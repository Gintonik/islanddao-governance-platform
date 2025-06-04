/**
 * Restore Canonical VSR Governance Power Scanner
 * Uses proper Anchor deserialization with vsr-idl.json for accurate governance power calculation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import vsrIdl from './vsr-idl.json' assert { type: 'json' };
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Create Anchor program instance
const provider = new anchor.AnchorProvider(connection, {}, {});
const program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);

/**
 * Calculate VSR multiplier using canonical formula
 */
function calculateVSRMultiplier(lockup) {
  // Handle expired or no lockup
  if (lockup.lockupKind === 0 || lockup.lockupEndTs.eqn(0)) {
    return 1.0;
  }
  
  const now = Math.floor(Date.now() / 1000);
  const endTs = lockup.lockupEndTs.toNumber();
  const secondsRemaining = Math.max(0, endTs - now);
  const years = secondsRemaining / (365.25 * 24 * 3600);
  
  // VSR formula: 1 + min(years_remaining, 4)
  return Math.min(1 + years, 5);
}

/**
 * Get all citizen wallet addresses from database
 */
async function getCitizenWallets() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    return result.rows.map(row => row.wallet);
  } finally {
    await pool.end();
  }
}

/**
 * Load all VSR Voter accounts (2728 bytes only)
 */
async function loadVSRVoterAccounts() {
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Loaded ${accounts.length} VSR Voter accounts (2728 bytes)`);
  return accounts;
}

/**
 * Calculate native governance power for a wallet using Anchor deserialization
 */
async function calculateNativeGovernancePower(walletAddress, voterAccounts) {
  let totalNativePower = 0;
  let depositCount = 0;
  const deposits = [];
  
  for (const { account, pubkey } of voterAccounts) {
    try {
      // Use Anchor to deserialize the Voter account
      const voterData = program.coder.accounts.decode('voter', account.data);
      
      // Check if this wallet is the authority (native deposits)
      const authority = voterData.authority.toBase58();
      if (authority !== walletAddress) continue;
      
      // Process deposit entries
      for (let i = 0; i < voterData.depositEntries.length; i++) {
        const deposit = voterData.depositEntries[i];
        
        // Skip unused deposits
        if (!deposit.isUsed) continue;
        
        // Get deposit amount (convert from native units to ISLAND with 6 decimals)
        const amount = deposit.amountDepositedNative.toNumber() / 1_000_000;
        
        // Skip withdrawn deposits
        if (amount === 0) continue;
        
        // Calculate multiplier
        const multiplier = calculateVSRMultiplier(deposit.lockup);
        const votingPower = amount * multiplier;
        
        totalNativePower += votingPower;
        depositCount++;
        
        // Store deposit info for debugging
        deposits.push({
          index: i,
          amount,
          multiplier,
          votingPower,
          lockupKind: deposit.lockup.lockupKind,
          lockupStartTs: deposit.lockup.startTs.toNumber(),
          lockupEndTs: deposit.lockup.lockupEndTs.toNumber(),
          isExpired: deposit.lockup.lockupKind === 0 || deposit.lockup.lockupEndTs.eqn(0),
          account: pubkey.toBase58()
        });
      }
    } catch (error) {
      // Skip accounts that can't be deserialized
      continue;
    }
  }
  
  return {
    nativePower: totalNativePower,
    depositCount,
    deposits
  };
}

/**
 * Audit all citizen wallets for VSR governance power
 */
async function auditCitizenVSRGovernance() {
  console.log('CANONICAL VSR GOVERNANCE POWER SCANNER');
  console.log('======================================');
  console.log('Restoring working Anchor-based deserialization for citizen wallets\n');
  
  // Load citizen wallets from database
  const citizenWallets = await getCitizenWallets();
  console.log(`Found ${citizenWallets.length} citizen wallets in database\n`);
  
  // Load all VSR Voter accounts
  const voterAccounts = await loadVSRVoterAccounts();
  console.log();
  
  const results = [];
  let citizensWithPower = 0;
  let totalNativePower = 0;
  
  for (const walletAddress of citizenWallets) {
    const result = await calculateNativeGovernancePower(walletAddress, voterAccounts);
    results.push({ wallet: walletAddress, ...result });
    
    if (result.nativePower > 0) citizensWithPower++;
    totalNativePower += result.nativePower;
    
    console.log(`${walletAddress}:`);
    console.log(`  Native Governance Power: ${result.nativePower.toFixed(2)} ISLAND`);
    console.log(`  Number of deposits: ${result.depositCount}`);
    
    if (result.deposits.length > 0) {
      const activeDeposits = result.deposits.filter(d => !d.isExpired);
      const expiredDeposits = result.deposits.filter(d => d.isExpired);
      
      console.log(`  Active lockups: ${activeDeposits.length}`);
      console.log(`  Expired lockups: ${expiredDeposits.length}`);
      
      // Show deposit details for debugging
      for (const deposit of result.deposits) {
        const status = deposit.isExpired ? 'EXPIRED' : 'ACTIVE';
        console.log(`    Deposit #${deposit.index}: ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.votingPower.toFixed(2)} ISLAND (${status})`);
        
        if (deposit.lockupEndTs > 0) {
          const endDate = new Date(deposit.lockupEndTs * 1000).toISOString().split('T')[0];
          console.log(`      Lockup ends: ${endDate}`);
        }
      }
    } else {
      console.log(`  Status: No VSR deposits found`);
    }
    
    console.log('  ' + '-'.repeat(60));
    console.log();
  }
  
  console.log('FINAL SUMMARY:');
  console.log('==============');
  console.log(`Total Citizens Scanned: ${citizenWallets.length}`);
  console.log(`Citizens with VSR Power: ${citizensWithPower}`);
  console.log(`Citizens without VSR Power: ${citizenWallets.length - citizensWithPower}`);
  console.log(`Total Native Governance Power: ${totalNativePower.toFixed(2)} ISLAND`);
  
  if (citizensWithPower === 0) {
    console.log('\nNote: No VSR governance power found for any citizens.');
    console.log('This indicates the citizen wallets do not participate in VSR governance.');
  }
  
  console.log('\nCanonical VSR governance power scan completed');
  console.log('Using proper Anchor deserialization with authentic on-chain data');
  
  return results;
}

auditCitizenVSRGovernance();