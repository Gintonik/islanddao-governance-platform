/**
 * Final Multi-Lockup Corrected Scanner
 * Applies proper per-deposit multiplier calculation while maintaining canonical accuracy
 * Uses the working detection method but with corrected governance power calculation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Load wallet aliases mapping
let walletAliases = {};
try {
  walletAliases = JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));
  console.log(`Loaded wallet aliases for ${Object.keys(walletAliases).length} wallets`);
} catch (error) {
  console.log('No wallet aliases file found, using direct authority matching only');
}

/**
 * Calculate VSR multiplier using the canonical multi-lockup approach
 * Individual lockup multiplier: min(5, 1 + min(yearsRemaining, 4))
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  const now = Math.floor(Date.now() / 1000);
  
  if (lockupKind === 0 || lockupEndTs <= now) {
    return 1.0;
  } else {
    const yearsRemaining = (lockupEndTs - now) / (365.25 * 24 * 3600);
    const multiplier = 1 + Math.min(yearsRemaining, 4);
    return Math.min(multiplier, 5.0);
  }
}

/**
 * Check if authority is controlled by wallet
 */
const isControlledByWallet = (wallet, authority) => {
  return authority === wallet || (walletAliases[wallet]?.includes(authority) ?? false);
};

/**
 * Parse deposits using the corrected multi-lockup approach
 */
function parseVSRDepositsCorrect(data, walletAddress = '', accountPubkey = '') {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Canonical byte offsets for deposit amounts
  const canonicalOffsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
  
  for (let i = 0; i < canonicalOffsets.length; i++) {
    const offset = canonicalOffsets[i];
    
    if (offset + 12 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          
          // Skip duplicates within the same account (prevents double counting)
          if (seenAmounts.has(amount)) {
            continue;
          }
          
          // Check isUsed flag at nearby positions
          let isUsed = false;
          const usedCheckOffsets = [offset - 8, offset + 8, offset + 16, offset + 24];
          for (const usedOffset of usedCheckOffsets) {
            if (usedOffset >= 0 && usedOffset < data.length) {
              const usedFlag = data.readUInt8(usedOffset);
              if (usedFlag === 1) {
                isUsed = true;
                break;
              }
            }
          }
          
          // Extract lockup information for individual deposit multiplier
          let lockupKind = 0;
          let lockupEndTs = 0;
          
          if (offset + 12 <= data.length) {
            try {
              lockupEndTs = data.readUInt32LE(offset + 8) || 0;
              // Read lockup kind from appropriate offset
              if (offset + 24 <= data.length) {
                lockupKind = data.readUInt8(offset + 24) || 0;
              }
            } catch (e) {
              // Use defaults
            }
          }
          
          // Apply filters before calculating multiplier
          let isValid = true;
          let filterReason = '';
          
          // Filter phantom 1000 ISLAND deposits with empty configurations
          if (amount === 1000.0 && lockupKind === 0 && lockupEndTs === 0) {
            isValid = false;
            filterReason = 'phantom=true';
          }
          
          // Filter very small amounts that aren't used
          if (amount < 1.0 && !isUsed) {
            isValid = false;
            filterReason = `amount=${amount}, isUsed=${isUsed}`;
          }
          
          if (isValid) {
            seenAmounts.add(amount);
            
            // Calculate individual deposit multiplier
            const multiplier = calculateMultiplier(lockupKind, lockupEndTs);
            const votingPower = amount * multiplier;
            
            deposits.push({
              amount,
              lockupKind,
              lockupEndTs,
              multiplier,
              votingPower,
              isUsed,
              offset
            });
          }
        }
      } catch (e) {
        // Continue to next offset
      }
    }
  }
  
  return deposits;
}

/**
 * Calculate native governance power with corrected multi-lockup detection
 */
