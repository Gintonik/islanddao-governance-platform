/**
 * Canonical VSR Governance Power Validator
 * Uses verified ground-truth test cases to validate and correct the scanner
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Ground-truth test cases for validation
const GROUND_TRUTH_CASES = [
  {
    wallet: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
    expectedDeposits: [310472.9693, 126344.82227],
    expectedNative: 'multiplier-based calculation',
    expectedDelegated: 0,
    note: 'All locked in VSR with voting multipliers, NO delegated power'
  },
  {
    wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
    expectedNative: 10350000, // ~10.35M
    expectedDelegated: 1268162, // ~1,268,162
    expectedTotal: 11620000, // ~11.62M
    note: 'Large native + significant delegated'
  },
  {
    wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKz7oKDp',
    expectedNative: 3360000, // ~3.36M
    expectedDelegated: 1600000, // ~1.6M
    note: 'Both native and delegated power'
  },
  {
    wallet: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    expectedNative: 13625.581,
    expectedDelegated: 4189328.11,
    delegator: 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i',
    note: 'Small native + large delegation from CinHb6Xt'
  }
];

/**
 * Parse VSR deposits with canonical Anchor-compatible struct parsing
 */
function parseCanonicalDeposits(data, verbose = false) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  if (verbose) {
    console.log(`    Parsing deposits from ${data.length} byte account`);
  }
  
  // Canonical VSR deposit structure: offset 104 + 87*i
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const isUsedByte = data[offset];
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        const lockupKind = data[offset + 24];
        const lockupStartTs = Number(data.readBigUInt64LE(offset + 32));
        const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
        
        // Handle non-standard isUsed values (like 131)
        const isUsed = isUsedByte !== 0;
        
        if (rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 100 && islandAmount <= 50000000) {
            // Calculate IslandDAO voting multiplier
            let multiplier = 1.0;
            
            if (lockupKind !== 0 && lockupEndTs > timestamp) {
              // Active lockup - calculate multiplier based on duration
              const lockupDuration = lockupEndTs - Math.max(lockupStartTs, timestamp);
              const maxDuration = 4 * 365 * 24 * 3600; // 4 years in seconds
              multiplier = Math.min(1 + (lockupDuration / maxDuration), 5.0);
            }
            
            deposits.push({
              depositIndex: i,
              amount: islandAmount,
              multiplier: multiplier,
              power: islandAmount * multiplier,
              isActive: lockupKind !== 0 && lockupEndTs > timestamp,
              isUsed: isUsed,
              isUsedByte: isUsedByte,
              lockupKind: lockupKind,
              lockupEndTs: lockupEndTs
            });
            
            if (verbose) {
              const status = lockupKind !== 0 && lockupEndTs > timestamp ? 'ACTIVE' : 'EXPIRED';
              console.log(`      Deposit ${i}: ${islandAmount.toFixed(3)} × ${multiplier.toFixed(2)}x = ${(islandAmount * multiplier).toFixed(3)} ISLAND (${status}, isUsed: ${isUsedByte})`);
            }
          }
        }
      } catch (error) {
        if (verbose) {
          console.log(`      Error parsing deposit ${i}: ${error.message}`);
        }
        continue;
      }
    }
  }
  
  return deposits;
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
 * Calculate canonical native governance power
 */
async function calculateCanonicalNativePower(walletAddress, verbose = false) {
  // Find Voter accounts where authority === wallet
  const nativeAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  let totalNativePower = 0;
  const allDeposits = [];
  
  if (verbose) {
    console.log(`  Found ${nativeAccounts.length} Voter accounts where wallet is authority`);
  }
  
  for (const { pubkey, account } of nativeAccounts) {
    if (verbose) {
      console.log(`  Analyzing native account: ${pubkey.toBase58()}`);
    }
    
    const deposits = parseCanonicalDeposits(account.data, verbose);
    allDeposits.push(...deposits);
    
    for (const deposit of deposits) {
      totalNativePower += deposit.power;
    }
  }
  
  return {
    totalNativePower,
    deposits: allDeposits,
    accountCount: nativeAccounts.length
  };
}

/**
 * Calculate canonical delegated governance power
 */
async function calculateCanonicalDelegatedPower(walletAddress, verbose = false) {
  // Scan all VSR accounts for delegation relationships
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  let totalDelegatedPower = 0;
  const delegations = [];
  
  if (verbose) {
    console.log(`  Scanning ${allAccounts.length} VSR accounts for delegations...`);
  }
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    const authorities = parseVSRAuthorities(data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Delegation: voterAuthority === wallet AND authority !== wallet
    if (voterAuthority === walletAddress && authority !== walletAddress) {
      if (verbose) {
        console.log(`  Found delegation account: ${pubkey.toBase58()} (from ${authority.substring(0,8)})`);
      }
      
      const deposits = parseCanonicalDeposits(data, verbose);
      
      for (const deposit of deposits) {
        totalDelegatedPower += deposit.power;
        delegations.push({
          account: pubkey.toBase58(),
          from: authority,
          ...deposit
        });
      }
    }
  }
  
  return {
    totalDelegatedPower,
    delegations
  };
}

