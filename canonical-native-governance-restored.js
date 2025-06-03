/**
 * Canonical Native Governance Power Scanner - Restored Working Model
 * Restores the proven methodology that detected governance power for 14+ citizens
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Load wallet aliases mapping for verified control relationships
let walletAliases = {};
try {
  walletAliases = JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));
} catch (error) {
  console.log('No wallet aliases file found, using direct authority matching only');
}

/**
 * Calculate VSR multiplier using canonical lockup logic
 */
function calculateMultiplier(lockupKind, startTs, endTs, cliffTs) {
  const now = Math.floor(Date.now() / 1000);
  
  if (lockupKind === 0 || endTs <= now) {
    // No lockup or expired lockup
    return 1.0;
  } else {
    // Active lockup - calculate years remaining
    const yearsRemaining = (endTs - now) / (365.25 * 24 * 3600);
    const multiplier = 1 + Math.min(yearsRemaining, 4);
    return Math.min(multiplier, 5.0);
  }
}

/**
 * Check if authority is controlled by wallet (direct or verified alias)
 */
function isControlledAuthority(authority, walletAddress) {
  // Base rule: direct authority match
  if (authority === walletAddress) {
    return { controlled: true, type: 'Direct authority' };
  }
  
  // Verified alias mapping
  const aliases = walletAliases[walletAddress];
  if (aliases && aliases.includes(authority)) {
    return { controlled: true, type: 'Verified alias' };
  }
  
  return { controlled: false, type: null };
}

/**
 * Parse deposits using canonical byte offsets and validation
 */
function parseVSRDeposits(data, walletAddress = '', accountPubkey = '') {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Canonical byte offsets for deposit amounts
  const canonicalOffsets = [112, 184, 192, 264, 272, 344, 352];
  
  console.log(`    Parsing deposits for account ${accountPubkey.slice(0, 8)}...`);
  
  for (let i = 0; i < canonicalOffsets.length; i++) {
    const offset = canonicalOffsets[i];
    
    if (offset + 8 <= data.length) {
      try {
        // Extract deposit amount (8 bytes)
        const rawAmount = Number(data.readBigUInt64LE(offset));
        
        // Extract isUsed flag (check multiple potential positions)
        let isUsed = false;
        const usedCheckOffsets = [offset - 8, offset + 8, offset + 16, offset + 24, offset + 72];
        for (const usedOffset of usedCheckOffsets) {
          if (usedOffset >= 0 && usedOffset < data.length) {
            const usedFlag = data.readUInt8(usedOffset);
            if (usedFlag === 1) {
              isUsed = true;
              break;
            }
          }
        }
        
        if (rawAmount > 0) {
          // Convert to ISLAND tokens (6 decimals)
          const amount = rawAmount / 1e6;
          
          // Extract lockup information from relative offsets
          let lockupKind = 0;
          let startTs = 0;
          let endTs = 0;
          let cliffTs = 0;
          let createdTs = 0;
          
          // Parse lockup data if available
          if (offset + 48 <= data.length) {
            try {
              lockupKind = data.readUInt8(offset + 24) || 0;
              startTs = Number(data.readBigUInt64LE(offset + 32)) || 0;
              endTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              cliffTs = endTs; // Use endTs as cliffTs for cliff lockups
              
              // Try to find creation timestamp
              if (offset + 56 <= data.length) {
                createdTs = Number(data.readBigUInt64LE(offset + 48)) || 0;
              }
            } catch (e) {
              // Use defaults if parsing fails
            }
          }
          
          console.log(`      Deposit ${i}: ${amount.toFixed(6)} ISLAND, isUsed=${isUsed}, lockupKind=${lockupKind}, startTs=${startTs}, endTs=${endTs}`);
          
          // Filter phantom 1,000 ISLAND deposits with empty config or vesting type 0
          let isPhantom = false;
          if (amount === 1000) {
            // Check if this is a phantom deposit (empty config or default vesting)
            if ((createdTs === 0 || startTs === 0) && lockupKind === 0) {
              isPhantom = true;
              console.log(`        → Phantom 1,000 ISLAND deposit filtered (empty config)`);
            }
          }
          
          // Validate deposit: must be used, within range, and not phantom
          if (amount >= 100 && amount <= 50000000 && isUsed && !isPhantom) {
            const amountKey = Math.round(amount * 1000);
            
            // Avoid duplicate amounts within same account
            if (!seenAmounts.has(amountKey)) {
              seenAmounts.add(amountKey);
              
              // Calculate multiplier using canonical logic
              const multiplier = calculateMultiplier(lockupKind, startTs, endTs, cliffTs);
              const votingPower = amount * multiplier;
              
              deposits.push({
                depositIndex: i,
                amount,
                isUsed,
                lockupKind,
                startTs,
                endTs,
                cliffTs,
                createdTs,
                multiplier,
                votingPower,
                offset,
                accountPubkey
              });
              
              console.log(`        → Valid: ${amount.toFixed(6)} ISLAND × ${multiplier.toFixed(2)} = ${votingPower.toFixed(2)} power`);
            } else {
              console.log(`        → Skipped duplicate: ${amount.toFixed(6)} ISLAND`);
            }
          } else if (rawAmount > 0) {
            console.log(`        → Filtered: amount=${amount.toFixed(6)}, isUsed=${isUsed}, phantom=${isPhantom}`);
          }
        }
      } catch (error) {
        console.log(`      Deposit ${i}: Parse error - ${error.message}`);
        continue;
      }
    }
  }
  
  console.log(`    Found ${deposits.length} valid deposits in account ${accountPubkey.slice(0, 8)}`);
  return deposits;
}

