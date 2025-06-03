/**
 * Canonical Native Governance Scanner - Optimized for Performance
 * Reverts to proven offset-based method with alias support
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Load wallet aliases mapping
const walletAliases = JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));

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
 * Check if authority is native for wallet (direct or alias)
 */
function isNativeAuthority(authority, wallet) {
  return authority === wallet || walletAliases[wallet]?.includes(authority);
}

/**
 * Parse deposits using proven offset method
 */
function parseVSRDeposits(data, walletAddress = '', accountPubkey = '') {
  const deposits = [];
  const seenAmounts = new Set();
  
  // Proven byte offsets for deposit amounts
  const depositOffsets = [112, 184, 192, 264, 272, 344, 352];
  
  console.log(`    Parsing deposits for account ${accountPubkey.slice(0, 8)}...`);
  
  for (let i = 0; i < depositOffsets.length; i++) {
    const offset = depositOffsets[i];
    
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
          
          console.log(`      Deposit ${i}: ${amount.toFixed(6)} ISLAND, isUsed=${isUsed}, lockupKind=${lockupKind}, startTs=${startTs}, endTs=${endTs}, createdTs=${createdTs}`);
          
          // Filter out phantom 1,000 ISLAND deposits
          let isPhantom = false;
          if (amount === 1000) {
            // Check if this is a phantom deposit (default/empty config)
            if ((createdTs === 0 || startTs === 0) && lockupKind === 0) {
              isPhantom = true;
              console.log(`        → Identified as phantom 1,000 ISLAND deposit (empty config)`);
            }
          }
          
          // Validate amount range and process valid deposits
          if (amount >= 1000 && amount <= 50000000 && isUsed && !isPhantom) {
            const amountKey = Math.round(amount * 1000);
            
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
                offset
              });
              
              console.log(`        → Valid: ${amount.toFixed(6)} ISLAND × ${multiplier.toFixed(2)} = ${votingPower.toFixed(2)} power`);
            } else {
              console.log(`        → Skipped duplicate amount: ${amount.toFixed(6)} ISLAND`);
            }
          } else if (rawAmount > 0) {
            console.log(`        → Filtered: amount=${amount.toFixed(6)}, isUsed=${isUsed}, phantom=${isPhantom}`);
          }
        }
      } catch (error) {
        console.log(`      Deposit ${i}: Error parsing - ${error.message}`);
        continue;
      }
    }
  }
  
  console.log(`    Found ${deposits.length} valid deposits in this account`);
  return deposits;
}

/**
 * Calculate native governance power for a specific wallet
 */
async function calculateNativeGovernancePower(walletAddress, allVSRAccounts) {
  console.log(`\nCalculating native power for: ${walletAddress}`);
  
  const walletPubkey = new PublicKey(walletAddress);
  let allRawDeposits = [];
  let nativeAccounts = 0;
  let processedAccounts = 0;
  let skippedAccounts = 0;
  
  console.log(`Processing all ${allVSRAccounts.length} VSR accounts...`);
  
  for (let i = 0; i < allVSRAccounts.length; i++) {
    const account = allVSRAccounts[i];
    processedAccounts++;
    
    try {
      const data = account.account.data;
      
      // Skip accounts that are too small to contain authority field
      if (data.length < 72) {
        skippedAccounts++;
        continue;
      }
      
      // Parse authority field (32 bytes at offset 32-64)
      const authorityBytes = data.slice(32, 64);
      const authority = new PublicKey(authorityBytes).toString();
      
      // Use optimized native authority check (direct or alias)
      if (isNativeAuthority(authority, walletAddress)) {
        nativeAccounts++;
        
        console.log(`  Found native VSR account ${nativeAccounts}: ${account.pubkey.toString()} (size: ${data.length} bytes)`);
        
        // Parse deposits from this account
        const deposits = parseVSRDeposits(data, walletAddress, account.pubkey.toString());
        
        for (const deposit of deposits) {
          allRawDeposits.push({
            ...deposit,
            accountPubkey: account.pubkey.toString()
          });
        }
      }
      
    } catch (error) {
      skippedAccounts++;
      continue;
    }
    
    // Progress reporting
    if (processedAccounts % 2000 === 0) {
      console.log(`  Processed ${processedAccounts}/${allVSRAccounts.length} accounts, found ${nativeAccounts} native accounts...`);
    }
  }
  
  console.log(`  Completed scan: ${processedAccounts} processed, ${skippedAccounts} skipped, ${nativeAccounts} native accounts found`);
  
  // Calculate total native power from all deposits
  let totalNativePower = 0;
  let totalDepositCount = allRawDeposits.length;
  
  console.log(`  Processing ${totalDepositCount} total deposits...`);
  
  for (const deposit of allRawDeposits) {
    totalNativePower += deposit.votingPower;
    console.log(`    Deposit: ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.votingPower.toFixed(2)} from account ${deposit.accountPubkey.slice(0, 8)}`);
  }
  
  console.log(`  Final native power: ${totalNativePower.toFixed(2)} ISLAND from ${totalDepositCount} deposits across ${nativeAccounts} accounts`);
  
  return {
    wallet: walletAddress,
    nativePower: totalNativePower,
    accountCount: nativeAccounts,
    deposits: allRawDeposits
  };
}

