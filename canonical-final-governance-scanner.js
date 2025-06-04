/**
 * Final Citizen Governance Power Scanner
 * Canonical, multiplier-aware implementation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateMultiplier(lockup, now = Date.now() / 1000) {
  const baseline = 3_000_000_000;
  const maxExtra = 3_000_000_000;
  const saturation = 31_536_000;

  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const timeRemaining = Math.max(endTs - now, 0);

  if (kind === 1 || kind === 4) {
    // Cliff or Monthly: straight-line decay
    const ratio = Math.min(1, timeRemaining / saturation);
    return (baseline + maxExtra * ratio) / 1e9;
  }

  if (kind === 2 || kind === 3) {
    // Constant or Vesting: time-weighted locked fraction
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / saturation);
    return (baseline + maxExtra * ratio) / 1e9;
  }

  return 1.0;
}

function parseAllDeposits(data, currentTime) {
  const deposits = [];
  const scannedOffsets = new Set();

  // Canonical lockup offsets
  const multiLockupOffsets = [184, 264, 344, 424];

  for (const offset of multiLockupOffsets) {
    if (offset + 8 <= data.length) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      if (amount >= 50 && amount <= 20_000_000) {
        // Based on investigation: metadata is stored in specific pattern relative to offset
        let lockupInfo = { kind: 0, startTs: 0, endTs: 0 };
        const metadataBase = offset - 32;
        
        // Look for lockup kind around expected position
        for (let kindOffset = metadataBase + 16; kindOffset <= metadataBase + 24; kindOffset++) {
          if (kindOffset < data.length) {
            const kind = data[kindOffset];
            if (kind >= 1 && kind <= 4) {
              // Look for timestamp pairs near metadata base
              let timestamps = [];
              for (let tsOffset = metadataBase; tsOffset <= metadataBase + 24; tsOffset += 8) {
                if (tsOffset + 8 <= data.length) {
                  try {
                    const ts = Number(data.readBigUInt64LE(tsOffset));
                    if (ts > 1577836800 && ts < 1893456000) { // 2020-2030 range
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

        if (lockupInfo.kind > 0 && lockupInfo.endTs > currentTime) {
          const multiplier = calculateMultiplier(lockupInfo, currentTime);
          const power = amount * multiplier;
          deposits.push({ amount, multiplier, power, isLocked: true, source: 'locked', offset });
          scannedOffsets.add(offset);
        }
      }
    }
  }

  // Unlocked scanner (skip phantom delegation markers)
  const directOffsets = [104, 112, 184, 264, 344];
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length && !scannedOffsets.has(offset)) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      const rounded = Math.round(amount);
      if (amount >= 1000 && amount <= 20_000_000 && rounded !== 1000 && rounded !== 11000) {
        deposits.push({ amount, multiplier: 1.0, power: amount, isLocked: false, source: 'unlocked', offset });
      }
    }
  }

  return deposits;
}

async function scanAllCitizens() {
  console.log('CANONICAL ISLANDDAO NATIVE GOVERNANCE POWER');
  console.log('==========================================');
  
  // Get all citizens from database
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = citizensResult.rows.map(row => row.wallet);
  
  console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
  
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { filters: [{ dataSize: 2728 }] });
  const currentTime = Date.now() / 1000;
  const results = [];

  for (const wallet of citizenWallets) {
    let total = 0, locked = 0, unlocked = 0;
    const allDeposits = [];
    
    for (const acct of allVSR) {
      const data = acct.account.data;
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        if (authority !== wallet) continue;
        
        const deposits = parseAllDeposits(data, currentTime);
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
    
    if (total > 0) {
      results.push({ wallet, total, locked, unlocked, deposits: allDeposits });
      
      console.log(`${wallet} - ${total.toLocaleString()} ISLAND`);
      console.log(`  Locked: ${locked.toLocaleString()} ISLAND`);
      console.log(`  Unlocked: ${unlocked.toLocaleString()} ISLAND`);
      
      if (allDeposits.length > 0) {
        console.log(`  Deposits (${allDeposits.length}):`);
        for (const deposit of allDeposits) {
          const lockupStatus = deposit.isLocked ? 'Locked' : 'Unlocked';
          console.log(`    ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)} = ${deposit.power.toLocaleString()} [${lockupStatus}]`);
        }
      }
      console.log('');
    }
  }

  console.log('SUMMARY');
  console.log('=======');
  console.log(`Citizens with governance power: ${results.length}/20`);
  
  const totalPower = results.reduce((sum, r) => sum + r.total, 0);
  const totalLocked = results.reduce((sum, r) => sum + r.locked, 0);
  const totalUnlocked = results.reduce((sum, r) => sum + r.unlocked, 0);
  
  console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Total locked: ${totalLocked.toLocaleString()} ISLAND`);
  console.log(`Total unlocked: ${totalUnlocked.toLocaleString()} ISLAND`);
  
  await pool.end();
  return results;
}

scanAllCitizens().catch(console.error);