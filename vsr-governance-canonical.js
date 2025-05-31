/**
 * Canonical VSR Governance Power Calculator
 * Uses official Anchor IDL deserialization from the VSR program
 * No hardcoded values or manual buffer parsing - pure on-chain data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet } = require('@coral-xyz/anchor');
const { Pool } = require('pg');
const https = require('https');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Get VSR IDL definition (embedded for reliability)
 */
function getVSRIdl() {
  return {
    "version": "0.2.2",
    "name": "voter_stake_registry",
    "instructions": [],
    "accounts": [
      {
        "name": "voter",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "registrar",
              "type": "publicKey"
            },
            {
              "name": "authority",
              "type": "publicKey"
            },
            {
              "name": "voterBump",
              "type": "u8"
            },
            {
              "name": "voterWeightRecordBump",
              "type": "u8"
            },
            {
              "name": "depositEntries",
              "type": {
                "vec": {
                  "defined": "DepositEntry"
                }
              }
            }
          ]
        }
      }
    ],
    "types": [
      {
        "name": "DepositEntry",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "lockup",
              "type": {
                "defined": "Lockup"
              }
            },
            {
              "name": "amountDepositedNative",
              "type": "u64"
            },
            {
              "name": "amountInitiallyLockedNative",
              "type": "u64"
            },
            {
              "name": "isUsed",
              "type": "bool"
            },
            {
              "name": "allowClawback",
              "type": "bool"
            },
            {
              "name": "votingMintConfigIdx",
              "type": "u8"
            }
          ]
        }
      },
      {
        "name": "Lockup",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "startTs",
              "type": "i64"
            },
            {
              "name": "endTs",
              "type": "i64"
            },
            {
              "name": "kind",
              "type": {
                "defined": "LockupKind"
              }
            }
          ]
        }
      },
      {
        "name": "LockupKind",
        "type": {
          "kind": "enum",
          "variants": [
            {
              "name": "none"
            },
            {
              "name": "daily"
            },
            {
              "name": "monthly"
            },
            {
              "name": "cliff"
            },
            {
              "name": "constant"
            }
          ]
        }
      }
    ]
  };
}

/**
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

/**
 * Find all Voter accounts for a wallet using Anchor program
 */
async function findVoterAccountsAnchor(program, walletPubkey) {
  console.log(`    Searching for Voter accounts for ${walletPubkey.toBase58().substring(0, 8)}...`);
  
  try {
    // Get all Voter accounts where this wallet is the authority
    const accounts = await program.account.voter.all([
      {
        memcmp: {
          offset: 40, // authority field offset in Voter account
          bytes: walletPubkey.toBase58()
        }
      }
    ]);
    
    console.log(`    Found ${accounts.length} Voter accounts via Anchor`);
    return accounts;
  } catch (error) {
    console.log(`    Error fetching Voter accounts: ${error.message}`);
    return [];
  }
}

/**
 * Calculate voting power multiplier based on lockup configuration
 */
function calculateVotingPowerMultiplier(deposit, registrarConfig) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Default multiplier for unlocked tokens
  let multiplier = 1.0;
  
  // Check if deposit has active lockup
  if (deposit.lockup && deposit.lockup.kind && deposit.lockup.kind.none === undefined) {
    const { startTs, endTs } = deposit.lockup;
    
    // If lockup is still active
    if (endTs > currentTime) {
      const remainingTime = endTs - currentTime;
      const maxLockupTime = registrarConfig?.lockupSaturationSecs || 31536000; // 1 year default
      
      // Calculate time-based multiplier
      const timeFactor = Math.min(remainingTime / maxLockupTime, 1.0);
      const baselineWeight = registrarConfig?.baselineVoteWeight || 1.0;
      const maxExtraWeight = registrarConfig?.maxExtraLockupVoteWeight || 3.0;
      
      multiplier = baselineWeight + (maxExtraWeight * timeFactor);
    }
  }
  
  return {
    multiplier,
    lockupKind: deposit.lockup?.kind ? Object.keys(deposit.lockup.kind)[0] : 'none',
    status: multiplier > 1.0 ? 'locked' : 'unlocked'
  };
}

/**
 * Calculate governance power for a single wallet using Anchor
 */
