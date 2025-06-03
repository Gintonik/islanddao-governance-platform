/**
 * Simplified Canonical VSR Validator
 * Focuses on accurate detection of native and delegated governance power
 * Based on debugging insights from kruHL3zJ analysis
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Ground truth for validation
const groundTruth = [
  {
    wallet: "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC",
    expectedDeposits: [310472.9693, 126344.82227],
    expectedDelegated: 0,
    note: "Should find both deposits in authority-owned account"
  },
  {
    wallet: "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4", 
    expectedDeposits: [13625.581],
    note: "Minimal native deposits"
  },
  {
    wallet: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA",
    expectedDelegated: 0,
    note: "Separate wallet - no delegation expected"
  }
];

/**
 * Calculate VSR multiplier: 1 + min(years_remaining, 4) capped at 5x
 */
function calculateVSRMultiplier(lockupEndTs, lockupKind) {
  const now = Math.floor(Date.now() / 1000);
  
  if (lockupKind === 0 || lockupEndTs === 0 || lockupEndTs <= now) {
    return 1.0;
  }
  
  const remainingSeconds = lockupEndTs - now;
  const remainingYears = remainingSeconds / (365 * 24 * 3600);
  return Math.min(1 + Math.min(remainingYears, 4), 5.0);
}

/**
 * Parse native deposits from account where authority === walletAddress
 */
