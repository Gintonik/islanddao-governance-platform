/**
 * Update Native Governance Power for IslandDAO Citizens
 * Calculates VSR voting power and updates PostgreSQL database
 * Run with: node update-native-power.js
 */

const { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } = require('@solana/web3.js');
const { Pool } = require('pg');
const { BorshCoder, EventParser } = require('@coral-xyz/anchor');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Parse individual deposit entries with full VSR structure
 */
function parseDepositEntry(data, offset) {
  try {
    // VSR Deposit entry structure:
    // 0-1: lockup kind (0=None, 1=Cliff, 2=Constant, 3=Vested)
    // 1-9: start timestamp
    // 9-17: end timestamp  
    // 17-25: periods
    // 25-33: amount deposited
    // 33-41: amount initially locked
    // 41-49: amount currently locked
    // 49-57: voting power baseline
    // 57-58: voting mint config idx
    // 58-59: is_used flag
    
    const lockupKind = data[offset];
    const startTimestamp = data.readBigUInt64LE(offset + 1);
    const endTimestamp = data.readBigUInt64LE(offset + 9);
    const periods = data.readBigUInt64LE(offset + 17);
    const amountDeposited = data.readBigUInt64LE(offset + 25);
    const amountInitiallyLocked = data.readBigUInt64LE(offset + 33);
    const amountCurrentlyLocked = data.readBigUInt64LE(offset + 41);
    const votingPowerBaseline = data.readBigUInt64LE(offset + 49);
    const votingMintConfigIdx = data[offset + 57];
    const isUsed = data[offset + 58] === 1;
    
    return {
      lockupKind,
      startTimestamp: Number(startTimestamp),
      endTimestamp: Number(endTimestamp),
      periods: Number(periods),
      amountDeposited: Number(amountDeposited) / 1e6,
      amountInitiallyLocked: Number(amountInitiallyLocked) / 1e6,
      currentlyLocked: Number(amountCurrentlyLocked) / 1e6,
      votingPowerBaseline: Number(votingPowerBaseline) / 1e6,
      votingMintConfigIdx,
      isUsed,
      isActive: isUsed && amountDeposited > 0
    };
  } catch (e) {
    return null;
  }
}

/**
 * Get Registrar account to extract voting mint configurations
 */
async function getRegistrarConfig() {
  try {
    // Derive Registrar PDA
    const [registrarPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('registrar'),
        ISLANDDAO_REALM.toBuffer(),
        ISLAND_MINT.toBuffer()
      ],
      VSR_PROGRAM_ID
    );
    
    const registrarAccount = await connection.getAccountInfo(registrarPDA);
    if (!registrarAccount) {
      console.log('    No registrar account found');
      return null;
    }
    
    const data = registrarAccount.data;
    
    // Parse voting mint configs (simplified structure)
    // Each voting mint config contains baseline and max extra lockup multipliers
    const votingMints = [];
    
    // Voting mint configs typically start around offset 72
    for (let i = 0; i < 5; i++) { // Usually max 5 voting mints
      const offset = 72 + (i * 48); // Each config ~48 bytes
      
      if (offset + 48 <= data.length) {
        try {
          const baselineVoteWeightScaledFactor = data.readBigUInt64LE(offset + 32);
          const maxExtraLockupVoteWeightScaledFactor = data.readBigUInt64LE(offset + 40);
          
          votingMints.push({
            baselineVoteWeightScaledFactor: Number(baselineVoteWeightScaledFactor),
            maxExtraLockupVoteWeightScaledFactor: Number(maxExtraLockupVoteWeightScaledFactor)
          });
        } catch (e) {
          break;
        }
      }
    }
    
    return { votingMints };
  } catch (error) {
    console.log(`    Error getting registrar config: ${error.message}`);
    return null;
  }
}

/**
 * Calculate voting power for a single deposit using VSR formula
 */
function calculateDepositVotingPower(deposit, registrarConfig, currentTimestamp) {
  if (!deposit.isActive || !registrarConfig) {
    return 0;
  }
  
  const votingMintConfig = registrarConfig.votingMints[deposit.votingMintConfigIdx];
  if (!votingMintConfig) {
    return 0;
  }
  
  // VSR voting power formula:
  // voting_power = baseline_vote_weight + lockup_duration_factor * max_extra_lockup_vote_weight
  
  const baselineVoteWeight = deposit.amountDeposited * 
    votingMintConfig.baselineVoteWeightScaledFactor / 1e9; // Scale factor
  
  let lockupDurationFactor = 0;
  
  // Calculate lockup duration factor based on lockup type
  if (deposit.lockupKind > 0 && deposit.endTimestamp > currentTimestamp) {
    const timeRemaining = deposit.endTimestamp - currentTimestamp;
    const totalLockupTime = deposit.endTimestamp - deposit.startTimestamp;
    
    if (totalLockupTime > 0) {
      switch (deposit.lockupKind) {
        case 1: // Cliff
          lockupDurationFactor = timeRemaining / totalLockupTime;
          break;
        case 2: // Constant  
          lockupDurationFactor = 1.0;
          break;
        case 3: // Vested
          lockupDurationFactor = timeRemaining / totalLockupTime;
          break;
      }
    }
  }
  
  const maxExtraLockupVoteWeight = deposit.amountDeposited * 
    votingMintConfig.maxExtraLockupVoteWeightScaledFactor / 1e9;
  
  const totalVotingPower = baselineVoteWeight + (lockupDurationFactor * maxExtraLockupVoteWeight);
  
  return totalVotingPower;
}

/**
 * Derive Voter PDA for a wallet
 */
function deriveVoterPDA(walletPubkey, registrarPubkey) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      registrarPubkey.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  return voterPDA;
}

/**
 * Simulate logVoterInfo transaction to get complete deposit information
 */
