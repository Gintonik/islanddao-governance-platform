/**
 * Canonical Native Governance Power Scanner - Restored Version
 * Restores the last known working implementation that validated:
 * - Takisoul: 8,709,019.78 ISLAND native
 * - Whale's Friend: 12,625.58 ISLAND native  
 * - GJdRQcsy: 144,708.98 ISLAND native
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

/**
 * Get all citizen wallets from database
 */
async function getCitizenWallets() {
  const result = await pool.query('SELECT wallet FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
  return result.rows.map(row => row.wallet);
}

/**
 * Load verified wallet aliases for authority matching
 */
function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases.json', 'utf8'));
    return aliases;
  } catch (error) {
    return {};
  }
}

/**
 * Calculate VSR lockup multiplier using canonical formula
 */
function calculateLockupMultiplier(lockupEndTs) {
  if (!lockupEndTs || lockupEndTs <= 0) return 1.0;
  
  const now = Date.now() / 1000;
  const SECONDS_PER_YEAR = 31556952; // Exact year in seconds
  
  if (lockupEndTs <= now) return 1.0; // Skip expired timestamps
  
  const yearsRemaining = Math.max(0, (lockupEndTs - now) / SECONDS_PER_YEAR);
  return Math.min(5, 1 + Math.min(yearsRemaining, 4));
}

/**
 * Check if wallet controls VSR account through authority or alias
 */
function checkWalletAuthority(walletAddress, voterAuthority, walletAliases) {
  // Direct authority match
  if (voterAuthority === walletAddress) {
    return { isControlled: true, type: 'Direct authority' };
  }
  
  // Alias match - wallet is an alias of voter.authority
  if (walletAliases[walletAddress] && walletAliases[walletAddress].includes(voterAuthority)) {
    return { isControlled: true, type: 'Verified alias' };
  }
  
  return { isControlled: false, type: null };
}

/**
 * Parse deposits with independent per-deposit multiplier calculation
 */
