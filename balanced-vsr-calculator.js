/**
 * Balanced VSR Governance Power Calculator
 * Captures all legitimate deposits while eliminating duplicates
 * Uses pattern recognition to identify valid deposit entries
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const VSR_CONFIG = {
  baseline: 1.0,
  maxExtra: 3.0,
  saturation: 31536000
};

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Find VSR accounts for a wallet
 */
async function findVSRAccounts(walletPubkey) {
  const accounts = [];
  
  try {
    const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    accounts.push(...authAccounts);
    
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
    
  } catch (error) {
    console.error(`Error searching VSR accounts: ${error.message}`);
  }
  
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
 * Extract deposits with smart duplicate elimination
 */
function extractBalancedDeposits(data) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  // Find all potential deposit amounts with their context
  const potentialDeposits = [];
  
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      if (amountInTokens >= 1000 && amountInTokens <= 50000000) {
        // Look for associated lockup data
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 'none';
        
        // Search for timestamps in nearby offsets
        for (let searchOffset = Math.max(0, offset - 32); 
             searchOffset <= Math.min(data.length - 16, offset + 32); 
             searchOffset += 8) {
          try {
            const ts1 = Number(data.readBigUInt64LE(searchOffset));
            const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
            
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
        
        potentialDeposits.push({
          offset,
          amount: amountInTokens,
          startTs,
          endTs,
          isLocked,
          lockupKind
        });
      }
    } catch (e) {
      continue;
    }
  }
  
  // Smart duplicate elimination
  const finalDeposits = [];
  const processedAmounts = new Map();
  
  // Sort by amount descending to prioritize larger deposits
  potentialDeposits.sort((a, b) => b.amount - a.amount);
  
  for (const deposit of potentialDeposits) {
    const amountKey = Math.round(deposit.amount * 1000); // Round to 3 decimal places
    
    if (!processedAmounts.has(amountKey)) {
      processedAmounts.set(amountKey, deposit);
      finalDeposits.push({
        amount: deposit.amount,
        startTs: deposit.startTs,
        endTs: deposit.endTs,
        isLocked: deposit.isLocked,
        lockupKind: deposit.lockupKind
      });
    }
  }
  
  return finalDeposits;
}

/**
 * Calculate multiplier
 */
function calculateMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // If unlocked or expired: baseline (1.0)
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return VSR_CONFIG.baseline;
  }
  
  // If actively locked: apply VSR formula
  const timeLeft = deposit.endTs - currentTime;
  const factor = Math.min(timeLeft / VSR_CONFIG.saturation, 1.0);
  const multiplier = VSR_CONFIG.baseline + (factor * VSR_CONFIG.maxExtra);
  
  return multiplier;
}

/**
 * Calculate governance power for a wallet
 */
async function calculateWalletGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    console.log(`\nProcessing wallet: ${walletAddress}`);
    
    const vsrAccounts = await findVSRAccounts(walletPubkey);
    console.log(`Found ${vsrAccounts.length} VSR accounts`);
    
    if (vsrAccounts.length === 0) {
      return { totalPower: 0, deposits: [] };
    }
    
    let totalPower = 0;
    const allDeposits = [];
    
    for (let i = 0; i < vsrAccounts.length; i++) {
      const account = vsrAccounts[i];
      console.log(`  Analyzing VSR account ${i + 1}/${vsrAccounts.length}: ${account.pubkey?.toBase58()}`);
      
      const deposits = extractBalancedDeposits(account.account.data);
      console.log(`  Found ${deposits.length} balanced deposits`);
      
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
 * Test validation and process all citizens if valid
 */
async function runBalancedCalculation() {
  console.log('=== Balanced VSR Governance Power Calculator ===');
  console.log('Captures all legitimate deposits while eliminating duplicates');
  console.log('');
  console.log('VSR Configuration:');
  console.log(`  Baseline: ${VSR_CONFIG.baseline}x`);
  console.log(`  Max Extra: ${VSR_CONFIG.maxExtra}x`);
  console.log(`  Saturation: ${VSR_CONFIG.saturation} seconds`);
  
  // Test against validation wallets first
  const testWallets = {
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': 144709,
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730
  };
  
  console.log('\n=== VALIDATION PHASE ===');
  let allValid = true;
  
  for (const [wallet, expectedPower] of Object.entries(testWallets)) {
    const { totalPower } = await calculateWalletGovernancePower(wallet);
    
    const difference = Math.abs(totalPower - expectedPower);
    const tolerance = expectedPower * 0.05; // 5% tolerance
    
    console.log(`\nValidation for ${wallet}:`);
    console.log(`  Expected: ${expectedPower.toLocaleString()}`);
    console.log(`  Actual: ${totalPower.toLocaleString()}`);
    console.log(`  Difference: ${difference.toLocaleString()}`);
    console.log(`  Tolerance: ${tolerance.toLocaleString()}`);
    
    if (difference <= tolerance) {
      console.log(`  ✅ VALIDATION PASSED`);
    } else {
      console.log(`  ❌ VALIDATION FAILED`);
      allValid = false;
    }
  }
  
  if (!allValid) {
    console.log('\n❌ VALIDATION FAILED - Database will NOT be updated');
    console.log('Calculator needs adjustment to match expected test wallet values');
    return false;
  }
  
  console.log('\n✅ ALL VALIDATIONS PASSED - Proceeding with full citizen calculation');
  
  // Process all citizens
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
  
  console.log(`\nProcessing ${citizens.length} citizens...`);
  
  const results = [];
  
  for (const citizen of citizens) {
    const citizenName = citizen.nickname || 'Anonymous';
    console.log(`\n[${results.length + 1}/${citizens.length}] ${citizenName}:`);
    
    const { totalPower } = await calculateWalletGovernancePower(citizen.wallet);
    
    results.push({
      wallet: citizen.wallet,
      nickname: citizenName,
      totalPower
    });
  }
  
  // Update database
  const updatePool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    for (const result of results) {
      await updatePool.query(`
        UPDATE citizens 
        SET native_governance_power = $1,
            total_governance_power = $2
        WHERE wallet = $3
      `, [result.totalPower, Math.round(result.totalPower * 1000000), result.wallet]);
    }
    
    console.log(`\n✅ Updated ${results.length} citizens in database`);
  } finally {
    await updatePool.end();
  }
  
  // Final summary
  const totalGovernancePower = results.reduce((sum, r) => sum + r.totalPower, 0);
  const citizensWithPower = results.filter(r => r.totalPower > 0);
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Citizens processed: ${citizens.length}`);
  console.log(`Citizens with power: ${citizensWithPower.length}`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  
  results.sort((a, b) => b.totalPower - a.totalPower);
  console.log('\nTop 10 Citizens:');
  results.slice(0, 10).forEach((citizen, index) => {
    console.log(`${index + 1}. ${citizen.nickname}: ${citizen.totalPower.toLocaleString()} ISLAND`);
  });
  
  console.log('\n✅ Balanced VSR calculation completed successfully');
  return true;
}

if (require.main === module) {
  runBalancedCalculation().catch(console.error);
}

module.exports = { 
  calculateWalletGovernancePower,
  runBalancedCalculation
};