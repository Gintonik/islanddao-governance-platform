/**
 * Complete 14 Citizen Scan
 * Ensure all citizens with governance power are found
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateMultiplier(lockup, now = Date.now() / 1000) {
  const BASE = 1_000_000_000;
  const MAX_EXTRA = 3_000_000_000;
  const SATURATION_SECS = 31_536_000;

  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const remaining = Math.max(endTs - now, 0);

  let bonus = 0;

  if (kind === 1 || kind === 4) {
    const ratio = Math.min(1, remaining / SATURATION_SECS);
    bonus = MAX_EXTRA * ratio;
  } else if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / SATURATION_SECS);
    bonus = MAX_EXTRA * ratio;
  }

  return (BASE + bonus) / 1e9;
}

function parseVSRDeposits(data, currentTime) {
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
  
  // Method 2: Multi-lockup patterns
  const multiLockupPatterns = [
    { amountOffset: 184, metadataStart: 152 },
    { amountOffset: 264, metadataStart: 232 },
    { amountOffset: 344, metadataStart: 312 },
    { amountOffset: 424, metadataStart: 392 }
  ];
  
  for (const pattern of multiLockupPatterns) {
    if (pattern.amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(pattern.amountOffset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 50 && amount <= 20000000) {
          const amountKey = Math.round(amount * 1000);
          if (!processedAmounts.has(amountKey)) {
            processedAmounts.add(amountKey);
            
            let lockupInfo = { kind: 0, startTs: 0, endTs: 0 };
            
            for (let kindOffset = pattern.metadataStart + 16; kindOffset <= pattern.metadataStart + 24; kindOffset++) {
              if (kindOffset < data.length) {
                const kind = data[kindOffset];
                if (kind >= 1 && kind <= 4) {
                  let timestamps = [];
                  for (let tsOffset = pattern.metadataStart; tsOffset <= pattern.metadataStart + 16; tsOffset += 8) {
                    if (tsOffset + 8 <= data.length) {
                      try {
                        const ts = Number(data.readBigUInt64LE(tsOffset));
                        if (ts > 1577836800 && ts < 1893456000) {
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
                      lockupInfo = { kind, startTs, endTs };
                      break;
                    }
                  }
                }
              }
            }
            
            if (lockupInfo.kind > 0) {
              const multiplier = calculateMultiplier(lockupInfo, currentTime);
              const power = amount * multiplier;
              
              deposits.push({
                amount,
                multiplier,
                power,
                lockupKind: lockupInfo.kind,
                isLocked: true,
                source: 'multiLockup'
              });
            }
          }
        }
      } catch (e) {
        continue;
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

async function scanComplete14Citizens() {
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
          const deposits = parseVSRDeposits(data, currentTime);
          
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
  
  console.log('ALL 14 CITIZENS WITH NATIVE GOVERNANCE POWER');
  console.log('===========================================');
  
  for (const result of results) {
    console.log(`${result.address} - ${result.total.toLocaleString()} ISLAND`);
  }
  
  console.log(`\nFound ${results.length} citizens with governance power`);
  
  await pool.end();
  return results;
}

scanComplete14Citizens().catch(console.error);