/**
 * Comprehensive VSR Governance Power Scanner
 * Loads ALL VSR accounts (16,586) to ensure complete delegation detection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Load ALL VSR accounts without size filtering
 */
async function loadAllVSRAccounts() {
  console.log('Loading ALL VSR accounts without size filtering...');
  
  // Get all accounts for VSR program without filters to ensure we get all 16,586
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  console.log(`Loaded ${allAccounts.length} total VSR accounts`);
  
  // Separate by size for analysis
  const accountsBySizes = {};
  for (const { pubkey, account } of allAccounts) {
    const size = account.data.length;
    if (!accountsBySizes[size]) accountsBySizes[size] = [];
    accountsBySizes[size].push({ pubkey, account });
  }
  
  console.log('Account distribution by size:');
  for (const [size, accounts] of Object.entries(accountsBySizes)) {
    console.log(`  Size ${size}: ${accounts.length} accounts`);
  }
  
  return allAccounts;
}

/**
 * Parse authorities from VSR account data
 */
function parseVSRAuthorities(data) {
  try {
    // Handle different account sizes
    if (data.length >= 104) {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      return { authority, voterAuthority };
    }
    
    // For smaller accounts, try different offsets
    if (data.length >= 72) {
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
        return { authority, voterAuthority };
      } catch (error) {
        return null;
      }
    }
    
    return null;
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
  
  // Process both large (2728-byte) and small (176-byte) accounts
  if (data.length < 100) return deposits;
  
  // Standard VSR deposit structure (for 2728-byte accounts)
  if (data.length >= 2728) {
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
                  power: islandAmount * multiplier,
                  source: 'standard'
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
                  power: islandAmount,
                  source: 'additional'
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
  
  // For smaller accounts (176-byte delegation accounts), use single parsing method
  else if (data.length >= 176) {
    // For 176-byte accounts, use comprehensive offset scanning with deduplication
    const smallAccountOffsets = [104, 112, 120];
    for (const offset of smallAccountOffsets) {
      if (offset + 8 <= data.length) {
        try {
          // Try structured parsing first (with lockup info)
          if (offset === 104 && offset + 48 <= data.length) {
            const rawAmount = Number(data.readBigUInt64LE(offset + 8));
            if (rawAmount > 0) {
              const islandAmount = rawAmount / 1e6;
              
              if (islandAmount >= 1 && islandAmount <= 50000000) {
                const roundedAmount = Math.round(islandAmount);
                if (!foundAmounts.has(roundedAmount)) {
                  foundAmounts.add(roundedAmount);
                  
                  const lockupKind = data[offset + 24] || 0;
                  const lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
                  const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
                  const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
                  
                  deposits.push({
                    amount: islandAmount,
                    multiplier: multiplier,
                    power: islandAmount * multiplier,
                    source: '176byte-structured'
                  });
                }
              }
            }
          } else {
            // For other offsets, use direct amount scanning
            const rawAmount = Number(data.readBigUInt64LE(offset));
            if (rawAmount > 0) {
              const islandAmount = rawAmount / 1e6;
              
              if (islandAmount >= 1000 && islandAmount <= 50000000) {
                const roundedAmount = Math.round(islandAmount);
                if (!foundAmounts.has(roundedAmount)) {
                  foundAmounts.add(roundedAmount);
                  
                  deposits.push({
                    amount: islandAmount,
                    multiplier: 1.0,
                    power: islandAmount,
                    source: '176byte-scan'
                  });
                }
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  return deposits;
}

/**
 * Find all delegations to a target wallet
 */
function findDelegationsToWallet(walletAddress, allVSRAccounts, verbose = false) {
  const delegations = [];
  let accountsChecked = 0;
  let delegationsFound = 0;
  
  if (verbose) {
    console.log(`  Scanning ${allVSRAccounts.length} VSR accounts for delegations to ${walletAddress.substring(0,8)}...`);
  }
  
  for (const { pubkey, account } of allVSRAccounts) {
    accountsChecked++;
    
    const authorities = parseVSRAuthorities(account.data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Look for delegations TO this wallet (voterAuthority === wallet AND authority !== wallet)
    if (voterAuthority === walletAddress && authority !== walletAddress) {
      delegationsFound++;
      
      if (verbose) {
        console.log(`    Found delegation from ${authority.substring(0,8)}: ${pubkey.toBase58()}`);
      }
      
      const deposits = parseVSRDeposits(account.data);
      
      if (deposits.length > 0) {
        const totalPower = deposits.reduce((sum, d) => sum + d.power, 0);
        
        delegations.push({
          account: pubkey.toBase58(),
          from: authority,
          totalPower: totalPower,
          deposits: deposits
        });
        
        if (verbose) {
          console.log(`      Power: ${totalPower.toFixed(3)} ISLAND from ${deposits.length} deposits`);
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`  Checked ${accountsChecked} accounts, found ${delegationsFound} delegation accounts`);
  }
  
  return delegations;
}

/**
 * Calculate native governance power for a wallet
 */
function calculateNativePower(walletAddress, allVSRAccounts, verbose = false) {
  let totalNativePower = 0;
  const nativeDeposits = [];
  let nativeAccountsFound = 0;
  
  for (const { pubkey, account } of allVSRAccounts) {
    const authorities = parseVSRAuthorities(account.data);
    if (!authorities) continue;
    
    // Native power: authority === wallet
    if (authorities.authority === walletAddress) {
      nativeAccountsFound++;
      
      if (verbose) {
        console.log(`    Native account: ${pubkey.toBase58()}`);
      }
      
      const deposits = parseVSRDeposits(account.data);
      
      for (const deposit of deposits) {
        totalNativePower += deposit.power;
        nativeDeposits.push({
          account: pubkey.toBase58(),
          ...deposit
        });
        
        if (verbose) {
          console.log(`      Deposit: ${deposit.amount.toFixed(3)} × ${deposit.multiplier.toFixed(2)}x = ${deposit.power.toFixed(3)} ISLAND`);
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`  Found ${nativeAccountsFound} native accounts with ${nativeDeposits.length} deposits`);
  }
  
  return { totalNativePower, nativeDeposits };
}

/**
 * Comprehensive validation of target wallets
 */
async function validateTargetWallets() {
  const testCases = [
    {
      wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
      expectedNative: 10350000,
      expectedDelegated: 1268162,
      note: 'Large native + significant delegated (missing ~800K in current detection)'
    },
    {
      wallet: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
      expectedNative: 13625.581,
      expectedDelegated: 4189328.11,
      note: 'Small native + large delegation from CinHb6Xt'
    },
    {
      wallet: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
      expectedDeposits: [310472.9693, 126344.82227],
      expectedDelegated: 0,
      note: 'Control case - should have NO delegated power'
    }
  ];
  
  console.log('COMPREHENSIVE VSR DELEGATION VALIDATION');
  console.log('======================================');
  
  // Load all VSR accounts
  const allVSRAccounts = await loadAllVSRAccounts();
  
  for (const testCase of testCases) {
    console.log(`\nValidating ${testCase.wallet.substring(0,8)} (${testCase.note})`);
    
    // Calculate native power
    const nativeResult = calculateNativePower(testCase.wallet, allVSRAccounts, true);
    
    // Find delegations
    const delegations = findDelegationsToWallet(testCase.wallet, allVSRAccounts, true);
    const totalDelegatedPower = delegations.reduce((sum, d) => sum + d.totalPower, 0);
    
    console.log(`\n🟢 Native Power: ${nativeResult.totalNativePower.toFixed(3)} ISLAND`);
    console.log(`🟡 Delegated Power: ${totalDelegatedPower.toFixed(3)} ISLAND`);
    console.log(`🔷 Total Power: ${(nativeResult.totalNativePower + totalDelegatedPower).toFixed(3)} ISLAND`);
    
    if (delegations.length > 0) {
      console.log(`\n   Delegations found:`);
      for (const delegation of delegations) {
        console.log(`     From ${delegation.from.substring(0,8)}: ${delegation.totalPower.toFixed(3)} ISLAND`);
      }
    } else {
      console.log(`\n   No delegations found`);
    }
    
    // Validate against expected values
    if (typeof testCase.expectedNative === 'number') {
      const nativeMatch = Math.abs(nativeResult.totalNativePower - testCase.expectedNative) / testCase.expectedNative < 0.05;
      console.log(`\n  Native validation: ${nativeMatch ? '✅ PASS' : '❌ FAIL'} (expected: ${testCase.expectedNative.toLocaleString()})`);
    }
    
    if (typeof testCase.expectedDelegated === 'number') {
      const delegatedMatch = testCase.expectedDelegated === 0 ? 
        totalDelegatedPower === 0 : 
        Math.abs(totalDelegatedPower - testCase.expectedDelegated) / testCase.expectedDelegated < 0.1;
      console.log(`  Delegated validation: ${delegatedMatch ? '✅ PASS' : '❌ FAIL'} (expected: ${testCase.expectedDelegated.toLocaleString()}, got: ${totalDelegatedPower.toFixed(3)})`);
      
      if (!delegatedMatch && testCase.expectedDelegated > 0) {
        const difference = testCase.expectedDelegated - totalDelegatedPower;
        console.log(`    Missing delegation power: ${difference.toFixed(3)} ISLAND`);
      }
    }
  }
}

// Run the comprehensive validation
validateTargetWallets()
  .then(() => {
    console.log('\nComprehensive VSR delegation validation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });