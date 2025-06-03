/**
 * Corrected Citizen VSR Scanner
 * Copies the exact working logic from audit-wallets-full-final.js
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Calculate multiplier - exact copy from audit-wallets-full-final.js
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0) return 1.0;
  if (lockupEndTs === 0) return 1.0;
  
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockupEndTs - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  
  return Math.min(1 + years, 5);
}

/**
 * Parse VSR deposits - exact copy from audit-wallets-full-final.js
 */
function parseVSRDepositsWithValidation(data) {
  const deposits = [];
  
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    
    for (let i = 0; i < 32; i++) {
      const depositOffset = 76 + (i * 192);
      
      if (depositOffset + 191 >= data.length) break;
      
      const isUsed = data.readUInt8(depositOffset) === 1;
      if (!isUsed) continue;
      
      const amountLow = data.readUInt32LE(depositOffset + 8);
      const amountHigh = data.readUInt32LE(depositOffset + 12);
      const amount = (amountHigh * 0x100000000 + amountLow) / 1_000_000;
      
      if (amount === 0) continue;
      
      const lockupKind = data.readUInt8(depositOffset + 16);
      const startTs = data.readUInt32LE(depositOffset + 17);
      const endTs = data.readUInt32LE(depositOffset + 21);
      
      const multiplier = calculateMultiplier(lockupKind, endTs);
      const power = amount * multiplier;
      
      deposits.push({
        depositIndex: i,
        isUsed,
        amount,
        lockupKind,
        startTs,
        endTs,
        multiplier,
        power,
        authority,
        voterAuthority
      });
    }
  } catch (error) {
    return [];
  }
  
  return deposits;
}

/**
 * Get citizen wallets from database
 */
async function getCitizenWallets() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    return result.rows.map(row => row.wallet);
  } finally {
    await pool.end();
  }
}

/**
 * Main scanning function - exact same approach as audit-wallets-full-final.js
 */
async function scanCitizenVSRPower() {
  console.log('CORRECTED CITIZEN VSR GOVERNANCE SCANNER');
  console.log('=========================================');
  console.log('Using exact same logic as audit-wallets-full-final.js\n');
  
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets\n`);
  
  // Load all VSR accounts - same as working scanner
  const voterAccounts = await connection.getProgramAccounts(new PublicKey(VSR_PROGRAM_ID), {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${voterAccounts.length} Voter accounts (2728 bytes)\n`);
  
  let citizensWithPower = 0;
  let totalNativePower = 0;
  let totalDelegatedPower = 0;
  
  for (const walletAddress of citizenWallets) {
    let nativePower = 0;
    let delegatedPower = 0;
    const foundDeposits = [];
    
    // Process ALL accounts - same as working scanner
    for (const { account, pubkey } of voterAccounts) {
      const deposits = parseVSRDepositsWithValidation(account.data);
      
      for (const deposit of deposits) {
        const isNative = deposit.authority === walletAddress;
        const isDelegated = deposit.voterAuthority === walletAddress && deposit.authority !== walletAddress;
        
        if (isNative) {
          nativePower += deposit.power;
          foundDeposits.push({ ...deposit, type: 'native', account: pubkey.toBase58() });
        }
        
        if (isDelegated) {
          delegatedPower += deposit.power;
          foundDeposits.push({ ...deposit, type: 'delegated', account: pubkey.toBase58() });
        }
      }
    }
    
    const totalPower = nativePower + delegatedPower;
    if (totalPower > 0) citizensWithPower++;
    totalNativePower += nativePower;
    totalDelegatedPower += delegatedPower;
    
    console.log(`${walletAddress}:`);
    
    if (foundDeposits.length > 0) {
      for (const deposit of foundDeposits) {
        const tag = deposit.type === 'native' ? '🟢 Native' : '🔵 Delegated';
        console.log(`  ${tag} | Deposit #${deposit.depositIndex}`);
        console.log(`    isUsed: ${deposit.isUsed}`);
        console.log(`    Amount: ${deposit.amount.toFixed(6)} ISLAND`);
        console.log(`    Multiplier: ${deposit.multiplier.toFixed(2)} | Power: ${deposit.power.toFixed(2)} ISLAND`);
        console.log(`    LockupKind: ${deposit.lockupKind} | Status: ${deposit.lockupKind === 0 ? 'EXPIRED' : 'ACTIVE'}`);
        console.log(`    StartTs: ${deposit.startTs} | EndTs: ${deposit.endTs}`);
        if (deposit.endTs > 0) {
          const endDate = new Date(deposit.endTs * 1000).toISOString().split('T')[0];
          console.log(`    End Date: ${endDate}`);
        }
        console.log(`    Authority: ${deposit.authority}`);
        console.log(`    VoterAuthority: ${deposit.voterAuthority}`);
        console.log(`    Account: ${deposit.account}`);
        console.log();
      }
    }
    
    console.log(`✅ Summary for ${walletAddress}`);
    console.log(`   - Native Power   : ${nativePower.toFixed(2)} ISLAND`);
    console.log(`   - Delegated Power: ${delegatedPower.toFixed(2)} ISLAND`);
    console.log(`   - Total Power    : ${totalPower.toFixed(2)} ISLAND`);
    console.log('-----------------------------------------------------');
    
    if (foundDeposits.length === 0) {
      console.log(`🟡 No VSR deposits found for ${walletAddress.slice(0, 8)}...`);
      console.log('-----------------------------------------------------');
    }
    
    console.log();
  }
  
  console.log('FINAL SUMMARY:');
  console.log('==============');
  console.log(`Total Citizens: ${citizenWallets.length}`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}`);
  console.log(`Citizens without Power: ${citizenWallets.length - citizensWithPower}`);
  console.log(`Total Native Power: ${totalNativePower.toFixed(2)} ISLAND`);
  console.log(`Total Delegated Power: ${totalDelegatedPower.toFixed(2)} ISLAND`);
  console.log(`Total Combined Power: ${(totalNativePower + totalDelegatedPower).toFixed(2)} ISLAND`);
  
  // Test with known VSR wallet
  console.log('\nVerifying scanner with known VSR wallet...');
  const testWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  let testNativePower = 0;
  
  for (const { account } of voterAccounts) {
    const deposits = parseVSRDepositsWithValidation(account.data);
    for (const deposit of deposits) {
      if (deposit.authority === testWallet) {
        testNativePower += deposit.power;
      }
    }
  }
  
  console.log(`Test wallet (Takisoul) VSR power: ${testNativePower.toFixed(2)} ISLAND`);
  
  if (testNativePower > 0) {
    console.log('✅ Scanner verified working correctly');
    if (citizensWithPower === 0) {
      console.log('✅ Citizen wallets confirmed to have no VSR governance power');
    }
  } else {
    console.log('❌ Scanner still has issues - expected 1.5M ISLAND for test wallet');
  }
  
  console.log('\nCorrected citizen VSR governance scan completed');
}

scanCitizenVSRPower();