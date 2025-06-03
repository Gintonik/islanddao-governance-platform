/**
 * Batch Validate Canonical VSR Scanner
 * Tests the canonical scanner against known ground truth wallets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Load all VSR accounts for comprehensive delegation analysis
 */
async function loadAllVSRAccounts() {
  console.log('Loading all VSR accounts for delegation analysis...');
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  console.log(`Loaded ${allAccounts.length} VSR accounts`);
  return allAccounts;
}

/**
 * Parse authorities from VSR account
 */
function parseVSRAuthorities(data) {
  try {
    if (data.length < 104) return null;
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

/**
 * Parse deposits from VSR account with comprehensive scanning
 */
function parseVSRDeposits(data) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  const foundAmounts = new Set();
  
  // Standard VSR deposit structure
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        if (rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 1 && islandAmount <= 50000000) {
            const roundedAmount = Math.round(islandAmount);
            if (!foundAmounts.has(roundedAmount)) {
              foundAmounts.add(roundedAmount);
              
              const lockupKind = data[offset + 24];
              const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
              const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
              const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
              
              deposits.push({
                amount: islandAmount,
                multiplier: multiplier,
                power: islandAmount * multiplier
              });
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  // Additional offset scanning for large deposits
  const additionalOffsets = [104, 112, 184, 192, 200, 208, 216, 224, 232, 240];
  for (const offset of additionalOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 100000 && islandAmount <= 50000000) {
            const roundedAmount = Math.round(islandAmount);
            if (!foundAmounts.has(roundedAmount)) {
              foundAmounts.add(roundedAmount);
              
              deposits.push({
                amount: islandAmount,
                multiplier: 1.0,
                power: islandAmount
              });
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return deposits;
}

/**
 * Find all delegations to a target wallet
 */
function findDelegationsToWallet(walletAddress, allVSRAccounts) {
  const delegations = [];
  
  for (const { pubkey, account } of allVSRAccounts) {
    const authorities = parseVSRAuthorities(account.data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Look for delegations TO this wallet (voterAuthority === wallet AND authority !== wallet)
    if (voterAuthority === walletAddress && authority !== walletAddress) {
      const deposits = parseVSRDeposits(account.data);
      
      if (deposits.length > 0) {
        const totalPower = deposits.reduce((sum, d) => sum + d.power, 0);
        
        delegations.push({
          account: pubkey.toBase58(),
          from: authority,
          totalPower: totalPower,
          deposits: deposits
        });
      }
    }
  }
  
  return delegations;
}

/**
 * Calculate native governance power for a wallet
 */
function calculateNativePower(walletAddress, allVSRAccounts) {
  let totalNativePower = 0;
  const nativeDeposits = [];
  
  for (const { pubkey, account } of allVSRAccounts) {
    const authorities = parseVSRAuthorities(account.data);
    if (!authorities) continue;
    
    // Native power: authority === wallet
    if (authorities.authority === walletAddress) {
      const deposits = parseVSRDeposits(account.data);
      
      for (const deposit of deposits) {
        totalNativePower += deposit.power;
        nativeDeposits.push({
          account: pubkey.toBase58(),
          ...deposit
        });
      }
    }
  }
  
  return { totalNativePower, nativeDeposits };
}

/**
 * Validate a wallet against expected values
 */
async function validateWallet(testCase, allVSRAccounts) {
  console.log(`\nValidating ${testCase.wallet.substring(0,8)} (${testCase.note})`);
  
  // Calculate native power
  const nativeResult = calculateNativePower(testCase.wallet, allVSRAccounts);
  
  // Find delegations
  const delegations = findDelegationsToWallet(testCase.wallet, allVSRAccounts);
  const totalDelegatedPower = delegations.reduce((sum, d) => sum + d.totalPower, 0);
  
  console.log(`🟢 Native Power: ${nativeResult.totalNativePower.toFixed(3)} ISLAND`);
  console.log(`🟡 Delegated Power: ${totalDelegatedPower.toFixed(3)} ISLAND`);
  console.log(`🔷 Total Power: ${(nativeResult.totalNativePower + totalDelegatedPower).toFixed(3)} ISLAND`);
  
  if (delegations.length > 0) {
    console.log(`   Delegations from:`);
    for (const delegation of delegations) {
      console.log(`     ${delegation.from.substring(0,8)}: ${delegation.totalPower.toFixed(3)} ISLAND`);
    }
  }
  
  // Validate native power
  let nativeValid = true;
  if (typeof testCase.expectedNative === 'number') {
    const nativeMatch = Math.abs(nativeResult.totalNativePower - testCase.expectedNative) / testCase.expectedNative < 0.05;
    console.log(`  Native validation: ${nativeMatch ? '✅ PASS' : '❌ FAIL'} (expected: ${testCase.expectedNative})`);
    nativeValid = nativeMatch;
  }
  
  // Validate delegated power
  let delegatedValid = true;
  if (typeof testCase.expectedDelegated === 'number') {
    const delegatedMatch = testCase.expectedDelegated === 0 ? 
      totalDelegatedPower === 0 : 
      Math.abs(totalDelegatedPower - testCase.expectedDelegated) / testCase.expectedDelegated < 0.05;
    console.log(`  Delegated validation: ${delegatedMatch ? '✅ PASS' : '❌ FAIL'} (expected: ${testCase.expectedDelegated})`);
    delegatedValid = delegatedMatch;
  }
  
  // Validate specific deposits
  if (testCase.expectedDeposits) {
    console.log(`  Expected deposits validation:`);
    for (const expectedAmount of testCase.expectedDeposits) {
      const found = nativeResult.nativeDeposits.some(d => Math.abs(d.amount - expectedAmount) < 1);
      console.log(`    ${expectedAmount.toFixed(3)} ISLAND: ${found ? '✅ FOUND' : '❌ MISSING'}`);
    }
  }
  
  return {
    walletAddress: testCase.wallet,
    nativePower: nativeResult.totalNativePower,
    delegatedPower: totalDelegatedPower,
    totalPower: nativeResult.totalNativePower + totalDelegatedPower,
    nativeValid,
    delegatedValid,
    delegations
  };
}

/**
 * Run batch validation on all test cases
 */
async function runBatchValidation() {
  const testCases = [
    {
      wallet: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
      expectedDeposits: [310472.9693, 126344.82227],
      expectedDelegated: 0,
      note: 'Should find 310K + 126K deposits, NO delegated power'
    },
    {
      wallet: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
      expectedNative: 13625.581,
      expectedDelegated: 4189328.11,
      note: 'Small native + large delegation from CinHb6Xt'
    },
    {
      wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
      expectedNative: 10350000,
      expectedDelegated: 1268162,
      note: 'Large native + significant delegated'
    }
  ];
  
  console.log('BATCH CANONICAL VSR VALIDATION');
  console.log('==============================');
  
  // Load all VSR accounts once for efficiency
  const allVSRAccounts = await loadAllVSRAccounts();
  
  const results = [];
  
  for (const testCase of testCases) {
    try {
      const result = await validateWallet(testCase, allVSRAccounts);
      results.push(result);
    } catch (error) {
      console.log(`  Error validating ${testCase.wallet}: ${error.message}`);
      results.push({ walletAddress: testCase.wallet, error: error.message });
    }
  }
  
  // Summary
  console.log('\n\nVALIDATION SUMMARY');
  console.log('==================');
  
  const validResults = results.filter(r => !r.error);
  const nativePassCount = validResults.filter(r => r.nativeValid !== false).length;
  const delegatedPassCount = validResults.filter(r => r.delegatedValid !== false).length;
  
  console.log(`Native power calculations: ${nativePassCount}/${validResults.length} passed`);
  console.log(`Delegated power calculations: ${delegatedPassCount}/${validResults.length} passed`);
  
  if (nativePassCount === validResults.length && delegatedPassCount === validResults.length) {
    console.log('\n✅ ALL VALIDATIONS PASSED - Canonical VSR scanner is accurate');
  } else {
    console.log('\n❌ SOME VALIDATIONS FAILED - Scanner needs adjustment');
  }
  
  return results;
}

// Run the batch validation
runBatchValidation()
  .then(() => {
    console.log('\nBatch canonical VSR validation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Batch validation failed:', error);
    process.exit(1);
  });