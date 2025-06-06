/**
 * Real Blockchain VSR Governance Power Scanner
 * Fetches current native governance power from Solana blockchain
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const connection = new Connection(process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REALM_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_DAO_REALM = new PublicKey('HT19EcD68zn8FGGQeGeTNrF7H3xNbNKgPy8rMrp1Ggde');

// Target citizens to analyze
const TARGET_CITIZENS = {
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA": "Takisoul",
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG": "legend", 
  "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA": "Moxie",
  "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6": "Icoder"
};

/**
 * Calculate VSR multiplier based on lockup metadata
 */
function calculateVSRMultiplier(lockup, currentTime = Math.floor(Date.now() / 1000)) {
  if (!lockup || !lockup.endTs || !lockup.startTs) {
    return 1.0;
  }

  const lockupStart = parseInt(lockup.startTs.toString());
  const lockupEnd = parseInt(lockup.endTs.toString());
  const lockupDuration = lockupEnd - lockupStart;
  
  // Calculate time-based multiplier (up to 5x for 5 years)
  const maxLockupDuration = 5 * 365 * 24 * 60 * 60; // 5 years in seconds
  const baseMultiplier = Math.min(lockupDuration / maxLockupDuration, 1.0) * 4.0 + 1.0;
  
  if (currentTime >= lockupEnd) {
    return 1.0; // Expired lockup
  }
  
  // Linear decay from full multiplier to 1.0
  const remainingTime = lockupEnd - currentTime;
  const decayFactor = remainingTime / lockupDuration;
  
  return 1.0 + (baseMultiplier - 1.0) * decayFactor;
}

/**
 * Parse VSR deposit from account data
 */
function parseVSRDeposit(data, currentTime) {
  try {
    // VSR Deposit Entry discriminator: [54, 46, 51, 255, 62, 77, 188, 222]
    const depositDiscriminator = Buffer.from([54, 46, 51, 255, 62, 77, 188, 222]);
    
    if (!data.subarray(0, 8).equals(depositDiscriminator)) {
      return null;
    }

    // Parse deposit fields
    const isUsed = data[8] === 1;
    const allowClawback = data[9] === 1;
    
    // Skip voter pubkey (32 bytes) and vault pubkey (32 bytes)
    let offset = 8 + 1 + 1 + 32 + 32;
    
    // Parse amount deposited (8 bytes, little endian)
    const amountDeposited = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Parse amount initially locked (8 bytes, little endian)
    const amountInitiallyLocked = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Parse lockup metadata
    const lockupKind = data[offset];
    offset += 1;
    
    let lockup = null;
    if (lockupKind === 1) { // Constant lockup
      const startTs = data.readBigUInt64LE(offset);
      offset += 8;
      const endTs = data.readBigUInt64LE(offset);
      offset += 8;
      
      lockup = {
        startTs: startTs,
        endTs: endTs,
        kind: 'constant'
      };
    }
    
    const amount = Number(amountDeposited) / 1_000_000; // Convert from lamports
    const multiplier = calculateVSRMultiplier(lockup, currentTime);
    
    return {
      isUsed,
      allowClawback,
      amount: amount,
      amountInitiallyLocked: Number(amountInitiallyLocked) / 1_000_000,
      lockup: lockup,
      multiplier: multiplier,
      weightedAmount: amount * multiplier
    };
    
  } catch (error) {
    console.error('Error parsing VSR deposit:', error);
    return null;
  }
}

/**
 * Get all VSR accounts for a wallet
 */
async function getVSRAccounts(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    
    console.log(`🔍 Scanning VSR accounts for ${walletAddress}...`);
    
    // Get all accounts owned by VSR program
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: "" // We'll check discriminators manually
          }
        }
      ]
    });
    
    console.log(`Found ${accounts.length} total VSR accounts`);
    
    // Filter accounts that contain this wallet address
    const relevantAccounts = [];
    
    for (const account of accounts) {
      const data = account.account.data;
      
      // Check if wallet address appears in the account data
      const walletBytes = publicKey.toBytes();
      for (let i = 0; i <= data.length - 32; i++) {
        if (data.subarray(i, i + 32).equals(walletBytes)) {
          relevantAccounts.push({
            pubkey: account.pubkey,
            data: data
          });
          break;
        }
      }
    }
    
    console.log(`Found ${relevantAccounts.length} VSR accounts containing wallet`);
    return relevantAccounts;
    
  } catch (error) {
    console.error(`Error getting VSR accounts for ${walletAddress}:`, error);
    return [];
  }
}

/**
 * Calculate native governance power for a wallet
 */
async function calculateNativeGovernancePower(walletAddress, nickname) {
  try {
    console.log(`\n🏛️ === Calculating Native Governance Power for ${nickname} ===`);
    console.log(`Wallet: ${walletAddress}`);
    
    const vsrAccounts = await getVSRAccounts(walletAddress);
    const currentTime = Math.floor(Date.now() / 1000);
    
    let totalNativeGovernancePower = 0;
    let totalDeposits = 0;
    const deposits = [];
    
    for (const account of vsrAccounts) {
      const deposit = parseVSRDeposit(account.data, currentTime);
      
      if (deposit && deposit.amount > 0) {
        totalDeposits++;
        
        // Only count active deposits (not withdrawn)
        if (!deposit.isUsed || deposit.amount > 1000) { // Small threshold for rounding
          totalNativeGovernancePower += deposit.weightedAmount;
          deposits.push(deposit);
          
          console.log(`  Deposit ${totalDeposits}: ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.weightedAmount.toLocaleString()} governance power`);
        } else {
          console.log(`  Deposit ${totalDeposits}: ${deposit.amount.toLocaleString()} ISLAND (WITHDRAWN/USED)`);
        }
      }
    }
    
    console.log(`\n📊 ${nickname} Results:`);
    console.log(`  Total Deposits Found: ${totalDeposits}`);
    console.log(`  Active Deposits: ${deposits.length}`);
    console.log(`  Native Governance Power: ${Math.floor(totalNativeGovernancePower).toLocaleString()} ISLAND`);
    
    return {
      wallet: walletAddress,
      nickname: nickname,
      nativeGovernancePower: Math.floor(totalNativeGovernancePower),
      totalDeposits: totalDeposits,
      activeDeposits: deposits.length,
      deposits: deposits
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${nickname}:`, error);
    return {
      wallet: walletAddress,
      nickname: nickname,
      nativeGovernancePower: 0,
      totalDeposits: 0,
      activeDeposits: 0,
      deposits: [],
      error: error.message
    };
  }
}

/**
 * Scan all target citizens
 */
async function scanTargetCitizens() {
  console.log('🚀 Real Blockchain VSR Governance Power Scanner');
  console.log('='.repeat(50));
  
  const results = [];
  
  for (const [wallet, nickname] of Object.entries(TARGET_CITIZENS)) {
    const result = await calculateNativeGovernancePower(wallet, nickname);
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📋 SUMMARY RESULTS:');
  console.log('='.repeat(50));
  
  for (const result of results) {
    if (result.error) {
      console.log(`❌ ${result.nickname}: ERROR - ${result.error}`);
    } else {
      console.log(`✅ ${result.nickname}: ${result.nativeGovernancePower.toLocaleString()} ISLAND (${result.activeDeposits} active deposits)`);
    }
  }
  
  return results;
}

// Run the scanner
if (import.meta.url === `file://${process.argv[1]}`) {
  scanTargetCitizens().catch(console.error);
}

export { scanTargetCitizens, calculateNativeGovernancePower };