/**
 * Calculate native governance power for a specific wallet
 */
async function calculateNativeGovernancePower(walletAddress, allVSRAccounts) {
  console.log(`\nCalculating native governance power for: ${walletAddress}`);
  
  let allDeposits = [];
  let controlledAccounts = 0;
  let processedAccounts = 0;
  let skippedAccounts = 0;
  
  console.log(`Processing all ${allVSRAccounts.length} VSR accounts...`);
  
  for (let i = 0; i < allVSRAccounts.length; i++) {
    const account = allVSRAccounts[i];
    processedAccounts++;
    
    try {
      const data = account.account.data;
      
      // Skip accounts that are too small
      if (data.length < 100) {
        skippedAccounts++;
        continue;
      }
      
      // Parse authority field (32 bytes at offset 32-64)
      const authorityBytes = data.slice(32, 64);
      const authority = new PublicKey(authorityBytes).toString();
      
      // Check if this authority is controlled by the wallet
      const controlCheck = isControlledAuthority(authority, walletAddress);
      
      if (controlCheck.controlled) {
        controlledAccounts++;
        
        console.log(`  Found controlled VSR account ${controlledAccounts}: ${account.pubkey.toString()}`);
        console.log(`    Authority: ${authority}`);
        console.log(`    Control type: ${controlCheck.type}`);
        
        // Parse deposits from this account
        const deposits = parseVSRDeposits(data, walletAddress, account.pubkey.toString());
        
        // Add all deposits to the collection
        allDeposits.push(...deposits);
      }
      
    } catch (error) {
      skippedAccounts++;
      continue;
    }
    
    // Progress reporting
    if (processedAccounts % 2000 === 0) {
      console.log(`  Processed ${processedAccounts}/${allVSRAccounts.length} accounts, found ${controlledAccounts} controlled accounts...`);
    }
  }
  
  console.log(`  Completed scan: ${processedAccounts} processed, ${skippedAccounts} skipped, ${controlledAccounts} controlled accounts found`);
  
  // Calculate total native governance power
  const totalNativePower = allDeposits.reduce((sum, deposit) => sum + deposit.votingPower, 0);
  
  console.log(`  Processing ${allDeposits.length} total deposits...`);
  for (const deposit of allDeposits) {
    console.log(`    ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.votingPower.toFixed(2)} power from ${deposit.accountPubkey.slice(0, 8)}`);
  }
  
  console.log(`  Final native power: ${totalNativePower.toFixed(2)} ISLAND from ${allDeposits.length} deposits across ${controlledAccounts} accounts`);
  
  return {
    wallet: walletAddress,
    nativePower: totalNativePower,
    accountCount: controlledAccounts,
    deposits: allDeposits
  };
}

/**
 * Scan all citizen wallets for native governance power
 */
