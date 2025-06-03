/**
 * Working Multi-Lockup Scanner
 * Copies the exact working methodology from canonical-native-governance-locked.js
 * Applies the multi-lockup fix to the proven working scanner
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
 * Calculate VSR multiplier using canonical lockup logic
 */
function calculateMultiplier(lockupKind, startTs, endTs, cliffTs) {
  const now = Math.floor(Date.now() / 1000);
  
  if (lockupKind === 0 || endTs <= now) {
    return 1.0;
  } else {
    const yearsRemaining = (endTs - now) / (365.25 * 24 * 3600);
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
 * Parse deposits using canonical byte offsets with multi-lockup fix
 */
function parseVSRDeposits(data, walletAddress = '', accountPubkey = '') {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Canonical byte offsets for deposit amounts
  const canonicalOffsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
  
  for (let i = 0; i < canonicalOffsets.length; i++) {
    const offset = canonicalOffsets[i];
    
    if (offset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          
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
          
          // Extract lockup information
          let lockupKind = 0;
          let startTs = 0;
          let endTs = 0;
          let cliffTs = 0;
          
          if (offset + 48 <= data.length) {
            try {
              lockupKind = data.readUInt8(offset + 24) || 0;
              startTs = Number(data.readBigUInt64LE(offset + 32)) || 0;
              endTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              cliffTs = endTs;
            } catch (e) {
              // Use defaults
            }
          }
          
          // Calculate multiplier for this specific deposit
          const multiplier = calculateMultiplier(lockupKind, startTs, endTs, cliffTs);
          const votingPower = amount * multiplier;
          
          // Skip duplicates within the same account
          if (seenAmounts.has(amount)) {
            continue;
          }
          
          // Apply filters
          let isValid = true;
          let filterReason = '';
          
          // Filter phantom 1000 ISLAND deposits
          if (amount === 1000.0 && lockupKind === 0 && startTs === 0 && endTs === 0) {
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
            deposits.push({
              amount,
              lockupKind,
              startTs,
              endTs,
              cliffTs,
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
 * Calculate native governance power with optimized detection
 */
async function calculateOptimizedNativeGovernancePower(walletAddress, allVSRAccounts) {
  console.log(`\nCalculating native governance power for: ${walletAddress}`);
  
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
        console.log(`  Found controlled VSR account ${controlledAccounts}: ${account.pubkey.toString().slice(0, 8)}...`);
        console.log(`    Control type: ${controlType}`);
        console.log(`    Authority: ${controlAuthority}`);
        
        const deposits = parseVSRDeposits(data, walletAddress, account.pubkey.toString());
        
        if (deposits.length > 0) {
          allDeposits.push(...deposits);
        }
      }
      
      if (processedAccounts % 3000 === 0) {
        console.log(`  Processed ${processedAccounts}/${allVSRAccounts.length} accounts, found ${controlledAccounts} controlled accounts...`);
      }
      
    } catch (error) {
      // Continue processing other accounts
    }
  }
  
  console.log(`  Completed scan: ${processedAccounts} processed, ${controlledAccounts} controlled accounts found`);
  console.log(`  Processing ${allDeposits.length} total deposits...`);
  
  // Calculate total governance power
  let totalGovernancePower = 0;
  for (const deposit of allDeposits) {
    totalGovernancePower += deposit.votingPower;
  }
  
  console.log(`  Final native power: ${totalGovernancePower.toFixed(2)} ISLAND from ${allDeposits.length} deposits across ${controlledAccounts} accounts`);
  
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
 * Main working multi-lockup scan function
 */
async function runWorkingMultiLockupScan() {
  console.log('WORKING MULTI-LOCKUP GOVERNANCE SCANNER');
  console.log('=======================================');
  console.log('Optimized methodology with broad detection and alias support\n');
  
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
      const result = await calculateOptimizedNativeGovernancePower(wallet, allVSRAccounts);
      
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
        
        console.log(`\n=== ${wallet.slice(0, 8)}... Summary ===`);
        console.log(`Native Power: ${result.nativePower.toFixed(2)} ISLAND`);
        console.log(`Controlled Accounts: ${result.controlledAccounts}`);
        console.log(`Valid Deposits: ${result.deposits.length}`);
        
        if (result.deposits.length > 0) {
          console.log('Deposit breakdown:');
          result.deposits.forEach(deposit => {
            console.log(`  ${deposit.amount} ISLAND (lockup ${deposit.lockupKind}, ${deposit.multiplier.toFixed(2)}x) = ${deposit.votingPower.toFixed(2)} power`);
          });
        }
      }
    }
    
    // Final summary
    console.log('\n======================================================================');
    console.log('FINAL WORKING MULTI-LOCKUP GOVERNANCE RESULTS');
    console.log('======================================================================');
    console.log(`Citizens scanned: ${citizenWallets.length}`);
    console.log(`Citizens with native governance power: ${citizensWithPower}`);
    console.log(`Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);
    
    // Display results
    console.log('\nNative governance power distribution:');
    results
      .filter(r => r.nativePower > 0)
      .sort((a, b) => b.nativePower - a.nativePower)
      .forEach(result => {
        console.log(`  ${result.wallet.slice(0, 8)}...: ${result.nativePower.toFixed(2)} ISLAND (${result.deposits} deposits, ${result.accounts} accounts)`);
      });
    
    // Save results
    const timestamp = new Date().toISOString().split('T')[0];
    const output = {
      timestamp: new Date().toISOString(),
      totalCitizens: citizenWallets.length,
      citizensWithPower,
      totalNativePower,
      scanMethod: 'working-multi-lockup',
      results
    };
    
    fs.writeFileSync(`working-multi-lockup-results-${timestamp}.json`, JSON.stringify(output, null, 2));
    
    console.log('\nWorking multi-lockup governance scanner completed successfully.');
    
    return output;
    
  } catch (error) {
    console.error('Error in working multi-lockup scan:', error.message);
    throw error;
  }
}

runWorkingMultiLockupScan().catch(console.error);