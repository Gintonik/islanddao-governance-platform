/**
 * Check Missing 14th Citizen
 * Debug why 37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA is missing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

const missingWallet = '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA';

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
  
  // Method 3: Direct unlocked deposits (focus on this since missing wallet has unlocked)
  const directOffsets = [104, 112, 184, 264, 344];
  
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        const amount = rawAmount / 1e6;
        
        console.log(`  Checking offset ${offset}: ${amount.toLocaleString()} ISLAND`);
        
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
              source: 'unlocked',
              offset
            });
            
            console.log(`    ✅ Added: ${amount.toLocaleString()} ISLAND`);
          } else {
            console.log(`    ❌ Skipped: already processed=${processedAmounts.has(amountKey)}, phantom=${rounded === 1000 || rounded === 11000}`);
          }
        } else {
          console.log(`    ❌ Outside range [1K, 20M]`);
        }
      } catch (e) {
        console.log(`    ❌ Error reading offset ${offset}: ${e.message}`);
      }
    }
  }
  
  return deposits;
}

async function checkMissingCitizen() {
  console.log(`Checking missing citizen: ${missingWallet}\n`);
  
  // Check if wallet is in database
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const citizensResult = await pool.query('SELECT wallet FROM citizens WHERE wallet = $1', [missingWallet]);
  
  if (citizensResult.rows.length === 0) {
    console.log('❌ Wallet NOT found in citizens database');
    await pool.end();
    return;
  } else {
    console.log('✅ Wallet found in citizens database');
  }
  
  // Check for VSR accounts
  const allVSR = await connection.getProgramAccounts(VSR_PROGRAM_ID, { 
    filters: [{ dataSize: 2728 }] 
  });
  
  console.log(`Checking ${allVSR.length} VSR accounts for authority match...\n`);
  
  const currentTime = Date.now() / 1000;
  let foundVSRAccount = false;
  
  for (const account of allVSR) {
    const data = account.account.data;
    
    try {
      let authority = null;
      if (data.length >= 40) {
        authority = new PublicKey(data.slice(8, 40)).toBase58();
      }
      
      if (authority === missingWallet) {
        foundVSRAccount = true;
        console.log(`✅ Found VSR account: ${account.pubkey.toBase58()}`);
        console.log(`Authority: ${authority}`);
        
        const deposits = parseVSRDeposits(data, currentTime);
        
        const totalPower = deposits.reduce((sum, d) => sum + d.power, 0);
        console.log(`\nTotal deposits found: ${deposits.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        if (deposits.length > 0) {
          console.log('Deposits:');
          for (const deposit of deposits) {
            console.log(`  ${deposit.amount.toLocaleString()} × ${deposit.multiplier} = ${deposit.power.toLocaleString()} [${deposit.source}]`);
          }
        }
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!foundVSRAccount) {
    console.log('❌ No VSR account found for this wallet');
  }
  
  await pool.end();
}

checkMissingCitizen().catch(console.error);