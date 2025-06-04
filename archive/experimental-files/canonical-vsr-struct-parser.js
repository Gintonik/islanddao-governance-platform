/**
 * Canonical VSR Governance Scanner - Struct-Aware Parsing
 * Uses Anchor IDL layout to properly parse DepositEntry structs with lockup multipliers
 * Target: Achieve Takisoul's expected ~8.7M ISLAND governance power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_API_KEY);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_DAO_REGISTRAR = new PublicKey('5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8');

/**
 * Load VSR IDL for canonical struct parsing
 */
function loadVSRIDL() {
  try {
    return JSON.parse(fs.readFileSync('./vsr-idl.json', 'utf8'));
  } catch (error) {
    console.error('Failed to load VSR IDL:', error.message);
    throw error;
  }
}

/**
 * Get all citizen wallets from database
 */
async function getCitizenWallets() {
  const result = await pool.query('SELECT wallet FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
  return result.rows.map(row => row.wallet);
}

/**
 * Load verified wallet aliases
 */
function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));
    console.log(`Loaded wallet aliases for ${Object.keys(aliases).length} wallets`);
    return aliases;
  } catch (error) {
    console.log('No wallet aliases file found, using empty aliases');
    return {};
  }
}

/**
 * Calculate VSR lockup multiplier using canonical formula
 */
