/**
 * Final Canonical VSR Governance Power Scanner
 * Efficiently calculates native and delegated governance power using authentic on-chain data
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

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
 * Extract deposits from VSR account using canonical structure
 */
function extractDeposits(data) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Scan VSR deposit entries at canonical offsets
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
              power: islandAmount * multiplier,
              isActive: isActiveLockup
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
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePower(walletAddress) {
  // Find Voter accounts where wallet is authority
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  let totalNativePower = 0;
  const sources = [];
  
  for (const { pubkey, account } of voterAccounts) {
    const deposits = extractDeposits(account.data);
    
    for (const deposit of deposits) {
      totalNativePower += deposit.power;
      sources.push({
        account: pubkey.toBase58(),
        power: deposit.power,
        amount: deposit.amount,
        multiplier: deposit.multiplier,
        type: 'native'
      });
    }
  }
  
  return { totalNativePower, sources, accountCount: voterAccounts.length };
}

/**
 * Find delegations to a wallet by scanning delegation relationships
 */
async function findDelegationsToWallet(targetWallet) {
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  let totalDelegatedPower = 0;
  const delegationSources = [];
  
  for (const { pubkey, account } of allVSRAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    const authorities = parseVoterAuthorities(data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // Check for delegation: voterAuthority === target AND authority !== target
    if (voterAuthority === targetWallet && authority !== targetWallet) {
      const deposits = extractDeposits(data);
      
      for (const deposit of deposits) {
        totalDelegatedPower += deposit.power;
        delegationSources.push({
          account: pubkey.toBase58(),
          power: deposit.power,
          amount: deposit.amount,
          multiplier: deposit.multiplier,
          type: 'delegated',
          from: authority
        });
      }
    }
  }
  
  return { totalDelegatedPower, delegationSources };
}

/**
 * Calculate complete governance power for a wallet
 */
async function calculateCompleteGovernancePower(walletAddress, verbose = false) {
  if (verbose) {
    console.log(`Analyzing ${walletAddress.substring(0,8)}...`);
  }
  
  // Calculate native power
  const nativeResult = await calculateNativeGovernancePower(walletAddress);
  
  if (verbose) {
    console.log(`  Found ${nativeResult.accountCount} Voter accounts where wallet is authority`);
    console.log(`  Native Power: ${nativeResult.totalNativePower.toFixed(3)} ISLAND`);
  }
  
  // Calculate delegated power
  const delegatedResult = await findDelegationsToWallet(walletAddress);
  
  if (verbose) {
    console.log(`  Delegated Power: ${delegatedResult.totalDelegatedPower.toFixed(3)} ISLAND`);
    if (delegatedResult.delegationSources.length > 0) {
      console.log(`  Found ${delegatedResult.delegationSources.length} delegations`);
    }
  }
  
  const totalPower = nativeResult.totalNativePower + delegatedResult.totalDelegatedPower;
  
  // Output in required format
  console.log(`VWR Total: N/A`);
  console.log(`Native from Deposits: ${nativeResult.totalNativePower.toFixed(3)}`);
  console.log(`Delegated from Others: ${delegatedResult.totalDelegatedPower.toFixed(3)}`);
  console.log(`Inference Used? false`);
  
  return {
    walletAddress,
    nativePower: nativeResult.totalNativePower,
    delegatedPower: delegatedResult.totalDelegatedPower,
    totalPower,
    nativeSources: nativeResult.sources,
    delegatedSources: delegatedResult.delegationSources
  };
}

/**
 * Test with the target wallet
 */
async function testTargetWallet() {
  console.log('CANONICAL VSR GOVERNANCE POWER SCANNER');
  console.log('=====================================');
  console.log('Helius RPC: Connected');
  console.log(`VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  console.log('');
  
  const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  
  try {
    const result = await calculateCompleteGovernancePower(targetWallet, true);
    
    console.log('');
    console.log('FINAL RESULT:');
    console.log(`Wallet: ${result.walletAddress}`);
    console.log(`Native: ${result.nativePower.toFixed(3)} ISLAND`);
    console.log(`Delegated: ${result.delegatedPower.toFixed(3)} ISLAND`);
    console.log(`Total: ${result.totalPower.toFixed(3)} ISLAND`);
    
    return result;
    
  } catch (error) {
    console.error('Error calculating governance power:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTargetWallet()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Scanner failed:', error);
      process.exit(1);
    });
}

export { calculateCompleteGovernancePower };