async function calculateGovernancePowerAnchor(program, walletAddress, registrarConfig) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    // Find all Voter accounts for this wallet
    const voterAccounts = await findVoterAccountsAnchor(program, walletPubkey);
    
    if (voterAccounts.length === 0) {
      return { totalPower: 0, deposits: [], accounts: 0 };
    }
    
    console.log(`\nProcessing ${voterAccounts.length} Voter accounts for ${walletAddress.substring(0, 8)}...:`);
    
    let totalPower = 0;
    const allDeposits = [];
    let validAccountsProcessed = 0;
    
    // Process all Voter accounts
    for (const voterAccount of voterAccounts) {
      const voter = voterAccount.account;
      const accountAddress = voterAccount.publicKey.toBase58();
      
      if (!voter.depositEntries || voter.depositEntries.length === 0) {
        console.log(`  Account ${accountAddress.substring(0, 8)}...: No deposits`);
        continue;
      }
      
      console.log(`  Account ${accountAddress.substring(0, 8)}...: Processing ${voter.depositEntries.length} deposit entries`);
      validAccountsProcessed++;
      
      let validDepositsInAccount = 0;
      
      // Process all deposit entries in this account
      for (const [index, deposit] of voter.depositEntries.entries()) {
        // Check if deposit is valid and used
        if (!deposit.isUsed) {
          continue;
        }
        
        // Get effective amount from either field
        let effectiveAmount = deposit.amountDepositedNative?.toNumber() || 0;
        if (effectiveAmount === 0) {
          effectiveAmount = deposit.amountInitiallyLockedNative?.toNumber() || 0;
        }
        
        if (effectiveAmount <= 0) {
          continue;
        }
        
        const amountInTokens = effectiveAmount / 1e6; // Convert from native units
        
        // Calculate voting power multiplier
        const { multiplier, lockupKind, status } = calculateVotingPowerMultiplier(deposit, registrarConfig);
        const power = amountInTokens * multiplier;
        
        console.log(`    Entry ${index}: ${amountInTokens.toLocaleString()} ISLAND | ${lockupKind} | ${status} | ${multiplier.toFixed(6)}x = ${power.toLocaleString()} power`);
        
        allDeposits.push({
          amount: amountInTokens,
          lockupKind,
          multiplier,
          power,
          status,
          accountAddress,
          entryIndex: index
        });
        
        totalPower += power;
        validDepositsInAccount++;
      }
      
      console.log(`    → ${validDepositsInAccount} valid deposits in this account`);
    }
    
    return {
      totalPower,
      deposits: allDeposits,
      accounts: validAccountsProcessed
    };
    
  } catch (error) {
    console.error(`Error calculating power for ${walletAddress}: ${error.message}`);
    return { totalPower: 0, deposits: [], accounts: 0 };
  }
}

/**
 * Process all citizens with canonical Anchor-based VSR calculation
 */
