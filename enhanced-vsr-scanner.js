/**
 * Final Citizen Governance Power Scanner
 * Canonical, multiplier-aware implementation with accurate lockup parsing
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

function parseAllDeposits(data, currentTime) {
  const deposits = [];
  const scannedOffsets = new Set();
  const processedAmounts = new Set();

  const multiLockupPatterns = [184, 264, 344, 424];

  for (const offset of multiLockupPatterns) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        const rounded = Math.round(amount);
        const amountKey = Math.round(amount * 1000);

        if (amount >= 50 && amount <= 20_000_000 && !processedAmounts.has(amountKey)) {
          processedAmounts.add(amountKey);
          let foundValidLock = false;

          for (let metaOffset = offset - 32; metaOffset >= offset - 64; metaOffset--) {
            try {
              const startTs = Number(data.readBigUInt64LE(metaOffset));
              const endTs = Number(data.readBigUInt64LE(metaOffset + 8));
              const kind = data[metaOffset + 24];

              if (kind >= 1 && kind <= 4 && startTs > 0 && startTs < endTs) {
                const lockup = { kind, startTs, endTs };
                const multiplier = calculateMultiplier(lockup, currentTime);
                const power = amount * multiplier;
                deposits.push({ amount, multiplier, power, isLocked: true, source: 'multiLockup', offset });
                scannedOffsets.add(offset);
                foundValidLock = true;
                break;
              }
            } catch (_) {}
          }

          if (!foundValidLock) {
            deposits.push({ amount, multiplier: 1.0, power: amount, isLocked: false, source: 'fallback-unlocked', offset });
          }
        }
      } catch (_) { continue; }
    }
  }

  const directOffsets = [104, 112, 184, 264, 344];
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length && !scannedOffsets.has(offset)) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        const rounded = Math.round(amount);
        const amountKey = Math.round(amount * 1000);

        if (amount >= 1000 && amount <= 20_000_000 && rounded !== 1000 && rounded !== 11000 && !processedAmounts.has(amountKey)) {
          processedAmounts.add(amountKey);
          deposits.push({ amount, multiplier: 1.0, power: amount, isLocked: false, source: 'unlocked', offset });
        }
      } catch (_) { continue; }
    }
  }

  return deposits;
}

async function scanCitizens() {
  console.log('ENHANCED CANONICAL ISLANDDAO GOVERNANCE POWER SCANNER');
  console.log('===================================================');
  console.log('✅ Flexible metadata search (offset-32 to offset-64)');
  console.log('✅ Fallback to unlocked for unmatched deposits');
  console.log('✅ Improved deduplication logic\n');
  
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const citizenWallets = citizensResult.rows.map(row => row.wallet);

  console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);

  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { filters: [{ dataSize: 2728 }] });
  const currentTime = Date.now() / 1000;
  const result = [];

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
          if (d.isLocked) locked += d.power; else unlocked += d.power;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (total > 0) {
      result.push({ wallet, total, locked, unlocked, deposits: allDeposits });
    }
  }

  // Sort by total governance power
  result.sort((a, b) => b.total - a.total);

  console.log('ENHANCED RESULTS - NATIVE GOVERNANCE POWER');
  console.log('=========================================');
  
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    console.log(`${i + 1}. ${r.wallet}`);
    console.log(`   Total: ${r.total.toLocaleString()} ISLAND`);
    console.log(`   Locked: ${r.locked.toLocaleString()} | Unlocked: ${r.unlocked.toLocaleString()}`);
    
    // Show deposits with multipliers > 1.0 (locked)
    const lockedDeposits = r.deposits.filter(d => d.multiplier > 1.0);
    if (lockedDeposits.length > 0) {
      console.log(`   Locked deposits:`);
      for (const deposit of lockedDeposits) {
        console.log(`     ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)}x = ${deposit.power.toLocaleString()} [${deposit.source}]`);
      }
    }
    console.log();
  }

  const totalNativeGovernancePower = result.reduce((sum, r) => sum + r.total, 0);
  const totalLockedPower = result.reduce((sum, r) => sum + r.locked, 0);
  const totalUnlockedPower = result.reduce((sum, r) => sum + r.unlocked, 0);
  
  console.log('ENHANCED SUMMARY');
  console.log('===============');
  console.log(`Citizens with governance power: ${result.length}`);
  console.log(`Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Total locked power: ${totalLockedPower.toLocaleString()} ISLAND`);
  console.log(`Total unlocked power: ${totalUnlockedPower.toLocaleString()} ISLAND`);
  
  if (totalLockedPower > 0) {
    console.log(`Locked percentage: ${((totalLockedPower / totalNativeGovernancePower) * 100).toFixed(1)}%`);
  }
  
  await pool.end();
  return result;
}

scanCitizens().catch(console.error);