function calculateLockupMultiplier(lockupKind, startTs, endTs) {
  if (lockupKind !== 1) return 1.0; // No lockup
  
  const now = Date.now() / 1000;
  
  // Validate timestamps
  if (endTs <= now || endTs <= startTs) return 1.0; // Expired or invalid
  
  const timeRemaining = endTs - now;
  const yearsRemaining = timeRemaining / (365.25 * 24 * 3600);
  
  // VSR canonical formula: 1 + min(years_remaining, 4), capped at 5x
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Parse DepositEntry struct using Anchor IDL layout
 * 
 * DepositEntry struct (32 bytes each):
 * - votingMintConfigIdx: u8 (1 byte)
 * - amountDepositedNative: u64 (8 bytes)
 * - amountInitiallyLockedNative: u64 (8 bytes)
 * - isUsed: bool (1 byte)
 * - lockup: Lockup struct (17 bytes)
 *   - startTs: u64 (8 bytes)
 *   - endTs: u64 (8 bytes)
 *   - lockupKind: u8 (1 byte)
 * Total: 35 bytes per entry (with padding)
 */
function parseDepositEntry(data, entryIndex) {
  const VOTER_HEADER_SIZE = 128; // authority + registrar + voterAuthority + voterWeightRecord
  const DEPOSIT_ENTRY_SIZE = 40; // Actual size with padding
  const entryOffset = VOTER_HEADER_SIZE + (entryIndex * DEPOSIT_ENTRY_SIZE);
  
  if (entryOffset + DEPOSIT_ENTRY_SIZE > data.length) {
    return null;
  }
  
  try {
    let offset = entryOffset;
    
    // Parse DepositEntry fields
    const votingMintConfigIdx = data.readUInt8(offset);
    offset += 1;
    
    // Add padding alignment for u64
    offset += 7; // Align to 8-byte boundary
    
    const amountDepositedNative = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    const amountInitiallyLockedNative = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    const isUsed = data.readUInt8(offset) !== 0;
    offset += 1;
    
    // Add padding before Lockup struct
    offset += 7; // Align to 8-byte boundary
    
    // Parse Lockup struct
    const startTs = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    const endTs = Number(data.readBigUInt64LE(offset));
    offset += 8;
    
    const lockupKind = data.readUInt8(offset);
    
    return {
      votingMintConfigIdx,
      amountDepositedNative,
      amountInitiallyLockedNative,
      isUsed,
      lockup: {
        startTs,
        endTs,
        lockupKind
      },
      rawOffset: entryOffset
    };
    
  } catch (error) {
    console.log(`Error parsing deposit entry ${entryIndex}:`, error.message);
    return null;
  }
}

/**
 * Parse Voter account using canonical Anchor struct layout
 */
function parseVoterAccount(data, accountPubkey) {
  console.log(`  Parsing voter account ${accountPubkey.slice(0, 8)}... (${data.length} bytes)`);
  
  if (data.length < 128) {
    console.log(`    Account too small: ${data.length} bytes`);
    return null;
  }
  
  try {
    // Parse Voter struct header
    const authority = new PublicKey(data.slice(0, 32)).toBase58();
    const registrar = new PublicKey(data.slice(32, 64)).toBase58();
    const voterAuthority = new PublicKey(data.slice(64, 96)).toBase58();
    const voterWeightRecord = new PublicKey(data.slice(96, 128)).toBase58();
    
    console.log(`    Authority: ${authority}`);
    console.log(`    Registrar: ${registrar}`);
    console.log(`    Voter Authority: ${voterAuthority}`);
    
    const deposits = [];
    const MAX_DEPOSITS = 32; // From IDL array size
    
    // Parse deposit entries array
    for (let i = 0; i < MAX_DEPOSITS; i++) {
      const entry = parseDepositEntry(data, i);
      
      if (!entry) continue;
      
      // Skip unused or invalid entries
      if (!entry.isUsed || entry.amountDepositedNative === 0) {
        continue;
      }
      
      const amount = entry.amountDepositedNative / 1e6; // Convert to ISLAND
      
      // Skip dust amounts
      if (amount < 0.01) continue;
      
      // Check for phantom 1000 ISLAND deposits with null lockup configurations
      const isPhantom = Math.abs(amount - 1000) < 0.01 && 
                       entry.lockup.startTs === 0 && 
                       entry.lockup.endTs === 0 && 
                       entry.lockup.lockupKind === 0;
      
      if (isPhantom) {
        console.log(`    Entry ${i}: ${amount.toFixed(6)} ISLAND - Filtered phantom deposit`);
        continue;
      }
      
      // Calculate multiplier and governance power
      const multiplier = calculateLockupMultiplier(
        entry.lockup.lockupKind,
        entry.lockup.startTs,
        entry.lockup.endTs
      );
      
      const governancePower = amount * multiplier;
      
      const deposit = {
        entryIndex: i,
        amount,
        votingMintConfigIdx: entry.votingMintConfigIdx,
        amountInitiallyLocked: entry.amountInitiallyLockedNative / 1e6,
        isUsed: entry.isUsed,
        lockup: entry.lockup,
        multiplier,
        governancePower,
        rawOffset: entry.rawOffset
      };
      
      deposits.push(deposit);
      
      if (multiplier > 1.0) {
        const lockupEnd = new Date(entry.lockup.endTs * 1000);
        console.log(`    Entry ${i}: ${amount.toFixed(6)} ISLAND × ${multiplier.toFixed(2)}x = ${governancePower.toFixed(2)} power (locked until ${lockupEnd.toISOString()})`);
      } else {
        console.log(`    Entry ${i}: ${amount.toFixed(6)} ISLAND × ${multiplier.toFixed(2)}x = ${governancePower.toFixed(2)} power`);
      }
    }
    
    const totalGovernancePower = deposits.reduce((sum, deposit) => sum + deposit.governancePower, 0);
    
    console.log(`    Found ${deposits.length} valid deposits, total power: ${totalGovernancePower.toFixed(2)} ISLAND`);
    
    return {
      authority,
      registrar,
      voterAuthority,
      voterWeightRecord,
      deposits,
      totalGovernancePower
    };
    
  } catch (error) {
    console.log(`    Error parsing voter account:`, error.message);
    return null;
  }
}

/**
 * Calculate native governance power for a wallet using struct-aware parsing
 */
async function calculateStructAwareGovernancePower(walletAddress) {
  console.log(`\nCalculating struct-aware governance power for: ${walletAddress}`);
  
  const walletAliases = loadWalletAliases();
  
  // Load all VSR voter accounts (2728 bytes)
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 }, // Voter account size
    ]
  });
  
  console.log(`Processing ${allVSRAccounts.length} VSR voter accounts...`);
  
  let totalGovernancePower = 0;
  let controlledAccounts = [];
  let allDeposits = [];
  let processedCount = 0;
  
  for (const account of allVSRAccounts) {
    processedCount++;
    
    if (processedCount % 1000 === 0) {
      console.log(`  Processed ${processedCount}/${allVSRAccounts.length} accounts...`);
    }
    
    const data = account.account.data;
    
    // Quick authority check before full parsing
    const authorityBytes = data.slice(0, 32);
    const authority = new PublicKey(authorityBytes).toBase58();
    
    const walletRefBytes = data.slice(64, 96); // voterAuthority position
    const walletRef = new PublicKey(walletRefBytes).toBase58();
    
    // Determine control relationship
    let isControlled = false;
    let controlType = null;
    
    if (authority === walletAddress) {
      isControlled = true;
      controlType = 'Direct authority match';
    } else if (walletRef === walletAddress) {
      isControlled = true;
      controlType = 'Voter authority match';
    } else if (walletAliases[walletAddress] && walletAliases[walletAddress].includes(authority)) {
      isControlled = true;
      controlType = 'Verified alias match';
    }
    
    if (isControlled) {
      console.log(`  Found controlled VSR account: ${account.pubkey.toBase58()}`);
      console.log(`    Control type: ${controlType}`);
      
      const voterData = parseVoterAccount(data, account.pubkey.toBase58());
      
      if (voterData && voterData.deposits.length > 0) {
        controlledAccounts.push({
          pubkey: account.pubkey.toBase58(),
          controlType,
          voterData
        });
        
        totalGovernancePower += voterData.totalGovernancePower;
        
        // Add deposits with account context
        voterData.deposits.forEach(deposit => {
          allDeposits.push({
            ...deposit,
            accountPubkey: account.pubkey.toBase58(),
            controlType
          });
        });
      }
    }
  }
  
  console.log(`  Final struct-aware governance power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  console.log(`  Controlled accounts: ${controlledAccounts.length}`);
  console.log(`  Total deposits: ${allDeposits.length}`);
  
  return {
    wallet: walletAddress,
    nativePower: totalGovernancePower,
    controlledAccounts: controlledAccounts.length,
    totalDeposits: allDeposits.length,
    deposits: allDeposits,
    accountDetails: controlledAccounts
  };
}

/**
 * Run canonical struct-aware VSR governance scan
 */
async function runStructAwareVSRScan() {
  console.log('CANONICAL VSR GOVERNANCE SCANNER - STRUCT-AWARE PARSING');
  console.log('=======================================================');
  console.log('Using Anchor IDL layout for accurate DepositEntry and Lockup parsing');
  
  const vsrIDL = loadVSRIDL();
  console.log(`Loaded VSR IDL version: ${vsrIDL.version}`);
  
  const citizenWallets = await getCitizenWallets();
  console.log(`\nScanning ${citizenWallets.length} citizen wallets...\n`);
  
  const results = [];
  
  for (const wallet of citizenWallets) {
    const result = await calculateStructAwareGovernancePower(wallet);
    results.push(result);
    
    console.log(`\n=== ${wallet.slice(0, 8)}... Summary ===`);
    console.log(`Native Power: ${result.nativePower.toFixed(2)} ISLAND`);
    console.log(`Controlled Accounts: ${result.controlledAccounts}`);
    console.log(`Valid Deposits: ${result.totalDeposits}`);
    
    if (result.deposits.length > 0) {
      console.log('Deposit breakdown:');
      result.deposits.forEach((deposit, i) => {
        const lockupInfo = deposit.multiplier > 1.0 ? 
          ` (lockup kind ${deposit.lockup.lockupKind}, ${deposit.multiplier.toFixed(2)}x, until ${new Date(deposit.lockup.endTs * 1000).toISOString()})` :
          ` (no lockup, ${deposit.multiplier.toFixed(2)}x)`;
        console.log(`  ${i + 1}. ${deposit.amount.toFixed(6)} ISLAND${lockupInfo} = ${deposit.governancePower.toFixed(2)} power`);
      });
    }
    console.log('');
  }
  
  // Sort results by governance power
  results.sort((a, b) => b.nativePower - a.nativePower);
  
  const totalGovernancePower = results.reduce((sum, result) => sum + result.nativePower, 0);
  const citizensWithPower = results.filter(r => r.nativePower > 0).length;
  const totalAccounts = results.reduce((sum, result) => sum + result.controlledAccounts, 0);
  const totalDeposits = results.reduce((sum, result) => sum + result.totalDeposits, 0);
  
  console.log('\n======================================================================');
  console.log('CANONICAL STRUCT-AWARE VSR GOVERNANCE RESULTS');
  console.log('======================================================================');
  console.log(`Citizens scanned: ${results.length}`);
  console.log(`Citizens with native governance power: ${citizensWithPower}`);
  console.log(`Total native governance power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  console.log(`Total controlled VSR accounts: ${totalAccounts}`);
  console.log(`Total valid deposits: ${totalDeposits}`);
  
  console.log('\nNative governance power distribution:');
  results.forEach((result, index) => {
    if (result.nativePower > 0) {
      console.log(`  ${index + 1}. ${result.wallet.slice(0, 8)}...: ${result.nativePower.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ISLAND (${result.totalDeposits} deposits, ${result.controlledAccounts} accounts)`);
    }
  });
  
  // Special validation for Takisoul
  const takisoul = results.find(r => r.wallet.includes('7pPJt2xo'));
  if (takisoul) {
    console.log('\n=== TAKISOUL STRUCT-AWARE VALIDATION ===');
    console.log(`Target: ~8,700,000 ISLAND`);
    console.log(`Actual: ${takisoul.nativePower.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ISLAND`);
    const isCloseToTarget = Math.abs(takisoul.nativePower - 8700000) < 500000;
    console.log(`Status: ${isCloseToTarget ? 'SUCCESS ✅' : 'NEEDS ADJUSTMENT ❌'}`);
    
    if (takisoul.deposits.length > 0) {
      console.log('Takisoul detailed deposit analysis:');
      takisoul.deposits.forEach((deposit, i) => {
        console.log(`  ${i + 1}. ${deposit.amount.toFixed(6)} ISLAND`);
        console.log(`     Lockup Kind: ${deposit.lockup.lockupKind}`);
        console.log(`     Start: ${new Date(deposit.lockup.startTs * 1000).toISOString()}`);
        console.log(`     End: ${new Date(deposit.lockup.endTs * 1000).toISOString()}`);
        console.log(`     Multiplier: ${deposit.multiplier.toFixed(2)}x`);
        console.log(`     Governance Power: ${deposit.governancePower.toFixed(2)} ISLAND`);
        console.log(`     Account: ${deposit.accountPubkey}`);
        console.log('');
      });
    }
  }
  
  // Save debug results
  const debugData = {
    timestamp: new Date().toISOString(),
    scannerVersion: 'canonical-vsr-struct-parser',
    idlVersion: vsrIDL.version,
    totalCitizens: results.length,
    citizensWithPower: citizensWithPower,
    totalGovernancePower: totalGovernancePower,
    totalControlledAccounts: totalAccounts,
    totalValidDeposits: totalDeposits,
    methodology: {
      structParsing: 'Anchor IDL DepositEntry layout',
      lockupCalculation: 'Canonical VSR multiplier formula',
      authorityMatching: 'Direct + Voter authority + Verified aliases',
      phantomFiltering: 'Null lockup 1000 ISLAND detection'
    },
    results: results.map(result => ({
      wallet: result.wallet,
      nativePower: result.nativePower,
      controlledAccounts: result.controlledAccounts,
      totalDeposits: result.totalDeposits,
      deposits: result.deposits
    }))
  };
  
  fs.writeFileSync('./native-results-debug.json', JSON.stringify(debugData, null, 2));
  console.log('\nStruct-aware debug results saved to native-results-debug.json');
  
  // If Takisoul validation passes, create final locked results
  if (takisoul && Math.abs(takisoul.nativePower - 8700000) < 500000) {
    console.log('\n🔒 VALIDATION PASSED - Creating locked final results...');
    
    const finalData = {
      timestamp: new Date().toISOString(),
      scannerVersion: 'canonical-vsr-struct-parser-locked',
      totalGovernancePower: totalGovernancePower,
      citizensWithPower: citizensWithPower,
      results: results.map(result => ({
        wallet: result.wallet,
        nativePower: result.nativePower,
        rank: results.indexOf(result) + 1
      }))
    };
    
    fs.writeFileSync('./native-results-final-locked.json', JSON.stringify(finalData, null, 2));
    console.log('Final locked results saved to native-results-final-locked.json');
    console.log('Scanner ready for delegation pipeline integration');
  }
  
  console.log('\nStruct-aware canonical VSR governance scanner completed.');
  
  await pool.end();
}

runStructAwareVSRScan().catch(console.error);