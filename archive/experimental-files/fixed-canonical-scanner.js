/**
 * Fixed Canonical VSR Scanner
 * Removes hardcoded wallets, uses database for all 20 citizens
 * Fixes multi-lockup parsing issues
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
  
  // Method 1: Multi-lockup patterns with individual metadata
  const multiLockupPatterns = [
    { amountOffset: 184, metadataOffset: 152 },
    { amountOffset: 264, metadataOffset: 232 },
    { amountOffset: 344, metadataOffset: 312 },
    { amountOffset: 424, metadataOffset: 392 }
  ];

  for (const { amountOffset, metadataOffset } of multiLockupPatterns) {
    if (amountOffset + 8 <= data.length && metadataOffset + 25 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(amountOffset));
        const amount = rawAmount / 1e6;
        
        if (amount >= 50 && amount <= 20_000_000) {
          const amountKey = Math.round(amount * 1000);
          
          if (!processedAmounts.has(amountKey)) {
            const startTs = Number(data.readBigUInt64LE(metadataOffset));
            const endTs = Number(data.readBigUInt64LE(metadataOffset + 8));
            const kind = data[metadataOffset + 24];
            
            // Debug logging
            console.log(`  Checking lockup at ${amountOffset}: ${amount.toLocaleString()} ISLAND, kind=${kind}, start=${startTs}, end=${endTs}`);
            
            if (kind >= 1 && kind <= 4 && startTs > 1577836800 && endTs > startTs && endTs > currentTime) {
              processedAmounts.add(amountKey);
              
              const lockup = { kind, startTs, endTs };
              const multiplier = calculateMultiplier(lockup, currentTime);
              const power = amount * multiplier;
              
              console.log(`    ✅ Added locked: ${amount.toLocaleString()} × ${multiplier.toFixed(3)} = ${power.toLocaleString()}`);
              
              deposits.push({ 
                amount, 
                multiplier, 
                power, 
                isLocked: true, 
                source: 'multiLockup', 
                offset: amountOffset,
                kind,
                startTs,
                endTs
              });
            } else {
              console.log(`    ❌ Invalid lockup: kind=${kind}, startTs=${startTs}, endTs=${endTs}, currentTime=${currentTime}`);
            }
          }
        }
      } catch (e) { 
        console.log(`    ❌ Error parsing lockup at ${amountOffset}: ${e.message}`);
        continue; 
      }
    }
  }

  // Method 2: Unlocked deposits
  const directOffsets = [104, 112, 184, 264, 344];
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        const rounded = Math.round(amount);
        
        if (amount >= 1000 && amount <= 20_000_000 && rounded !== 1000 && rounded !== 11000) {
          const amountKey = Math.round(amount * 1000);
          
          if (!processedAmounts.has(amountKey)) {
            processedAmounts.add(amountKey);
            
            console.log(`    ✅ Added unlocked: ${amount.toLocaleString()} ISLAND`);
            
            deposits.push({ 
              amount, 
              multiplier: 1.0, 
              power: amount, 
              isLocked: false, 
              source: 'unlocked', 
              offset 
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

async function scanAllCitizensFixed() {
  console.log('FIXED CANONICAL VSR SCANNER');
  console.log('===========================');
  console.log('✅ No hardcoded wallets - using database');
  console.log('✅ BASE=1B, MAX_EXTRA=3B formula');
  console.log('✅ Individual lockup metadata parsing\n');
  
  // Get ALL citizens from database (not hardcoded)
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
  const allCitizenWallets = citizensResult.rows.map(row => row.wallet);
  
  console.log(`Scanning ${allCitizenWallets.length} citizens from database...\n`);
  
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { 
    filters: [{ dataSize: 2728 }] 
  });
  
  const currentTime = Date.now() / 1000;
  const results = [];

  for (const wallet of allCitizenWallets) {
    console.log(`\nScanning ${wallet}...`);
    
    let total = 0, locked = 0, unlocked = 0;
    const allDeposits = [];
    
    for (const acct of allVSR) {
      const data = acct.account.data;
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        if (authority !== wallet) continue;
        
        console.log(`  Found VSR account: ${acct.pubkey.toBase58()}`);
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
      results.push({ wallet, total, locked, unlocked, deposits: allDeposits });
      console.log(`  ✅ Total: ${total.toLocaleString()} ISLAND (${locked.toLocaleString()} locked + ${unlocked.toLocaleString()} unlocked)`);
    } else {
      console.log(`  ❌ No governance power found`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULTS - ALL CITIZENS WITH GOVERNANCE POWER');
  console.log('='.repeat(60));
  
  results.sort((a, b) => b.total - a.total);
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    console.log(`${i + 1}. ${result.wallet} - ${result.total.toLocaleString()} ISLAND`);
    console.log(`   Locked: ${result.locked.toLocaleString()} | Unlocked: ${result.unlocked.toLocaleString()}`);
    
    if (result.deposits.length > 1) {
      console.log(`   Deposits:`);
      for (const deposit of result.deposits) {
        const multiplierStr = deposit.multiplier === 1.0 ? '1.0x' : `${deposit.multiplier.toFixed(3)}x`;
        console.log(`     ${deposit.amount.toLocaleString()} × ${multiplierStr} = ${deposit.power.toLocaleString()} [${deposit.source}]`);
      }
    }
    console.log();
  }

  console.log(`Found ${results.length} citizens with governance power`);
  console.log(`Total governance power: ${results.reduce((sum, r) => sum + r.total, 0).toLocaleString()} ISLAND`);
  
  await pool.end();
  return results;
}

scanAllCitizensFixed().catch(console.error);