/**
 * Canonical Native Governance Scanner with Verified Wallet Authority Mapping
 * Recognizes controlled authority wallets through verified aliases
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
 * Parse VSR deposits using canonical deposit entry structure
 */
function parseVSRDepositsExpanded(data, walletAddress = '', accountPubkey = '') {
  const deposits = [];
  
  console.log(`    Parsing deposits using canonical VSR deposit entry structure for account ${accountPubkey.slice(0, 8)}...`);
  
  // VSR deposit entries start at offset 232, each entry is 80 bytes
  const DEPOSIT_AREA_START = 232;
  const DEPOSIT_ENTRY_SIZE = 80;
  const MAX_DEPOSITS = 32;
  
  for (let i = 0; i < MAX_DEPOSITS; i++) {
    const entryOffset = DEPOSIT_AREA_START + (i * DEPOSIT_ENTRY_SIZE);
    
    if (entryOffset + DEPOSIT_ENTRY_SIZE > data.length) break;
    
    try {
      // Parse deposit entry fields using canonical VSR structure
      const isUsed = data.readUInt8(entryOffset) === 1;
      const reserved = data.readUInt32LE(entryOffset + 1); // 4 bytes padding
      const amountDepositedNative = data.readBigUInt64LE(entryOffset + 8);
      const allowClawback = data.readUInt8(entryOffset + 16) === 1;
      
      // Lockup structure starts at offset +24
      const lockupKind = data.readUInt8(entryOffset + 24);
      const lockupStartTs = data.readBigUInt64LE(entryOffset + 32);
      const lockupEndTs = data.readBigUInt64LE(entryOffset + 40);
      const lockupCliffTs = data.readBigUInt64LE(entryOffset + 48);
      
      // Convert amount to ISLAND (6 decimals)
      const amount = Number(amountDepositedNative) / 1e6;
      
      if (isUsed && amount > 0) {
        // Enhanced phantom detection for 1,000 ISLAND deposits
        let isPhantom = false;
        if (amount === 1000) {
          // Filter phantom 1,000 ISLAND if all lockup configs are zero
          if (lockupKind === 0 && lockupStartTs === 0n && lockupEndTs === 0n && lockupCliffTs === 0n) {
            isPhantom = true;
            console.log(`      Entry ${i}: ${amount.toFixed(6)} ISLAND (phantom - all lockup configs zero)`);
          }
        }
        
        if (!isPhantom) {
          // Calculate multiplier using canonical lockup logic
          const multiplier = calculateMultiplier(lockupKind, Number(lockupStartTs), Number(lockupEndTs), Number(lockupCliffTs));
          const votingPower = amount * multiplier;
          
          console.log(`      Entry ${i}: ${amount.toFixed(6)} ISLAND, isUsed=${isUsed}, lockup=${lockupKind}, startTs=${Number(lockupStartTs)}, endTs=${Number(lockupEndTs)}, multiplier=${multiplier.toFixed(2)}, power=${votingPower.toFixed(2)}`);
          
          deposits.push({
            depositIndex: i,
            entryOffset,
            amount,
            isUsed,
            allowClawback,
            lockupKind,
            lockupStartTs: Number(lockupStartTs),
            lockupEndTs: Number(lockupEndTs),
            lockupCliffTs: Number(lockupCliffTs),
            multiplier,
            votingPower,
            accountPubkey
          });
        }
      } else if (amount > 0) {
        console.log(`      Entry ${i}: ${amount.toFixed(6)} ISLAND (not used, isUsed=${isUsed})`);
      }
      
    } catch (error) {
      console.log(`      Entry ${i}: Parse error - ${error.message}`);
      continue;
    }
  }
  
  console.log(`    Found ${deposits.length} valid deposits in account ${accountPubkey.slice(0, 8)}`);
  return deposits;
}

/**
 * Check if a wallet controls a VSR account through comprehensive detection methods
 */
function isControlledVSRAccount(walletAddress, data) {
  // Extract authority and voter_authority
  const authorityBytes = data.slice(32, 64);
  const authority = new PublicKey(authorityBytes).toString();
  
  const voterAuthorityBytes = data.slice(64, 96);
  const voterAuthority = new PublicKey(voterAuthorityBytes).toString();
  
  // Rule 1: Direct authority match
  if (walletAddress === authority) {
    return { controlled: true, type: 'Direct authority', authority };
  }
  
  // Rule 2: Verified alias match
  const aliases = walletAliases[walletAddress];
  if (aliases && aliases.includes(authority)) {
    return { controlled: true, type: 'Verified alias', authority };
  }
  
  // Rule 3: Wallet appears at offset 8 (fallback detection pattern)
  try {
    const offset8Bytes = data.slice(8, 40);
    const offset8Address = new PublicKey(offset8Bytes).toString();
    
    if (walletAddress === offset8Address) {
      // Additional validation: wallet should not equal authority or voter_authority
      // This reduces false positives by ensuring it's truly a fallback case
      if (walletAddress !== authority && walletAddress !== voterAuthority) {
        return { controlled: true, type: 'Offset 8 fallback detection', authority: offset8Address };
      }
    }
  } catch (error) {
    // Continue if offset 8 parsing fails
  }
  
  return { controlled: false, type: null, authority };
}

