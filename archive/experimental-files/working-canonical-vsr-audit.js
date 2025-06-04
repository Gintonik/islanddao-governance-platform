/**
 * Working Canonical VSR Audit for Citizens
 * Uses the exact same method as audit-wallets-full-final.js that successfully detected VSR power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Calculate multiplier using the exact same method as the working scanner
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
 * Parse VSR deposits using the exact same method that works in audit-wallets-full-final.js
 */
function parseVSRDepositsWithValidation(data) {
  const deposits = [];
  
  try {
    // Parse authority and voter authority (first 64 bytes after discriminator)
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    
    // Parse deposits starting at offset 76
    for (let i = 0; i < 32; i++) {
      const depositOffset = 76 + (i * 192);
      
      // Safety check
      if (depositOffset + 191 >= data.length) break;
      
      // Check isUsed flag
      const isUsed = data.readUInt8(depositOffset) === 1;
      if (!isUsed) continue;
      
      // Parse amount using the working method
      const amountLow = data.readUInt32LE(depositOffset + 8);
      const amountHigh = data.readUInt32LE(depositOffset + 12);
      const amount = (amountHigh * 0x100000000 + amountLow) / 1_000_000; // 6 decimals
      
      if (amount === 0) continue;
      
      // Parse lockup info
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
        voterAuthority,
        isExpired: lockupKind === 0 || endTs === 0
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
 * Calculate governance power for a wallet using the working method
 */
async function calculateGovernancePower(walletAddress, vsrAccounts) {
  let nativePower = 0;
  let delegatedPower = 0;
  const foundDeposits = [];
  
  for (const { account, pubkey } of vsrAccounts) {
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
  
  return {
    nativePower,
    delegatedPower,
    totalPower: nativePower + delegatedPower,
    deposits: foundDeposits
  };
}

/**
 * Audit all citizen wallets using the working canonical method
 */
async function auditCitizenWallets() {
  console.log('CANONICAL VSR GOVERNANCE POWER AUDIT FOR CITIZENS');
  console.log('==================================================');
  console.log('Using the exact same method as audit-wallets-full-final.js\n');
  
  // Get citizen wallets from database
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets in database\n`);
  
  // Load VSR accounts
  const vsrAccounts = await connection.getProgramAccounts(new PublicKey(VSR_PROGRAM_ID), {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${vsrAccounts.length} Voter accounts (2728 bytes)\n`);
  
  let citizensWithPower = 0;
  let totalNativePower = 0;
  let totalDelegatedPower = 0;
  
  for (const walletAddress of citizenWallets) {
    const result = await calculateGovernancePower(walletAddress, vsrAccounts);
    
    if (result.totalPower > 0) citizensWithPower++;
    totalNativePower += result.nativePower;
    totalDelegatedPower += result.delegatedPower;
    
    console.log(`${walletAddress}:`);
    
    if (result.deposits.length > 0) {
      for (const deposit of result.deposits) {
        const tag = deposit.type === 'native' ? '🟢 Native' : '🔵 Delegated';
        console.log(`  ${tag} | Deposit #${deposit.depositIndex}`);
        console.log(`    isUsed: ${deposit.isUsed}`);
        console.log(`    Amount: ${deposit.amount.toFixed(6)} ISLAND`);
        console.log(`    Multiplier: ${deposit.multiplier.toFixed(2)} | Power: ${deposit.power.toFixed(2)} ISLAND`);
        console.log(`    LockupKind: ${deposit.lockupKind} | Status: ${deposit.isExpired ? 'EXPIRED' : 'ACTIVE'}`);
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
    console.log(`   - Native Power   : ${result.nativePower.toFixed(2)} ISLAND`);
    console.log(`   - Delegated Power: ${result.delegatedPower.toFixed(2)} ISLAND`);
    console.log(`   - Total Power    : ${result.totalPower.toFixed(2)} ISLAND`);
    console.log('-----------------------------------------------------');
    
    if (result.deposits.length === 0) {
      console.log(`🟡 No VSR deposits found for ${walletAddress.slice(0, 8)}...`);
      console.log('-----------------------------------------------------');
    }
    
    console.log();
  }
  
  console.log('FINAL SUMMARY:');
  console.log('==============');
  console.log(`Total Citizens Audited: ${citizenWallets.length}`);
  console.log(`Citizens with Governance Power: ${citizensWithPower}`);
  console.log(`Citizens without Power: ${citizenWallets.length - citizensWithPower}`);
  console.log(`Total Native Power: ${totalNativePower.toFixed(2)} ISLAND`);
  console.log(`Total Delegated Power: ${totalDelegatedPower.toFixed(2)} ISLAND`);
  console.log(`Total Combined Power: ${(totalNativePower + totalDelegatedPower).toFixed(2)} ISLAND`);
  
  console.log('\n✅ Canonical VSR governance power audit completed');
  console.log('Uses the exact same proven method as audit-wallets-full-final.js');
}

auditCitizenWallets();