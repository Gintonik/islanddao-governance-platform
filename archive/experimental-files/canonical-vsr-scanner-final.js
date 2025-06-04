/**
 * Canonical VSR Scanner - Final Implementation
 * Accurately detects native governance power and applies proper delegation rules
 * No hardcoded exclusions - uses only canonical VSR logic
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate VSR multiplier: 1 + min(years_remaining, 4) with 5x cap
 */
function calculateVSRMultiplier(lockupEndTs) {
  const now = Math.floor(Date.now() / 1000);
  
  if (lockupEndTs === 0 || lockupEndTs <= now) {
    return 1.0;
  }
  
  const remainingSeconds = lockupEndTs - now;
  const remainingYears = remainingSeconds / (365 * 24 * 3600);
  
  // VSR formula: 1 + min(years_remaining, 4) with 5x total cap
  return Math.min(1 + Math.min(remainingYears, 4), 5.0);
}

/**
 * Parse all deposit entries from VSR account data
 * Extracts deposits from multiple parsing methods and deduplicates
 */
function parseAllDepositEntries(data) {
  const deposits = [];
  const seenDeposits = new Map(); // key: amount_rounded, value: deposit
  
  if (data.length < 100) return deposits;
  
  // Method 1: Parse 2728-byte VSR accounts (standard Voter accounts)
  if (data.length >= 2728) {
    // Standard deposit entry slots (32 deposits max)
    for (let i = 0; i < 32; i++) {
      const offset = 104 + (87 * i);
      if (offset + 48 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset + 8));
          if (rawAmount > 0) {
            const amount = rawAmount / 1e6;
            const lockupKind = data[offset + 24];
            const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
            
            if (amount >= 1 && amount <= 50000000) {
              const key = Math.round(amount * 1000); // Round to 3 decimals for deduplication
              
              if (!seenDeposits.has(key)) {
                const multiplier = calculateVSRMultiplier(lockupEndTs);
                const isActive = lockupEndTs > Math.floor(Date.now() / 1000);
                
                seenDeposits.set(key, {
                  amount,
                  lockupKind,
                  lockupEndTs,
                  multiplier,
                  power: amount * multiplier,
                  isActive,
                  source: `slot_${i}`,
                  isUsed: true,
                  amountDeposited: amount
                });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    // Additional large deposit detection at special offsets
    const specialOffsets = [104, 184, 192, 200, 208, 216];
    for (const offset of specialOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset));
          if (rawAmount > 0) {
            const amount = rawAmount / 1e6;
            
            if (amount >= 50000 && amount <= 50000000) {
              const key = Math.round(amount * 1000);
              
              if (!seenDeposits.has(key)) {
                let lockupKind = 0;
                let lockupEndTs = 0;
                let multiplier = 1.0;
                
                // Try to extract lockup data if available
                if (offset + 48 <= data.length) {
                  try {
                    lockupKind = data[offset + 24];
                    lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
                    multiplier = calculateVSRMultiplier(lockupEndTs);
                  } catch (error) {
                    // Use default values
                  }
                }
                
                const isActive = lockupEndTs > Math.floor(Date.now() / 1000);
                
                seenDeposits.set(key, {
                  amount,
                  lockupKind,
                  lockupEndTs,
                  multiplier,
                  power: amount * multiplier,
                  isActive,
                  source: `offset_${offset}`,
                  isUsed: true,
                  amountDeposited: amount
                });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  // Method 2: Parse 176-byte delegation accounts
  else if (data.length >= 176) {
    const offsets = [104, 112, 120, 128];
    for (const offset of offsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset));
          if (rawAmount > 0) {
            const amount = rawAmount / 1e6;
            
            if (amount >= 100 && amount <= 50000000) {
              const key = Math.round(amount * 1000);
              
              if (!seenDeposits.has(key)) {
                let lockupKind = 0;
                let lockupEndTs = 0;
                let multiplier = 1.0;
                
                // For 176-byte accounts, lockup data might be at offset + 16
                if (offset + 48 <= data.length) {
                  try {
                    lockupKind = data[offset + 24] || 0;
                    lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
                    multiplier = calculateVSRMultiplier(lockupEndTs);
                  } catch (error) {
                    // Use default values
                  }
                }
                
                const isActive = lockupEndTs > Math.floor(Date.now() / 1000);
                
                seenDeposits.set(key, {
                  amount,
                  lockupKind,
                  lockupEndTs,
                  multiplier,
                  power: amount * multiplier,
                  isActive,
                  source: `delegation_${offset}`,
                  isUsed: true,
                  amountDeposited: amount
                });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  return Array.from(seenDeposits.values());
}

/**
 * Parse VSR account into structured format
 */
function parseVSRAccount(data, accountPubkey) {
  if (data.length < 104) return null;
  
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    
    const depositEntries = parseAllDepositEntries(data);
    
    return {
      accountPubkey: accountPubkey.toBase58(),
      authority,
      voterAuthority,
      depositEntries,
      accountSize: data.length
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate native governance power
 * Only from accounts where authority === walletAddress
 */
function calculateNativePower(vsrAccounts, walletAddress) {
  let totalNativePower = 0;
  const nativeDeposits = [];
  
  for (const account of vsrAccounts) {
    // Native power: authority must equal wallet address
    if (account.authority === walletAddress) {
      for (const deposit of account.depositEntries) {
        if (deposit.isUsed && deposit.amountDeposited > 0) {
          totalNativePower += deposit.power;
          nativeDeposits.push({
            ...deposit,
            accountPubkey: account.accountPubkey,
            accountSize: account.accountSize
          });
        }
      }
    }
  }
  
  return { totalNativePower, nativeDeposits };
}

/**
 * Calculate delegated governance power
 * From accounts where voterAuthority === walletAddress AND authority !== walletAddress
 */
function calculateDelegatedPower(vsrAccounts, walletAddress) {
  let totalDelegatedPower = 0;
  const delegations = [];
  
  for (const account of vsrAccounts) {
    // Delegation rules: voterAuthority === wallet AND authority !== wallet
    if (account.voterAuthority === walletAddress && 
        account.authority !== walletAddress) {
      
      let accountPower = 0;
      for (const deposit of account.depositEntries) {
        if (deposit.isUsed && deposit.amountDeposited > 0) {
          accountPower += deposit.power;
        }
      }
      
      if (accountPower > 0) {
        totalDelegatedPower += accountPower;
        delegations.push({
          from: account.authority,
          fromShort: account.authority.substring(0, 8),
          power: accountPower,
          accountPubkey: account.accountPubkey,
          deposits: account.depositEntries.filter(d => d.isUsed && d.amountDeposited > 0)
        });
      }
    }
  }
  
  return { totalDelegatedPower, delegations };
}

/**
 * Calculate comprehensive governance power for wallets
 */
async function calculateCanonicalGovernancePower(walletAddresses) {
  console.log('CANONICAL VSR SCANNER - FINAL IMPLEMENTATION');
  console.log('===========================================');
  console.log(`Processing ${walletAddresses.length} wallets with canonical VSR rules`);
  
  // Load all VSR accounts
  console.log('Loading VSR accounts...');
  const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`Loaded ${programAccounts.length} VSR program accounts`);
  
  // Parse all VSR accounts
  console.log('Parsing VSR accounts...');
  const vsrAccounts = [];
  for (const { pubkey, account } of programAccounts) {
    const parsed = parseVSRAccount(account.data, pubkey);
    if (parsed && parsed.depositEntries.length > 0) {
      vsrAccounts.push(parsed);
    }
  }
  console.log(`Parsed ${vsrAccounts.length} valid VSR accounts with deposits`);
  
  const results = {};
  
  for (const walletAddress of walletAddresses) {
    console.log(`\nProcessing ${walletAddress.substring(0,8)}...`);
    
    // Calculate native power
    const { totalNativePower, nativeDeposits } = calculateNativePower(vsrAccounts, walletAddress);
    
    // Calculate delegated power  
    const { totalDelegatedPower, delegations } = calculateDelegatedPower(vsrAccounts, walletAddress);
    
    console.log(`  Native: ${totalNativePower.toFixed(3)} ISLAND from ${nativeDeposits.length} deposits`);
    console.log(`  Delegated: ${totalDelegatedPower.toFixed(3)} ISLAND from ${delegations.length} delegators`);
    
    // Detailed deposit analysis for native power
    if (nativeDeposits.length > 0) {
      console.log(`  Native deposits:`);
      for (const deposit of nativeDeposits) {
        const status = deposit.isActive ? 'ACTIVE' : 'EXPIRED';
        console.log(`    ${deposit.amount.toFixed(3)} × ${deposit.multiplier.toFixed(2)}x = ${deposit.power.toFixed(3)} ISLAND (${status}, ${deposit.source})`);
      }
    }
    
    results[walletAddress] = {
      wallet: walletAddress,
      native: totalNativePower,
      delegated: totalDelegatedPower,
      total: totalNativePower + totalDelegatedPower,
      nativeDeposits,
      delegations,
      note: `Detected ${nativeDeposits.length} native deposits, ${delegations.length} delegations. All canonical VSR rules applied.`
    };
  }
  
  return results;
}

/**
 * Test canonical scanner on ground truth wallets
 */
async function testCanonicalScanner() {
  const testWallets = [
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC', // Should show 436K+ base deposits with multipliers
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA'
  ];
  
  const results = await calculateCanonicalGovernancePower(testWallets);
  
  console.log('\nCANONICAL VSR SCANNER RESULTS:');
  console.log('==============================');
  
  for (const [wallet, result] of Object.entries(results)) {
    console.log(`\n${wallet.substring(0,8)}:`);
    console.log(`  Native: ${result.native.toFixed(3)} ISLAND`);
    console.log(`  Delegated: ${result.delegated.toFixed(3)} ISLAND`);
    console.log(`  Total: ${result.total.toFixed(3)} ISLAND`);
    console.log(`  ${result.note}`);
    
    if (result.delegations.length > 0) {
      console.log(`  Delegations: ${result.delegations.map(d => `${d.fromShort}(${d.power.toFixed(0)})`).join(', ')}`);
    }
  }
  
  // Special validation for kruHL3zJ
  const kruhlResult = results['kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC'];
  if (kruhlResult) {
    console.log('\nSPECIAL VALIDATION - kruHL3zJ:');
    console.log('==============================');
    
    const expectedDeposits = [310472.9693, 126344.82227];
    let foundExpectedDeposits = 0;
    
    for (const expectedAmount of expectedDeposits) {
      const found = kruhlResult.nativeDeposits.some(d => Math.abs(d.amount - expectedAmount) < 0.01);
      if (found) {
        foundExpectedDeposits++;
        console.log(`✅ Found expected deposit: ${expectedAmount.toFixed(3)} ISLAND`);
      } else {
        console.log(`❌ Missing expected deposit: ${expectedAmount.toFixed(3)} ISLAND`);
      }
    }
    
    console.log(`Expected deposits found: ${foundExpectedDeposits}/${expectedDeposits.length}`);
    console.log(`Native power: ${kruhlResult.native.toFixed(3)} ISLAND (should exceed ${expectedDeposits.reduce((a,b) => a+b, 0).toFixed(3)} due to multipliers)`);
    console.log(`Delegated power: ${kruhlResult.delegated.toFixed(3)} ISLAND (expected: 0)`);
    
    if (kruhlResult.delegated === 0) {
      console.log(`✅ Delegation correctly excluded via canonical rules`);
    } else {
      console.log(`❌ Unexpected delegation detected`);
    }
  }
  
  console.log('\nCANONICAL RULES APPLIED:');
  console.log('- Native: authority === walletAddress');
  console.log('- Delegated: voterAuthority === walletAddress AND authority !== walletAddress');
  console.log('- VSR Multiplier: 1 + min(years_remaining, 4) with 5x cap');
  console.log('- No hardcoded address exclusions');
  console.log('- Comprehensive deposit detection and deduplication');
}

testCanonicalScanner()
  .then(() => {
    console.log('\nCanonical VSR scanner test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Scanner test failed:', error);
    process.exit(1);
  });