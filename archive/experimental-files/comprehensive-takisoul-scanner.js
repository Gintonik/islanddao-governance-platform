/**
 * Comprehensive Takisoul VSR Scanner
 * Finds all VSR accounts owned by Takisoul to capture full ~8.7M ISLAND governance power
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate multiplier using canonical VSR formula
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  const now = Math.floor(Date.now() / 1000);
  let multiplier = 1.0;
  
  switch (lockupKind) {
    case 0: // No lockup
      multiplier = 1.0;
      break;
    case 1: // Cliff lockup
      if (now < lockupEndTs) {
        const secondsRemaining = lockupEndTs - now;
        const years = secondsRemaining / (365.25 * 24 * 3600);
        multiplier = Math.min(1 + years, 5);
      } else {
        multiplier = 1.0;
      }
      break;
    case 2: // Constant lockup
      if (now < lockupEndTs) {
        const secondsRemaining = lockupEndTs - now;
        const years = secondsRemaining / (365.25 * 24 * 3600);
        multiplier = Math.min(1 + years, 5);
      } else {
        multiplier = 1.0;
      }
      break;
    case 3: // Vesting
      multiplier = 1.0;
      break;
  }
  
  return multiplier;
}

/**
 * Parse deposits using working offset methodology
 */
function parseDepositsFromAccount(data) {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Use proven working offsets
  const workingOffsets = [104, 112, 184, 192, 200, 208];
  
  for (let i = 0; i < workingOffsets.length; i++) {
    const offset = workingOffsets[i];
    
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6; // ISLAND has 6 decimals
          const key = Math.round(amount * 1000);
          
          if (amount >= 1000 && amount <= 50000000 && !seenAmounts.has(key)) {
            seenAmounts.add(key);
            
            let lockupKind = 0;
            let lockupEndTs = 0;
            
            // Extract lockup information
            if (offset + 48 <= data.length) {
              try {
                lockupKind = data[offset + 24] || 0;
                lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              } catch (e) {
                // Use defaults
              }
            }
            
            const multiplier = calculateMultiplier(lockupKind, lockupEndTs);
            const governancePower = amount * multiplier;
            
            deposits.push({
              amount,
              lockupKind,
              lockupEndTs,
              multiplier,
              governancePower,
              offset
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
 * Find all VSR accounts owned by Takisoul
 */
async function findAllTakisoulVSRAccounts() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  
  console.log(`\n=== COMPREHENSIVE TAKISOUL VSR SCAN ===`);
  console.log(`Wallet: ${takisoulWallet}`);
  
  // Get all VSR accounts
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 }, // Voter account size
    ]
  });
  
  console.log(`Scanning ${accounts.length} VSR accounts...`);
  
  let foundAccounts = 0;
  let totalNativeGovernancePower = 0;
  let totalDelegatedGovernancePower = 0;
  const accountDetails = [];
  
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const data = account.account.data;
    
    try {
      // Parse authority and voter_authority using exact offsets
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      const isNative = authority === takisoulWallet;
      const isDelegated = voterAuthority === takisoulWallet && authority !== takisoulWallet;
      
      if (!isNative && !isDelegated) continue;
      
      foundAccounts++;
      
      const deposits = parseDepositsFromAccount(data);
      
      let accountNativePower = 0;
      let accountDelegatedPower = 0;
      
      for (const deposit of deposits) {
        if (isNative) {
          accountNativePower += deposit.governancePower;
          totalNativeGovernancePower += deposit.governancePower;
        }
        if (isDelegated) {
          accountDelegatedPower += deposit.governancePower;
          totalDelegatedGovernancePower += deposit.governancePower;
        }
      }
      
      console.log(`\nAccount ${foundAccounts}: ${account.pubkey.toString()}`);
      console.log(`  Authority: ${authority}`);
      console.log(`  Voter Authority: ${voterAuthority}`);
      console.log(`  Type: ${isNative ? 'NATIVE' : 'DELEGATED'}`);
      console.log(`  Deposits: ${deposits.length}`);
      
      for (const deposit of deposits) {
        console.log(`    ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.governancePower.toFixed(2)}`);
      }
      
      console.log(`  Account Power: ${isNative ? accountNativePower.toFixed(2) : accountDelegatedPower.toFixed(2)} ISLAND`);
      
      accountDetails.push({
        account: account.pubkey.toString(),
        authority,
        voterAuthority,
        type: isNative ? 'NATIVE' : 'DELEGATED',
        deposits,
        power: isNative ? accountNativePower : accountDelegatedPower
      });
      
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\n=== TAKISOUL SUMMARY ===`);
  console.log(`Found VSR Accounts: ${foundAccounts}`);
  console.log(`Total Native Governance Power: ${totalNativeGovernancePower.toFixed(2)} ISLAND`);
  console.log(`Total Delegated Governance Power: ${totalDelegatedGovernancePower.toFixed(2)} ISLAND`);
  console.log(`Combined Governance Power: ${(totalNativeGovernancePower + totalDelegatedGovernancePower).toFixed(2)} ISLAND`);
  
  return {
    accounts: foundAccounts,
    nativePower: totalNativeGovernancePower,
    delegatedPower: totalDelegatedGovernancePower,
    totalPower: totalNativeGovernancePower + totalDelegatedGovernancePower,
    details: accountDetails
  };
}

/**
 * Find all VSR accounts for Whale's Friend for comparison
 */
async function findWhalesFriendVSRAccounts() {
  const whalesFriendWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  
  console.log(`\n=== WHALE'S FRIEND VSR SCAN ===`);
  console.log(`Wallet: ${whalesFriendWallet}`);
  
  // Get all VSR accounts
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 }, // Voter account size
    ]
  });
  
  let foundAccounts = 0;
  let totalNativeGovernancePower = 0;
  
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const data = account.account.data;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      const isNative = authority === whalesFriendWallet;
      
      if (!isNative) continue;
      
      foundAccounts++;
      
      const deposits = parseDepositsFromAccount(data);
      
      let accountNativePower = 0;
      
      for (const deposit of deposits) {
        accountNativePower += deposit.governancePower;
        totalNativeGovernancePower += deposit.governancePower;
      }
      
      console.log(`\nAccount ${foundAccounts}: ${account.pubkey.toString()}`);
      console.log(`  Deposits: ${deposits.length}`);
      
      for (const deposit of deposits) {
        console.log(`    ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.governancePower.toFixed(2)}`);
      }
      
      console.log(`  Account Power: ${accountNativePower.toFixed(2)} ISLAND`);
      
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\n=== WHALE'S FRIEND SUMMARY ===`);
  console.log(`Found VSR Accounts: ${foundAccounts}`);
  console.log(`Total Native Governance Power: ${totalNativeGovernancePower.toFixed(2)} ISLAND`);
  
  return {
    accounts: foundAccounts,
    nativePower: totalNativeGovernancePower
  };
}

/**
 * Main execution
 */
async function runComprehensiveAnalysis() {
  try {
    const takisoulResults = await findAllTakisoulVSRAccounts();
    const whalesFriendResults = await findWhalesFriendVSRAccounts();
    
    console.log(`\n=== ANALYSIS COMPLETE ===`);
    console.log(`Takisoul Native Power: ${takisoulResults.nativePower.toFixed(2)} ISLAND (Expected: ~8,700,000)`);
    console.log(`Whale's Friend Native Power: ${whalesFriendResults.nativePower.toFixed(2)} ISLAND (Expected: 12,625.58)`);
    
  } catch (error) {
    console.error('Error during comprehensive analysis:', error);
  }
}

runComprehensiveAnalysis();