/**
 * Validate wallet against ground truth
 */
async function validateWalletCanonical(testCase, verbose = false) {
  console.log(`\nValidating ${testCase.wallet.substring(0,8)} (${testCase.note})`);
  
  // Calculate native power
  const nativeResult = await calculateCanonicalNativePower(testCase.wallet, verbose);
  
  // Calculate delegated power
  const delegatedResult = await calculateCanonicalDelegatedPower(testCase.wallet, verbose);
  
  const totalPower = nativeResult.totalNativePower + delegatedResult.totalDelegatedPower;
  
  console.log(`\n🏛️ VWR Total: N/A`);
  console.log(`🟢 Native from Deposits: ${nativeResult.totalNativePower.toFixed(3)}`);
  console.log(`🟡 Delegated from Others: ${delegatedResult.totalDelegatedPower.toFixed(3)}`);
  console.log(`🧠 Inference Used? false`);
  console.log(`  Total Power: ${totalPower.toFixed(3)} ISLAND`);
  
  // Validation against ground truth
  let validationPassed = true;
  
  if (testCase.expectedDeposits) {
    console.log(`\n  Checking expected deposits:`);
    for (const expectedAmount of testCase.expectedDeposits) {
      const found = nativeResult.deposits.some(d => Math.abs(d.amount - expectedAmount) < 1);
      console.log(`    ${expectedAmount.toFixed(3)} ISLAND: ${found ? '✅ FOUND' : '❌ MISSING'}`);
      if (!found) validationPassed = false;
    }
  }
  
  if (typeof testCase.expectedNative === 'number') {
    const nativeError = Math.abs(nativeResult.totalNativePower - testCase.expectedNative) / testCase.expectedNative;
    console.log(`  Native Power: Expected ${testCase.expectedNative.toLocaleString()}, Got ${nativeResult.totalNativePower.toFixed(3)} (${(nativeError * 100).toFixed(2)}% error)`);
    if (nativeError > 0.05) validationPassed = false; // 5% tolerance
  }
  
  if (typeof testCase.expectedDelegated === 'number') {
    const delegatedError = testCase.expectedDelegated === 0 ? 
      (delegatedResult.totalDelegatedPower === 0 ? 0 : 1) :
      Math.abs(delegatedResult.totalDelegatedPower - testCase.expectedDelegated) / testCase.expectedDelegated;
    console.log(`  Delegated Power: Expected ${testCase.expectedDelegated.toLocaleString()}, Got ${delegatedResult.totalDelegatedPower.toFixed(3)} (${(delegatedError * 100).toFixed(2)}% error)`);
    if (delegatedError > 0.05) validationPassed = false; // 5% tolerance
  }
  
  if (testCase.delegator) {
    const foundDelegator = delegatedResult.delegations.some(d => d.from === testCase.delegator);
    console.log(`  Expected delegator ${testCase.delegator.substring(0,8)}: ${foundDelegator ? '✅ FOUND' : '❌ MISSING'}`);
    if (!foundDelegator) validationPassed = false;
  }
  
  console.log(`\n  Validation: ${validationPassed ? '✅ PASSED' : '❌ FAILED'}`);
  
  return {
    wallet: testCase.wallet,
    nativePower: nativeResult.totalNativePower,
    delegatedPower: delegatedResult.totalDelegatedPower,
    totalPower,
    validationPassed,
    nativeDeposits: nativeResult.deposits,
    delegations: delegatedResult.delegations
  };
}

/**
 * Run canonical validation on all test cases
 */
async function runCanonicalValidation() {
  console.log('CANONICAL VSR GOVERNANCE POWER VALIDATOR');
  console.log('=======================================');
  console.log('Using verified ground-truth test cases to validate scanner accuracy');
  
  const results = [];
  let passedCount = 0;
  
  for (const testCase of GROUND_TRUTH_CASES) {
    try {
      const result = await validateWalletCanonical(testCase, true);
      results.push(result);
      if (result.validationPassed) passedCount++;
    } catch (error) {
      console.log(`  Error validating ${testCase.wallet}: ${error.message}`);
    }
  }
  
  console.log(`\n📊 VALIDATION SUMMARY:`);
  console.log(`✅ Passed: ${passedCount}/${GROUND_TRUTH_CASES.length}`);
  console.log(`📈 Success Rate: ${(passedCount / GROUND_TRUTH_CASES.length * 100).toFixed(1)}%`);
  
  if (passedCount === GROUND_TRUTH_CASES.length) {
    console.log(`\n🎯 ALL VALIDATIONS PASSED - Canonical scanner is accurate!`);
  } else {
    console.log(`\n🔧 Some validations failed - scanner needs adjustment`);
  }
  
  return results;
}

// Run validation
runCanonicalValidation()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });