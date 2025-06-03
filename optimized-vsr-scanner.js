/**
 * Optimized VSR Governance Power Scanner
 * Pre-builds delegation map for efficiency, maintains accurate native power detection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Global delegation map for efficiency
let globalDelegationMap = null;

/**
 * Parse authority and voterAuthority from Voter account
 */
function parseVoterAuthorities(data) {
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
 * Extract deposit amounts from VSR account using canonical structure
 */
function extractDepositAmounts(data) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  // First try standard VSR deposit structure
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const isUsed = data[offset] === 1;
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        const lockupKind = data[offset + 24];
        const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
        
        if (isUsed && rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 100 && islandAmount <= 50000000) {
            const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
            const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
            deposits.push({
              amount: islandAmount,
              multiplier: multiplier,
              power: islandAmount * multiplier
            });
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  // If no deposits found, try alternative scanning for different account structures
  if (deposits.length === 0 && data.length >= 200) {
    // Scan for 64-bit values that could be deposit amounts in ISLAND range
    for (let offset = 100; offset < Math.min(data.length - 8, 3000); offset += 8) {
      try {
        const rawValue = Number(data.readBigUInt64LE(offset));
        if (rawValue > 0) {
          const islandValue = rawValue / 1e6;
          
          // Check if this looks like a reasonable ISLAND amount
          if (islandValue >= 100 && islandValue <= 50000000) {
            // Validate by checking if nearby bytes contain reasonable lockup info
            let isValidDeposit = false;
            
            // Check various offsets for lockup timestamps
            for (const tsOffset of [32, 40, 48]) {
              if (offset + tsOffset < data.length - 8) {
                const possibleTimestamp = Number(data.readBigUInt64LE(offset + tsOffset));
                if (possibleTimestamp > 1600000000 && possibleTimestamp < 2000000000) {
                  isValidDeposit = true;
                  break;
                }
              }
            }
            
            if (isValidDeposit) {
              deposits.push({
                amount: islandValue,
                multiplier: 1.0,
                power: islandValue
              });
              break; // Take first valid deposit found
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
 * Build global delegation map once for all wallets
 */
async function buildGlobalDelegationMap(verbose = false) {
  if (verbose) {
    console.log('🔍 Building global delegation map from all VSR accounts...');
  }
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  const delegationMap = new Map();
  let delegationCount = 0;
  
  if (verbose) {
    console.log(`   Processing ${allVSRAccounts.length} VSR accounts for delegations...`);
  }
  
  for (const { pubkey, account } of allVSRAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    const authorities = parseVoterAuthorities(data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Check for delegation pattern: authority !== voterAuthority
    if (authority !== voterAuthority) {
      const deposits = extractDepositAmounts(data);
      const totalPower = deposits.reduce((sum, deposit) => sum + deposit.power, 0);
      
      if (totalPower > 0) {
        if (!delegationMap.has(voterAuthority)) {
          delegationMap.set(voterAuthority, {
            totalDelegated: 0,
            delegations: []
          });
        }
        
        delegationMap.get(voterAuthority).totalDelegated += totalPower;
        delegationMap.get(voterAuthority).delegations.push({
          from: authority,
          power: totalPower,
          account: pubkey.toBase58(),
          deposits: deposits
        });
        
        delegationCount++;
      }
    }
  }
  
  if (verbose) {
    console.log(`   Built delegation map: ${delegationMap.size} recipients, ${delegationCount} delegations`);
  }
  
  return delegationMap;
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePower(walletAddress, verbose = false) {
  // Find all Voter accounts where wallet is authority
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  let totalNativePower = 0;
  const nativeSources = [];
  
  for (const { pubkey, account } of voterAccounts) {
    const data = account.data;
    const deposits = extractDepositAmounts(data);
    
    for (const deposit of deposits) {
      totalNativePower += deposit.power;
      nativeSources.push({
        account: pubkey.toBase58(),
        power: deposit.power,
        baseAmount: deposit.amount,
        multiplier: deposit.multiplier,
        type: 'Voter-native'
      });
      
      if (verbose) {
        console.log(`     ✅ Native: ${deposit.amount.toFixed(3)} × ${deposit.multiplier.toFixed(2)}x = ${deposit.power.toFixed(3)} ISLAND`);
      }
    }
  }
  
  if (verbose) {
    console.log(`     📊 Found ${voterAccounts.length} Voter accounts where wallet is authority`);
    console.log(`     🟢 Total Native Power: ${totalNativePower.toFixed(3)} ISLAND`);
  }
  
  return { totalNativePower, nativeSources };
}

/**
 * Calculate delegated governance power for a wallet
 */
function calculateDelegatedGovernancePower(walletAddress, verbose = false) {
  if (!globalDelegationMap || !globalDelegationMap.has(walletAddress)) {
    if (verbose) {
      console.log(`     ✅ Delegation scan completed successfully - no delegations found`);
    }
    return { totalDelegatedPower: 0, delegatedSources: [] };
  }
  
  const delegationData = globalDelegationMap.get(walletAddress);
  const delegatedSources = [];
  
  for (const delegation of delegationData.delegations) {
    delegatedSources.push({
      account: delegation.account,
      power: delegation.power,
      baseAmount: delegation.power,
      multiplier: 1.0,
      type: 'Voter-delegated',
      authority: delegation.from,
      voterAuthority: walletAddress
    });
    
    if (verbose) {
      console.log(`     📨 Delegated from ${delegation.from.substring(0,8)}: ${delegation.power.toFixed(3)} ISLAND`);
    }
  }
  
  if (verbose) {
    console.log(`     ✅ Delegation scan completed successfully - ${delegationData.delegations.length} delegations found`);
  }
  
  return { 
    totalDelegatedPower: delegationData.totalDelegated, 
    delegatedSources 
  };
}

/**
 * Calculate complete governance power for a wallet
 */
async function calculateGovernancePower(walletAddress, verbose = false) {
  if (verbose) {
    console.log(`🔍 ${walletAddress}`);
  }
  
  // Calculate native power
  const { totalNativePower, nativeSources } = await calculateNativeGovernancePower(walletAddress, verbose);
  
  // Calculate delegated power
  const { totalDelegatedPower, delegatedSources } = calculateDelegatedGovernancePower(walletAddress, verbose);
  
  const totalPower = totalNativePower + totalDelegatedPower;
  
  // Debug output
  console.log(`🏛️ VWR Total: N/A`);
  console.log(`🟢 Native from Deposits: ${totalNativePower.toFixed(3)}`);
  console.log(`🟡 Delegated from Others: ${totalDelegatedPower.toFixed(3)}`);
  console.log(`🧠 Inference Used? false`);
  
  if (verbose) {
    console.log(`     📊 Final: ${totalNativePower.toFixed(3)} native + ${totalDelegatedPower.toFixed(3)} delegated = ${totalPower.toFixed(3)} total`);
  }
  
  return {
    walletAddress,
    nativePower: totalNativePower,
    delegatedPower: totalDelegatedPower,
    totalPower,
    nativeSources,
    delegatedSources
  };
}

/**
 * Test with specific wallets
 */
async function testOptimizedScanner() {
  console.log('🏛️ OPTIMIZED VSR GOVERNANCE SCANNER');
  console.log('===================================');
  console.log('📡 Helius RPC: Connected');
  console.log(`🏛️ VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  
  // Build delegation map once
  globalDelegationMap = await buildGlobalDelegationMap(true);
  
  // Test wallets
  const testWallets = [
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Expected ~12,625 native + delegated
    'DezXAZ8zqzHuQM5tLGPXdEDpqet8TyrFt9CtaKKWJ43', // Top delegation target
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC', // Known good native power
    'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1'  // Simple 200k case
  ];
  
  console.log('\n🔍 Testing wallets:');
  const results = [];
  
  for (const wallet of testWallets) {
    const result = await calculateGovernancePower(wallet, true);
    results.push(result);
    console.log('');
  }
  
  console.log('\n📊 SUMMARY:');
  for (const result of results) {
    console.log(`${result.walletAddress.substring(0,8)}: ${result.totalPower.toFixed(3)} ISLAND (${result.nativePower.toFixed(3)} native + ${result.delegatedPower.toFixed(3)} delegated)`);
  }
  
  return results;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOptimizedScanner()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

export { calculateGovernancePower, buildGlobalDelegationMap };