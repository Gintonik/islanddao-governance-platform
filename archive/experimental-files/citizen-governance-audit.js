/**
 * Citizen Governance Audit
 * Uses the proven canonical VSR scanner to audit all 20 citizen wallets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// All 20 citizen wallet addresses from the map
const CITIZEN_WALLETS = [
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh',
  '6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  '3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr',
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA',
  'B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST',
  'ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  'EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF',
  '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk',
  '2NZ9hwrGNitbGTjt4p4py2m6iwAjJ9Bzs8vXeWs1QpHT',
  'CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
  '9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94',
  '9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n',
  'BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz',
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  'DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt'
];

/**
 * Calculate multiplier using canonical VSR rules
 */
function calculateMultiplier(lockupKind, lockupEndTs) {
  if (lockupKind === 0) return 1.0;
  if (lockupEndTs === 0) return 1.0;
  
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = Math.max(0, lockupEndTs - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  
  return Math.min(1 + years, 5);
}

/**
 * Parse VSR deposits using the proven method
 */
function parseVSRDepositsWithValidation(data) {
  const deposits = [];
  
  try {
    // Parse authority and voter authority (first 64 bytes)
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(40, 72)).toBase58();
    
    // Parse deposit entries - use safer approach with bounds checking
    for (let i = 0; i < 32; i++) {
      const depositOffset = 76 + (i * 192);
      
      // Ensure we don't go beyond the buffer
      if (depositOffset + 192 > data.length) break;
      
      // Check isUsed flag
      const isUsed = data.readUInt8(depositOffset) === 1;
      if (!isUsed) continue;
      
      // Parse deposit data
      const amountBytes = data.slice(depositOffset + 8, depositOffset + 16);
      const amount = Number(amountBytes.readBigUInt64LE()) / 1_000_000; // 6 decimals for ISLAND
      
      if (amount === 0) continue;
      
      // Parse lockup (starts at depositOffset + 16)
      const lockupKind = data.readUInt8(depositOffset + 16);
      const startTs = data.readUInt32LE(depositOffset + 17);
      const endTs = data.readUInt32LE(depositOffset + 21);
      
      const multiplier = calculateMultiplier(lockupKind, endTs);
      const power = amount * multiplier;
      
      deposits.push({
        depositIndex: i,
        isUsed,
        amount,
        lockupKind,
        startTs,
        endTs,
        multiplier,
        power,
        authority,
        voterAuthority
      });
    }
  } catch (error) {
    // Skip accounts with parsing errors
    return [];
  }
  
  return deposits;
}

/**
 * Calculate governance power for a specific wallet
 */
async function calculateWalletGovernancePower(walletAddress, allVSRAccounts) {
  let nativePower = 0;
  let delegatedPower = 0;
  const deposits = [];
  
  for (const { account, pubkey } of allVSRAccounts) {
    const parsedDeposits = parseVSRDepositsWithValidation(account.data);
    
    for (const deposit of parsedDeposits) {
      const isNative = deposit.authority === walletAddress;
      const isDelegated = deposit.voterAuthority === walletAddress && deposit.authority !== walletAddress;
      
      if (isNative) {
        nativePower += deposit.power;
        deposits.push({ ...deposit, type: 'native', account: pubkey.toBase58() });
      }
      
      if (isDelegated) {
        delegatedPower += deposit.power;
        deposits.push({ ...deposit, type: 'delegated', account: pubkey.toBase58() });
      }
    }
  }
  
  return {
    nativePower,
    delegatedPower,
    totalPower: nativePower + delegatedPower,
    deposits
  };
}

/**
 * Load all VSR accounts
 */
async function loadVSRAccounts() {
  const voterAccounts = await connection.getProgramAccounts(new PublicKey(VSR_PROGRAM_ID), {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${voterAccounts.length} Voter accounts (2728 bytes)`);
  return voterAccounts;
}

/**
 * Audit all citizen wallets
 */
async function auditAllCitizens() {
  console.log('CITIZEN GOVERNANCE POWER AUDIT');
  console.log('===============================');
  console.log('Calculating VSR governance power for all 20 citizens on the map\n');
  
  const allVSRAccounts = await loadVSRAccounts();
  console.log();
  
  const results = [];
  
  for (const walletAddress of CITIZEN_WALLETS) {
    const result = await calculateWalletGovernancePower(walletAddress, allVSRAccounts);
    results.push({ wallet: walletAddress, ...result });
    
    console.log(`${walletAddress.slice(0, 8)}...:`);
    
    if (result.deposits.length > 0) {
      for (const deposit of result.deposits) {
        const tag = deposit.type === 'native' ? 'Native' : 'Delegated';
        console.log(`  ${tag} | Deposit #${deposit.depositIndex}`);
        console.log(`    Amount: ${deposit.amount.toFixed(6)} ISLAND`);
        console.log(`    Multiplier: ${deposit.multiplier.toFixed(2)} | Power: ${deposit.power.toFixed(2)} ISLAND`);
        console.log(`    LockupKind: ${deposit.lockupKind} | Status: ${deposit.lockupKind === 0 ? 'EXPIRED' : 'ACTIVE'}`);
        console.log(`    Authority: ${deposit.authority.slice(0, 8)}...`);
        console.log(`    VoterAuthority: ${deposit.voterAuthority.slice(0, 8)}...`);
        console.log();
      }
    }
    
    console.log(`Summary for ${walletAddress.slice(0, 8)}...`);
    console.log(`   Native Power   : ${result.nativePower.toFixed(2)} ISLAND`);
    console.log(`   Delegated Power: ${result.delegatedPower.toFixed(2)} ISLAND`);
    console.log(`   Total Power    : ${result.totalPower.toFixed(2)} ISLAND`);
    console.log('-----------------------------------------------------');
    
    if (result.deposits.length === 0) {
      console.log(`No VSR deposits found`);
      console.log('-----------------------------------------------------');
    }
    
    console.log();
  }
  
  // Summary statistics
  const totalNative = results.reduce((sum, r) => sum + r.nativePower, 0);
  const totalDelegated = results.reduce((sum, r) => sum + r.delegatedPower, 0);
  const citizensWithPower = results.filter(r => r.totalPower > 0).length;
  
  console.log('SUMMARY STATISTICS:');
  console.log('==================');
  console.log(`Total Citizens Audited: ${CITIZEN_WALLETS.length}`);
  console.log(`Citizens with Governance Power: ${citizensWithPower}`);
  console.log(`Citizens without Power: ${CITIZEN_WALLETS.length - citizensWithPower}`);
  console.log(`Total Native Power: ${totalNative.toFixed(2)} ISLAND`);
  console.log(`Total Delegated Power: ${totalDelegated.toFixed(2)} ISLAND`);
  console.log(`Total Governance Power: ${(totalNative + totalDelegated).toFixed(2)} ISLAND`);
  
  console.log('\nCitizen governance power audit completed');
  console.log('All calculations use canonical VSR rules with proper isUsed validation');
  
  return results;
}

auditAllCitizens();