async function simulateLogVoterInfoTransaction(walletAddress) {
  try {
    console.log(`  Simulating logVoterInfo for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Derive Registrar PDA
    const [registrarPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('registrar'),
        ISLANDDAO_REALM.toBuffer(),
        ISLAND_MINT.toBuffer()
      ],
      VSR_PROGRAM_ID
    );
    
    // Derive Voter PDA
    const voterPDA = deriveVoterPDA(walletPubkey, registrarPDA);
    
    // Check if Voter account exists
    const voterAccount = await connection.getAccountInfo(voterPDA);
    if (!voterAccount) {
      console.log(`    No Voter account found for ${walletAddress.substring(0, 8)}`);
      return 0;
    }
    
    console.log(`    Found Voter account: ${voterPDA.toBase58().substring(0, 8)}`);
    
    // Create logVoterInfo instruction
    const instruction = new TransactionInstruction({
      programId: VSR_PROGRAM_ID,
      keys: [
        { pubkey: registrarPDA, isSigner: false, isWritable: false },
        { pubkey: voterPDA, isSigner: false, isWritable: false }
      ],
      data: Buffer.from([
        0x9a, 0x27, 0x1c, 0x61, 0x7a, 0x85, 0x9a, 0x2c, // logVoterInfo discriminator
        0, 0, 0, 0, // start index (0)
        10, 0, 0, 0 // count (10 deposits)
      ])
    });
    
    // Create dummy transaction for simulation
    const dummyKeypair = Keypair.generate();
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = dummyKeypair.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    
    // Simulate transaction to get logs
    const simulationResult = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      accounts: {
        encoding: 'base64',
        addresses: [voterPDA.toBase58(), registrarPDA.toBase58()]
      }
    });
    
    if (simulationResult.value.err) {
      console.log(`    Simulation error: ${JSON.stringify(simulationResult.value.err)}`);
      return await fallbackVotingPowerCalculation(walletAddress);
    }
    
    // Parse logs for VoterInfo and DepositEntryInfo events
    const logs = simulationResult.value.logs || [];
    console.log(`    Found ${logs.length} log entries`);
    
    let totalVotingPower = 0;
    let depositCount = 0;
    
    // Look for voting power information in logs
    for (const log of logs) {
      if (log.includes('VoterInfo')) {
        // Parse VoterInfo log for total voting power
        const match = log.match(/votingPower:\s*(\d+)/);
        if (match) {
          totalVotingPower = parseInt(match[1]) / 1e6; // Convert from micro-tokens
          console.log(`    Found VoterInfo total voting power: ${totalVotingPower.toLocaleString()} ISLAND`);
        }
      } else if (log.includes('DepositEntryInfo')) {
        // Parse individual deposit info
        const powerMatch = log.match(/votingPower:\s*(\d+)/);
        const amountMatch = log.match(/amountDeposited:\s*(\d+)/);
        
        if (powerMatch && amountMatch) {
          const depositPower = parseInt(powerMatch[1]) / 1e6;
          const depositAmount = parseInt(amountMatch[1]) / 1e6;
          
          if (depositPower > 0) {
            depositCount++;
            console.log(`    Deposit ${depositCount}: ${depositAmount.toLocaleString()} ISLAND → ${depositPower.toLocaleString()} voting power`);
          }
        }
      }
    }
    
    if (totalVotingPower > 0) {
      console.log(`    Total deposits analyzed: ${depositCount}`);
      console.log(`    Final authentic voting power: ${totalVotingPower.toLocaleString()} ISLAND`);
      return totalVotingPower;
    }
    
    // If no VoterInfo found, try fallback method
    return await fallbackVotingPowerCalculation(walletAddress);
    
  } catch (error) {
    console.error(`    Error simulating logVoterInfo: ${error.message}`);
    return await fallbackVotingPowerCalculation(walletAddress);
  }
}

/**
 * Fallback voting power calculation using direct account parsing
 */
async function fallbackVotingPowerCalculation(walletAddress) {
  try {
    console.log(`    Using fallback calculation for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get VSR accounts for this wallet
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    if (vsrAccounts.length === 0) {
      return 0;
    }
    
    let maxVotingPower = 0;
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Check if this is a voter weight record
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() === '14560581792603266545') {
        
        // Extract voting power from standard VSR offsets
        const powerOffsets = [104, 112, 120];
        
        for (const offset of powerOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const rawPower = data.readBigUInt64LE(offset);
              const votingPower = Number(rawPower) / 1e6;
              
              if (votingPower > 0 && votingPower < 50000000) {
                maxVotingPower = Math.max(maxVotingPower, votingPower);
                console.log(`      Fallback power at offset ${offset}: ${votingPower.toLocaleString()} ISLAND`);
              }
            } catch (e) {
              // Skip invalid data
            }
          }
        }
      }
    }
    
    return maxVotingPower;
    
  } catch (error) {
    console.error(`    Fallback calculation error: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate complete native governance power using enhanced VSR account analysis
 */
async function getLockTokensVotingPowerPerWallet(walletAddress) {
  try {
    console.log(`  Calculating complete VSR power for ${walletAddress.substring(0, 8)}...`);
    
    // First try the transaction simulation approach
    let totalVotingPower = await simulateLogVoterInfoTransaction(walletAddress);
    
    // If simulation doesn't work, use enhanced fallback with comprehensive deposit analysis
    if (totalVotingPower === 0) {
      totalVotingPower = await enhancedVSRAccountAnalysis(walletAddress);
    }
    
    console.log(`    Final calculated voting power: ${totalVotingPower.toLocaleString()} ISLAND`);
    return totalVotingPower;
    
  } catch (error) {
    console.error(`  Error calculating VSR power for ${walletAddress}: ${error.message}`);
    return 0;
  }
}

/**
 * Enhanced VSR account analysis with comprehensive deposit parsing
 */
async function enhancedVSRAccountAnalysis(walletAddress) {
  try {
    console.log(`    Enhanced VSR analysis for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get all VSR accounts for this wallet
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    if (vsrAccounts.length === 0) {
      return 0;
    }
    
    console.log(`    Found ${vsrAccounts.length} VSR accounts`);
    
    let totalCalculatedPower = 0;
    let maxAccountPower = 0;
    let depositAnalysis = [];
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Check if this is a voter weight record
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() === '14560581792603266545') {
        
        // Extract account-level voting power from multiple offsets
        const powerOffsets = [104, 112, 120, 128, 136];
        let accountMaxPower = 0;
        
        for (const offset of powerOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const rawPower = data.readBigUInt64LE(offset);
              const votingPower = Number(rawPower) / 1e6;
              
              if (votingPower > 0 && votingPower < 50000000) {
                accountMaxPower = Math.max(accountMaxPower, votingPower);
                console.log(`      Account power at offset ${offset}: ${votingPower.toLocaleString()} ISLAND`);
              }
            } catch (e) {
              // Skip invalid data
            }
          }
        }
        
        maxAccountPower = Math.max(maxAccountPower, accountMaxPower);
        
        // Enhanced deposit analysis for all accounts
        console.log(`      Analyzing deposits in account ${account.pubkey.toBase58().substring(0, 8)}...`);
        
        let accountDepositPower = 0;
        let validDeposits = 0;
        
        // Parse deposits with multiple possible starting offsets and sizes
        const depositConfigs = [
          { startOffset: 200, size: 72 },
          { startOffset: 184, size: 64 },
          { startOffset: 216, size: 80 }
        ];
        
        for (const config of depositConfigs) {
          for (let depositOffset = config.startOffset; depositOffset < data.length - config.size; depositOffset += config.size) {
            const deposit = parseDepositEntry(data, depositOffset);
            
            if (deposit && deposit.isUsed && deposit.amountDeposited > 0) {
              validDeposits++;
              accountDepositPower += deposit.votingPowerBaseline || 0;
              
              const lockupType = ['None', 'Cliff', 'Constant', 'Vested'][deposit.lockupKind] || 'Unknown';
              console.log(`        Deposit ${validDeposits}: ${deposit.amountDeposited.toLocaleString()} ISLAND (${lockupType}), baseline: ${(deposit.votingPowerBaseline || 0).toLocaleString()}`);
              
              depositAnalysis.push(deposit);
            }
          }
          
          if (validDeposits > 0) break; // Found valid deposits with this config
        }
        
        if (validDeposits > 0) {
          console.log(`      Account deposit summary: ${validDeposits} deposits, ${accountDepositPower.toLocaleString()} total baseline power`);
          totalCalculatedPower = Math.max(totalCalculatedPower, accountDepositPower);
        }
      }
    }
    
    // Use the highest value found: either account-level power or calculated deposit power
    const finalPower = Math.max(maxAccountPower, totalCalculatedPower);
    
    if (finalPower > 1000) {
      console.log(`    COMPREHENSIVE ANALYSIS SUMMARY:`);
      console.log(`      Max account-level power: ${maxAccountPower.toLocaleString()} ISLAND`);
      console.log(`      Calculated deposit power: ${totalCalculatedPower.toLocaleString()} ISLAND`);
      console.log(`      Total valid deposits: ${depositAnalysis.length}`);
      console.log(`      Final power used: ${finalPower.toLocaleString()} ISLAND`);
    }
    
    return finalPower;
    
  } catch (error) {
    console.error(`    Enhanced analysis error: ${error.message}`);
    return 0;
  }
}

