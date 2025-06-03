/**
 * Fixed Citizen VSR Scanner
 * Uses the exact working offset logic from audit-wallets-full-final.js that successfully detected VSR power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate multiplier using exact logic from working scanner
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0 || lockupEndTs === 0) return 1.0;
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockupEndTs - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  return Math.min(1 + years, 5);
}

/**
 * Parse VSR deposits using exact working offsets from audit-wallets-full-final.js
 */
function parseVSRDepositsWithValidation(data) {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Use the exact proven offset scanning approach that worked
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
              governancePower: power,
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
 * Parse all 32 VSR deposit entries using canonical structure
 */
function parseAllVSRDeposits(data, walletAddress, debugLog = false) {
  const deposits = [];
  
  if (debugLog) {
    console.log(`  🔍 Parsing all 32 deposit entries for ${walletAddress.slice(0, 8)}...`);
  }
  
  // Loop over all 32 deposit entries starting at offset 232, each 80 bytes
  for (let i = 0; i < 32; i++) {
    const depositOffset = 232 + (i * 80);
    
    if (depositOffset + 80 > data.length) break;
    
    try {
      // Check isUsed flag at start of deposit entry
      const isUsed = data.readUInt8(depositOffset) === 1;
      
      // Extract amountDepositedNative (8 bytes at offset +0 within deposit)
      const amountRaw = data.readBigUInt64LE(depositOffset + 8);
      const amount = Number(amountRaw) / 1e9; // 9 decimals for ISLAND
      
      if (debugLog && (isUsed || amount > 0)) {
        console.log(`    Entry ${i}: isUsed=${isUsed}, amount=${amount.toFixed(6)}`);
      }
      
      // Only process if isUsed === true and amount > 0
      if (!isUsed || amount === 0) continue;
      
      // Parse lockup fields starting at offset +32 within deposit entry
      const lockupOffset = depositOffset + 32;
      const lockupKind = data.readUInt8(lockupOffset);
      const startTs = Number(data.readBigUInt64LE(lockupOffset + 8));
      const endTs = Number(data.readBigUInt64LE(lockupOffset + 16));
      const cliffTs = Number(data.readBigUInt64LE(lockupOffset + 24));
      
      // Calculate multiplier based on lockup type
      const now = Math.floor(Date.now() / 1000);
      let multiplier = 1.0;
      
      switch (lockupKind) {
        case 0: // No lockup
          multiplier = 1.0;
          break;
        case 1: // Cliff lockup
          if (now < cliffTs) {
            const secondsRemaining = cliffTs - now;
            const years = secondsRemaining / (365.25 * 24 * 3600);
            multiplier = Math.min(1 + years, 5);
          } else {
            multiplier = 1.0;
          }
          break;
        case 2: // Constant lockup
          if (now < endTs) {
            const secondsRemaining = endTs - now;
            const years = secondsRemaining / (365.25 * 24 * 3600);
            multiplier = Math.min(1 + years, 5);
          } else {
            multiplier = 1.0;
          }
          break;
        case 3: // Vesting
          multiplier = 1.0;
          break;
      }
      
      const governancePower = amount * multiplier;
      
      if (debugLog) {
        console.log(`    ✅ Valid deposit ${i}:`);
        console.log(`       Amount: ${amount.toFixed(6)} ISLAND`);
        console.log(`       Lockup Kind: ${lockupKind}`);
        console.log(`       Start: ${startTs} | End: ${endTs} | Cliff: ${cliffTs}`);
        console.log(`       Multiplier: ${multiplier.toFixed(2)}x`);
        console.log(`       Governance Power: ${governancePower.toFixed(2)} ISLAND`);
      }
      
      deposits.push({
        depositIndex: i,
        isUsed,
        amount,
        lockupKind,
        startTs,
        endTs,
        cliffTs,
        multiplier,
        governancePower,
        offset: depositOffset
      });
      
    } catch (error) {
      if (debugLog) {
        console.log(`    ❌ Error parsing deposit ${i}: ${error.message}`);
      }
      continue;
    }
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
 * Main scanning function using exact working logic
 */
async function scanCitizensWithWorkingLogic() {
  console.log('FIXED CITIZEN VSR SCANNER');
  console.log('=========================');
  console.log('Using exact working offset logic from audit-wallets-full-final.js\n');
  
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets in database`);
  
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${voterAccounts.length} Voter accounts (2728 bytes)\n`);
  
  let citizensWithPower = 0;
  let totalNative = 0;
  let totalDelegated = 0;
  
  for (const walletBase58 of citizenWallets) {
    let native = 0;
    let delegated = 0;
    let depositCount = 0;
    let found = false;

    for (const { pubkey, account } of voterAccounts) {
      const data = account.data;
      
      try {
        // Use exact offsets from working scanner
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
        
        const isNative = authority === walletBase58;
        const isDelegated = voterAuthority === walletBase58 && authority !== walletBase58;
        
        if (!isNative && !isDelegated) continue;
        
        const deposits = parseVSRDepositsWithValidation(data);
        
        for (const deposit of deposits) {
          if (isNative) {
            native += deposit.governancePower;
            depositCount++;
            console.log(`    💰 Native deposit ${deposit.depositIndex}: ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.governancePower.toFixed(2)} ISLAND`);
          }
          if (isDelegated) {
            delegated += deposit.governancePower;
            console.log(`    🔵 Delegated deposit ${deposit.depositIndex}: ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.governancePower.toFixed(2)} ISLAND`);
          }
          
          found = true;
        }
      } catch (error) {
        continue;
      }
    }

    const total = native + delegated;
    if (total > 0) citizensWithPower++;
    
    totalNative += native;
    totalDelegated += delegated;
    
    console.log(`Wallet: ${walletBase58}`);
    console.log(`Native: ${native.toFixed(2)} ISLAND`);
    console.log(`Delegated: ${delegated.toFixed(2)} ISLAND`);
    console.log(`Total: ${total.toFixed(2)} ISLAND`);
    console.log(`Deposits: ${depositCount}`);
    console.log('---');
  }
  
  console.log('\nSUMMARY:');
  console.log(`Total Citizens: ${citizenWallets.length}`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}`);
  console.log(`Citizens without Power: ${citizenWallets.length - citizensWithPower}`);
  console.log(`Total Native Power: ${totalNative.toFixed(2)} ISLAND`);
  console.log(`Total Delegated Power: ${totalDelegated.toFixed(2)} ISLAND`);
  console.log(`Combined Power: ${(totalNative + totalDelegated).toFixed(2)} ISLAND`);
  
  console.log('\nFixed citizen VSR governance scan completed');
  console.log('Uses exact working offset logic that successfully detected VSR power');
}

scanCitizensWithWorkingLogic();