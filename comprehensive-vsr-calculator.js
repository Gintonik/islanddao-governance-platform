/**
 * Comprehensive VSR Governance Power Calculator
 * Finds ALL VSR voter accounts and applies correct multiplier logic
 * Validates against known test wallets before database updates
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

// Authentic registrar configuration (extracted from blockchain)
const VSR_CONFIG = {
  baseline: 1.0,
  maxExtra: 3.0,
  saturation: 31536000 // 1 year in seconds
};

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Find ALL VSR voter accounts for a wallet using comprehensive search
 */
async function findAllVSRAccounts(walletPubkey) {
  const accounts = [];
  
  try {
    // Method 1: Direct memcmp on authority field
    const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    accounts.push(...authAccounts);
    
    // Method 2: Search for voter PDA
    const [voterPDA] = PublicKey.findProgramAddressSync(
      [
        REGISTRAR_ADDRESS.toBuffer(),
        Buffer.from('voter'),
        walletPubkey.toBuffer()
      ],
      VSR_PROGRAM_ID
    );
    
    const voterAccount = await connection.getAccountInfo(voterPDA);
    if (voterAccount) {
      accounts.push({ pubkey: voterPDA, account: voterAccount });
    }
    
    // Method 3: Broader search with different offsets
    for (const offset of [16, 24, 32, 40, 48]) {
      try {
        const offsetAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
          filters: [
            { memcmp: { offset, bytes: walletPubkey.toBase58() } }
          ]
        });
        accounts.push(...offsetAccounts);
      } catch (e) {
        continue;
      }
    }
    
  } catch (error) {
    console.error(`Error searching VSR accounts for ${walletPubkey.toBase58()}: ${error.message}`);
  }
  
  // Remove duplicates based on pubkey
  const uniqueAccounts = [];
  const seenPubkeys = new Set();
  
  for (const account of accounts) {
    const pubkeyStr = account.pubkey?.toBase58() || 'unknown';
    if (!seenPubkeys.has(pubkeyStr)) {
      seenPubkeys.add(pubkeyStr);
      uniqueAccounts.push(account);
    }
  }
  
  return uniqueAccounts;
}

/**
 * Extract all deposits from VSR account data with comprehensive parsing
 */
