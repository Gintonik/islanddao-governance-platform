/**
 * Complete Citizen VSR Scanner
 * Uses canonical offset-based parsing with precise byte offsets for all VSR governance power calculation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate VSR multiplier based on lockup type and timing
 */
function calculateVSRMultiplier(lockupKind, startTs, endTs, cliffTs) {
  const now = Math.floor(Date.now() / 1000);
  
  switch (lockupKind) {
    case 0: // None
      return 1.0;
      
    case 1: // Cliff
      return now < cliffTs ? 2.0 : 1.0;
      
    case 2: // Constant
      if (now >= endTs) return 1.0;
      const duration = endTs - startTs;
      const remaining = endTs - now;
      return Math.max(1.0, (remaining / duration) * 2);
      
    case 3: // Vesting
      return 1.0;
      
    default:
      return 1.0;
  }
}

/**
 * Parse single Voter account using canonical byte offsets
 */
function parseVoterAccount(data) {
  if (data.length !== 2728) return null;
  
  try {
    // Parse authority and voterAuthority from fixed offsets
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    
    const deposits = [];
    
    // Parse 32 deposit entries, each 80 bytes, starting at offset 232
    for (let i = 0; i < 32; i++) {
      const depositOffset = 232 + (i * 80);
      
      if (depositOffset + 80 > data.length) break;
      
      // Check isUsed flag at the start of deposit entry
      const isUsed = data.readUInt8(depositOffset) === 1;
      if (!isUsed) continue;
      
      // Parse amountDepositedNative (8 bytes at offset +8)
      const amountRaw = data.readBigUInt64LE(depositOffset + 8);
      const amount = Number(amountRaw) / 1e9; // 9 decimals for ISLAND
      
      if (amount === 0) continue;
      
      // Parse lockup fields starting at offset +32 within deposit entry
      const lockupOffset = depositOffset + 32;
      const lockupKind = data.readUInt8(lockupOffset);
      const startTs = Number(data.readBigUInt64LE(lockupOffset + 8));
      const endTs = Number(data.readBigUInt64LE(lockupOffset + 16));
      const cliffTs = Number(data.readBigUInt64LE(lockupOffset + 24));
      
      const multiplier = calculateVSRMultiplier(lockupKind, startTs, endTs, cliffTs);
      const governancePower = amount * multiplier;
      
      deposits.push({
        amount,
        lockupKind,
        startTs,
        endTs,
        cliffTs,
        multiplier,
        governancePower,
        depositIndex: i
      });
    }
    
    return { authority, voterAuthority, deposits };
  } catch (error) {
    return null;
  }
}

/**
 * Get all citizen wallets from database
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
 * Calculate governance power for a single wallet
 */
function calculateWalletGovernancePower(walletAddress, voterAccounts) {
  let nativePower = 0;
  let delegatedPower = 0;
  let depositCount = 0;
  
  for (const { account } of voterAccounts) {
    const parsed = parseVoterAccount(account.data);
    if (!parsed) continue;
    
    const { authority, voterAuthority, deposits } = parsed;
    
    for (const deposit of deposits) {
      const isNative = authority === walletAddress;
      const isDelegated = voterAuthority === walletAddress && authority !== walletAddress;
      
      if (isNative) {
        nativePower += deposit.governancePower;
        depositCount++;
      }
      
      if (isDelegated) {
        delegatedPower += deposit.governancePower;
      }
    }
  }
  
  return { nativePower, delegatedPower, depositCount };
}

/**
 * Main scanning function
 */
async function scanAllCitizensVSR() {
  console.log('COMPLETE CITIZEN VSR GOVERNANCE SCANNER');
  console.log('=======================================');
  console.log('Using canonical offset-based parsing with precise byte offsets\n');
  
  // Get citizen wallets from database
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets in database`);
  
  // Load all VSR Voter accounts
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${voterAccounts.length} VSR Voter accounts (2728 bytes)\n`);
  
  let citizensWithPower = 0;
  let totalNative = 0;
  let totalDelegated = 0;
  
  // Process each citizen wallet
  for (const walletAddress of citizenWallets) {
    const result = calculateWalletGovernancePower(walletAddress, voterAccounts);
    
    const totalPower = result.nativePower + result.delegatedPower;
    if (totalPower > 0) citizensWithPower++;
    
    totalNative += result.nativePower;
    totalDelegated += result.delegatedPower;
    
    console.log(`Wallet: ${walletAddress}`);
    console.log(`Native: ${result.nativePower.toFixed(2)} ISLAND`);
    console.log(`Delegated: ${result.delegatedPower.toFixed(2)} ISLAND`);
    console.log(`Total: ${totalPower.toFixed(2)} ISLAND`);
    console.log(`Deposits: ${result.depositCount}`);
    console.log('---');
  }
  
  console.log('\nSUMMARY:');
  console.log(`Total Citizens: ${citizenWallets.length}`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}`);
  console.log(`Citizens without Power: ${citizenWallets.length - citizensWithPower}`);
  console.log(`Total Native Power: ${totalNative.toFixed(2)} ISLAND`);
  console.log(`Total Delegated Power: ${totalDelegated.toFixed(2)} ISLAND`);
  console.log(`Combined Power: ${(totalNative + totalDelegated).toFixed(2)} ISLAND`);
  
  console.log('\nComplete citizen VSR governance scan finished');
  console.log('All calculations use canonical offset-based parsing with precise byte offsets');
}

scanAllCitizensVSR();