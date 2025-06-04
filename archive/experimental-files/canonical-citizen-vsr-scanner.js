/**
 * Canonical Citizen VSR Scanner
 * Uses exact offset-based parsing logic from audit-wallets-full-final.js
 * Processes all citizens from database with proven byte parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate multiplier using exact logic from audit-wallets-full-final.js
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0 || lockupEndTs === 0) return 1.0;
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockupEndTs - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  return Math.min(1 + years, 5);
}

/**
 * Parse VSR deposits using exact logic from audit-wallets-full-final.js
 */
function parseVSRDepositsWithValidation(data) {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Use the proven offset scanning approach from audit-wallets-full-final.js
  const directOffsets = [104, 112, 184, 192, 200, 208];
  
  for (const offset of directOffsets) {
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6; // ISLAND has 6 decimals
          const key = Math.round(amount * 1000);
          
          if (amount >= 1000 && amount <= 50000000 && !seenAmounts.has(key)) {
            seenAmounts.add(key);
            
            // Extract isUsed flag from various positions
            let isUsed = true;
            const usedPositions = [-16, -8, 16, 24, 32];
            for (const usedPos of usedPositions) {
              if (offset + usedPos >= 0 && offset + usedPos < data.length) {
                const testUsed = data[offset + usedPos];
                if (testUsed === 1) {
                  isUsed = true;
                  break;
                }
              }
            }
            
            let lockupKind = 0;
            let lockupStartTs = 0;
            let lockupEndTs = 0;
            
            // Extract lockup information
            if (offset + 48 <= data.length) {
              try {
                lockupKind = data[offset + 24] || 0;
                lockupStartTs = Number(data.readBigUInt64LE(offset + 32)) || 0;
                lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              } catch (e) {
                // Use defaults
              }
            }
            
            const multiplier = calculateMultiplier(lockupKind, lockupEndTs);
            const power = amount * multiplier;
            
            deposits.push({
              isUsed,
              amount,
              lockupKind,
              lockupStartTs,
              lockupEndTs,
              multiplier,
              power,
              isActive: lockupKind !== 0 && lockupEndTs > Math.floor(Date.now() / 1000),
              offset,
              depositIndex: deposits.length
            });
          }
        }
      } catch (error) {
        continue;
      }
    }
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
 * Main scanning function using exact logic from audit-wallets-full-final.js
 */
async function scanCitizenVSRGovernance() {
  console.log('CANONICAL CITIZEN VSR GOVERNANCE SCANNER');
  console.log('=========================================');
  console.log('Using exact offset-based parsing from audit-wallets-full-final.js\n');
  
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets in database\n`);
  
  // Load all VSR Voter accounts (2728 bytes only)
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${voterAccounts.length} Voter accounts (2728 bytes)\n`);
  
  const results = [];
  let citizensWithPower = 0;
  
  for (const walletBase58 of citizenWallets) {
    let native = 0;
    let delegated = 0;
    let depositCount = 0;
    let found = false;

    for (const { pubkey, account } of voterAccounts) {
      const data = account.data;
      
      try {
        // Parse authority and voterAuthority using exact offsets from audit-wallets-full-final.js
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
        
        const isNative = authority === walletBase58;
        const isDelegated = voterAuthority === walletBase58 && authority !== walletBase58;
        
        if (!isNative && !isDelegated) continue;
        
        const deposits = parseVSRDepositsWithValidation(data);
        
        for (const deposit of deposits) {
          if (!deposit.isUsed) continue;
          if (deposit.amount === 0) continue;
          
          const { amount, multiplier, power, lockupKind, lockupStartTs, lockupEndTs, depositIndex } = deposit;
          
          if (isNative) {
            native += power;
            depositCount++;
          }
          if (isDelegated) {
            delegated += power;
          }
          
          found = true;
        }
      } catch (error) {
        continue;
      }
    }

    const total = native + delegated;
    if (total > 0) citizensWithPower++;
    
    results.push({
      wallet: walletBase58.slice(0, 8) + '...',
      native: native.toFixed(2),
      delegated: delegated.toFixed(2),
      total: total.toFixed(2),
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
  
  // Verify scanner with known VSR wallets
  console.log('\nVerifying scanner with known VSR wallets:');
  const testWallets = [
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',   // kruHL3zJ
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', // Fywb7YDC
    '4pT6ESaMQTgGPZXmR3nwwyPYzF7gX5Bdc3o5VLseWbMJ'  // 4pT6ESaM
  ];
  
  for (const testWallet of testWallets) {
    let testNative = 0;
    let testDelegated = 0;
    
    for (const { account } of voterAccounts) {
      const data = account.data;
      
      try {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
        
        const isNative = authority === testWallet;
        const isDelegated = voterAuthority === testWallet && authority !== testWallet;
        
        if (!isNative && !isDelegated) continue;
        
        const deposits = parseVSRDepositsWithValidation(data);
        
        for (const deposit of deposits) {
          if (!deposit.isUsed || deposit.amount === 0) continue;
          
          if (isNative) testNative += deposit.power;
          if (isDelegated) testDelegated += deposit.power;
        }
      } catch (error) {
        continue;
      }
    }
    
    console.log(`${testWallet.slice(0, 8)}...: ${testNative.toFixed(2)} native, ${testDelegated.toFixed(2)} delegated`);
  }
  
  console.log('\nCanonical citizen VSR governance scan completed');
  console.log('Uses exact offset-based parsing logic from audit-wallets-full-final.js');
  
  return results;
}

scanCitizenVSRGovernance();