async function scanAllCitizensNativeGovernance() {
  console.log('CANONICAL NATIVE GOVERNANCE POWER SCANNER - RESTORED');
  console.log('===================================================');
  console.log('Restoring proven methodology with verified alias support\n');
  
  try {
    // Load citizen wallets
    const citizenWallets = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
    
    // Load all VSR accounts once for efficiency
    console.log('Loading all VSR program accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts\n`);
    
    const results = [];
    
    // Process each citizen wallet
    for (const wallet of citizenWallets) {
      const result = await calculateNativeGovernancePower(wallet, allVSRAccounts);
      results.push(result);
      
      // Progress summary
      console.log(`\n=== ${wallet.slice(0, 8)}... Summary ===`);
      console.log(`Native Power: ${result.nativePower.toFixed(2)} ISLAND`);
      console.log(`Controlled Accounts: ${result.accountCount}`);
      console.log(`Valid Deposits: ${result.deposits.length}`);
      
      if (result.deposits.length > 0) {
        console.log(`Deposit breakdown:`);
        for (const deposit of result.deposits) {
          console.log(`  ${deposit.amount.toFixed(6)} ISLAND (lockup ${deposit.lockupKind}, ${deposit.multiplier.toFixed(2)}x) = ${deposit.votingPower.toFixed(2)} power`);
        }
      }
      console.log('');
    }
    
    // Save canonical results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'canonical-native-governance-restored',
      totalCitizens: results.length,
      walletAliasesCount: Object.keys(walletAliases).length,
      methodology: {
        authorityMatching: 'Direct + Verified aliases',
        offsetMethod: 'Canonical byte offsets [112, 184, 192, 264, 272, 344, 352]',
        phantomFiltering: 'Empty config detection for 1,000 ISLAND deposits',
        multiplierCalculation: 'Canonical lockup logic with 5x cap'
      },
      results: results.map(r => ({
        wallet: r.wallet,
        nativePower: r.nativePower,
        accountCount: r.accountCount,
        depositCount: r.deposits.length,
        deposits: r.deposits.map(d => ({
          amount: d.amount,
          lockupKind: d.lockupKind,
          lockupStartTs: d.startTs,
          lockupEndTs: d.endTs,
          multiplier: d.multiplier,
          votingPower: d.votingPower,
          accountPubkey: d.accountPubkey,
          offset: d.offset
        }))
      }))
    };
    
    fs.writeFileSync('./native-results-final.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`CANONICAL NATIVE GOVERNANCE RESULTS - FINAL`);
    console.log(`${'='.repeat(70)}`);
    
    const totalNativePower = results.reduce((sum, r) => sum + r.nativePower, 0);
    const citizensWithPower = results.filter(r => r.nativePower > 0);
    const totalAccounts = results.reduce((sum, r) => sum + r.accountCount, 0);
    const totalDeposits = results.reduce((sum, r) => sum + r.deposits.length, 0);
    
    console.log(`Citizens scanned: ${results.length}`);
    console.log(`Citizens with native governance power: ${citizensWithPower.length}`);
    console.log(`Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);
    console.log(`Total controlled VSR accounts: ${totalAccounts}`);
    console.log(`Total valid deposits: ${totalDeposits}`);
    
    if (citizensWithPower.length > 0) {
      console.log(`\nNative governance power distribution:`);
      for (const citizen of citizensWithPower) {
        console.log(`  ${citizen.wallet.slice(0, 8)}...: ${citizen.nativePower.toFixed(2)} ISLAND (${citizen.deposits.length} deposits, ${citizen.accountCount} accounts)`);
      }
    }
    
    console.log(`\n✅ Methodology validation:`);
    console.log(`  - Used canonical byte offsets for deposit extraction`);
    console.log(`  - Applied authority === wallet + verified alias mapping`);
    console.log(`  - Filtered phantom 1,000 ISLAND deposits with empty configs`);
    console.log(`  - Calculated canonical lockup multipliers with 5x cap`);
    console.log(`  - Processed all ${allVSRAccounts.length} VSR program accounts`);
    
    console.log(`\n✅ Results saved to native-results-final.json`);
    console.log(`✅ Canonical native governance scanner restoration completed successfully`);
    
  } catch (error) {
    console.error('Error in canonical scanner restoration:', error.message);
  }
}

scanAllCitizensNativeGovernance().catch(console.error);