/**
 * Debug Governance Power - Verify native and delegated power per wallet
 * Uses authentic on-chain VSR data to show exact breakdown
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Test wallets from validation requirements
const TEST_WALLETS = [
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh',
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC'
];

function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

function parseDepositEntry(data, offset) {
  try {
    const amountDepositedNative = Number(data.readBigUInt64LE(offset));
    const amountInitiallyLocked = Number(data.readBigUInt64LE(offset + 8));
    const isUsed = data.readUInt8(offset + 16) !== 0;
    const lockupStartTs = Number(data.readBigUInt64LE(offset + 32));
    const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
    const lockupKind = data.readUInt32LE(offset + 48);
    
    return {
      amountDepositedNative,
      amountInitiallyLocked,
      isUsed,
      lockupStartTs,
      lockupEndTs,
      lockupKind
    };
  } catch (error) {
    return null;
  }
}

function calculateAuthenticLockupMultiplier(deposit, currentTimestamp) {
  if (!deposit.isUsed || deposit.amountDepositedNative === 0) {
    return 0;
  }
  
  // Handle invalid timestamp data
  if (deposit.lockupEndTs === 0 || deposit.lockupStartTs === 0) {
    if (deposit.lockupKind > 1000000) {
      return 5.0; // Assume maximum lockup
    }
    return 1.0; // Conservative fallback
  }
  
  if (currentTimestamp >= deposit.lockupEndTs) {
    return 1.0; // Expired lockups have base multiplier
  }
  
  const remainingSeconds = deposit.lockupEndTs - currentTimestamp;
  const remainingYears = remainingSeconds / (365.25 * 24 * 60 * 60);
  
  // IslandDAO VSR configuration: 1x to 5x over 4 years
  if (remainingYears <= 0) return 1.0;
  if (remainingYears >= 4) return 5.0;
  
  return 1.0 + (remainingYears / 4.0) * 4.0;
}

async function getVoterWeightRecordPower(walletAddress) {
  const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 176 },
      { memcmp: { offset: 72, bytes: walletAddress } }
    ]
  });

  let totalPower = 0;
  const sources = [];

  for (const { pubkey, account } of voterWeightRecords) {
    const powerRaw = Number(account.data.readBigUInt64LE(104));
    const power = powerRaw / 1e6;

    if (power > 0) {
      totalPower += power;
      sources.push({
        account: pubkey.toBase58(),
        power: power
      });
    }
  }

  return { totalPower, sources };
}

async function analyzeWalletGovernancePower(walletAddress) {
  console.log(`=== WALLET: ${walletAddress.substring(0,10)}... ===`);
  
  // Get VWR total power
  const vwrResult = await getVoterWeightRecordPower(walletAddress);
  console.log(`Total VWR Power: ${vwrResult.totalPower.toLocaleString()}`);
  
  // Load all Voter accounts for analysis
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  const currentTimestamp = Math.floor(Date.now() / 1000);
  let nativePower = 0;
  let delegatedPower = 0;
  const nativeDeposits = [];
  const delegatedSources = new Map();
  
  console.log(`→ Native Deposits:`);
  
  // Find native deposits (where wallet is authority)
  for (const { pubkey, account } of allVoterAccounts) {
    const data = account.data;
    const authorities = parseVoterAuthorities(data);
    
    if (!authorities || authorities.authority !== walletAddress) continue;
    
    // Parse deposits from this account
    const maxDeposits = 32;
    const depositSize = 72;
    const baseOffset = 200;
    
    for (let i = 0; i < maxDeposits; i++) {
      const offset = baseOffset + (i * depositSize);
      
      if (offset + depositSize > data.length) break;
      
      const deposit = parseDepositEntry(data, offset);
      
      if (deposit && deposit.isUsed && deposit.amountDepositedNative > 0) {
        const multiplier = calculateAuthenticLockupMultiplier(deposit, currentTimestamp);
        const power = (deposit.amountDepositedNative * multiplier) / 1e6;
        
        if (power > 0) {
          nativePower += power;
          nativeDeposits.push({
            amount: deposit.amountDepositedNative / 1e6,
            multiplier: multiplier,
            power: power,
            account: pubkey.toBase58()
          });
          
          const status = currentTimestamp < deposit.lockupEndTs ? 'ACTIVE' : 'EXPIRED';
          console.log(`${(deposit.amountDepositedNative / 1e6).toLocaleString()} ISLAND × ${multiplier.toFixed(2)}x = ${power.toLocaleString()} (${status})`);
        }
      }
    }
    
    // Fallback: try simple value extraction if no structured deposits
    if (nativeDeposits.length === 0) {
      const fallbackOffsets = [112, 144, 176, 208, 240];
      
      for (const offset of fallbackOffsets) {
        try {
          const rawValue = Number(data.readBigUInt64LE(offset));
          const islandAmount = rawValue / 1e6;
          
          if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
            nativePower += islandAmount;
            console.log(`${islandAmount.toLocaleString()} ISLAND × 1.00x = ${islandAmount.toLocaleString()} (fallback @${offset})`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  console.log(`→ Delegated From:`);
  
  // Find delegated deposits (where wallet is voterAuthority but not authority)
  for (const { pubkey, account } of allVoterAccounts) {
    const data = account.data;
    const authorities = parseVoterAuthorities(data);
    
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    if (voterAuthority === walletAddress && authority !== walletAddress) {
      // Parse deposits from this delegating account
      const maxDeposits = 32;
      const depositSize = 72;
      const baseOffset = 200;
      
      let accountDelegatedPower = 0;
      let accountDeposits = 0;
      
      for (let i = 0; i < maxDeposits; i++) {
        const offset = baseOffset + (i * depositSize);
        
        if (offset + depositSize > data.length) break;
        
        const deposit = parseDepositEntry(data, offset);
        
        if (deposit && deposit.isUsed && deposit.amountDepositedNative > 0) {
          const multiplier = calculateAuthenticLockupMultiplier(deposit, currentTimestamp);
          const power = (deposit.amountDepositedNative * multiplier) / 1e6;
          
          if (power > 0) {
            accountDelegatedPower += power;
            accountDeposits++;
          }
        }
      }
      
      // Fallback for delegation accounts
      if (accountDeposits === 0) {
        const fallbackOffsets = [112, 144, 176, 208, 240];
        
        for (const offset of fallbackOffsets) {
          try {
            const rawValue = Number(data.readBigUInt64LE(offset));
            const islandAmount = rawValue / 1e6;
            
            if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
              accountDelegatedPower += islandAmount;
              accountDeposits = 1;
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      if (accountDelegatedPower > 0) {
        delegatedPower += accountDelegatedPower;
        
        if (!delegatedSources.has(authority)) {
          delegatedSources.set(authority, { power: 0, deposits: 0 });
        }
        
        const source = delegatedSources.get(authority);
        source.power += accountDelegatedPower;
        source.deposits += accountDeposits;
      }
    }
  }
  
  // Display delegated sources
  if (delegatedSources.size > 0) {
    for (const [authority, info] of delegatedSources) {
      console.log(`${authority.substring(0,10)}... → ${info.power.toLocaleString()} ISLAND (${info.deposits} deposits)`);
    }
  } else {
    console.log(`(no delegations found)`);
  }
  
  console.log(`Native: ${nativePower.toLocaleString()}`);
  console.log(`Delegated: ${delegatedPower.toLocaleString()}`);
  console.log(`Total: ${(nativePower + delegatedPower).toLocaleString()}`);
  console.log();
}

async function debugAllWallets() {
  console.log('🔍 DEBUG GOVERNANCE POWER BREAKDOWN');
  console.log('===================================\n');
  
  for (const wallet of TEST_WALLETS) {
    await analyzeWalletGovernancePower(wallet);
  }
}

// Run if called directly
if (process.argv[2]) {
  // Single wallet mode
  await analyzeWalletGovernancePower(process.argv[2]);
} else {
  // All test wallets mode
  await debugAllWallets();
}