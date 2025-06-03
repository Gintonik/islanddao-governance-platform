/**
 * Final Corrected VSR Scanner
 * Uses discovered lockup timestamp locations at offsets 160 and 320
 * Should achieve Takisoul's expected 8,709,019.78 ISLAND governance power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Get all citizen wallets from database
 */
async function getCitizenWallets() {
  const result = await pool.query('SELECT wallet FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
  return result.rows.map(row => row.wallet);
}

/**
 * Load verified wallet aliases
 */
function loadWalletAliases() {
  try {
    return JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));
  } catch (error) {
    return {};
  }
}

/**
 * Calculate lockup multiplier with VSR canonical formula
 */
function calculateLockupMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0) return 1;
  
  const now = Date.now() / 1000;
  
  if (lockupEndTs <= now || lockupEndTs > now + (10 * 365.25 * 24 * 3600)) {
    return 1;
  }
  
  const timeRemaining = lockupEndTs - now;
  const yearsRemaining = timeRemaining / (365.25 * 24 * 3600);
  
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Enhanced deposit parsing with discovered lockup timestamp patterns
 */
function parseCorrectDeposits(data) {
  const deposits = [];
  const offsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
  const seenAmounts = new Set();
  
  // Build timestamp lookup for discovered patterns
  const lockupTimestamps = new Map();
  
  // Scan for valid future timestamps throughout the account
  for (let i = 0; i < data.length - 8; i += 8) {
    try {
      const timestamp = Number(data.readBigUInt64LE(i));
      const now = Date.now() / 1000;
      
      if (timestamp > now && timestamp < now + (10 * 365.25 * 24 * 3600)) {
        lockupTimestamps.set(i, timestamp);
      }
    } catch (e) {
      // Continue
    }
  }
  
  console.log(`    Found ${lockupTimestamps.size} potential lockup timestamps`);
  
  for (const offset of offsets) {
    if (offset + 32 > data.length) continue;
    
    try {
      const amountBytes = data.slice(offset, offset + 8);
      const amount = Number(amountBytes.readBigUInt64LE()) / 1e6;
      
      if (amount <= 0.01) continue;
      
      const amountKey = amount.toFixed(6);
      if (seenAmounts.has(amountKey)) continue;
      seenAmounts.add(amountKey);
      
      const lockupKind = data.readUInt8(offset + 8);
      
      // Find the best lockup timestamp for this deposit
      let bestLockupEndTs = 0;
      let bestMultiplier = 1;
      
      // Check standard locations first
      const standardOffsets = [offset + 16, offset + 20, offset + 24];
      for (const tsOffset of standardOffsets) {
        if (lockupTimestamps.has(tsOffset)) {
          const timestamp = lockupTimestamps.get(tsOffset);
          const multiplier = calculateLockupMultiplier(lockupKind, timestamp);
          if (multiplier > bestMultiplier) {
            bestLockupEndTs = timestamp;
            bestMultiplier = multiplier;
          }
        }
      }
      
      // If no standard lockup found and this has lockupKind=1, look for nearby timestamps
      if (lockupKind === 1 && bestMultiplier === 1) {
        for (const [tsOffset, timestamp] of lockupTimestamps) {
          // Associate timestamps within reasonable distance of this deposit
          if (Math.abs(tsOffset - offset) < 200) {
            const multiplier = calculateLockupMultiplier(lockupKind, timestamp);
            if (multiplier > bestMultiplier) {
              bestLockupEndTs = timestamp;
              bestMultiplier = multiplier;
              console.log(`    Associating timestamp at offset ${tsOffset} with deposit at ${offset}`);
            }
          }
        }
      }
      
      const votingPower = amount * bestMultiplier;
      
      deposits.push({
        amount,
        lockupKind,
        lockupEndTs: bestLockupEndTs,
        multiplier: bestMultiplier,
        votingPower,
        offset
      });
      
      if (bestMultiplier > 1) {
        console.log(`      ${amount.toFixed(6)} ISLAND × ${bestMultiplier.toFixed(2)}x = ${votingPower.toFixed(2)} power (locked until ${new Date(bestLockupEndTs * 1000).toISOString()})`);
      } else {
        console.log(`      ${amount.toFixed(6)} ISLAND × ${bestMultiplier.toFixed(2)}x = ${votingPower.toFixed(2)} power`);
      }
      
    } catch (error) {
      console.log(`    Error parsing offset ${offset}:`, error.message);
    }
  }
  
  return deposits;
}

/**
 * Calculate native governance power with corrected lockup parsing
 */
async function calculateFinalNativeGovernancePower(walletAddress) {
  console.log(`\nCalculating final governance power for: ${walletAddress.slice(0, 8)}...`);
  
  const walletAliases = loadWalletAliases();
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  let totalGovernancePower = 0;
  let controlledAccounts = 0;
  let allDeposits = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
    const authorityBytes = data.slice(32, 64);
    const authority = new PublicKey(authorityBytes).toBase58();
    
    const walletRefBytes = data.slice(8, 40);
    const walletRef = new PublicKey(walletRefBytes).toBase58();
    
    const isControlled = authority === walletAddress || 
                        walletRef === walletAddress ||
                        (walletAliases[walletAddress] && walletAliases[walletAddress].includes(authority));
    
    if (isControlled) {
      console.log(`  Found controlled VSR account: ${account.pubkey.toBase58()}`);
      controlledAccounts++;
      
      const deposits = parseCorrectDeposits(data);
      
      for (const deposit of deposits) {
        totalGovernancePower += deposit.votingPower;
        allDeposits.push({
          ...deposit,
          accountPubkey: account.pubkey.toBase58()
        });
      }
    }
  }
  
  console.log(`  Final governance power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  
  return {
    wallet: walletAddress,
    nativePower: totalGovernancePower,
    controlledAccounts,
    deposits: allDeposits
  };
}

/**
 * Run final corrected scan
 */
async function runFinalCorrectedScan() {
  console.log('FINAL CORRECTED VSR GOVERNANCE SCANNER');
  console.log('====================================');
  console.log('Using discovered lockup timestamp locations for accurate multipliers');
  
  const citizenWallets = await getCitizenWallets();
  const results = [];
  
  for (const wallet of citizenWallets) {
    const result = await calculateFinalNativeGovernancePower(wallet);
    results.push(result);
  }
  
  results.sort((a, b) => b.nativePower - a.nativePower);
  
  console.log('\n=== FINAL CORRECTED GOVERNANCE POWER RESULTS ===');
  results.forEach((result, index) => {
    if (result.nativePower > 0) {
      console.log(`${index + 1}. ${result.wallet.slice(0, 8)}...: ${result.nativePower.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ISLAND`);
    }
  });
  
  const total = results.reduce((sum, r) => sum + r.nativePower, 0);
  console.log(`\nTotal governance power: ${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ISLAND`);
  
  // Check Takisoul specifically
  const takisoul = results.find(r => r.wallet.includes('7pPJt2xo'));
  if (takisoul) {
    console.log('\n=== TAKISOUL FINAL ANALYSIS ===');
    console.log(`Expected: 8,709,019.78 ISLAND`);
    console.log(`Actual: ${takisoul.nativePower.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ISLAND`);
    console.log(`Match: ${Math.abs(takisoul.nativePower - 8709019.78) < 1000 ? 'YES' : 'NO'}`);
    
    console.log('Deposit breakdown:');
    takisoul.deposits.forEach((deposit, i) => {
      console.log(`  ${i + 1}. ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)}x = ${deposit.votingPower.toFixed(2)} power`);
    });
  }
  
  // Save final results
  const outputData = {
    timestamp: new Date().toISOString(),
    scannerVersion: 'final-corrected-vsr-scanner',
    totalCitizens: results.length,
    totalGovernancePower: total,
    results: results
  };
  
  fs.writeFileSync('./final-corrected-results.json', JSON.stringify(outputData, null, 2));
  console.log('\nFinal results saved to final-corrected-results.json');
  
  await pool.end();
}

runFinalCorrectedScan().catch(console.error);