function parseDepositsIndependently(data, accountPubkey, debugMode = false) {
  const deposits = [];
  const verifiedOffsets = [104, 112, 184, 192, 200, 208, 264, 272, 344, 352];
  const seenAmounts = new Set();
  
  if (debugMode) {
    console.log(`    Parsing deposits for account ${accountPubkey.slice(0, 8)}... (independent mode)`);
  }
  
  for (const offset of verifiedOffsets) {
    if (offset + 32 > data.length) continue;
    
    try {
      // Parse amount
      const amountBytes = data.slice(offset, offset + 8);
      const amount = Number(amountBytes.readBigUInt64LE()) / 1e6;
      
      if (amount <= 0.01) continue;
      
      // Skip duplicates within same account
      const amountKey = amount.toFixed(6);
      if (seenAmounts.has(amountKey)) {
        if (debugMode) console.log(`      Offset ${offset}: ${amount.toFixed(6)} ISLAND - Skipped duplicate`);
        continue;
      }
      seenAmounts.add(amountKey);
      
      // Filter phantom 1,000 ISLAND deposits
      const isPhantom = Math.abs(amount - 1000) < 0.01;
      if (isPhantom) {
        const configBytes = data.slice(offset + 32, offset + 64);
        const isEmpty = configBytes.every(byte => byte === 0);
        if (isEmpty) {
          if (debugMode) console.log(`      Offset ${offset}: ${amount.toFixed(6)} ISLAND - Filtered phantom deposit`);
          continue;
        }
      }
      
      // Parse isUsed flag
      let isUsed = true;
      if (offset + 24 < data.length) {
        const usedFlag = data.readUInt8(offset + 24);
        if (usedFlag === 0 && amount < 100) {
          isUsed = false;
        }
      }
      
      if (!isUsed) {
        if (debugMode) console.log(`      Offset ${offset}: ${amount.toFixed(6)} ISLAND - Skipped unused deposit`);
        continue;
      }
      
      // Independent timestamp search for THIS specific deposit: +0 to +128 bytes
      let bestLockupEndTs = 0;
      let bestMultiplier = 1.0;
      let foundAtOffset = null;
      let allValidTimestamps = [];
      
      const now = Date.now() / 1000;
      
      for (let i = 0; i <= 128; i += 8) {
        const tsOffset = offset + i;
        if (tsOffset + 8 <= data.length) {
          try {
            const timestamp = Number(data.readBigUInt64LE(tsOffset));
            
            // Skip expired timestamps - only use future timestamps
            if (timestamp > now && timestamp < now + (10 * 365.25 * 24 * 3600)) {
              const multiplier = calculateLockupMultiplier(timestamp);
              
              allValidTimestamps.push({
                offset: i,
                timestamp,
                multiplier,
                date: new Date(timestamp * 1000).toISOString()
              });
              
              // Use highest legal multiplier for this deposit
              if (multiplier > bestMultiplier) {
                bestLockupEndTs = timestamp;
                bestMultiplier = multiplier;
                foundAtOffset = i;
              }
            }
          } catch (e) {
            // Continue searching
          }
        }
      }
      
      // Calculate voting power for this deposit
      const votingPower = amount * bestMultiplier;
      
      const deposit = {
        offset,
        amount,
        lockupEndTs: bestLockupEndTs,
        multiplier: bestMultiplier,
        votingPower,
        isUsed,
        accountPubkey,
        timestampFoundAtOffset: foundAtOffset,
        validTimestamps: debugMode ? allValidTimestamps : []
      };
      
      deposits.push(deposit);
      
      if (debugMode) {
        console.log(`      Offset ${offset}: ${amount.toFixed(6)} ISLAND × ${bestMultiplier.toFixed(3)}x = ${votingPower.toFixed(2)} power`);
        if (bestLockupEndTs > 0) {
          console.log(`        Locked until ${new Date(bestLockupEndTs * 1000).toISOString()} (found at +${foundAtOffset})`);
        }
        if (allValidTimestamps.length > 1) {
          console.log(`        Found ${allValidTimestamps.length} valid timestamps:`);
          allValidTimestamps.forEach(ts => {
            console.log(`          +${ts.offset}: ${ts.multiplier.toFixed(3)}x until ${ts.date}`);
          });
        }
      }
      
    } catch (error) {
      if (debugMode) console.log(`      Error parsing offset ${offset}:`, error.message);
    }
  }
  
  if (debugMode) {
    console.log(`    Found ${deposits.length} valid deposits in account ${accountPubkey.slice(0, 8)}`);
  }
  return deposits;
}

/**
 * Calculate native governance power for a wallet with restored authority detection
 */
async function calculateRestoredNativeGovernancePower(walletAddress, debugMode = false) {
  const walletAliases = loadWalletAliases();
  
  // Load all VSR accounts
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  let totalGovernancePower = 0;
  let controlledAccounts = 0;
  let allDeposits = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
    // Extract voter authority from VSR account
    const authorityBytes = data.slice(32, 64);
    const voterAuthority = new PublicKey(authorityBytes).toBase58();
    
    const walletRefBytes = data.slice(8, 40);
    const walletRef = new PublicKey(walletRefBytes).toBase58();
    
    // Check wallet authority with both direct and alias matching
    let controlResult = checkWalletAuthority(walletAddress, voterAuthority, walletAliases);
    
    // Also check wallet reference for additional control patterns
    if (!controlResult.isControlled && walletRef === walletAddress) {
      controlResult = { isControlled: true, type: 'Wallet reference' };
    }
    
    if (controlResult.isControlled) {
      controlledAccounts++;
      if (debugMode) {
        console.log(`  Found controlled VSR account ${controlledAccounts}: ${account.pubkey.toBase58()}`);
        console.log(`    Control type: ${controlResult.type}`);
        console.log(`    Voter authority: ${voterAuthority}`);
      }
      
      const deposits = parseDepositsIndependently(data, account.pubkey.toBase58(), debugMode);
      
      for (const deposit of deposits) {
        totalGovernancePower += deposit.votingPower;
        allDeposits.push(deposit);
      }
    }
  }
  
  return {
    wallet: walletAddress,
    nativePower: totalGovernancePower,
    controlledAccounts,
    totalDeposits: allDeposits.length,
    deposits: allDeposits
  };
}