/**
 * Get all VSR accounts from the program
 */
async function getAllVSRAccounts() {
  console.log('Loading all VSR program accounts...');
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    commitment: 'confirmed',
    encoding: 'base64'
  });
  
  console.log(`Loaded ${accounts.length} VSR accounts`);
  return accounts;
}

/**
 * Calculate native governance power with expanded authority recognition
 */
async function calculateExpandedNativeGovernancePower(walletAddress, allVSRAccounts) {
  console.log(`\nCalculating expanded native power for: ${walletAddress}`);
  
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
      if (data.length < 100) {
        skippedAccounts++;
        continue;
      }
      
      // Check if this wallet controls this VSR account through any mechanism
      const controlCheck = isControlledVSRAccount(walletAddress, data);
      
      if (controlCheck.controlled) {
        nativeAccounts++;
        
        console.log(`  Found controlled VSR account ${nativeAccounts}: ${account.pubkey.toString()}`);
        console.log(`    Authority: ${controlCheck.authority}`);
        console.log(`    Control type: ${controlCheck.type}`);
        
        // Parse deposit entries using proven offset method
        const deposits = parseVSRDepositsExpanded(data, walletAddress, account.pubkey.toString());
        
        for (const deposit of deposits) {
          allRawDeposits.push(deposit);
        }
      }
      
    } catch (error) {
      skippedAccounts++;
      continue;
    }
    
    // Progress reporting
    if (processedAccounts % 2000 === 0) {
      console.log(`  Processed ${processedAccounts}/${allVSRAccounts.length} accounts, found ${nativeAccounts} controlled accounts...`);
    }
  }
  
  console.log(`  Completed scan: ${processedAccounts} processed, ${skippedAccounts} skipped, ${nativeAccounts} controlled accounts found`);
  
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
 * Get citizen wallets from database
 */
async function getCitizenWallets() {
  try {
    // Load citizen wallets from the extracted file
    const citizenWallets = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    return citizenWallets;
  } catch (error) {
    console.error('Error loading citizen wallets:', error.message);
    // Fallback to benchmark wallets if file not found
    return [
      '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
      '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Whale's Friend
      '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // Top Holder
    ];
  }
}

/**
 * Scan all citizens with expanded authority recognition
 */
async function scanAllCitizensExpanded() {
  console.log('CANONICAL NATIVE GOVERNANCE SCANNER WITH EXPANDED AUTHORITY MAPPING');
  console.log('==================================================================');
  console.log('Using verified wallet aliases for controlled authority recognition\n');
  
  try {
    // Load all VSR accounts once
    const allVSRAccounts = await getAllVSRAccounts();
    
    // Get citizen wallets
    const citizenWallets = await getCitizenWallets();
    console.log(`\nScanning ${citizenWallets.length} citizen wallets...\n`);
    
    const results = [];
    
    for (const wallet of citizenWallets) {
      const result = await calculateExpandedNativeGovernancePower(wallet, allVSRAccounts);
      results.push(result);
      
      // Progress summary
      console.log(`\n=== ${wallet.slice(0, 8)}... Results ===`);
      console.log(`Native Power: ${result.nativePower.toFixed(2)} ISLAND`);
      console.log(`Controlled Accounts: ${result.accountCount}`);
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
      scannerVersion: 'canonical-native-governance-expanded',
      totalCitizens: results.length,
      walletAliasesUsed: Object.keys(walletAliases).length,
      results: results.map(r => ({
        wallet: r.wallet,
        nativePower: r.nativePower,
        accountCount: r.accountCount,
        depositCount: r.deposits.length,
        deposits: r.deposits.map(d => ({
          amount: d.amount,
          multiplier: d.multiplier,
          votingPower: d.votingPower,
          accountPubkey: d.accountPubkey,
          offset: d.offset
        }))
      }))
    };
    
    fs.writeFileSync('./native-results-expanded.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`EXPANDED CANONICAL SCANNER SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Scanned all VSR program accounts with expanded authority mapping`);
    console.log(`✅ Used verified wallet aliases for controlled authority recognition`);
    console.log(`✅ Applied canonical deposit parsing and multiplier calculations`);
    console.log(`✅ Results saved to native-results-expanded.json`);
    
    const totalNativePower = results.reduce((sum, r) => sum + r.nativePower, 0);
    const totalAccounts = results.reduce((sum, r) => sum + r.accountCount, 0);
    const totalDeposits = results.reduce((sum, r) => sum + r.deposits.length, 0);
    
    console.log(`\nAggregate Results:`);
    console.log(`Citizens scanned: ${results.length}`);
    console.log(`Total native power: ${totalNativePower.toFixed(2)} ISLAND`);
    console.log(`Total controlled accounts: ${totalAccounts}`);
    console.log(`Total deposits: ${totalDeposits}`);
    
    console.log(`\nExpanded canonical native governance scanner completed successfully.`);
    
  } catch (error) {
    console.error('Error in expanded scanner:', error.message);
  }
}

scanAllCitizensExpanded().catch(console.error);