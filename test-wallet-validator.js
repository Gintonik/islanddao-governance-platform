/**
 * Test Wallet Validator
 * Focuses on the two specific test wallets to validate VSR calculation accuracy
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const VSR_CONFIG = {
  baseline: 1.0,
  maxExtra: 3.0,
  saturation: 31536000 // 1 year in seconds
};

const connection = new Connection(HELIUS_RPC, 'confirmed');

const TEST_WALLETS = {
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': 144709,
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730
};

/**
 * Find ALL VSR accounts for a wallet
 */
async function findAllVSRAccounts(walletPubkey) {
  console.log(`Searching for VSR accounts for ${walletPubkey.toBase58()}...`);
  const accounts = [];
  
  try {
    // Method 1: Standard authority search
    const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    console.log(`  Found ${authAccounts.length} accounts via authority search`);
    accounts.push(...authAccounts);
    
    // Method 2: Voter PDA
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
      console.log(`  Found Voter PDA: ${voterPDA.toBase58()}`);
      accounts.push({ pubkey: voterPDA, account: voterAccount });
    }
    
    // Method 3: Broader offset search
    for (const offset of [16, 24, 32, 40, 48, 56, 64]) {
      try {
        const offsetAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
          filters: [
            { memcmp: { offset, bytes: walletPubkey.toBase58() } }
          ]
        });
        if (offsetAccounts.length > 0) {
          console.log(`  Found ${offsetAccounts.length} accounts at offset ${offset}`);
          accounts.push(...offsetAccounts);
        }
      } catch (e) {
        continue;
      }
    }
    
  } catch (error) {
    console.error(`Error searching VSR accounts: ${error.message}`);
  }
  
  // Remove duplicates
  const uniqueAccounts = [];
  const seenPubkeys = new Set();
  
  for (const account of accounts) {
    const pubkeyStr = account.pubkey?.toBase58() || 'unknown';
    if (!seenPubkeys.has(pubkeyStr)) {
      seenPubkeys.add(pubkeyStr);
      uniqueAccounts.push(account);
    }
  }
  
  console.log(`  Total unique VSR accounts: ${uniqueAccounts.length}`);
  return uniqueAccounts;
}

/**
 * Extract deposits with comprehensive parsing
 */
function extractAllDeposits(data) {
  const deposits = [];
  
  // More comprehensive deposit extraction
  for (let offset = 0; offset < data.length - 32; offset += 4) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      // Wider range for deposit amounts
      if (amountInTokens >= 10 && amountInTokens <= 50000000) {
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 'none';
        
        // Search for timestamp data in wider range
        for (let searchOffset = Math.max(0, offset - 128); 
             searchOffset <= Math.min(data.length - 16, offset + 128); 
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
        
        // Check for duplicates with looser tolerance
        const isDuplicate = deposits.some(existing => 
          Math.abs(existing.amount - amountInTokens) < 1.0
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
 * Test specific wallet
 */
async function testWallet(walletAddress, expectedPower) {
  console.log(`\n=== Testing ${walletAddress} ===`);
  console.log(`Expected power: ${expectedPower.toLocaleString()}`);
  
  const walletPubkey = new PublicKey(walletAddress);
  const vsrAccounts = await findAllVSRAccounts(walletPubkey);
  
  if (vsrAccounts.length === 0) {
    console.log('❌ No VSR accounts found');
    return false;
  }
  
  let totalPower = 0;
  let totalDeposits = 0;
  
  for (let i = 0; i < vsrAccounts.length; i++) {
    const account = vsrAccounts[i];
    console.log(`\nAnalyzing VSR account ${i + 1}/${vsrAccounts.length}: ${account.pubkey?.toBase58()}`);
    
    const deposits = extractAllDeposits(account.account.data);
    console.log(`Found ${deposits.length} deposits in this account`);
    
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
      
      console.log(`  Deposit: ${deposit.amount.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${status} | ${multiplier.toFixed(6)}x = ${power.toLocaleString()} power`);
      
      totalPower += power;
      totalDeposits++;
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`  Total deposits: ${totalDeposits}`);
  console.log(`  Total power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`  Expected: ${expectedPower.toLocaleString()} ISLAND`);
  
  const difference = Math.abs(totalPower - expectedPower);
  const tolerance = expectedPower * 0.05; // 5% tolerance
  
  console.log(`  Difference: ${difference.toLocaleString()}`);
  console.log(`  Tolerance: ${tolerance.toLocaleString()}`);
  
  if (difference <= tolerance) {
    console.log(`  ✅ VALIDATION PASSED`);
    return true;
  } else {
    console.log(`  ❌ VALIDATION FAILED`);
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('=== Test Wallet Validator ===');
  console.log('VSR Configuration:');
  console.log(`  Baseline: ${VSR_CONFIG.baseline}x`);
  console.log(`  Max Extra: ${VSR_CONFIG.maxExtra}x`);
  console.log(`  Saturation: ${VSR_CONFIG.saturation} seconds`);
  
  let allPassed = true;
  
  for (const [wallet, expectedPower] of Object.entries(TEST_WALLETS)) {
    const passed = await testWallet(wallet, expectedPower);
    if (!passed) {
      allPassed = false;
    }
  }
  
  console.log('\n=== FINAL VALIDATION RESULT ===');
  if (allPassed) {
    console.log('✅ ALL TEST WALLETS PASSED - Calculator is working correctly');
  } else {
    console.log('❌ SOME TEST WALLETS FAILED - Calculator needs adjustment');
  }
  
  return allPassed;
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testWallet, runTests };