/**
 * Validate against target results to ensure restoration accuracy
 */
async function validateRestoredResults() {
  const targetWallets = [
    {
      name: 'Takisoul',
      wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
      expected: 8709019.78
    },
    {
      name: 'Whale\'s Friend',
      wallet: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
      expected: 12625.58
    },
    {
      name: 'GJdRQcsy',
      wallet: 'GJdRQcsyWZ4vDSxmbC5JrJQfCDdq7QfSMZH4zK8LRZue',
      expected: 144708.98
    }
  ];
  
  console.log('CANONICAL NATIVE GOVERNANCE RESTORATION VALIDATION');
  console.log('================================================');
  console.log('Validating restored scanner against target outcomes\n');
  
  const validationResults = [];
  let allMatch = true;
  
  for (const target of targetWallets) {
    console.log(`=== ${target.name} Validation ===`);
    const result = await calculateRestoredNativeGovernancePower(target.wallet, true);
    
    const difference = result.nativePower - target.expected;
    const tolerancePercent = Math.abs(difference / target.expected) * 100;
    const isMatch = tolerancePercent < 0.1; // <0.1% tolerance
    
    console.log(`\nExpected: ${target.expected.toLocaleString()} ISLAND`);
    console.log(`Actual: ${result.nativePower.toLocaleString()} ISLAND`);
    console.log(`Difference: ${difference.toFixed(2)} ISLAND`);
    console.log(`Tolerance: ${tolerancePercent.toFixed(3)}%`);
    console.log(`Match: ${isMatch ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    
    if (!isMatch) {
      allMatch = false;
      console.log('\nDEBUG - Per-deposit power calculations:');
      result.deposits.forEach((deposit, i) => {
        console.log(`  ${i + 1}. ${deposit.amount.toFixed(6)} ISLAND × ${deposit.multiplier.toFixed(3)}x = ${deposit.votingPower.toFixed(2)} power`);
        if (deposit.lockupEndTs > 0) {
          console.log(`     Lockup expiry: ${new Date(deposit.lockupEndTs * 1000).toISOString()}`);
        }
        if (deposit.validTimestamps && deposit.validTimestamps.length > 0) {
          console.log(`     Valid timestamps found: ${deposit.validTimestamps.length}`);
          deposit.validTimestamps.forEach(ts => {
            console.log(`       +${ts.offset}: ${ts.multiplier.toFixed(3)}x expiry ${ts.date}`);
          });
        }
      });
    }
    
    validationResults.push({
      ...result,
      name: target.name,
      expected: target.expected,
      difference,
      tolerancePercent,
      isMatch
    });
    
    console.log('\n' + '='.repeat(60) + '\n');
  }
  
  return { validationResults, allMatch };
}

/**
 * Run restored canonical governance scan
 */
async function runRestoredCanonicalGovernanceScan() {
  console.log('CANONICAL NATIVE GOVERNANCE SCANNER - RESTORED');
  console.log('============================================');
  console.log('Restoring last known working implementation with target validation');
  
  // Validate target wallets first
  const { validationResults, allMatch } = await validateRestoredResults();
  
  if (!allMatch) {
    console.log('🚫 RESTORATION VALIDATION FAILED');
    console.log('Target wallets do not match expected values - cannot lock scanner');
    console.log('Additional adjustment required for accurate restoration');
    await pool.end();
    return false;
  }
  
  console.log('🎉 RESTORATION VALIDATION SUCCESSFUL!');
  console.log('All target wallets match expected values - proceeding with full scan\n');
  
  // Run full scan for all citizens
  const citizenWallets = await getCitizenWallets();
  const allResults = [];
  
  console.log('Running complete citizen governance scan...');
  for (const wallet of citizenWallets) {
    const result = await calculateRestoredNativeGovernancePower(wallet, false);
    allResults.push(result);
  }
  
  // Sort results by governance power
  allResults.sort((a, b) => b.nativePower - a.nativePower);
  
  const totalGovernancePower = allResults.reduce((sum, result) => sum + result.nativePower, 0);
  const citizensWithPower = allResults.filter(r => r.nativePower > 0).length;
  const totalAccounts = allResults.reduce((sum, result) => sum + result.controlledAccounts, 0);
  const totalDeposits = allResults.reduce((sum, result) => sum + result.totalDeposits, 0);
  
  console.log('\n======================================================================');
  console.log('RESTORED CANONICAL NATIVE GOVERNANCE RESULTS');
  console.log('======================================================================');
  console.log(`Citizens scanned: ${allResults.length}`);
  console.log(`Citizens with native governance power: ${citizensWithPower}`);
  console.log(`Total native governance power: ${totalGovernancePower.toFixed(2)} ISLAND`);
  console.log(`Total controlled VSR accounts: ${totalAccounts}`);
  console.log(`Total valid deposits: ${totalDeposits}`);
  
  console.log('\nTop 10 native governance power holders:');
  allResults.slice(0, 10).forEach((result, index) => {
    if (result.nativePower > 0) {
      console.log(`  ${index + 1}. ${result.wallet.slice(0, 8)}...: ${result.nativePower.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ISLAND`);
    }
  });
  
  // Save restored results
  const outputData = {
    timestamp: new Date().toISOString(),
    scannerVersion: 'canonical-native-governance-restored',
    restorationStatus: 'ALL_TARGETS_VALIDATED',
    targetValidation: validationResults.map(result => ({
      name: result.name,
      wallet: result.wallet,
      expected: result.expected,
      actual: result.nativePower,
      difference: result.difference,
      tolerancePercent: result.tolerancePercent,
      isMatch: result.isMatch,
      deposits: result.deposits.map(deposit => ({
        offset: deposit.offset,
        amount: deposit.amount,
        lockupEndTs: deposit.lockupEndTs,
        multiplier: deposit.multiplier,
        votingPower: deposit.votingPower,
        timestampFoundAtOffset: deposit.timestampFoundAtOffset
      }))
    })),
    allCitizensResults: allResults.map(result => ({
      wallet: result.wallet,
      nativePower: result.nativePower,
      controlledAccounts: result.controlledAccounts,
      totalDeposits: result.totalDeposits,
      deposits: result.deposits.map(deposit => ({
        offset: deposit.offset,
        amount: deposit.amount,
        lockupEndTs: deposit.lockupEndTs,
        multiplier: deposit.multiplier,
        votingPower: deposit.votingPower,
        isUsed: deposit.isUsed,
        accountPubkey: deposit.accountPubkey,
        timestampFoundAtOffset: deposit.timestampFoundAtOffset
      }))
    })),
    summary: {
      totalCitizens: allResults.length,
      citizensWithPower,
      totalGovernancePower,
      totalControlledAccounts: totalAccounts,
      totalValidDeposits: totalDeposits,
      scannerStatus: 'RESTORED_AND_VALIDATED'
    },
    methodology: {
      authorityMatching: 'Direct authority + Verified aliases + Wallet reference',
      offsetMethod: 'Verified offsets [104, 112, 184, 192, 200, 208, 264, 272, 344, 352]',
      lockupParsing: 'Independent per-deposit timestamp search (+0 to +128 bytes)',
      multiplierCalculation: 'Canonical VSR formula: min(5, 1 + min(yearsRemaining, 4))',
      yearCalculation: 'yearsRemaining = (timestamp - now) / 31556952',
      phantomFiltering: 'Empty config detection for 1,000 ISLAND deposits',
      expiredTimestampHandling: 'Skip timestamps <= current time',
      independentCalculation: 'Each deposit calculated independently - no global multipliers'
    }
  };
  
  fs.writeFileSync('./native-results-restored.json', JSON.stringify(outputData, null, 2));
  console.log('\nRestored results saved to native-results-restored.json');
  
  console.log('\n🔒 CANONICAL NATIVE GOVERNANCE SCANNER RESTORED AND LOCKED');
  console.log('All target validations passed - scanner successfully restored to working state');
  console.log('Independent per-deposit multiplier calculations implemented and verified');
  
  await pool.end();
  return true;
}

runRestoredCanonicalGovernanceScan().catch(console.error);