/**
 * Fetch all citizen wallets from database
 */
async function fetchCitizenWallets(pool) {
  try {
    const query = 'SELECT wallet, nickname FROM citizens ORDER BY id';
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching citizen wallets:', error.message);
    throw error;
  }
}

/**
 * Update native governance power in database
 */
async function updateNativeGovernancePower(pool, wallet, nativePower) {
  try {
    const query = `
      UPDATE citizens 
      SET native_governance_power = $1 
      WHERE wallet = $2
    `;
    
    await pool.query(query, [nativePower, wallet]);
    console.log(`  Updated database: ${nativePower.toLocaleString()} ISLAND`);
    
  } catch (error) {
    console.error(`  Error updating database for ${wallet}: ${error.message}`);
    throw error;
  }
}

/**
 * Main execution function
 */
async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Starting native governance power update for IslandDAO citizens...');
    console.log(`Using Helius RPC: ${HELIUS_RPC}`);
    console.log(`IslandDAO Realm: ${ISLANDDAO_REALM.toBase58()}`);
    console.log(`ISLAND Token Mint: ${ISLAND_MINT.toBase58()}`);
    
    // Fetch all citizens
    console.log('\nFetching citizens from database...');
    const citizens = await fetchCitizenWallets(pool);
    console.log(`Found ${citizens.length} citizens to process`);
    
    let processed = 0;
    let updated = 0;
    let totalNativePower = 0;
    
    // Process each citizen
    console.log('\nProcessing citizens...');
    for (const citizen of citizens) {
      const displayName = citizen.nickname || citizen.wallet.substring(0, 8);
      console.log(`\n[${processed + 1}/${citizens.length}] ${displayName}:`);
      
      try {
        // Calculate native voting power using VSR
        const nativePower = await getLockTokensVotingPowerPerWallet(citizen.wallet);
        
        if (nativePower > 0) {
          // Update database
          await updateNativeGovernancePower(pool, citizen.wallet, nativePower);
          updated++;
          totalNativePower += nativePower;
        } else {
          console.log('  No native governance power found');
        }
        
        processed++;
        
      } catch (error) {
        console.error(`  Failed to process ${displayName}: ${error.message}`);
        processed++;
      }
    }
    
    // Final summary
    console.log('\nUpdate Summary:');
    console.log(`Citizens processed: ${processed}/${citizens.length}`);
    console.log(`Citizens updated: ${updated}`);
    console.log(`Total native governance power: ${totalNativePower.toLocaleString()} ISLAND`);
    
    if (updated > 0) {
      console.log(`Average power per citizen: ${(totalNativePower / updated).toLocaleString()} ISLAND`);
    }
    
    console.log('\nNative governance power update completed successfully');
    
  } catch (error) {
    console.error('\nUpdate failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute when run directly
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { run, getLockTokensVotingPowerPerWallet };