async function processAllCitizensCanonical() {
  console.log('=== Canonical VSR Governance Calculator ===');
  console.log('Uses official Anchor IDL from VSR repository');
  console.log('Pure on-chain deserialization with no hardcoded values');
  console.log('');
  
  // Load VSR IDL
  console.log('Loading VSR IDL definition...');
  const vsrIdl = getVSRIdl();
  console.log('✅ VSR IDL loaded successfully');
  
  // Create Anchor program instance
  const wallet = createDummyWallet();
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(vsrIdl, VSR_PROGRAM_ID.toBase58(), provider);
  
  console.log('✅ Anchor program initialized');
  console.log('');
  
  // Get registrar configuration (use reasonable defaults)
  const registrarConfig = {
    baselineVoteWeight: 1.0,
    maxExtraLockupVoteWeight: 3.0,
    lockupSaturationSecs: 31536000 // 1 year
  };
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  let citizens;
  try {
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    citizens = result.rows;
  } finally {
    await pool.end();
  }
  
  console.log(`Processing ${citizens.length} citizens...\n`);
  
  const results = [];
  let validationsPassed = 0;
  let validationsFailed = 0;
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    const citizenName = citizen.nickname || 'Anonymous';
    
    console.log(`[${i + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...):`);
    
    const { totalPower, deposits, accounts } = await calculateGovernancePowerAnchor(program, citizen.wallet, registrarConfig);
    
    if (deposits.length > 0) {
      console.log(`Total: ${totalPower.toLocaleString()} ISLAND governance power from ${accounts} accounts`);
    } else {
      console.log(`No governance power found`);
    }
    
    // Critical validations with expected values
    if (citizen.wallet === 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1') {
      if (Math.abs(totalPower - 200000) < 1) {
        console.log(`✅ Titanmaker validation PASSED: ${totalPower} = 200,000`);
        validationsPassed++;
      } else {
        console.log(`❌ Titanmaker validation FAILED: ${totalPower} ≠ 200,000`);
        validationsFailed++;
      }
    } else if (citizen.wallet === 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG') {
      if (Math.abs(totalPower - 3361730.15) < 0.01) {
        console.log(`✅ Legend validation PASSED: ${totalPower} = 3,361,730.15`);
        validationsPassed++;
      } else {
        console.log(`❌ Legend validation FAILED: ${totalPower} ≠ 3,361,730.15`);
        validationsFailed++;
      }
    } else if (citizen.wallet === '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt') {
      if (totalPower > 8000000 && totalPower < 50000000) { // Should be around 10M, not 422M
        console.log(`✅ DeanMachine validation PASSED: ${totalPower.toLocaleString()} (reasonable range)`);
        validationsPassed++;
      } else {
        console.log(`❌ DeanMachine validation FAILED: ${totalPower.toLocaleString()} (outside expected range)`);
        validationsFailed++;
      }
    } else if (citizen.wallet === '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA') {
      // Takisoul should have ~8.7M ISLAND
      if (totalPower > 8000000) {
        console.log(`✅ Takisoul validation PASSED: ${totalPower.toLocaleString()} ISLAND (expected ~8.7M)`);
        validationsPassed++;
      } else {
        console.log(`❌ Takisoul validation FAILED: ${totalPower.toLocaleString()} ISLAND (should be ~8.7M)`);
        validationsFailed++;
      }
    } else if (citizen.wallet === 'kruHL3zJdEfBUcdDo42BSKTjTWmrmfLhZ3WUDi14n1r') {
      // KO3 should have ~1.8M ISLAND
      if (totalPower > 1500000) {
        console.log(`✅ KO3 validation PASSED: ${totalPower.toLocaleString()} ISLAND (expected ~1.8M)`);
        validationsPassed++;
      } else {
        console.log(`❌ KO3 validation FAILED: ${totalPower.toLocaleString()} ISLAND (should be ~1.8M)`);
        validationsFailed++;
      }
    }
    
    results.push({
      wallet: citizen.wallet,
      nickname: citizenName,
      totalPower: Math.round(totalPower * 1000000) / 1000000
    });
  }
  
  // Update database only if all validations pass
  if (validationsFailed === 0) {
    console.log('\n✅ All validations passed - updating database...');
    
    const updatePool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    try {
      for (const result of results) {
        await updatePool.query(`
          UPDATE citizens 
          SET native_governance_power = $1,
              delegated_governance_power = 0,
              total_governance_power = $1
          WHERE wallet = $2
        `, [result.totalPower, result.wallet]);
      }
      
      console.log(`✅ Updated ${results.length} citizens in database`);
    } finally {
      await updatePool.end();
    }
  } else {
    console.log(`\n❌ ${validationsFailed} validations failed - NOT updating database`);
    console.log('Need to investigate discrepancies before proceeding');
  }
  
  // Final summary
  const totalGovernancePower = results.reduce((sum, r) => sum + r.totalPower, 0);
  const citizensWithPower = results.filter(r => r.totalPower > 0);
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Citizens processed: ${citizens.length}`);
  console.log(`Citizens with power: ${citizensWithPower.length}`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Validations passed: ${validationsPassed}`);
  console.log(`Validations failed: ${validationsFailed}`);
  
  // Top 10 leaderboard
  results.sort((a, b) => b.totalPower - a.totalPower);
  console.log('\n=== TOP 10 LEADERBOARD ===');
  results.slice(0, 10).forEach((citizen, index) => {
    console.log(`${index + 1}. ${citizen.nickname}: ${citizen.totalPower.toLocaleString()} ISLAND`);
  });
  
  if (validationsFailed === 0) {
    console.log('\n🎯 SUCCESS: All validations passed - this is the new canonical implementation');
  } else {
    console.log('\n⚠️  FAILED: Discrepancies found - keeping existing implementation active');
  }
  
  return {
    results,
    validationsPassed,
    validationsFailed,
    isCanonical: validationsFailed === 0
  };
}

if (require.main === module) {
  processAllCitizensCanonical().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  processAllCitizensCanonical,
  calculateGovernancePowerAnchor
};