async function calculateCorrectedNativeGovernancePower(walletAddress, allVSRAccounts) {
  console.log(`\nCalculating corrected governance power for: ${walletAddress}`);
  
  let allDeposits = [];
  let controlledAccounts = 0;
  let processedAccounts = 0;
  
  // Create wallet pubkey for efficient comparison
  const walletPubkey = new PublicKey(walletAddress);
  const walletBytes = walletPubkey.toBytes();
  
  for (let i = 0; i < allVSRAccounts.length; i++) {
    const account = allVSRAccounts[i];
    processedAccounts++;
    
    try {
      const data = account.account.data;
      
      if (data.length < 100) continue;
      
      let isControlled = false;
      let controlType = '';
      let controlAuthority = '';
      
      // Check 1: Authority control (primary method)
      try {
        const authorityBytes = data.slice(32, 64);
        const authority = new PublicKey(authorityBytes).toString();
        
        if (isControlledByWallet(walletAddress, authority)) {
          isControlled = true;
          controlType = authority === walletAddress ? 'Direct authority' : 'Verified alias';
          controlAuthority = authority;
        }
      } catch (e) {
        // Continue to next check
      }
      
      // Check 2: Wallet bytes in data (broader detection for previous working cases)
      if (!isControlled) {
        try {
          // Check key positions where wallet might appear
          const checkPositions = [8, 64, 96]; // Common positions for wallet references
          
          for (const pos of checkPositions) {
            if (pos + 32 <= data.length) {
              const slice = data.slice(pos, pos + 32);
              if (slice.equals(Buffer.from(walletBytes))) {
                isControlled = true;
                controlType = `Wallet reference at offset ${pos}`;
                controlAuthority = walletAddress;
                break;
              }
            }
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (isControlled) {
        controlledAccounts++;
        
        const deposits = parseVSRDepositsCorrect(data, walletAddress, account.pubkey.toString());
        
        if (deposits.length > 0) {
          allDeposits.push(...deposits);
        }
      }
      
    } catch (error) {
      // Continue processing other accounts
    }
  }
  
  // Calculate total governance power using corrected per-deposit multipliers
  let totalGovernancePower = 0;
  for (const deposit of allDeposits) {
    totalGovernancePower += deposit.votingPower;
  }
  
  console.log(`  Final corrected power: ${totalGovernancePower.toFixed(2)} ISLAND from ${allDeposits.length} deposits across ${controlledAccounts} accounts`);
  
  return {
    nativePower: totalGovernancePower,
    deposits: allDeposits,
    controlledAccounts
  };
}

/**
 * Get all citizens with pins from database
 */
async function getAllCitizensWithPins() {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    await pool.end();

    return result.rows.map(row => row.wallet);
  } catch (error) {
    console.error('Error fetching citizens from database:', error.message);
    return [];
  }
}

/**
 * Main corrected multi-lockup scan function
 */
async function runCorrectedMultiLockupScan() {
  console.log('FINAL MULTI-LOCKUP CORRECTED GOVERNANCE SCANNER');
  console.log('===============================================');
  console.log('Applying individual deposit multipliers with canonical accuracy\n');
  
  try {
    // Load citizens with pins
    const citizenWallets = await getAllCitizensWithPins();
    console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
    
    console.log('Loading all VSR program accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts\n`);
    
    const results = [];
    let totalNativePower = 0;
    let citizensWithPower = 0;
    
    // Process each citizen
    for (const wallet of citizenWallets) {
      const result = await calculateCorrectedNativeGovernancePower(wallet, allVSRAccounts);
      
      results.push({
        wallet,
        nativePower: result.nativePower,
        deposits: result.deposits.length,
        accounts: result.controlledAccounts,
        depositDetails: result.deposits
      });
      
      if (result.nativePower > 0) {
        citizensWithPower++;
        totalNativePower += result.nativePower;
        console.log(`${wallet.slice(0, 8)}...: ${result.nativePower.toFixed(2)} ISLAND (${result.deposits.length} deposits, ${result.controlledAccounts} accounts)`);
      }
    }
    
    // Final summary
    console.log('\n======================================================================');
    console.log('FINAL CORRECTED MULTI-LOCKUP GOVERNANCE RESULTS');
    console.log('======================================================================');
    console.log(`Citizens scanned: ${citizenWallets.length}`);
    console.log(`Citizens with native governance power: ${citizensWithPower}`);
    console.log(`Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);
    
    // Display top citizens
    console.log('\nTop citizens by corrected governance power:');
    results
      .filter(r => r.nativePower > 0)
      .sort((a, b) => b.nativePower - a.nativePower)
      .slice(0, 10)
      .forEach((result, index) => {
        console.log(`${index + 1}. ${result.wallet.slice(0, 8)}...: ${result.nativePower.toFixed(2)} ISLAND`);
      });
    
    // Save results
    const timestamp = new Date().toISOString().split('T')[0];
    const output = {
      timestamp: new Date().toISOString(),
      totalCitizens: citizenWallets.length,
      citizensWithPower,
      totalNativePower,
      scanMethod: 'corrected-multi-lockup',
      results
    };
    
    fs.writeFileSync(`corrected-multi-lockup-results-${timestamp}.json`, JSON.stringify(output, null, 2));
    
    console.log('\nCorrected multi-lockup governance scanner completed successfully.');
    
    return output;
    
  } catch (error) {
    console.error('Error in corrected multi-lockup scan:', error.message);
    throw error;
  }
}

runCorrectedMultiLockupScan().catch(console.error);