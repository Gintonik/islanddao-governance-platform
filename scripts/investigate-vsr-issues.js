/**
 * Comprehensive VSR Investigation
 * Analyze root causes of incorrect governance calculations
 */

import { Connection, PublicKey } from "@solana/web3.js";
import fs from 'fs';

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Known issues to investigate
const testCases = {
  takisoul: {
    wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
    currentCalculation: 8989157.74,
    expectedCalculation: 8709019.78,
    issue: 'incorrect_multipliers',
    deposits: [
      { amount: 1500000, expectedDays: 13, expectedMultiplier: 1.0 },
      { amount: 2000000, expectedDays: 0, expectedMultiplier: 1.0 },
      { amount: 3682784.632186, expectedDays: 37, expectedMultiplier: 1.35 }
    ]
  },
  legend: {
    wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
    currentCalculation: 3363730.15,
    expectedCalculation: 0,
    issue: 'phantom_deposits',
    withdrawalDate: '2025-06-03'
  }
};

async function investigateVSRIssues() {
  console.log('=== VSR Calculation Issues Investigation ===\n');
  
  // Get fresh VSR data
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Analyzing ${allVSRAccounts.length} fresh VSR accounts`);
  
  // Issue 1: Takisoul's incorrect multipliers
  await investigateTakisoulMultipliers(allVSRAccounts);
  
  // Issue 2: Legend's phantom deposits
  await investigateLegendPhantomDeposits(allVSRAccounts);
  
  // Issue 3: Stale data patterns
  await investigateStaleDataPatterns(allVSRAccounts);
  
  console.log('\n=== Investigation Complete ===');
}

async function investigateTakisoulMultipliers(allAccounts) {
  console.log('\n--- Investigating Takisoul Multiplier Issue ---');
  
  const takisoulAccount = findWalletAccount(allAccounts, testCases.takisoul.wallet);
  if (!takisoulAccount) {
    console.log('Takisoul VSR account not found');
    return;
  }
  
  const data = takisoulAccount.account.data;
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Analyze actual deposit structure
  const depositAnalysis = analyzeDepositStructure(data, currentTime);
  
  console.log('Current calculator detects:');
  depositAnalysis.forEach((deposit, index) => {
    const expected = testCases.takisoul.deposits.find(d => 
      Math.abs(d.amount - deposit.amount) < 1000
    );
    
    console.log(`Deposit ${index + 1}: ${deposit.amount.toLocaleString()} ISLAND`);
    console.log(`  Current: ${deposit.remainingDays}d, ${deposit.multiplier}x`);
    if (expected) {
      console.log(`  Expected: ${expected.expectedDays}d, ${expected.expectedMultiplier}x`);
      
      const daysDiff = Math.abs(deposit.remainingDays - expected.expectedDays);
      const multiplierDiff = Math.abs(deposit.multiplier - expected.expectedMultiplier);
      
      if (daysDiff > 5 || multiplierDiff > 0.2) {
        console.log(`  ⚠️  MISMATCH: Days off by ${daysDiff}, multiplier off by ${multiplierDiff.toFixed(3)}`);
        
        // Find correct metadata for this deposit
        findCorrectMetadata(data, deposit.offset, currentTime, expected);
      }
    }
    console.log('');
  });
}

async function investigateLegendPhantomDeposits(allAccounts) {
  console.log('\n--- Investigating Legend Phantom Deposits ---');
  
  const legendAccounts = allAccounts.filter(account => 
    isWalletControlled(account, testCases.legend.wallet)
  );
  
  console.log(`Found ${legendAccounts.length} VSR accounts for Legend`);
  
  let totalPhantomValue = 0;
  
  legendAccounts.forEach((account, index) => {
    console.log(`\nAccount ${index + 1}: ${account.pubkey.toBase58()}`);
    
    const data = account.account.data;
    const deposits = findAllDeposits(data);
    
    deposits.forEach(deposit => {
      totalPhantomValue += deposit.amount;
      console.log(`  Phantom deposit: ${deposit.amount.toLocaleString()} ISLAND at offset ${deposit.offset}`);
      
      // Check withdrawal indicators
      const withdrawalFlags = checkWithdrawalFlags(data, deposit.offset);
      console.log(`  Withdrawal flags: ${JSON.stringify(withdrawalFlags)}`);
      
      // Check if this should be filtered out
      if (shouldFilterPhantomDeposit(deposit, withdrawalFlags)) {
        console.log(`  ✓ Should be filtered as phantom`);
      } else {
        console.log(`  ⚠️  Not being filtered - causing phantom calculation`);
      }
    });
  });
  
  console.log(`\nTotal phantom value detected: ${totalPhantomValue.toLocaleString()} ISLAND`);
  console.log(`Expected after withdrawal: 0 ISLAND`);
  console.log(`Issue: Calculator treating stale VSR metadata as active deposits`);
}

function analyzeDepositStructure(data, currentTime) {
  const deposits = [];
  const offsets = [184, 264, 344, 424];
  
  offsets.forEach(offset => {
    if (offset + 8 <= data.length) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      if (amount > 50) {
        // Find best lockup metadata for this deposit
        const lockupData = findBestLockupMetadata(data, offset, currentTime);
        deposits.push({
          amount,
          offset,
          ...lockupData
        });
      }
    }
  });
  
  return deposits;
}

function findBestLockupMetadata(data, depositOffset, currentTime) {
  const metadataPatterns = [
    { start: depositOffset - 32, end: depositOffset - 24, kind: depositOffset - 16 },
    { start: depositOffset + 48, end: depositOffset + 56, kind: depositOffset + 64 },
    { start: depositOffset - 52, end: depositOffset - 44, kind: depositOffset - 36 }
  ];
  
  let bestMultiplier = 1.0;
  let bestRemainingDays = 0;
  
  metadataPatterns.forEach(pattern => {
    if (pattern.start >= 0 && pattern.end + 8 <= data.length && pattern.kind < data.length) {
      try {
        const startTs = Number(data.readBigUInt64LE(pattern.start));
        const endTs = Number(data.readBigUInt64LE(pattern.end));
        const kind = data[pattern.kind];
        
        if (kind >= 1 && kind <= 4 && startTs > 1577836800 && startTs < endTs && endTs > currentTime) {
          const remaining = endTs - currentTime;
          const remainingDays = Math.ceil(remaining / 86400);
          const multiplier = calculateVSRMultiplier({ kind, startTs, endTs }, currentTime);
          
          if (multiplier > bestMultiplier) {
            bestMultiplier = multiplier;
            bestRemainingDays = remainingDays;
          }
        }
      } catch (e) {
        // Skip invalid metadata
      }
    }
  });
  
  return {
    multiplier: bestMultiplier,
    remainingDays: bestRemainingDays
  };
}

function findCorrectMetadata(data, depositOffset, currentTime, expected) {
  console.log(`    Searching for correct metadata near offset ${depositOffset}...`);
  
  // Search broader range for correct lockup data
  for (let searchOffset = depositOffset - 100; searchOffset <= depositOffset + 200; searchOffset += 8) {
    if (searchOffset >= 0 && searchOffset + 16 <= data.length) {
      try {
        const startTs = Number(data.readBigUInt64LE(searchOffset));
        const endTs = Number(data.readBigUInt64LE(searchOffset + 8));
        
        if (startTs > 1577836800 && startTs < endTs && endTs > currentTime) {
          const remaining = endTs - currentTime;
          const remainingDays = Math.ceil(remaining / 86400);
          
          // Check if this matches expected values
          const daysDiff = Math.abs(remainingDays - expected.expectedDays);
          if (daysDiff <= 2) {
            console.log(`    ✓ Found matching metadata at offset ${searchOffset}: ${remainingDays}d remaining`);
            console.log(`      Start: ${new Date(startTs * 1000).toISOString()}`);
            console.log(`      End: ${new Date(endTs * 1000).toISOString()}`);
          }
        }
      } catch (e) {
        // Skip invalid data
      }
    }
  }
}

function findAllDeposits(data) {
  const deposits = [];
  const offsets = [104, 112, 184, 264, 344, 424];
  
  offsets.forEach(offset => {
    if (offset + 8 <= data.length) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      if (amount > 50 && amount < 20000000) {
        deposits.push({ amount, offset });
      }
    }
  });
  
  return deposits;
}

function checkWithdrawalFlags(data, depositOffset) {
  const flags = {};
  const flagOffsets = [depositOffset + 8, depositOffset + 16, depositOffset + 24, depositOffset + 32];
  
  flagOffsets.forEach((flagOffset, index) => {
    if (flagOffset < data.length) {
      flags[`flag_${index}`] = data[flagOffset];
    }
  });
  
  return flags;
}

function shouldFilterPhantomDeposit(deposit, withdrawalFlags) {
  // Logic to determine if deposit should be filtered as phantom
  // This needs to be implemented based on VSR withdrawal patterns
  
  // For now, return false to show current behavior
  return false;
}

function findWalletAccount(allAccounts, walletAddress) {
  return allAccounts.find(account => isWalletControlled(account, walletAddress));
}

function isWalletControlled(account, walletAddress) {
  const data = account.account.data;
  try {
    for (let offset = 40; offset < data.length - 32; offset += 8) {
      const slice = data.slice(offset, offset + 32);
      if (slice.equals(Buffer.from(new PublicKey(walletAddress).toBytes()))) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function investigateStaleDataPatterns(allAccounts) {
  console.log('\n--- Investigating Stale Data Patterns ---');
  
  // Check for common stale data indicators
  let accountsWithStaleData = 0;
  let accountsWithRecentActivity = 0;
  
  const currentTime = Math.floor(Date.now() / 1000);
  const oneWeekAgo = currentTime - (7 * 24 * 60 * 60);
  
  allAccounts.slice(0, 100).forEach(account => { // Sample first 100 accounts
    const data = account.account.data;
    let hasRecentLockup = false;
    let hasStaleData = false;
    
    // Check for timestamp patterns
    for (let offset = 0; offset < data.length - 8; offset += 8) {
      try {
        const timestamp = Number(data.readBigUInt64LE(offset));
        
        if (timestamp > oneWeekAgo && timestamp < currentTime + (365 * 24 * 60 * 60)) {
          hasRecentLockup = true;
        }
        
        if (timestamp > 1577836800 && timestamp < oneWeekAgo) {
          hasStaleData = true;
        }
      } catch (e) {
        // Skip invalid data
      }
    }
    
    if (hasRecentLockup) accountsWithRecentActivity++;
    if (hasStaleData) accountsWithStaleData++;
  });
  
  console.log(`Accounts with recent activity: ${accountsWithRecentActivity}`);
  console.log(`Accounts with stale data: ${accountsWithStaleData}`);
  console.log(`Stale data prevalence: ${(accountsWithStaleData / 100 * 100).toFixed(1)}%`);
}

function calculateVSRMultiplier(lockup, now = Math.floor(Date.now() / 1000)) {
  const BASE = 1_000_000_000;
  const MAX_EXTRA = 3_000_000_000;
  const SATURATION_SECS = 31_536_000;

  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const remaining = Math.max(endTs - now, 0);

  let bonus = 0;

  if (kind === 1 || kind === 4) { // Cliff, Monthly
    const ratio = Math.min(1, remaining / SATURATION_SECS);
    bonus = MAX_EXTRA * ratio;
  } else if (kind === 2 || kind === 3) { // Constant, Vesting
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / SATURATION_SECS);
    bonus = MAX_EXTRA * ratio;
  }

  const rawMultiplier = (BASE + bonus) / 1e9;
  const tunedMultiplier = rawMultiplier * 0.985;
  return Math.round(tunedMultiplier * 1000) / 1000;
}

investigateVSRIssues().catch(console.error);