/**
 * Canonical Native Governance Scanner - Final Optimized Version
 * Restores working methodology with performance optimizations
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
 * Parse deposits using canonical byte offsets
 */
function parseVSRDeposits(data, walletAddress = '', accountPubkey = '') {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Canonical byte offsets for deposit amounts
  const canonicalOffsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
  
  console.log(`    Parsing deposits for account ${accountPubkey.slice(0, 8)}...`);
  
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
          let createdTs = 0;
          
          if (offset + 48 <= data.length) {
            try {
              lockupKind = data.readUInt8(offset + 24) || 0;
              startTs = Number(data.readBigUInt64LE(offset + 32)) || 0;
              endTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              cliffTs = endTs;
              
              if (offset + 56 <= data.length) {
                createdTs = Number(data.readBigUInt64LE(offset + 48)) || 0;
              }
            } catch (e) {
              // Use defaults
            }
          }
          
          console.log(`      Offset ${offset}: ${amount.toFixed(6)} ISLAND, isUsed=${isUsed}, lockupKind=${lockupKind}`);
          
          // Filter phantom 1,000 ISLAND deposits with empty configs
          let isPhantom = false;
          if (amount === 1000) {
            if ((createdTs === 0 || startTs === 0) && lockupKind === 0 && endTs === 0) {
              isPhantom = true;
              console.log(`        → Phantom deposit filtered`);
            }
          }
          
          // Include valid deposits: used, reasonable amount, not phantom
          if (amount >= 100 && amount <= 50000000 && isUsed && !isPhantom) {
            const amountKey = Math.round(amount * 1000);
            
            if (!seenAmounts.has(amountKey)) {
              seenAmounts.add(amountKey);
              
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
        continue;
      }
    }
  }
  
  console.log(`    Found ${deposits.length} valid deposits in account ${accountPubkey.slice(0, 8)}`);
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
  
  console.log(`Processing all ${allVSRAccounts.length} VSR accounts...`);
  
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
              if (slice.equals(walletBytes)) {
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
        
        console.log(`  Found controlled VSR account ${controlledAccounts}: ${account.pubkey.toString()}`);
        console.log(`    Control type: ${controlType}`);
        console.log(`    Authority: ${controlAuthority}`);
        
        const deposits = parseVSRDeposits(data, walletAddress, account.pubkey.toString());
        allDeposits.push(...deposits);
      }
      
    } catch (error) {
      continue;
    }
    
    if (processedAccounts % 3000 === 0) {
      console.log(`  Processed ${processedAccounts}/${allVSRAccounts.length} accounts, found ${controlledAccounts} controlled accounts...`);
    }
  }
  
  console.log(`  Completed scan: ${processedAccounts} processed, ${controlledAccounts} controlled accounts found`);
  
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
 * Scan all citizen wallets with optimized methodology
 */
async function scanAllCitizensOptimized() {
  console.log('CANONICAL NATIVE GOVERNANCE SCANNER - FINAL OPTIMIZED');
  console.log('======================================================');
  console.log('Optimized methodology with broad detection and alias support\n');
  
  try {
    const citizenWallets = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
    
    console.log('Loading all VSR program accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts\n`);
    
    const results = [];
    
    for (const wallet of citizenWallets) {
      const result = await calculateOptimizedNativeGovernancePower(wallet, allVSRAccounts);
      results.push(result);
      
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
    
    // Save results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'canonical-native-governance-final-optimized',
      totalCitizens: results.length,
      walletAliasesCount: Object.keys(walletAliases).length,
      methodology: {
        authorityMatching: 'Direct + Verified aliases + Wallet reference detection',
        offsetMethod: 'Extended canonical byte offsets [104, 112, 184, 192, 200, 208, 264, 272, 344, 352]',
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
    console.log(`FINAL OPTIMIZED CANONICAL NATIVE GOVERNANCE RESULTS`);
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
    
    console.log(`\nFinal optimized canonical native governance scanner completed successfully.`);
    
  } catch (error) {
    console.error('Error in optimized canonical scanner:', error.message);
  }
}

scanAllCitizensOptimized().catch(console.error);