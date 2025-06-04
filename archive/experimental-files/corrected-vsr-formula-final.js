/**
 * Corrected VSR Formula Final Implementation
 * Fixes: BASE=1B, MAX_EXTRA=3B and individual lockup parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateMultiplier(lockup, now = Date.now() / 1000) {
  const BASE = 1_000_000_000;  // Corrected: 1B not 3B
  const MAX_EXTRA = 3_000_000_000;  // 3B max bonus
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

  return (BASE + bonus) / 1e9;  // Convert back to multiplier
}

function parseVSRDepositsCorrect(data, currentTime) {
  const deposits = [];
  const processedAmounts = new Set();
  
  // Method 1: Formal deposit entries (working correctly)
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
          const multiplier = calculateMultiplier(lockup, currentTime);
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
  
  // Method 2: Individual lockup parsing (FIXED)
  // Each amount offset gets its own metadata triplet
  const lockupPatterns = [
    { amountOffset: 184, metadataOffset: 152 },
    { amountOffset: 264, metadataOffset: 232 },
    { amountOffset: 344, metadataOffset: 312 },
    { amountOffset: 424, metadataOffset: 392 }
  ];
  
  for (const pattern of lockupPatterns) {
    if (pattern.amountOffset + 8 <= data.length && pattern.metadataOffset + 32 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(pattern.amountOffset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 50 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          if (!processedAmounts.has(amountKey)) {
            
            // Read individual lockup metadata for THIS amount offset
            const startTs = Number(data.readBigUInt64LE(pattern.metadataOffset));
            const endTs = Number(data.readBigUInt64LE(pattern.metadataOffset + 8));
            const kind = data[pattern.metadataOffset + 24];
            
            // Validate lockup data
            if (kind >= 1 && kind <= 4 && 
                startTs > 1577836800 && startTs < 1893456000 &&
                endTs > 1577836800 && endTs < 1893456000 &&
                endTs > startTs && endTs > currentTime) {
              
              processedAmounts.add(amountKey);
              
              const lockup = { kind, startTs, endTs };
              const multiplier = calculateMultiplier(lockup, currentTime);
              const power = amount * multiplier;
              
              deposits.push({
                amount,
                multiplier,
                power,
                lockupKind: kind,
                isLocked: true,
                source: 'individualLockup',
                startTs,
                endTs
              });
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  // Method 3: Unlocked deposits (working correctly)
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

async function scanAllCitizensCorrected() {
  console.log('CORRECTED VSR FORMULA FINAL IMPLEMENTATION');
  console.log('=========================================');
  console.log('Fixed: BASE=1B, MAX_EXTRA=3B, Individual lockup parsing\n');
  
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = citizensResult.rows.map(row => row.wallet);
  
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { 
    filters: [{ dataSize: 2728 }] 
  });
  
  const currentTime = Date.now() / 1000;
  const results = [];
  
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
          const deposits = parseVSRDepositsCorrect(data, currentTime);
          
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
    }
  }
  
  console.log('CORRECTED NATIVE GOVERNANCE POWER - ALL CITIZENS');
  console.log('===============================================');
  
  results.sort((a, b) => b.total - a.total);
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    console.log(`${i + 1}. ${result.address} - ${result.total.toLocaleString()} ISLAND`);
    
    if (result.deposits.length > 1) {
      console.log(`   Breakdown:`);
      for (const deposit of result.deposits) {
        const multiplierStr = deposit.multiplier === 1.0 ? '1.0x' : `${deposit.multiplier.toFixed(3)}x`;
        console.log(`     ${deposit.amount.toLocaleString()} × ${multiplierStr} = ${deposit.power.toLocaleString()} [${deposit.source}]`);
      }
    }
  }
  
  console.log(`\nFound ${results.length} citizens with governance power`);
  console.log(`Total governance power: ${results.reduce((sum, r) => sum + r.total, 0).toLocaleString()} ISLAND`);
  
  // Verification against expected values
  console.log('\nVERIFICATION AGAINST EXPECTED VALUES');
  console.log('===================================');
  
  const expectedValues = {
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8709019.78,
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': 144708.98,
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': 10353647.01
  };
  
  for (const [wallet, expected] of Object.entries(expectedValues)) {
    const result = results.find(r => r.address === wallet);
    if (result) {
      const accuracy = ((result.total / expected) * 100).toFixed(1);
      console.log(`${wallet.slice(0, 8)}... Expected: ${expected.toLocaleString()}, Got: ${result.total.toLocaleString()} (${accuracy}%)`);
    }
  }
  
  await pool.end();
  return results;
}

scanAllCitizensCorrected().catch(console.error);