function extractAllDeposits(data, walletAddress) {
  const deposits = [];
  
  // Parse VSR account structure more comprehensively
  for (let offset = 0; offset < data.length - 32; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      
      // Check for token amounts (in microLAMPORTS, so divide by 1e6)
      const amountInTokens = value / 1e6;
      
      if (amountInTokens >= 100 && amountInTokens <= 10000000) {
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 'none';
        
        // Search for associated timestamp data
        for (let searchOffset = Math.max(0, offset - 64); 
             searchOffset <= Math.min(data.length - 16, offset + 64); 
             searchOffset += 8) {
          try {
            const ts1 = Number(data.readBigUInt64LE(searchOffset));
            const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
            
            // Valid timestamp range (2024-2026)
            if (ts1 >= 1700000000 && ts1 <= 1800000000 && 
                ts2 > ts1 && ts2 <= 1800000000) {
              startTs = ts1;
              endTs = ts2;
              isLocked = true;
              
              const duration = endTs - startTs;
              if (duration > 3 * 365 * 24 * 3600) {
                lockupKind = 'cliff';
              } else if (duration > 30 * 24 * 3600) {
                lockupKind = 'constant';
              } else if (duration > 7 * 24 * 3600) {
                lockupKind = 'monthly';
              } else {
                lockupKind = 'daily';
              }
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        // Check for duplicates
        const isDuplicate = deposits.some(existing => 
          Math.abs(existing.amount - amountInTokens) < 0.001 &&
          existing.startTs === startTs && existing.endTs === endTs
        );
        
        if (!isDuplicate && amountInTokens > 0) {
          deposits.push({
            amount: amountInTokens,
            startTs,
            endTs,
            isLocked,
            lockupKind
          });
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Calculate multiplier for a deposit using VSR formula
 */
function calculateMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // If unlocked or expired: baseline multiplier (1.0)
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return VSR_CONFIG.baseline;
  }
  
  // If actively locked: apply VSR boost formula
  const timeLeft = deposit.endTs - currentTime;
  const factor = Math.min(timeLeft / VSR_CONFIG.saturation, 1.0);
  const multiplier = VSR_CONFIG.baseline + (factor * VSR_CONFIG.maxExtra);
  
  return multiplier;
}

/**
 * Calculate total governance power for a wallet
 */
async function calculateWalletGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    console.log(`\nProcessing wallet: ${walletAddress}`);
    
    const vsrAccounts = await findAllVSRAccounts(walletPubkey);
    console.log(`Found ${vsrAccounts.length} VSR accounts`);
    
    if (vsrAccounts.length === 0) {
      console.log('No VSR accounts found');
      return { totalPower: 0, deposits: [] };
    }
    
    const allDeposits = [];
    let totalPower = 0;
    
    for (let i = 0; i < vsrAccounts.length; i++) {
      const account = vsrAccounts[i];
      console.log(`  Analyzing VSR account ${i + 1}/${vsrAccounts.length}`);
      
      const deposits = extractAllDeposits(account.account.data, walletAddress);
      
      for (const deposit of deposits) {
        const multiplier = calculateMultiplier(deposit);
        const power = deposit.amount * multiplier;
        
        const currentTime = Math.floor(Date.now() / 1000);
        let status = 'unlocked';
        if (deposit.isLocked) {
          if (deposit.endTs > currentTime) {
            const remainingYears = (deposit.endTs - currentTime) / (365.25 * 24 * 3600);
            status = `${remainingYears.toFixed(2)}y remaining`;
          } else {
            status = 'expired';
          }
        }
        
        console.log(`    Deposit: ${deposit.amount.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${status} | ${multiplier.toFixed(6)}x = ${power.toLocaleString()} power`);
        
        allDeposits.push({
          amount: deposit.amount,
          lockupKind: deposit.lockupKind,
          multiplier,
          power,
          status
        });
        
        totalPower += power;
      }
    }
    
    console.log(`  Total power: ${totalPower.toLocaleString()} ISLAND`);
    return { totalPower, deposits: allDeposits };
    
  } catch (error) {
    console.error(`Error calculating power for ${walletAddress}: ${error.message}`);
    return { totalPower: 0, deposits: [] };
  }
}

/**
 * Validate results against known test wallets
 */
function validateResults(results) {
  const testWallets = {
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': 144709,
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730
  };
  
  let allValid = true;
  
  for (const [wallet, expectedPower] of Object.entries(testWallets)) {
    const result = results.find(r => r.wallet === wallet);
    if (result) {
      const actualPower = result.totalPower;
      const tolerance = expectedPower * 0.05; // 5% tolerance
      const difference = Math.abs(actualPower - expectedPower);
      
      console.log(`\nValidation for ${wallet}:`);
      console.log(`  Expected: ${expectedPower.toLocaleString()}`);
      console.log(`  Actual: ${actualPower.toLocaleString()}`);
      console.log(`  Difference: ${difference.toLocaleString()}`);
      console.log(`  Tolerance: ${tolerance.toLocaleString()}`);
      
      if (difference > tolerance) {
        console.log(`  ❌ VALIDATION FAILED - difference exceeds tolerance`);
        allValid = false;
      } else {
        console.log(`  ✅ VALIDATION PASSED`);
      }
    } else {
      console.log(`\n❌ Test wallet ${wallet} not found in results`);
      allValid = false;
    }
  }
  
  return allValid;
}

/**
 * Update database with governance power
 */
async function updateDatabase(results) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    for (const result of results) {
      await pool.query(`
        UPDATE citizens 
        SET native_governance_power = $1,
            total_governance_power = $2
        WHERE wallet = $3
      `, [result.totalPower, Math.round(result.totalPower * 1000000), result.wallet]);
    }
    
    console.log(`\n✅ Updated ${results.length} citizens in database`);
  } finally {
    await pool.end();
  }
}

/**
 * Main execution function
 */
async function run() {
  console.log('=== Comprehensive VSR Governance Power Calculator ===');
  console.log('Finding ALL VSR voter accounts and applying correct multiplier logic');
  console.log('');
  console.log('VSR Configuration:');
  console.log(`  Baseline: ${VSR_CONFIG.baseline}x`);
  console.log(`  Max Extra: ${VSR_CONFIG.maxExtra}x`);
  console.log(`  Saturation: ${VSR_CONFIG.saturation} seconds (${VSR_CONFIG.saturation / 31536000} years)`);
  console.log('');
  
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
  
  for (const citizen of citizens) {
    const citizenName = citizen.nickname || 'Anonymous';
    console.log(`[${results.length + 1}/${citizens.length}] ${citizenName}:`);
    
    const { totalPower, deposits } = await calculateWalletGovernancePower(citizen.wallet);
    
    results.push({
      wallet: citizen.wallet,
      nickname: citizenName,
      totalPower,
      deposits
    });
  }
  
  // Validate results before database update
  console.log('\n=== VALIDATION PHASE ===');
  const isValid = validateResults(results);
  
  if (!isValid) {
    console.log('\n❌ VALIDATION FAILED - Database will NOT be updated');
    console.log('Fix the calculator to match expected test wallet values');
    process.exit(1);
  }
  
  console.log('\n✅ ALL VALIDATIONS PASSED - Proceeding with database update');
  
  // Update database
  await updateDatabase(results);
  
  // Final summary
  const totalGovernancePower = results.reduce((sum, r) => sum + r.totalPower, 0);
  const citizensWithPower = results.filter(r => r.totalPower > 0);
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Citizens processed: ${citizens.length}`);
  console.log(`Citizens with power: ${citizensWithPower.length}`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  
  // Top 10 citizens
  results.sort((a, b) => b.totalPower - a.totalPower);
  console.log('\nTop 10 Citizens:');
  results.slice(0, 10).forEach((citizen, index) => {
    console.log(`${index + 1}. ${citizen.nickname}: ${citizen.totalPower.toLocaleString()} ISLAND`);
  });
  
  console.log('\n✅ Comprehensive VSR calculation completed successfully');
}

if (require.main === module) {
  run().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  calculateWalletGovernancePower,
  findAllVSRAccounts,
  validateResults
};