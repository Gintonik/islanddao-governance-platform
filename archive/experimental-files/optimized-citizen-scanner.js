/**
 * Optimized Citizen Governance Scanner
 * Uses exact offset parsing logic with performance optimizations
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Calculate multiplier - exact same logic
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
 * Extract deposits from single VSR account with exact parsing
 */
function extractVSRDeposits(data) {
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
        authority,
        voterAuthority,
        power,
        amount,
        multiplier
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
 * Main scanning function with optimization
 */
async function scanCitizenGovernance() {
  console.log('OPTIMIZED CITIZEN GOVERNANCE SCANNER');
  console.log('====================================');
  
  const citizenWallets = await getCitizenWallets();
  console.log(`Scanning ${citizenWallets.length} citizen wallets`);
  
  // Create wallet lookup for faster processing
  const walletSet = new Set(citizenWallets);
  
  const voterAccounts = await connection.getProgramAccounts(new PublicKey(VSR_PROGRAM_ID), {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Processing ${voterAccounts.length} VSR accounts`);
  
  // Initialize results for all citizens
  const results = {};
  citizenWallets.forEach(wallet => {
    results[wallet] = {
      wallet: wallet.slice(0, 8) + '...',
      nativePower: 0,
      delegatedPower: 0,
      totalPower: 0,
      deposits: 0
    };
  });
  
  // Process VSR accounts
  let processed = 0;
  for (const { account } of voterAccounts) {
    const deposits = extractVSRDeposits(account.data);
    
    for (const deposit of deposits) {
      // Check if authority is a citizen (native power)
      if (walletSet.has(deposit.authority)) {
        results[deposit.authority].nativePower += deposit.power;
        results[deposit.authority].deposits++;
      }
      
      // Check if voterAuthority is a citizen (delegated power)
      if (walletSet.has(deposit.voterAuthority) && deposit.voterAuthority !== deposit.authority) {
        results[deposit.voterAuthority].delegatedPower += deposit.power;
      }
    }
    
    processed++;
    if (processed % 1000 === 0) {
      console.log(`Processed ${processed}/${voterAccounts.length} accounts`);
    }
  }
  
  // Calculate totals and format results
  const finalResults = [];
  let citizensWithPower = 0;
  
  for (const wallet of citizenWallets) {
    const result = results[wallet];
    result.totalPower = result.nativePower + result.delegatedPower;
    result.nativePower = result.nativePower.toFixed(2);
    result.delegatedPower = result.delegatedPower.toFixed(2);
    result.totalPower = result.totalPower.toFixed(2);
    
    if (parseFloat(result.totalPower) > 0) citizensWithPower++;
    finalResults.push(result);
  }
  
  // Display results
  console.table(finalResults);
  
  console.log(`\nSUMMARY:`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}/${citizenWallets.length}`);
  
  // Quick verification with known test wallets
  const testWallets = ['7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA'];
  console.log('\nVerification:');
  
  for (const testWallet of testWallets) {
    let testPower = 0;
    for (const { account } of voterAccounts) {
      const deposits = extractVSRDeposits(account.data);
      for (const deposit of deposits) {
        if (deposit.authority === testWallet) {
          testPower += deposit.power;
        }
      }
    }
    console.log(`${testWallet.slice(0, 8)}...: ${testPower.toFixed(2)} ISLAND`);
  }
  
  return finalResults;
}

scanCitizenGovernance();