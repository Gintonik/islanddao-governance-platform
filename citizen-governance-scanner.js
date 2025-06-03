/**
 * Citizen Governance Power Scanner
 * Uses exact VSR parsing method from audit-wallets-full-final.js
 * Scans all citizen wallets from the Citizens Map database
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Calculate multiplier using exact logic from audit-wallets-full-final.js
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
 * Parse VSR deposits using exact offset-based parsing from audit-wallets-full-final.js
 */
function parseVSRDepositsWithValidation(data) {
  const deposits = [];
  
  try {
    // Parse authority and voter authority (exact same offsets)
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    
    // Parse deposits starting at offset 76 (exact same logic)
    for (let i = 0; i < 32; i++) {
      const depositOffset = 76 + (i * 192);
      
      // Safety check
      if (depositOffset + 191 >= data.length) break;
      
      // Check isUsed flag
      const isUsed = data.readUInt8(depositOffset) === 1;
      if (!isUsed) continue;
      
      // Parse amount using exact same method
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
        voterAuthority
      });
    }
  } catch (error) {
    return [];
  }
  
  return deposits;
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
 * Calculate governance power for all citizens
 */
async function scanCitizenGovernancePower() {
  console.log('CITIZEN GOVERNANCE POWER SCANNER');
  console.log('=================================');
  console.log('Using exact VSR parsing method from audit-wallets-full-final.js\n');
  
  // Get citizen wallets from database
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets in database\n`);
  
  // Load ALL VSR Voter accounts (exact same method)
  const voterAccounts = await connection.getProgramAccounts(new PublicKey(VSR_PROGRAM_ID), {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${voterAccounts.length} VSR Voter accounts (2728 bytes)\n`);
  
  const results = [];
  let citizensWithPower = 0;
  
  for (const walletAddress of citizenWallets) {
    let nativePower = 0;
    let delegatedPower = 0;
    let depositCount = 0;
    
    // Process ALL accounts using exact same logic
    for (const { account, pubkey } of voterAccounts) {
      const deposits = parseVSRDepositsWithValidation(account.data);
      
      for (const deposit of deposits) {
        const isNative = deposit.authority === walletAddress;
        const isDelegated = deposit.voterAuthority === walletAddress && deposit.authority !== walletAddress;
        
        if (isNative) {
          nativePower += deposit.power;
          depositCount++;
        }
        
        if (isDelegated) {
          delegatedPower += deposit.power;
        }
      }
    }
    
    const totalPower = nativePower + delegatedPower;
    if (totalPower > 0) citizensWithPower++;
    
    results.push({
      wallet: walletAddress.slice(0, 8) + '...',
      nativePower: nativePower.toFixed(2),
      delegatedPower: delegatedPower.toFixed(2),
      totalPower: totalPower.toFixed(2),
      deposits: depositCount
    });
  }
  
  // Display results in table format
  console.table(results);
  
  console.log('\nSUMMARY:');
  console.log('========');
  console.log(`Total Citizens: ${citizenWallets.length}`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}`);
  console.log(`Citizens without Power: ${citizenWallets.length - citizensWithPower}`);
  
  // Test with known VSR wallets to verify scanner
  console.log('\nVerifying scanner with known VSR wallets:');
  const testWallets = [
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
    '4pT6ESaMQTgGPZXmR3nwwyPYzF7gX5Bdc3o5VLseWbMJ', // 4pT6ESaM
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', // Fywb7YDC
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC'   // kruHL3zJ
  ];
  
  for (const testWallet of testWallets) {
    let testNative = 0;
    let testDelegated = 0;
    
    for (const { account } of voterAccounts) {
      const deposits = parseVSRDepositsWithValidation(account.data);
      for (const deposit of deposits) {
        if (deposit.authority === testWallet) {
          testNative += deposit.power;
        }
        if (deposit.voterAuthority === testWallet && deposit.authority !== testWallet) {
          testDelegated += deposit.power;
        }
      }
    }
    
    console.log(`${testWallet.slice(0, 8)}...: ${testNative.toFixed(2)} native, ${testDelegated.toFixed(2)} delegated`);
  }
  
  console.log('\nCitizen governance power scan completed');
  console.log('Using exact offset-based parsing that supports unlocked but deposited tokens');
  
  return results;
}

scanCitizenGovernancePower();