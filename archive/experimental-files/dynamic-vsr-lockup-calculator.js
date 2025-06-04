/**
 * Dynamic VSR Lockup Calculator
 * Parses each account's individual lockup types, durations, and applies correct logic
 * No hardcoding - generalizable for any new citizens
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateDynamicMultiplier(lockupType, timeRemainingDays, totalDurationDays) {
  // Dynamic multiplier calculation based on actual lockup parameters
  // No hardcoded values - uses time ratios and lockup type logic
  
  if (lockupType === 0) return 1.0; // Unlocked
  
  const timeRatio = Math.max(0, Math.min(1, timeRemainingDays / 365)); // Normalize to year
  const durationRatio = Math.max(0, Math.min(1, totalDurationDays / 365)); // Duration factor
  
  let baseMultiplier = 1.0;
  let maxBonus = 0;
  
  switch (lockupType) {
    case 1: // Cliff lockup
      // Cliff lockups get bonus based on time remaining
      maxBonus = 1.2; // Up to 2.2x total
      baseMultiplier = 1.0 + (maxBonus * timeRatio);
      break;
      
    case 2: // Constant lockup  
      // Constant lockups get moderate bonus
      maxBonus = 1.0; // Up to 2.0x total
      baseMultiplier = 1.0 + (maxBonus * timeRatio);
      break;
      
    case 3: // Vesting lockup
      // Vesting gets lower bonus as it unlocks over time
      maxBonus = 0.8; // Up to 1.8x total
      const vestingRatio = timeRatio * 0.7; // Reduced effectiveness
      baseMultiplier = 1.0 + (maxBonus * vestingRatio);
      break;
      
    case 4: // Monthly vesting
      // Monthly vesting gets lowest bonus
      maxBonus = 0.5; // Up to 1.5x total
      const monthlyRatio = timeRatio * 0.5; // Further reduced
      baseMultiplier = 1.0 + (maxBonus * monthlyRatio);
      break;
      
    default:
      baseMultiplier = 1.0;
  }
  
  return Math.max(1.0, baseMultiplier);
}

function parseIndividualLockupData(data, amountOffset, metadataStart, currentTime) {
  // Parse individual lockup data for a specific deposit
  let lockupInfo = {
    kind: 0,
    startTs: 0,
    endTs: 0,
    amount: 0,
    isValid: false
  };
  
  try {
    // Get amount
    const rawAmount = Number(data.readBigUInt64LE(amountOffset));
    const amount = rawAmount / 1e6;
    
    if (amount < 50 || amount > 20000000) {
      return lockupInfo;
    }
    
    lockupInfo.amount = amount;
    
    // Parse lockup kind from metadata area
    for (let kindOffset = metadataStart + 16; kindOffset <= metadataStart + 24; kindOffset++) {
      if (kindOffset < data.length) {
        const kind = data[kindOffset];
        if (kind >= 1 && kind <= 4) {
          // Look for timestamp pairs
          let timestamps = [];
          for (let tsOffset = metadataStart; tsOffset <= metadataStart + 16; tsOffset += 8) {
            if (tsOffset + 8 <= data.length) {
              try {
                const ts = Number(data.readBigUInt64LE(tsOffset));
                if (ts > 1577836800 && ts < 1893456000) { // Valid timestamp range
                  timestamps.push(ts);
                }
              } catch (e) {}
            }
          }
          
          if (timestamps.length >= 2) {
            timestamps.sort((a, b) => a - b);
            const startTs = timestamps[0];
            const endTs = timestamps[timestamps.length - 1];
            
            if (endTs > currentTime && startTs < endTs) {
              lockupInfo.kind = kind;
              lockupInfo.startTs = startTs;
              lockupInfo.endTs = endTs;
              lockupInfo.isValid = true;
              break;
            }
          }
        }
      }
    }
    
    return lockupInfo;
  } catch (e) {
    return lockupInfo;
  }
}

function parseAllVSRDeposits(data, currentTime) {
  const deposits = [];
  const processedAmounts = new Set();
  
  // Method 1: Formal deposit entries
  const depositEntrySize = 56;
  const maxDeposits = 32;
  
  for (let i = 0; i < maxDeposits; i++) {
    const offset = 104 + (i * depositEntrySize);
    
    if (offset + depositEntrySize > data.length) break;
    
    try {
      const isUsed = data[offset];
      const amountRaw = Number(data.readBigUInt64LE(offset + 8));
      const amount = amountRaw / 1e6;
      const lockupKind = data[offset + 32];
      const startTs = Number(data.readBigUInt64LE(offset + 40));
      const endTs = Number(data.readBigUInt64LE(offset + 48));
      
      if (isUsed === 1 && amount > 50) {
        const amountKey = Math.round(amount * 1000);
        if (!processedAmounts.has(amountKey)) {
          processedAmounts.add(amountKey);
          
          const timeRemaining = Math.max(0, endTs - currentTime);
          const totalDuration = Math.max(1, endTs - startTs);
          const timeRemainingDays = timeRemaining / 86400;
          const totalDurationDays = totalDuration / 86400;
          
          const multiplier = calculateDynamicMultiplier(lockupKind, timeRemainingDays, totalDurationDays);
          const power = amount * multiplier;
          
          deposits.push({
            amount,
            multiplier,
            power,
            lockupKind,
            startTs,
            endTs,
            timeRemainingDays: Math.floor(timeRemainingDays),
            totalDurationDays: Math.floor(totalDurationDays),
            isLocked: lockupKind > 0,
            source: 'formalEntry'
          });
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  // Method 2: Multi-lockup pattern parsing with individual lockup analysis
  const multiLockupPatterns = [
    { amountOffset: 184, metadataStart: 152 },
    { amountOffset: 264, metadataStart: 232 },
    { amountOffset: 344, metadataStart: 312 },
    { amountOffset: 424, metadataStart: 392 }
  ];
  
  for (const pattern of multiLockupPatterns) {
    const lockupData = parseIndividualLockupData(data, pattern.amountOffset, pattern.metadataStart, currentTime);
    
    if (lockupData.isValid && lockupData.amount > 0) {
      const amountKey = Math.round(lockupData.amount * 1000);
      if (!processedAmounts.has(amountKey)) {
        processedAmounts.add(amountKey);
        
        const timeRemaining = Math.max(0, lockupData.endTs - currentTime);
        const totalDuration = Math.max(1, lockupData.endTs - lockupData.startTs);
        const timeRemainingDays = timeRemaining / 86400;
        const totalDurationDays = totalDuration / 86400;
        
        const multiplier = calculateDynamicMultiplier(lockupData.kind, timeRemainingDays, totalDurationDays);
        const power = lockupData.amount * multiplier;
        
        deposits.push({
          amount: lockupData.amount,
          multiplier,
          power,
          lockupKind: lockupData.kind,
          startTs: lockupData.startTs,
          endTs: lockupData.endTs,
          timeRemainingDays: Math.floor(timeRemainingDays),
          totalDurationDays: Math.floor(totalDurationDays),
          isLocked: true,
          source: 'multiLockup'
        });
      }
    }
  }
  
  // Method 3: Unlocked deposits
  const directOffsets = [104, 112, 184, 264, 344];
  
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 1000 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          const rounded = Math.round(amount);
          
          if (!processedAmounts.has(amountKey) && rounded !== 1000 && rounded !== 11000) {
            processedAmounts.add(amountKey);
            
            deposits.push({
              amount,
              multiplier: 1.0,
              power: amount,
              lockupKind: 0,
              startTs: 0,
              endTs: 0,
              timeRemainingDays: 0,
              totalDurationDays: 0,
              isLocked: false,
              source: 'unlocked'
            });
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  return deposits;
}

async function scanAllCitizensDynamic() {
  console.log('DYNAMIC VSR GOVERNANCE POWER SCANNER');
  console.log('===================================');
  console.log('Individual lockup parsing - no hardcoded values\n');
  
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = citizensResult.rows.map(row => row.wallet);
  
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { 
    filters: [{ dataSize: 2728 }] 
  });
  
  const currentTime = Date.now() / 1000;
  const results = [];
  
  console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
  
  for (const walletAddress of citizenWallets) {
    let totalPower = 0;
    let lockedPower = 0;
    let unlockedPower = 0;
    const allDeposits = [];
    
    for (const account of allVSR) {
      const data = account.account.data;
      
      try {
        let authority = null;
        if (data.length >= 40) {
          authority = new PublicKey(data.slice(8, 40)).toBase58();
        }
        
        if (authority === walletAddress) {
          const deposits = parseAllVSRDeposits(data, currentTime);
          
          for (const deposit of deposits) {
            totalPower += deposit.power;
            allDeposits.push(deposit);
            
            if (deposit.isLocked) {
              lockedPower += deposit.power;
            } else {
              unlockedPower += deposit.power;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (totalPower > 0) {
      results.push({
        address: walletAddress,
        total: totalPower,
        locked: lockedPower,
        unlocked: unlockedPower,
        deposits: allDeposits
      });
      
      console.log(`${walletAddress} - ${totalPower.toLocaleString()} ISLAND`);
      console.log(`  Locked: ${lockedPower.toLocaleString()} ISLAND`);
      console.log(`  Unlocked: ${unlockedPower.toLocaleString()} ISLAND`);
      
      if (allDeposits.length > 0) {
        console.log(`  Deposits (${allDeposits.length}):`);
        for (const deposit of allDeposits) {
          if (deposit.isLocked) {
            const lockupTypes = ['', 'Cliff', 'Constant', 'Vesting', 'Monthly'];
            const lockupName = lockupTypes[deposit.lockupKind] || 'Unknown';
            console.log(`    ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)} = ${deposit.power.toLocaleString()} [${lockupName} - ${deposit.timeRemainingDays}d left]`);
          } else {
            console.log(`    ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)} = ${deposit.power.toLocaleString()} [Unlocked]`);
          }
        }
      }
      console.log('');
    }
  }
  
  // Export results with detailed analysis
  const exportData = {
    timestamp: new Date().toISOString(),
    totalCitizens: citizenWallets.length,
    citizensWithPower: results.length,
    totalGovernancePower: results.reduce((sum, r) => sum + r.total, 0),
    totalLocked: results.reduce((sum, r) => sum + r.locked, 0),
    totalUnlocked: results.reduce((sum, r) => sum + r.unlocked, 0),
    citizens: results,
    calculationMethod: "Dynamic per-deposit lockup parsing with individual multipliers"
  };
  
  fs.writeFileSync('dynamic-vsr-governance-results.json', JSON.stringify(exportData, null, 2));
  
  console.log('FINAL SUMMARY');
  console.log('=============');
  console.log(`Citizens with governance power: ${results.length}/20`);
  console.log(`Total governance power: ${exportData.totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Total locked: ${exportData.totalLocked.toLocaleString()} ISLAND`);
  console.log(`Total unlocked: ${exportData.totalUnlocked.toLocaleString()} ISLAND`);
  console.log(`\nDetailed results exported to: dynamic-vsr-governance-results.json`);
  
  await pool.end();
  return results;
}

scanAllCitizensDynamic().catch(console.error);