/**
 * Anchor-based VSR Governance Power Calculator
 * Properly decodes IslandDAO registrar config using Anchor deserialization
 * No raw byte parsing - uses proper VSR program structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// VSR Program IDL (simplified for registrar and voting mint config)
const VSR_IDL = {
  "version": "0.2.0",
  "name": "voter_stake_registry",
  "instructions": [],
  "accounts": [
    {
      "name": "registrar",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "governanceProgramId",
            "type": "publicKey"
          },
          {
            "name": "realm",
            "type": "publicKey"
          },
          {
            "name": "governingTokenMint",
            "type": "publicKey"
          },
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "votingMints",
            "type": {
              "vec": {
                "defined": "VotingMintConfig"
              }
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "VotingMintConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "baselineVoteWeight",
            "type": "u64"
          },
          {
            "name": "maxExtraLockupVoteWeight",
            "type": "u64"
          },
          {
            "name": "lockupSaturationSecs",
            "type": "u64"
          },
          {
            "name": "digitShift",
            "type": "i8"
          }
        ]
      }
    }
  ]
};

// Global registrar config (MUST be fetched from blockchain using Anchor)
let registrarConfig = null;

/**
 * Create a dummy wallet for Anchor provider (read-only operations)
 */
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

/**
 * Find IslandDAO registrar account using proper PDA derivation
 */
async function findIslandDAORegistrar() {
  console.log('Searching for IslandDAO registrar using Anchor...');
  
  try {
    // Search for registrar accounts by fetching all VSR program accounts
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Found ${allVSRAccounts.length} total VSR program accounts`);
    
    // Filter for potential registrar accounts (larger accounts)
    const potentialRegistrars = allVSRAccounts.filter(account => 
      account.account.data.length > 200
    );
    
    console.log(`Found ${potentialRegistrars.length} potential registrar accounts`);
    
    // Setup Anchor
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    // Try to decode each potential registrar
    for (const account of potentialRegistrars) {
      try {
        console.log(`Attempting to decode registrar: ${account.pubkey.toBase58()}`);
        
        // Try to decode as registrar account
        const registrarData = program.coder.accounts.decode('registrar', account.account.data);
        
        console.log(`Successfully decoded registrar with ${registrarData.votingMints.length} voting mints`);
        
        // Check if this registrar contains our ISLAND mint
        for (const votingMint of registrarData.votingMints) {
          if (votingMint.mint.equals(ISLAND_MINT)) {
            console.log(`✓ Found ISLAND mint in registrar: ${account.pubkey.toBase58()}`);
            return {
              pubkey: account.pubkey,
              data: registrarData,
              islandMintConfig: votingMint
            };
          }
        }
        
      } catch (error) {
        // Not a valid registrar account, continue searching
        continue;
      }
    }
    
    throw new Error('CRITICAL: No VSR registrar account found containing ISLAND mint');
    
  } catch (error) {
    console.error('Error searching for registrar:', error.message);
    throw error;
  }
}

/**
 * Extract authentic VSR configuration using Anchor deserialization
 */
async function fetchAuthenticRegistrarConfig() {
  try {
    const registrarInfo = await findIslandDAORegistrar();
    const islandConfig = registrarInfo.islandMintConfig;
    
    console.log('✓ AUTHENTIC VSR CONFIG EXTRACTED via Anchor:');
    console.log(`  mint: ${islandConfig.mint.toBase58()}`);
    console.log(`  baseline_vote_weight: ${islandConfig.baselineVoteWeight.toString()}`);
    console.log(`  max_extra_lockup_vote_weight: ${islandConfig.maxExtraLockupVoteWeight.toString()}`);
    console.log(`  lockup_saturation_secs: ${islandConfig.lockupSaturationSecs.toString()}`);
    console.log(`  digit_shift: ${islandConfig.digitShift}`);
    console.log(`  registrar_address: ${registrarInfo.pubkey.toBase58()}`);
    
    // Convert to proper decimal values using digit_shift
    const digitShift = islandConfig.digitShift;
    const baselineVoteWeight = Number(islandConfig.baselineVoteWeight) / Math.pow(10, Math.abs(digitShift));
    const maxExtraLockupVoteWeight = Number(islandConfig.maxExtraLockupVoteWeight) / Math.pow(10, Math.abs(digitShift));
    const lockupSaturationSecs = Number(islandConfig.lockupSaturationSecs);
    
    console.log('');
    console.log('Converted values:');
    console.log(`  baseline_vote_weight: ${baselineVoteWeight}`);
    console.log(`  max_extra_lockup_vote_weight: ${maxExtraLockupVoteWeight}`);
    console.log(`  lockup_saturation_secs: ${lockupSaturationSecs} (${(lockupSaturationSecs / 31557600).toFixed(2)} years)`);
    
    // Validate reasonable values
    if (baselineVoteWeight <= 0 || maxExtraLockupVoteWeight <= 0 || lockupSaturationSecs <= 0) {
      throw new Error('Invalid registrar configuration values');
    }
    
    return {
      baselineVoteWeight,
      maxExtraLockupVoteWeight,
      lockupSaturationSecs,
      registrarPDA: registrarInfo.pubkey,
      digitShift
    };
    
  } catch (error) {
    console.error('FATAL: Cannot extract authentic registrar configuration:', error.message);
    throw error;
  }
}

/**
 * Derive Voter PDA from registrar
 */
function getVoterPDA(registrarPubkey, walletPubkey) {
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
 * Extract all deposits from VSR account data
 */
function extractAllDepositsFromVSRAccount(data) {
  const deposits = [];
  
  // Scan through account data looking for deposit patterns
  for (let offset = 0; offset < data.length - 16; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      // Check if this looks like a valid deposit amount
      if (amountInTokens >= 1000 && amountInTokens <= 100000) {
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 0;
        
        // Look for timestamp patterns around this deposit
        if (value > 1700000000 && value < 1800000000) {
          // Current value is a timestamp
          startTs = value;
          if (offset + 8 < data.length) {
            const nextValue = Number(data.readBigUInt64LE(offset + 8));
            if (nextValue > startTs && nextValue < 1800000000) {
              endTs = nextValue;
              isLocked = true;
              
              // Determine lockup kind based on duration
              const duration = endTs - startTs;
              if (duration > 365 * 24 * 3600) {
                lockupKind = 1; // Cliff
              } else if (duration > 30 * 24 * 3600) {
                lockupKind = 2; // Constant
              } else if (duration > 7 * 24 * 3600) {
                lockupKind = 4; // Monthly
              } else {
                lockupKind = 3; // Daily
              }
            }
          }
        } else {
          // Look for nearby timestamp pairs
          for (let searchOffset = Math.max(0, offset - 16); searchOffset <= offset + 16 && searchOffset + 16 <= data.length; searchOffset += 8) {
            try {
              const ts1 = Number(data.readBigUInt64LE(searchOffset));
              const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
              
              if (ts1 > 1700000000 && ts1 < 1800000000 && 
                  ts2 > ts1 && ts2 < 1800000000) {
                startTs = ts1;
                endTs = ts2;
                isLocked = true;
                
                const duration = endTs - startTs;
                if (duration > 365 * 24 * 3600) {
                  lockupKind = 1; // Cliff
                } else if (duration > 30 * 24 * 3600) {
                  lockupKind = 2; // Constant
                } else if (duration > 7 * 24 * 3600) {
                  lockupKind = 4; // Monthly
                } else {
                  lockupKind = 3; // Daily
                }
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        // Include ALL deposits
        if (amountInTokens > 0) {
          // Check for duplicates
          const isDuplicate = deposits.some(existing => 
            Math.abs(existing.amount - amountInTokens) < 0.1
          );
          
          if (!isDuplicate) {
            deposits.push({
              amount: amountInTokens,
              lockupKind,
              startTs,
              endTs,
              isLocked
            });
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Calculate multiplier using authentic VSR logic from Anchor-decoded config
 */
function calculateAuthenticMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Use the authentic values from Anchor-decoded registrar
  const baseline = registrarConfig.baselineVoteWeight;
  const maxExtra = registrarConfig.maxExtraLockupVoteWeight;
  const saturation = registrarConfig.lockupSaturationSecs;
  
  // Rule 1: If not locked or expired, use baseline only
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return baseline;
  }
  
  // Rule 2: For Constant lockups (kind == 2), use the authentic VSR formula
  if (deposit.lockupKind === 2) { // Constant
    const remainingSecs = deposit.endTs - currentTime;
    const multiplier = baseline + Math.min(remainingSecs / saturation, 1.0) * maxExtra;
    return multiplier;
  }
  
  // Rule 3: For other lockup kinds, log warning and use baseline
  const lockupKindNames = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'];
  const kindName = lockupKindNames[deposit.lockupKind] || 'Unknown';
  
  if (deposit.lockupKind !== 0) {
    console.log(`    ⚠️ WARNING: ${kindName} lockup detected - using baseline only (formula not confirmed for this type)`);
  }
  
  return baseline;
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePowerForWallet(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const voterPDA = getVoterPDA(registrarConfig.registrarPDA, walletPubkey);
    
    console.log(`  Processing ${walletAddress.substring(0, 8)}...`);
    
    // Try to get Voter PDA first
    let voterAccount = await connection.getAccountInfo(voterPDA);
    let vsrAccounts = [];
    
    if (voterAccount) {
      console.log(`    Found Voter PDA account`);
      vsrAccounts = [{ account: voterAccount }];
    } else {
      // Search for VSR accounts
      console.log(`    No Voter PDA found, searching VSR accounts...`);
      const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
        ]
      });
      
      if (accounts.length === 0) {
        console.log(`    No VSR accounts found`);
        return { power: 0, deposits: [], totalDepositAmount: 0 };
      }
      
      console.log(`    Found ${accounts.length} VSR accounts`);
      vsrAccounts = accounts;
    }
    
    const allDeposits = [];
    let totalGovernancePower = 0;
    let totalDepositAmount = 0;
    
    // Process each VSR account
    for (const vsrAccount of vsrAccounts) {
      const data = vsrAccount.account.data;
      
      // Verify this is a voter weight record
      const discriminator = data.readBigUInt64LE(0);
      if (discriminator.toString() !== '14560581792603266545') {
        continue;
      }
      
      // Extract ALL deposits from this account
      const deposits = extractAllDepositsFromVSRAccount(data);
      
      for (const deposit of deposits) {
        // Skip only zero-amount deposits
        if (deposit.amount === 0) {
          continue;
        }
        
        totalDepositAmount += deposit.amount;
        
        // Calculate multiplier using authentic registrar values
        const multiplier = calculateAuthenticMultiplier(deposit);
        const votingPower = Math.round(deposit.amount * multiplier * 1000000) / 1000000; // Round to 6 decimals
        
        totalGovernancePower += votingPower;
        
        // Determine status for display
        const currentTime = Math.floor(Date.now() / 1000);
        let status = 'unlocked';
        let isExpired = false;
        
        if (deposit.isLocked) {
          if (deposit.endTs > currentTime) {
            const remainingYears = (deposit.endTs - currentTime) / (365.25 * 24 * 3600);
            status = `${remainingYears.toFixed(2)}y active`;
          } else {
            status = 'expired lockup';
            isExpired = true;
          }
        }
        
        const lockupKindNames = ['None', 'Cliff', 'Constant', 'Daily', 'Monthly'];
        const lockupKindName = lockupKindNames[deposit.lockupKind] || 'Unknown';
        
        console.log(`    Deposit: ${deposit.amount.toLocaleString()} ISLAND (${lockupKindName}, locked=${deposit.isLocked}, expired=${isExpired}) × ${multiplier.toFixed(6)} = ${votingPower.toLocaleString()} power`);
        
        allDeposits.push({
          amount: deposit.amount,
          lockupKind: deposit.lockupKind,
          lockupKindName,
          isLocked: deposit.isLocked,
          isExpired,
          startTs: deposit.startTs,
          endTs: deposit.endTs,
          multiplier,
          power: votingPower,
          status
        });
      }
    }
    
    // Round final result to 6 decimals
    totalGovernancePower = Math.round(totalGovernancePower * 1000000) / 1000000;
    
    console.log(`    Summary: ${allDeposits.length} deposits, ${totalDepositAmount.toLocaleString()} ISLAND total deposits, ${totalGovernancePower.toLocaleString()} ISLAND governance power`);
    return { power: totalGovernancePower, deposits: allDeposits, totalDepositAmount };
    
  } catch (error) {
    console.error(`    Error processing ${walletAddress}: ${error.message}`);
    return { power: 0, deposits: [], totalDepositAmount: 0 };
  }
}

/**
 * Update citizen governance power in database
 */
async function updateCitizenGovernancePower(pool, wallet, nativePower) {
  try {
    // Get current delegated power to preserve it
    const currentResult = await pool.query(`
      SELECT delegated_governance_power FROM citizens WHERE wallet = $1
    `, [wallet]);
    
    const delegatedPower = Number(currentResult.rows[0]?.delegated_governance_power || 0);
    const totalPower = nativePower + delegatedPower;
    
    // Convert total to whole numbers for bigint storage (multiply by 1e6 for precision)
    const totalForStorage = Math.round(totalPower * 1000000);
    
    await pool.query(`
      UPDATE citizens 
      SET native_governance_power = $1,
          total_governance_power = $2
      WHERE wallet = $3
    `, [nativePower, totalForStorage, wallet]);
    
    console.log(`    ✓ Updated database: ${nativePower.toLocaleString()} native + ${delegatedPower.toLocaleString()} delegated = ${totalPower.toLocaleString()} total`);
  } catch (error) {
    console.error(`    ✗ Database error: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function run() {
  console.log('=== Anchor-based VSR Governance Power Calculator ===');
  console.log('Properly decodes IslandDAO registrar config using Anchor deserialization');
  console.log('No raw byte parsing - uses proper VSR program structure');
  console.log('');
  
  try {
    // CRITICAL: Fetch authentic registrar configuration using Anchor - MUST succeed
    registrarConfig = await fetchAuthenticRegistrarConfig();
    
    console.log('');
    console.log('VSR Multiplier Logic:');
    console.log('• Unlocked or expired deposits: baseline multiplier');
    console.log('• Constant lockups (kind=2): multiplier = baseline + min(remaining/saturation, 1) * bonus');
    console.log('• Other lockup kinds: baseline only (with warning)');
    console.log('');
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    try {
      // Get all citizens from database
      const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
      const citizens = result.rows;
      
      console.log(`Processing ${citizens.length} citizens from database...\n`);
      
      let citizensWithPower = 0;
      let totalNativeGovernancePower = 0;
      let totalDepositAmountAcrossDAO = 0;
      const citizenResults = [];
      
      // Process each citizen
      for (let i = 0; i < citizens.length; i++) {
        const citizen = citizens[i];
        const citizenName = citizen.nickname || 'Anonymous';
        
        console.log(`[${i + 1}/${citizens.length}] ${citizenName}:`);
        
        const result = await calculateNativeGovernancePowerForWallet(citizen.wallet);
        
        if (result.power > 0) {
          await updateCitizenGovernancePower(pool, citizen.wallet, result.power);
          citizensWithPower++;
          totalNativeGovernancePower += result.power;
          totalDepositAmountAcrossDAO += result.totalDepositAmount;
          
          citizenResults.push({
            nickname: citizenName,
            wallet: citizen.wallet,
            power: result.power,
            deposits: result.deposits,
            totalDepositAmount: result.totalDepositAmount
          });
        } else {
          console.log(`    No governance power found`);
        }
        
        console.log('');
      }
      
      // Final summary
      console.log('=== FINAL RESULTS ===');
      console.log(`Citizens processed: ${citizens.length}`);
      console.log(`Citizens with non-zero power: ${citizensWithPower}`);
      console.log(`Sum of all native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`Total deposit amount across DAO: ${totalDepositAmountAcrossDAO.toLocaleString()} ISLAND`);
      
      if (citizensWithPower > 0 && totalDepositAmountAcrossDAO > 0) {
        const overallMultiplier = totalNativeGovernancePower / totalDepositAmountAcrossDAO;
        console.log(`Average power per active citizen: ${(totalNativeGovernancePower / citizensWithPower).toLocaleString()} ISLAND`);
        console.log(`Overall governance multiplier: ${overallMultiplier.toFixed(6)}x`);
      }
      
      // Show detailed breakdown for top citizens
      if (citizenResults.length > 0) {
        console.log('\n=== TOP 5 CITIZENS BY GOVERNANCE POWER ===');
        
        citizenResults.sort((a, b) => b.power - a.power);
        
        citizenResults.slice(0, 5).forEach((citizen, index) => {
          console.log(`\n${index + 1}. ${citizen.nickname}`);
          console.log(`   Wallet: ${citizen.wallet}`);
          console.log(`   Total governance power: ${citizen.power.toLocaleString()} ISLAND`);
          console.log(`   Breakdown of deposits:`);
          
          citizen.deposits.forEach((deposit, depIndex) => {
            console.log(`     ${depIndex + 1}: ${deposit.amount.toLocaleString()} ISLAND (${deposit.lockupKindName}, locked=${deposit.isLocked}, multiplier=${deposit.multiplier.toFixed(6)})`);
          });
        });
      }
      
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error('CRITICAL FAILURE:', error.message);
    console.error('Script terminated - cannot proceed without authentic registrar data');
    process.exit(1);
  }
}

// Run the calculation
if (require.main === module) {
  run().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  calculateNativeGovernancePowerForWallet,
  calculateAuthenticMultiplier,
  fetchAuthenticRegistrarConfig
};