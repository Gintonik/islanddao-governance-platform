/**
 * Update Native Governance Power for IslandDAO Citizens
 * Calculates VSR voting power and updates PostgreSQL database
 * Run with: node update-native-power.js
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

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
 * Calculate native governance power using the proven VSR methodology
 * Uses the same approach that successfully extracted authentic data before
 */
async function getLockTokensVotingPowerPerWallet(walletAddress) {
  try {
    console.log(`  Fetching VSR data for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get VSR accounts for this wallet using the proven method
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    console.log(`    Found ${vsrAccounts.length} VSR accounts`);
    
    if (vsrAccounts.length === 0) {
      return 0;
    }
    
    let maxVotingPower = 0;
    let depositDetails = [];
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Check if this is a voter weight record using proven discriminator
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() === '14560581792603266545') {
        
        // Extract voting power from standard VSR offsets that worked before
        const powerOffsets = [104, 112, 120];
        
        for (const offset of powerOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const rawPower = data.readBigUInt64LE(offset);
              const votingPower = Number(rawPower) / 1e6; // Convert from micro-tokens
              
              if (votingPower > 0 && votingPower < 50000000) {
                maxVotingPower = Math.max(maxVotingPower, votingPower);
                console.log(`      Power at offset ${offset}: ${votingPower.toLocaleString()} ISLAND`);
              }
            } catch (e) {
              // Skip invalid data
            }
          }
        }
        
        // Enhanced deposit analysis for high-power wallets
        if (maxVotingPower > 1000000) {
          console.log(`      Analyzing deposits for high-power wallet...`);
          
          // Parse deposits with improved structure detection
          for (let depositOffset = 200; depositOffset < data.length - 72; depositOffset += 72) {
            const deposit = parseDepositEntry(data, depositOffset);
            
            if (deposit && deposit.isUsed && deposit.amountDeposited > 0) {
              depositDetails.push(deposit);
              const lockupType = ['None', 'Cliff', 'Constant', 'Vested'][deposit.lockupKind] || 'Unknown';
              console.log(`        Used Deposit: ${deposit.amountDeposited.toLocaleString()} ISLAND (${lockupType}), locked: ${deposit.currentlyLocked.toLocaleString()}`);
            }
          }
        }
      }
    }
    
    // Enhanced logging for high-power wallets
    if (maxVotingPower > 1000000) {
      console.log(`    HIGH POWER WALLET ANALYSIS:`);
      console.log(`      Total used deposits: ${depositDetails.length}`);
      console.log(`      Sum of deposit amounts: ${depositDetails.reduce((sum, d) => sum + d.amountDeposited, 0).toLocaleString()} ISLAND`);
      console.log(`      Sum of currently locked: ${depositDetails.reduce((sum, d) => sum + d.currentlyLocked, 0).toLocaleString()} ISLAND`);
      console.log(`      Final max voting power: ${maxVotingPower.toLocaleString()} ISLAND`);
    }
    
    console.log(`    Final voting power: ${maxVotingPower.toLocaleString()} ISLAND`);
    return maxVotingPower;
    
  } catch (error) {
    console.error(`  Error fetching power for ${walletAddress}: ${error.message}`);
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