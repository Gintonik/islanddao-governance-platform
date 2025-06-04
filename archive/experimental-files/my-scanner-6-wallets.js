/**
 * My Scanner - Testing on 6 wallets
 * Version with comprehensive deduplication and formal entry parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateCorrectMultiplier(lockup, now = Date.now() / 1000) {
  const baseline = 3_000_000_000;
  const maxExtra = 3_000_000_000;
  const saturation = 31_536_000;

  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const timeRemaining = Math.max(endTs - now, 0);

  if (kind === 1 || kind === 4) {
    const ratio = Math.min(1, timeRemaining / saturation);
    return (baseline + maxExtra * ratio) / 1e9;
  }

  if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / saturation);
    return (baseline + maxExtra * ratio) / 1e9;
  }

  return 1.0;
}

function parseVSRDeposits(data, currentTime) {
  const deposits = [];
  const processedAmounts = new Set(); // Prevent duplicate amounts
  
  // Method 1: Parse formal deposit entries first (highest priority)
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
        const amountKey = Math.round(amount * 1000); // Round to 3 decimals for dedup
        if (!processedAmounts.has(amountKey)) {
          processedAmounts.add(amountKey);
          
          const lockup = { kind: lockupKind, startTs, endTs };
          const multiplier = calculateCorrectMultiplier(lockup, currentTime);
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
  
  // Method 2: Multi-lockup pattern detection
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
            
            for (let kindOffset = metadataStart + 16; kindOffset <= metadataStart + 24; kindOffset++) {
              if (kindOffset < data.length) {
                const kind = data[kindOffset];
                if (kind >= 1 && kind <= 4) {
                  let startTs = 0;
                  let endTs = 0;
                  
                  try {
                    const ts1 = Number(data.readBigUInt64LE(metadataStart));
                    const ts2 = Number(data.readBigUInt64LE(metadataStart + 8));
                    
                    if (ts1 > 1577836800 && ts1 < 1893456000 && 
                        ts2 > 1577836800 && ts2 < 1893456000) {
                      startTs = Math.min(ts1, ts2);
                      endTs = Math.max(ts1, ts2);
                      
                      if (endTs > currentTime) {
                        lockupInfo = { kind, startTs, endTs };
                        break;
                      }
                    }
                  } catch (e) {}
                }
              }
            }
            
            const multiplier = calculateCorrectMultiplier(lockupInfo, currentTime);
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
  
  // Method 3: Direct unlocked deposits
  const directOffsets = [104, 112, 184, 264, 344];
  
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 1000 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          
          // Skip if already processed or phantom deposit
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

async function scanCitizens() {
  console.log('MY SCANNER - Testing on 6 wallets');
  console.log('==================================');
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { filters: [{ dataSize: 2728 }] });
  const wallets = [
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh'
  ];
  const currentTime = Date.now() / 1000;
  const result = [];

  for (const wallet of wallets) {
    let total = 0, locked = 0, unlocked = 0;
    for (const acct of allVSR) {
      const data = acct.account.data;
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      if (authority !== wallet) continue;
      const deposits = parseVSRDeposits(data, currentTime);
      for (const d of deposits) {
        total += d.power;
        if (d.isLocked) locked += d.power; else unlocked += d.power;
      }
    }
    result.push({ wallet, total, locked, unlocked });
    console.log(`${wallet}:
  Total: ${total.toLocaleString()} ISLAND
  Locked: ${locked.toLocaleString()} | Unlocked: ${unlocked.toLocaleString()}\n`);
  }

  const totalPower = result.reduce((sum, r) => sum + r.total, 0);
  console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
}

scanCitizens().catch(console.error);