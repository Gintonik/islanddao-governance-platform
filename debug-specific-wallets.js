/**
 * Debug Specific Citizen Wallets
 * Deep analysis of Takisoul and Whale's Friend VSR accounts
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate multiplier using exact logic from working scanner
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  const now = Math.floor(Date.now() / 1000);
  let multiplier = 1.0;
  
  switch (lockupKind) {
    case 0: // No lockup
      multiplier = 1.0;
      break;
    case 1: // Cliff lockup
      if (now < lockupEndTs) {
        const secondsRemaining = lockupEndTs - now;
        const years = secondsRemaining / (365.25 * 24 * 3600);
        multiplier = Math.min(1 + years, 5);
      } else {
        multiplier = 1.0;
      }
      break;
    case 2: // Constant lockup
      if (now < lockupEndTs) {
        const secondsRemaining = lockupEndTs - now;
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
  
  return multiplier;
}

/**
 * Find all VSR accounts for a specific wallet
 */
async function findAllVSRAccountsForWallet(walletAddress) {
  console.log(`\n=== ANALYZING WALLET: ${walletAddress} ===`);
  
  // Find all accounts where this wallet is either authority or voter_authority
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 }, // Voter account size
    ]
  });
  
  console.log(`Found ${accounts.length} total VSR accounts`);
  
  let foundAccounts = 0;
  let totalGovernancePower = 0;
  
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const data = account.account.data;
    
    try {
      // Use exact offsets from working scanner
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      const isNative = authority === walletAddress;
      const isDelegated = voterAuthority === walletAddress && authority !== walletAddress;
      
      if (!isNative && !isDelegated) continue;
      
      foundAccounts++;
      console.log(`\nAccount ${foundAccounts}: ${account.pubkey.toString()}`);
      console.log(`  Authority: ${authority}`);
      console.log(`  Voter Authority: ${voterAuthority}`);
      console.log(`  Type: ${isNative ? 'NATIVE' : 'DELEGATED'}`);
      
      // Parse all deposits using working offsets
      const workingOffsets = [104, 112, 184, 192, 200, 208];
      const seenAmounts = new Set();
      
      for (let j = 0; j < workingOffsets.length; j++) {
        const offset = workingOffsets[j];
        
        if (offset + 8 <= data.length) {
          try {
            const rawAmount = Number(data.readBigUInt64LE(offset));
            if (rawAmount > 0) {
              const amount = rawAmount / 1e6;
              const key = Math.round(amount * 1000);
              
              if (amount >= 1000 && amount <= 50000000 && !seenAmounts.has(key)) {
                seenAmounts.add(key);
                
                let lockupKind = 0;
                let lockupEndTs = 0;
                
                if (offset + 48 <= data.length) {
                  try {
                    lockupKind = data[offset + 24] || 0;
                    lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
                  } catch (e) {
                    // Use defaults
                  }
                }
                
                const multiplier = calculateMultiplier(lockupKind, lockupEndTs);
                const governancePower = amount * multiplier;
                
                console.log(`    Deposit ${j}: ${amount.toFixed(6)} ISLAND × ${multiplier.toFixed(2)} = ${governancePower.toFixed(2)}`);
                
                if (isNative) {
                  totalGovernancePower += governancePower;
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
      
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\nSUMMARY for ${walletAddress}:`);
  console.log(`  Found VSR Accounts: ${foundAccounts}`);
  console.log(`  Total Native Governance Power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  
  return totalGovernancePower;
}

/**
 * Debug specific wallets
 */
async function debugSpecificWallets() {
  console.log('DEBUGGING SPECIFIC CITIZEN WALLETS');
  console.log('==================================');
  
  // Takisoul - should find ~8.7M across multiple VSR accounts
  const takisoul = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  await findAllVSRAccountsForWallet(takisoul);
  
  // Whale's Friend - should be exactly 12,625.58 ISLAND  
  const whalesFriend = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  await findAllVSRAccountsForWallet(whalesFriend);
  
  // Top holder for comparison
  const topHolder = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
  await findAllVSRAccountsForWallet(topHolder);
}

debugSpecificWallets().catch(console.error);