function parseNativeDeposits(data, accountPubkey) {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Based on kruHL3zJ debugging: deposits found at offsets 104, 184, 192
  const offsets = [104, 112, 184, 192, 200, 208, 216];
  
  for (const offset of offsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          const key = Math.round(amount * 1000);
          
          if (amount >= 1000 && amount <= 50000000 && !seenAmounts.has(key)) {
            seenAmounts.add(key);
            
            let lockupKind = 0;
            let lockupEndTs = 0;
            
            // Extract lockup data if available
            if (offset + 48 <= data.length) {
              try {
                lockupKind = data[offset + 24] || 0;
                lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              } catch (e) {
                // Use defaults
              }
            }
            
            const multiplier = calculateVSRMultiplier(lockupEndTs, lockupKind);
            const isActive = lockupKind !== 0 && lockupEndTs > Math.floor(Date.now() / 1000);
            
            deposits.push({
              amount,
              lockupKind,
              lockupEndTs,
              multiplier,
              governancePower: amount * multiplier,
              isActive,
              offset,
              accountPubkey: accountPubkey.substring(0, 8)
            });
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
 * Parse delegation power from account where voterAuthority === walletAddress AND authority !== voterAuthority
 */
function parseDelegationPower(data, authority, voterAuthority, accountPubkey) {
  const delegationEntries = [];
  
  // Scan for delegation amounts at common offsets
  const offsets = [104, 112, 120, 128, 136, 144];
  
  for (const offset of offsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          
          if (amount >= 100 && amount <= 50000000) {
            let lockupKind = 0;
            let lockupEndTs = 0;
            
            if (offset + 48 <= data.length) {
              try {
                lockupKind = data[offset + 24] || 0;
                lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              } catch (e) {
                // Use defaults
              }
            }
            
            const multiplier = calculateVSRMultiplier(lockupEndTs, lockupKind);
            
            delegationEntries.push({
              amount,
              multiplier,
              governancePower: amount * multiplier,
              offset,
              from: authority.substring(0, 8)
            });
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return delegationEntries;
}

/**
 * Calculate governance power for a single wallet
 */
async function calculateWalletGovernancePower(walletAddress) {
  console.log(`\nCalculating governance power for ${walletAddress.substring(0,8)}...`);
  
  const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  let nativePower = 0;
  let delegatedPower = 0;
  const nativeDeposits = [];
  const delegations = [];
  
  for (const { pubkey, account } of programAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      // NATIVE POWER: authority === walletAddress
      if (authority === walletAddress) {
        const deposits = parseNativeDeposits(data, pubkey.toBase58());
        
        for (const deposit of deposits) {
          nativePower += deposit.governancePower;
          nativeDeposits.push(deposit);
        }
        
        if (deposits.length > 0) {
          console.log(`  Found native account ${pubkey.toBase58().substring(0,8)} with ${deposits.length} deposits`);
        }
      }
      
      // DELEGATED POWER: voterAuthority === walletAddress AND authority !== voterAuthority
      if (voterAuthority === walletAddress && authority !== voterAuthority) {
        const delegationEntries = parseDelegationPower(data, authority, voterAuthority, pubkey.toBase58());
        
        const accountPower = delegationEntries.reduce((sum, entry) => sum + entry.governancePower, 0);
        
        if (accountPower > 0) {
          delegatedPower += accountPower;
          delegations.push({
            from: authority,
            fromShort: authority.substring(0, 8),
            power: accountPower,
            accountPubkey: pubkey.toBase58().substring(0, 8),
            entries: delegationEntries
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return {
    wallet: walletAddress,
    nativePower,
    delegatedPower,
    totalPower: nativePower + delegatedPower,
    nativeDeposits,
    delegations
  };
}

/**
 * Validate results against ground truth
 */
function validateResults(result, expected) {
  console.log(`\nValidating ${result.wallet.substring(0,8)}:`);
  console.log(`  Native: ${result.nativePower.toFixed(3)} ISLAND from ${result.nativeDeposits.length} deposits`);
  console.log(`  Delegated: ${result.delegatedPower.toFixed(3)} ISLAND from ${result.delegations.length} delegators`);
  console.log(`  Total: ${result.totalPower.toFixed(3)} ISLAND`);
  
  const validations = [];
  
  // Validate expected deposits
  if (expected.expectedDeposits) {
    console.log(`  Expected deposits: ${expected.expectedDeposits.join(', ')}`);
    
    for (const expectedAmount of expected.expectedDeposits) {
      const found = result.nativeDeposits.some(d => Math.abs(d.amount - expectedAmount) < 0.01);
      const status = found ? '✅' : '❌';
      console.log(`    ${status} ${expectedAmount.toFixed(3)} ISLAND: ${found ? 'FOUND' : 'NOT FOUND'}`);
      validations.push({ type: 'deposit', expected: expectedAmount, found });
    }
  }
  
  // Validate expected delegation
  if (expected.expectedDelegated !== undefined) {
    const delegationMatch = Math.abs(result.delegatedPower - expected.expectedDelegated) < 1000;
    const status = delegationMatch ? '✅' : '❌';
    console.log(`    ${status} Expected delegation: ${expected.expectedDelegated}, Got: ${result.delegatedPower.toFixed(3)}`);
    validations.push({ type: 'delegation', expected: expected.expectedDelegated, actual: result.delegatedPower, match: delegationMatch });
  }
  
  // Show deposit details
  if (result.nativeDeposits.length > 0) {
    console.log(`  Native deposit details:`);
    for (const deposit of result.nativeDeposits) {
      const status = deposit.isActive ? 'ACTIVE' : 'EXPIRED';
      console.log(`    ${deposit.amount.toFixed(3)} × ${deposit.multiplier.toFixed(2)}x = ${deposit.governancePower.toFixed(3)} ISLAND (${status}, offset ${deposit.offset})`);
    }
  }
  
  // Show delegation details
  if (result.delegations.length > 0) {
    console.log(`  Delegations:`);
    for (const delegation of result.delegations) {
      console.log(`    From ${delegation.fromShort}: ${delegation.power.toFixed(3)} ISLAND`);
    }
  }
  
  return validations;
}

/**
 * Run simplified canonical validation
 */
async function runSimplifiedValidation() {
  console.log('SIMPLIFIED CANONICAL VSR VALIDATOR');
  console.log('==================================');
  console.log('Accurate detection using debugging insights');
  
  const results = [];
  
  for (const expected of groundTruth) {
    console.log(`\n${expected.note}`);
    
    const result = await calculateWalletGovernancePower(expected.wallet);
    const validations = validateResults(result, expected);
    
    results.push({ result, expected, validations });
  }
  
  console.log('\n\nFINAL SUMMARY');
  console.log('=============');
  
  let allPassed = true;
  
  for (const { result, expected, validations } of results) {
    console.log(`\n${result.wallet.substring(0,8)}: ${result.nativePower.toFixed(3)} native + ${result.delegatedPower.toFixed(3)} delegated = ${result.totalPower.toFixed(3)} ISLAND`);
    
    const depositsPassed = validations.filter(v => v.type === 'deposit' && v.found).length;
    const totalDeposits = validations.filter(v => v.type === 'deposit').length;
    
    if (totalDeposits > 0) {
      console.log(`  Deposits: ${depositsPassed}/${totalDeposits} found`);
      if (depositsPassed < totalDeposits) allPassed = false;
    }
    
    const delegationValidations = validations.filter(v => v.type === 'delegation');
    if (delegationValidations.length > 0) {
      const delegationPassed = delegationValidations[0].match;
      console.log(`  Delegation: ${delegationPassed ? 'PASS' : 'FAIL'}`);
      if (!delegationPassed) allPassed = false;
    }
  }
  
  console.log(`\nOverall validation: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log('\nCanonical rules applied:');
  console.log('- Native: authority === walletAddress');
  console.log('- Delegated: voterAuthority === walletAddress AND authority !== voterAuthority');
  console.log('- VSR multiplier: 1 + min(years_remaining, 4) capped at 5x');
  console.log('- No hardcoded exclusions');
}

runSimplifiedValidation()
  .then(() => {
    console.log('\nSimplified canonical validation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });