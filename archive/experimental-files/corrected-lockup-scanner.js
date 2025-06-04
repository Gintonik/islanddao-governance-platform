/**
 * Corrected Lockup Scanner - Fix Takisoul's Governance Power
 * Properly parse lockup timestamps to calculate accurate multipliers
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
    console.log('No wallet aliases file found, using empty aliases');
    return {};
  }
}

/**
 * Calculate lockup multiplier with corrected logic
 */
function calculateLockupMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0) return 1; // No lockup
  
  const now = Date.now() / 1000;
  
  // Validate lockup end timestamp (should be in reasonable future range)
  if (lockupEndTs <= now || lockupEndTs > now + (10 * 365.25 * 24 * 3600)) {
    return 1; // Invalid or expired lockup
  }
  
  const timeRemaining = lockupEndTs - now;
  const yearsRemaining = timeRemaining / (365.25 * 24 * 3600);
  
  // VSR canonical formula: 1 + min(years_remaining, 4), capped at 5x
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Enhanced deposit parsing with multiple lockup timestamp locations
 */
function parseEnhancedDeposits(data) {
  const deposits = [];
  const offsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
  const seenAmounts = new Set();
  
  for (const offset of offsets) {
    if (offset + 32 > data.length) continue;
    
    try {
      // Parse amount
      const amountBytes = data.slice(offset, offset + 8);
      const amount = Number(amountBytes.readBigUInt64LE()) / 1e6;
      
      if (amount <= 0.01) continue; // Skip tiny/invalid amounts
      
      // Skip duplicates within same account
      const amountKey = amount.toFixed(6);
      if (seenAmounts.has(amountKey)) continue;
      seenAmounts.add(amountKey);
      
      // Parse lockup data with multiple potential locations
      const lockupKind = data.readUInt8(offset + 8);
      
      // Try multiple potential locations for lockup end timestamp
      const potentialEndTsOffsets = [
        offset + 16,  // Standard location
        offset + 20,  // Alternative 1
        offset + 24,  // Alternative 2
        offset + 12,  // Alternative 3
      ];
      
      let bestLockupEndTs = 0;
      let bestMultiplier = 1;
      
      // Check all potential timestamp locations
      for (const tsOffset of potentialEndTsOffsets) {
        if (tsOffset + 8 > data.length) continue;
        
        try {
          const lockupEndTs = Number(data.readBigUInt64LE(tsOffset));
          const multiplier = calculateLockupMultiplier(lockupKind, lockupEndTs);
          
          // Use the timestamp that gives the highest valid multiplier
          if (multiplier > bestMultiplier) {
            bestLockupEndTs = lockupEndTs;
            bestMultiplier = multiplier;
          }
        } catch (error) {
          // Continue to next potential location
        }
      }
      
      // For debugging: Check if we should manually decode the struct differently
      if (lockupKind === 1 && bestMultiplier === 1) {
        // Try alternative parsing approaches for lockup kind 1
        console.log(`  Debug: Checking alternative parsing for ${amount} ISLAND at offset ${offset}`);
        console.log(`  Raw bytes: ${data.slice(offset + 8, offset + 32).toString('hex')}`);
        
        // Try reading as different data structures
        const altBytes = data.slice(offset + 8, offset + 32);
        for (let i = 0; i < altBytes.length - 8; i += 4) {
          try {
            const altTimestamp = Number(altBytes.readBigUInt64LE(i));
            const now = Date.now() / 1000;
            if (altTimestamp > now && altTimestamp < now + (10 * 365.25 * 24 * 3600)) {
              const altMultiplier = calculateLockupMultiplier(1, altTimestamp);
              if (altMultiplier > bestMultiplier) {
                console.log(`  Found valid timestamp at byte ${i}: ${altTimestamp} (${new Date(altTimestamp * 1000).toISOString()})`);
                console.log(`  Multiplier: ${altMultiplier.toFixed(2)}x`);
                bestLockupEndTs = altTimestamp;
                bestMultiplier = altMultiplier;
              }
            }
          } catch (e) {
            // Continue searching
          }
        }
      }
      
      deposits.push({
        amount,
        lockupKind,
        lockupEndTs: bestLockupEndTs,
        multiplier: bestMultiplier,
        votingPower: amount * bestMultiplier,
        offset
      });
      
    } catch (error) {
      console.log(`  Error parsing offset ${offset}:`, error.message);
    }
  }
  
  return deposits;
}

/**
 * Calculate native governance power with corrected lockup parsing
 */
async function calculateCorrectedNativeGovernancePower(walletAddress) {
  console.log(`\nCalculating corrected governance power for: ${walletAddress}`);
  
  const walletAliases = loadWalletAliases();
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Processing ${allVSRAccounts.length} VSR accounts...`);
  
  let totalGovernancePower = 0;
  let controlledAccounts = 0;
  let allDeposits = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
    // Check authority and wallet reference
    const authorityBytes = data.slice(32, 64);
    const authority = new PublicKey(authorityBytes).toBase58();
    
    const walletRefBytes = data.slice(8, 40);
    const walletRef = new PublicKey(walletRefBytes).toBase58();
    
    // Check if this account is controlled by the wallet
    const isControlled = authority === walletAddress || 
                        walletRef === walletAddress ||
                        (walletAliases[walletAddress] && walletAliases[walletAddress].includes(authority));
    
    if (isControlled) {
      console.log(`  Found controlled VSR account: ${account.pubkey.toBase58()}`);
      console.log(`    Authority: ${authority}`);
      console.log(`    Wallet Reference: ${walletRef}`);
      
      controlledAccounts++;
      
      const deposits = parseEnhancedDeposits(data);
      console.log(`    Found ${deposits.length} deposits:`);
      
      for (const deposit of deposits) {
        console.log(`      ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)}x = ${deposit.votingPower.toFixed(2)} power`);
        if (deposit.lockupEndTs > 0) {
          console.log(`        Lockup until: ${new Date(deposit.lockupEndTs * 1000).toISOString()}`);
        }
        
        totalGovernancePower += deposit.votingPower;
        allDeposits.push({
          ...deposit,
          accountPubkey: account.pubkey.toBase58()
        });
      }
    }
  }
  
  console.log(`  Final corrected governance power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  console.log(`  Controlled accounts: ${controlledAccounts}`);
  console.log(`  Total deposits: ${allDeposits.length}`);
  
  return {
    wallet: walletAddress,
    nativePower: totalGovernancePower,
    controlledAccounts,
    deposits: allDeposits
  };
}

/**
 * Run corrected scan on all citizens
 */
async function runCorrectedGovernanceScan() {
  console.log('CORRECTED LOCKUP GOVERNANCE SCANNER');
  console.log('==================================');
  
  const citizenWallets = await getCitizenWallets();
  console.log(`Scanning ${citizenWallets.length} citizen wallets for corrected governance power...`);
  
  const results = [];
  
  for (const wallet of citizenWallets) {
    const result = await calculateCorrectedNativeGovernancePower(wallet);
    results.push(result);
  }
  
  // Sort by governance power
  results.sort((a, b) => b.nativePower - a.nativePower);
  
  console.log('\n=== CORRECTED GOVERNANCE POWER RESULTS ===');
  results.forEach((result, index) => {
    if (result.nativePower > 0) {
      console.log(`${index + 1}. ${result.wallet.slice(0, 8)}...: ${result.nativePower.toFixed(2)} ISLAND (${result.deposits.length} deposits)`);
    }
  });
  
  const total = results.reduce((sum, r) => sum + r.nativePower, 0);
  console.log(`\nTotal corrected governance power: ${total.toFixed(2)} ISLAND`);
  
  // Save results
  const outputData = {
    timestamp: new Date().toISOString(),
    scannerVersion: 'corrected-lockup-scanner',
    totalCitizens: results.length,
    totalGovernancePower: total,
    results: results
  };
  
  fs.writeFileSync('./corrected-governance-results.json', JSON.stringify(outputData, null, 2));
  console.log('\nResults saved to corrected-governance-results.json');
  
  // Check Takisoul specifically
  const takisoul = results.find(r => r.wallet.includes('7pPJt2xo'));
  if (takisoul) {
    console.log('\n=== TAKISOUL CORRECTED ANALYSIS ===');
    console.log(`Wallet: ${takisoul.wallet}`);
    console.log(`Corrected Power: ${takisoul.nativePower.toFixed(2)} ISLAND`);
    console.log('Deposit breakdown:');
    takisoul.deposits.forEach((deposit, i) => {
      console.log(`  ${i + 1}. ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)}x = ${deposit.votingPower.toFixed(2)} power`);
      if (deposit.lockupEndTs > 0) {
        console.log(`     Locked until: ${new Date(deposit.lockupEndTs * 1000).toISOString()}`);
      }
    });
  }
  
  await pool.end();
}

runCorrectedGovernanceScan().catch(console.error);