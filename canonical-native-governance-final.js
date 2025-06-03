/**
 * Canonical Native Governance Scanner - Final Production Version
 * Optimized for accurate detection of IslandDAO citizen governance power
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
 * Parse VSR deposits using canonical deposit entry structure
 */
function parseVSRDeposits(data, accountPubkey) {
  const deposits = [];
  
  // VSR deposit entries start at offset 232, each entry is 80 bytes
  const DEPOSIT_AREA_START = 232;
  const DEPOSIT_ENTRY_SIZE = 80;
  const MAX_DEPOSITS = 32;
  
  for (let i = 0; i < MAX_DEPOSITS; i++) {
    const entryOffset = DEPOSIT_AREA_START + (i * DEPOSIT_ENTRY_SIZE);
    
    if (entryOffset + DEPOSIT_ENTRY_SIZE > data.length) break;
    
    try {
      const isUsed = data.readUInt8(entryOffset) === 1;
      const amountDepositedNative = data.readBigUInt64LE(entryOffset + 8);
      const allowClawback = data.readUInt8(entryOffset + 16) === 1;
      
      // Lockup structure
      const lockupKind = data.readUInt8(entryOffset + 24);
      const lockupStartTs = data.readBigUInt64LE(entryOffset + 32);
      const lockupEndTs = data.readBigUInt64LE(entryOffset + 40);
      const lockupCliffTs = data.readBigUInt64LE(entryOffset + 48);
      
      const amount = Number(amountDepositedNative) / 1e6;
      
      if (isUsed && amount > 0) {
        // Enhanced phantom detection
        let isPhantom = false;
        if (amount === 1000 && lockupKind === 0 && lockupStartTs === 0n && lockupEndTs === 0n) {
          isPhantom = true;
        }
        
        if (!isPhantom) {
          const multiplier = calculateMultiplier(lockupKind, Number(lockupStartTs), Number(lockupEndTs), Number(lockupCliffTs));
          const votingPower = amount * multiplier;
          
          deposits.push({
            depositIndex: i,
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
      }
      
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Check if wallet controls VSR account through any detection method
 */
function isControlledVSRAccount(walletAddress, data) {
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
  
  // Rule 3: Offset 8 fallback (only if deposits are used and significant)
  try {
    const offset8Bytes = data.slice(8, 40);
    const offset8Address = new PublicKey(offset8Bytes).toString();
    
    if (walletAddress === offset8Address && walletAddress !== authority && walletAddress !== voterAuthority) {
      // Quick check for any used deposits before claiming control
      const deposits = parseVSRDeposits(data, 'temp');
      if (deposits.length > 0) {
        return { controlled: true, type: 'Offset 8 with used deposits', authority: offset8Address };
      }
    }
  } catch (error) {
    // Continue if parsing fails
  }
  
  return { controlled: false, type: null, authority };
}

/**
 * Calculate native governance power for a specific wallet
 */
async function calculateNativeGovernancePower(walletAddress) {
  console.log(`\nCalculating native governance power for: ${walletAddress.slice(0, 8)}...`);
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    commitment: 'confirmed',
    encoding: 'base64'
  });
  
  let allDeposits = [];
  let controlledAccounts = 0;
  let processedCount = 0;
  
  for (const account of allVSRAccounts) {
    processedCount++;
    
    if (processedCount % 4000 === 0) {
      console.log(`  Processed ${processedCount}/${allVSRAccounts.length} accounts...`);
    }
    
    try {
      const data = account.account.data;
      if (data.length < 100) continue;
      
      const controlCheck = isControlledVSRAccount(walletAddress, data);
      
      if (controlCheck.controlled) {
        controlledAccounts++;
        console.log(`  Found controlled account ${controlledAccounts}: ${account.pubkey.toString().slice(0, 8)}...`);
        console.log(`    Control type: ${controlCheck.type}`);
        
        const deposits = parseVSRDeposits(data, account.pubkey.toString());
        
        if (deposits.length > 0) {
          console.log(`    Found ${deposits.length} valid deposits:`);
          for (const deposit of deposits) {
            console.log(`      Entry ${deposit.depositIndex}: ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.votingPower.toFixed(2)} power`);
            allDeposits.push(deposit);
          }
        } else {
          console.log(`    No valid deposits found`);
        }
      }
      
    } catch (error) {
      continue;
    }
  }
  
  const totalNativePower = allDeposits.reduce((sum, d) => sum + d.votingPower, 0);
  
  console.log(`  Final result: ${totalNativePower.toFixed(2)} ISLAND from ${allDeposits.length} deposits across ${controlledAccounts} accounts`);
  
  return {
    wallet: walletAddress,
    nativePower: totalNativePower,
    accountCount: controlledAccounts,
    deposits: allDeposits
  };
}

/**
 * Scan all citizens for native governance power
 */
async function scanAllCitizensNativeGovernance() {
  console.log('CANONICAL NATIVE GOVERNANCE SCANNER - FINAL VERSION');
  console.log('===================================================');
  console.log('Production scanner with optimized detection and parsing\n');
  
  try {
    const citizenWallets = JSON.parse(fs.readFileSync('./citizen-wallets.json', 'utf8'));
    console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
    
    const results = [];
    
    for (const wallet of citizenWallets) {
      const result = await calculateNativeGovernancePower(wallet);
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
    
    // Save final results
    const outputData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'canonical-native-governance-final',
      totalCitizens: results.length,
      results: results.map(r => ({
        wallet: r.wallet,
        nativePower: r.nativePower,
        accountCount: r.accountCount,
        depositCount: r.deposits.length,
        deposits: r.deposits.map(d => ({
          depositIndex: d.depositIndex,
          amount: d.amount,
          lockupKind: d.lockupKind,
          lockupStartTs: d.lockupStartTs,
          lockupEndTs: d.lockupEndTs,
          multiplier: d.multiplier,
          votingPower: d.votingPower,
          accountPubkey: d.accountPubkey
        }))
      }))
    };
    
    fs.writeFileSync('./canonical-native-governance-results.json', JSON.stringify(outputData, null, 2));
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`FINAL CANONICAL NATIVE GOVERNANCE RESULTS`);
    console.log(`${'='.repeat(60)}`);
    
    const totalNativePower = results.reduce((sum, r) => sum + r.nativePower, 0);
    const citizensWithPower = results.filter(r => r.nativePower > 0);
    
    console.log(`Citizens scanned: ${results.length}`);
    console.log(`Citizens with native power: ${citizensWithPower.length}`);
    console.log(`Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);
    
    console.log(`\nCitizens with governance power:`);
    for (const citizen of citizensWithPower) {
      console.log(`  ${citizen.wallet.slice(0, 8)}...: ${citizen.nativePower.toFixed(2)} ISLAND (${citizen.deposits.length} deposits)`);
    }
    
    console.log(`\nResults saved to canonical-native-governance-results.json`);
    console.log(`Canonical native governance scanner completed successfully.`);
    
  } catch (error) {
    console.error('Error in canonical scanner:', error.message);
  }
}

scanAllCitizensNativeGovernance().catch(console.error);