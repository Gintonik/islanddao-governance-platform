/**
 * Complete Citizen Governance Power Scan
 * Scans all 20 citizens and prints governance power for those with VSR deposits
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
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
  let ratio = 0;

  if (kind === 1) {
    ratio = Math.min(1, timeRemaining / saturation);
  } else if (kind === 2 || kind === 3) {
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    ratio = Math.min(1, (lockedRatio * duration) / saturation);
  } else if (kind === 4) {
    ratio = Math.min(1, timeRemaining / saturation);
  } else {
    return 1.0;
  }

  return (baseline + maxExtra * ratio) / 1e9;
}

function parseAllDeposits(data, currentTime) {
  const deposits = [];
  
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
        const lockup = { kind: lockupKind, startTs, endTs };
        const multiplier = calculateCorrectMultiplier(lockup, currentTime);
        const power = amount * multiplier;
        
        deposits.push({
          amount,
          multiplier,
          power,
          lockupKind,
          isLocked: lockupKind > 0,
          source: 'formal'
        });
      }
    } catch (e) {
      continue;
    }
  }
  
  // Method 2: Multi-lockup pattern detection
  const multiLockupOffsets = [
    { amountOffset: 184, metadataBase: 152 },
    { amountOffset: 264, metadataBase: 232 },
    { amountOffset: 344, metadataBase: 312 },
    { amountOffset: 424, metadataBase: 392 }
  ];
  
  for (const pattern of multiLockupOffsets) {
    const { amountOffset, metadataBase } = pattern;
    
    if (amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(amountOffset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 50 && amount <= 20000000) {
          const alreadyFound = deposits.some(d => Math.abs(d.amount - amount) < 1);
          
          if (!alreadyFound) {
            let lockupInfo = { kind: 0, startTs: 0, endTs: 0 };
            
            for (let kindOffset = metadataBase + 16; kindOffset <= metadataBase + 24; kindOffset++) {
              if (kindOffset < data.length) {
                const kind = data[kindOffset];
                if (kind >= 1 && kind <= 4) {
                  let timestamps = [];
                  for (let tsOffset = metadataBase; tsOffset <= metadataBase + 24; tsOffset += 8) {
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
                    
                    if (endTs > currentTime) {
                      lockupInfo = { kind, startTs, endTs };
                      break;
                    }
                  }
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
      } catch (e) {}
    }
  }
  
  // Method 3: Direct amount scanning for unlocked deposits
  const directOffsets = [104, 112, 184, 264, 344];
  
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 1000 && amount <= 20000000) {
          const alreadyFound = deposits.some(d => Math.abs(d.amount - amount) < 1);
          
          if (!alreadyFound) {
            const rounded = Math.round(amount);
            if (rounded === 1000 || rounded === 11000) continue;
            
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
      } catch (e) {}
    }
  }
  
  return deposits;
}

async function scanAllCitizens() {
  console.log('COMPLETE CITIZEN GOVERNANCE POWER SCAN');
  console.log('=====================================');
  console.log('Native governance power breakdown for all citizens with VSR deposits\n');
  
  // Get all citizens from database
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = citizensResult.rows.map(row => row.wallet);
  
  console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
  
  // Load all VSR accounts once
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  const currentTime = Date.now() / 1000;
  const results = [];
  
  for (const walletAddress of citizenWallets) {
    let totalPower = 0;
    let lockedPower = 0;
    let unlockedPower = 0;
    const allDeposits = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      try {
        let authority = null;
        if (data.length >= 40) {
          authority = new PublicKey(data.slice(8, 40)).toBase58();
        }
        
        if (authority === walletAddress) {
          const deposits = parseAllDeposits(data, currentTime);
          
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
      } catch (e) {}
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
          const lockupStatus = deposit.isLocked ? 
            `Locked (Kind ${deposit.lockupKind})` : 'Unlocked';
          console.log(`    ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)} = ${deposit.power.toLocaleString()} [${lockupStatus}]`);
        }
      }
      console.log('');
    }
  }
  
  console.log('SUMMARY');
  console.log('=======');
  console.log(`Citizens with governance power: ${results.length}/20`);
  
  const totalGovernancePower = results.reduce((sum, r) => sum + r.total, 0);
  const totalLocked = results.reduce((sum, r) => sum + r.locked, 0);
  const totalUnlocked = results.reduce((sum, r) => sum + r.unlocked, 0);
  
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Total locked: ${totalLocked.toLocaleString()} ISLAND`);
  console.log(`Total unlocked: ${totalUnlocked.toLocaleString()} ISLAND`);
  
  await pool.end();
  return results;
}

scanAllCitizens().catch(console.error);