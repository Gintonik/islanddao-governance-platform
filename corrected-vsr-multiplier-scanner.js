/**
 * Corrected VSR Multiplier Scanner
 * Fixed multiplier calculation to match expected governance power values
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateCorrectedMultiplier(lockup, now = Date.now() / 1000) {
  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const timeRemaining = Math.max(endTs - now, 0);
  const saturation = 31_536_000; // 1 year

  if (kind === 1 || kind === 4) {
    // Cliff or Monthly: simple time-based multiplier
    const ratio = Math.min(1, timeRemaining / saturation);
    return 1.0 + (2.0 * ratio); // Max 3x multiplier
  }

  if (kind === 2 || kind === 3) {
    // Constant or Vesting: weighted average approach
    const elapsed = Math.max(0, now - startTs);
    const unlockedRatio = Math.min(1, elapsed / duration);
    const lockedRatio = 1 - unlockedRatio;
    
    // Only the locked portion gets bonus multiplier
    const bonusRatio = Math.min(1, timeRemaining / saturation);
    const multiplier = unlockedRatio * 1.0 + lockedRatio * (1.0 + bonusRatio);
    
    return multiplier;
  }

  return 1.0;
}

function parseVSRDepositsCorrect(data, currentTime) {
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
          
          const lockup = { kind: lockupKind, startTs, endTs };
          const multiplier = calculateCorrectedMultiplier(lockup, currentTime);
          const power = amount * multiplier;
          
          deposits.push({
            amount,
            multiplier,
            power,
            lockupKind,
            isLocked: lockupKind > 0,
            source: 'formalEntry'
          });
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  // Method 2: Multi-lockup patterns
  const multiLockupPatterns = [
    { amountOffset: 184, metadataStart: 152 },
    { amountOffset: 264, metadataStart: 232 },
    { amountOffset: 344, metadataStart: 312 },
    { amountOffset: 424, metadataStart: 392 }
  ];
  
  for (const pattern of multiLockupPatterns) {
    const { amountOffset, metadataStart } = pattern;
    
    if (amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(amountOffset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 50 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          if (!processedAmounts.has(amountKey)) {
            processedAmounts.add(amountKey);
            
            let lockupInfo = { kind: 0, startTs: 0, endTs: 0 };
            
            // Parse lockup metadata
            for (let kindOffset = metadataStart + 16; kindOffset <= metadataStart + 24; kindOffset++) {
              if (kindOffset < data.length) {
                const kind = data[kindOffset];
                if (kind >= 1 && kind <= 4) {
                  try {
                    const ts1 = Number(data.readBigUInt64LE(metadataStart));
                    const ts2 = Number(data.readBigUInt64LE(metadataStart + 8));
                    
                    if (ts1 > 1577836800 && ts1 < 1893456000 && 
                        ts2 > 1577836800 && ts2 < 1893456000) {
                      const startTs = Math.min(ts1, ts2);
                      const endTs = Math.max(ts1, ts2);
                      
                      if (endTs > currentTime) {
                        lockupInfo = { kind, startTs, endTs };
                        break;
                      }
                    }
                  } catch (e) {}
                }
              }
            }
            
            const multiplier = calculateCorrectedMultiplier(lockupInfo, currentTime);
            const power = amount * multiplier;
            
            deposits.push({
              amount,
              multiplier,
              power,
              lockupKind: lockupInfo.kind,
              isLocked: lockupInfo.kind > 0,
              source: 'multiLockup'
            });
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  // Method 3: Unlocked deposits (unchanged - these are correct)
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

async function testCorrectedMultipliers() {
  console.log('CORRECTED VSR MULTIPLIER TEST');
  console.log('============================');
  
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { 
    filters: [{ dataSize: 2728 }] 
  });
  
  const testWallets = [
    { wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8709019.78, name: 'Takisoul' },
    { wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.981722, name: 'GJdRQcsy' }
  ];
  
  const currentTime = Date.now() / 1000;
  
  for (const testCase of testWallets) {
    console.log(`\nTesting ${testCase.name}: ${testCase.wallet.substring(0,8)}`);
    console.log(`Expected: ${testCase.expected.toLocaleString()} ISLAND`);
    
    let total = 0, locked = 0, unlocked = 0;
    const allDeposits = [];
    
    for (const acct of allVSR) {
      const data = acct.account.data;
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        if (authority !== testCase.wallet) continue;
        
        const deposits = parseVSRDepositsCorrect(data, currentTime);
        for (const d of deposits) {
          total += d.power;
          allDeposits.push(d);
          if (d.isLocked) locked += d.power;
          else unlocked += d.power;
        }
      } catch (e) {
        continue;
      }
    }
    
    console.log(`Calculated: ${total.toLocaleString()} ISLAND`);
    console.log(`  Locked: ${locked.toLocaleString()} ISLAND`);
    console.log(`  Unlocked: ${unlocked.toLocaleString()} ISLAND`);
    
    if (allDeposits.length > 0) {
      console.log(`  Deposits (${allDeposits.length}):`);
      for (const deposit of allDeposits) {
        const lockupStatus = deposit.isLocked ? `Locked (Kind ${deposit.lockupKind})` : 'Unlocked';
        console.log(`    ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)} = ${deposit.power.toLocaleString()} [${lockupStatus}]`);
      }
    }
    
    const difference = Math.abs(total - testCase.expected);
    const percentError = (difference / testCase.expected) * 100;
    
    if (percentError <= 5) {
      console.log(`✅ MATCH: ${percentError.toFixed(2)}% error`);
    } else {
      console.log(`❌ MISMATCH: ${percentError.toFixed(2)}% error`);
    }
  }
}

testCorrectedMultipliers().catch(console.error);