/**
 * Scan all citizen wallets for native governance power
 */
async function scanAllCitizensOptimized() {
  console.log('CANONICAL NATIVE GOVERNANCE SCANNER - OPTIMIZED');
  console.log('===============================================');
  console.log('Using proven offset method with alias support for maximum accuracy\n');
  
  try {
    // Load citizen wallets
    const citizenWallets = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
    
    // Load all VSR accounts once
    console.log('Loading all VSR program accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts\n`);
    
    const results = [];
    
    for (const wallet of citizenWallets) {
      const result = await calculateNativeGovernancePower(wallet, allVSRAccounts);
      results.push(result);
      
      // Progress summary
      console.log(`\n=== ${wallet.slice(0, 8)}... Results ===`);
      console.log(`Native Power: ${result.nativePower.toFixed(2)} ISLAND`);
      console.log(`Native Accounts: ${result.accountCount}`);
      console.log(`Total Deposits: ${result.deposits.length}`);
      
      if (result.deposits.length > 0) {
        console.log(`Deposit Breakdown:`);
        for (const deposit of result.deposits) {
          console.log(`  ${deposit.amount.toFixed(6)} ISLAND (${deposit.multiplier.toFixed(2)}x) = ${deposit.votingPower.toFixed(2)} power`);
        }
      }
      console.log('');
    }
    
    // Save results to file
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'canonical-native-governance-optimized',
      totalCitizens: results.length,
      walletAliasesUsed: Object.keys(walletAliases).length,
      results: results.map(r => ({
        wallet: r.wallet,
        nativePower: r.nativePower,
        accountCount: r.accountCount,
        depositCount: r.deposits.length,
        deposits: r.deposits.map(d => ({
          amount: d.amount,
          lockupKind: d.lockupKind,
          startTs: d.startTs,
          endTs: d.endTs,
          multiplier: d.multiplier,
          votingPower: d.votingPower,
          accountPubkey: d.accountPubkey,
          offset: d.offset
        }))
      }))
    };
    
    fs.writeFileSync('./native-results-expanded.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`OPTIMIZED CANONICAL SCANNER SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Scanned all VSR program accounts with proven offset method`);
    console.log(`✅ Used verified wallet aliases for controlled authority recognition`);
    console.log(`✅ Applied canonical deposit parsing and multiplier calculations`);
    console.log(`✅ Filtered phantom 1,000 ISLAND deposits with empty configs`);
    console.log(`✅ Results saved to native-results-expanded.json`);
    
    const totalNativePower = results.reduce((sum, r) => sum + r.nativePower, 0);
    const totalAccounts = results.reduce((sum, r) => sum + r.accountCount, 0);
    const totalDeposits = results.reduce((sum, r) => sum + r.deposits.length, 0);
    const citizensWithPower = results.filter(r => r.nativePower > 0);
    
    console.log(`\nAggregate Results:`);
    console.log(`Citizens scanned: ${results.length}`);
    console.log(`Citizens with native power: ${citizensWithPower.length}`);
    console.log(`Total native power: ${totalNativePower.toFixed(2)} ISLAND`);
    console.log(`Total native accounts: ${totalAccounts}`);
    console.log(`Total deposits: ${totalDeposits}`);
    
    if (citizensWithPower.length > 0) {
      console.log(`\nCitizens with governance power:`);
      for (const citizen of citizensWithPower) {
        console.log(`  ${citizen.wallet.slice(0, 8)}...: ${citizen.nativePower.toFixed(2)} ISLAND (${citizen.deposits.length} deposits)`);
      }
    }
    
    console.log(`\nOptimized canonical native governance scanner completed successfully.`);
    
  } catch (error) {
    console.error('Error in optimized scanner:', error.message);
  }
}

scanAllCitizensOptimized().catch(console.error);