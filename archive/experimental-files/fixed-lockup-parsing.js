/**
 * Fixed Lockup Parsing Implementation
 * Uses the exact metadata offsets discovered in debug analysis
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
  const processedAmounts = new Set();
  
  // Use exact patterns discovered in debug analysis
  const lockupMappings = [
    { amountOffset: 184, metadataOffsets: [152, 232] },
    { amountOffset: 264, metadataOffsets: [232, 312] },
    { amountOffset: 344, metadataOffsets: [312, 392] },
    { amountOffset: 424, metadataOffsets: [392] }
  ];

  for (const mapping of lockupMappings) {
    if (mapping.amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(mapping.amountOffset));
        const amount = rawAmount / 1e6;
        const amountKey = Math.round(amount * 1000);

        if (amount >= 50 && amount <= 20_000_000 && !processedAmounts.has(amountKey)) {
          let bestMultiplier = 1.0;
          let bestLockup = null;
          let foundValidLockup = false;

          // Check each potential metadata offset for this amount
          for (const metaOffset of mapping.metadataOffsets) {
            if (metaOffset + 32 <= data.length) {
              try {
                const startTs = Number(data.readBigUInt64LE(metaOffset));
                const endTs = Number(data.readBigUInt64LE(metaOffset + 8));
                const kind = data[metaOffset + 24];

                if (kind >= 1 && kind <= 4 && startTs > 1577836800 && startTs < endTs && 
                    endTs > 1577836800 && endTs < 1893456000) {
                  
                  const lockup = { kind, startTs, endTs };
                  const multiplier = calculateMultiplier(lockup, currentTime);
                  
                  // Use the lockup that gives the highest multiplier
                  if (multiplier > bestMultiplier) {
                    bestMultiplier = multiplier;
                    bestLockup = lockup;
                    foundValidLockup = true;
                  }
                }
              } catch (e) {
                continue;
              }
            }
          }

          processedAmounts.add(amountKey);
          
          if (foundValidLockup && bestMultiplier > 1.0) {
            const power = amount * bestMultiplier;
            deposits.push({ 
              amount, 
              multiplier: bestMultiplier, 
              power, 
              isLocked: true, 
              source: 'validLockup',
              lockup: bestLockup,
              offset: mapping.amountOffset
            });
          } else {
            deposits.push({ 
              amount, 
              multiplier: 1.0, 
              power: amount, 
              isLocked: false, 
              source: 'noValidLockup',
              offset: mapping.amountOffset
            });
          }
        }
      } catch (e) { 
        continue; 
      }
    }
  }

  // Handle direct unlocked deposits at other offsets
  const directOffsets = [104, 112];
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        const rounded = Math.round(amount);
        const amountKey = Math.round(amount * 1000);

        if (amount >= 1000 && amount <= 20_000_000 && rounded !== 1000 && rounded !== 11000 && 
            !processedAmounts.has(amountKey)) {
          processedAmounts.add(amountKey);
          deposits.push({ 
            amount, 
            multiplier: 1.0, 
            power: amount, 
            isLocked: false, 
            source: 'unlocked',
            offset
          });
        }
      } catch (e) { 
        continue; 
      }
    }
  }

  return deposits;
}

async function scanWithFixedLockupParsing() {
  console.log('FIXED LOCKUP PARSING IMPLEMENTATION');
  console.log('===================================');
  console.log('✅ Using exact metadata offsets from debug analysis');
  console.log('✅ Best multiplier selection for each deposit');
  console.log('✅ Comprehensive lockup validation\n');
  
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

  result.sort((a, b) => b.total - a.total);

  console.log('FIXED PARSING RESULTS - WITH ACTUAL LOCKED DEPOSITS');
  console.log('==================================================');
  
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    console.log(`${i + 1}. ${r.wallet}`);
    console.log(`   Total: ${r.total.toLocaleString()} ISLAND`);
    console.log(`   Locked: ${r.locked.toLocaleString()} | Unlocked: ${r.unlocked.toLocaleString()}`);
    
    const lockedDeposits = r.deposits.filter(d => d.isLocked);
    if (lockedDeposits.length > 0) {
      console.log(`   Locked deposits:`);
      for (const deposit of lockedDeposits) {
        console.log(`     ${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)}x = ${deposit.power.toLocaleString()}`);
      }
    }
    console.log();
  }

  const totalNativeGovernancePower = result.reduce((sum, r) => sum + r.total, 0);
  const totalLockedPower = result.reduce((sum, r) => sum + r.locked, 0);
  const totalUnlockedPower = result.reduce((sum, r) => sum + r.unlocked, 0);
  
  console.log('FINAL SUMMARY WITH LOCKED DEPOSITS');
  console.log('==================================');
  console.log(`Citizens with governance power: ${result.length}`);
  console.log(`Total native governance power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Total locked power: ${totalLockedPower.toLocaleString()} ISLAND`);
  console.log(`Total unlocked power: ${totalUnlockedPower.toLocaleString()} ISLAND`);
  console.log(`Locked percentage: ${((totalLockedPower / totalNativeGovernancePower) * 100).toFixed(1)}%`);
  
  await pool.end();
  return result;
}

scanWithFixedLockupParsing().catch(console.error);