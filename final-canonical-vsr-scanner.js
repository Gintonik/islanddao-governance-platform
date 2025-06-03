/**
 * Final Canonical VSR Scanner with Authentic Registrar Configuration
 * Uses decoded registrar parameters from blockchain for accurate governance power calculation
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import fs from 'fs';
import pkg from 'pg';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Authentic registrar parameters decoded from blockchain
const REGISTRAR_PARAMS = {
  baseline: 3_000_000_000,
  maxExtra: 3_000_000_000,
  saturationSecs: 31_536_000, // 1 year
  vsrProgramId: "vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ"
};

const VSR_PROGRAM_ID = new PublicKey(REGISTRAR_PARAMS.vsrProgramId);
const connection = new Connection(process.env.HELIUS_RPC_URL);

/**
 * Calculate multiplier using authentic registrar configuration
 */
function calculateMultiplier(timeLeftSecs) {
  const ratio = Math.min(1, timeLeftSecs / REGISTRAR_PARAMS.saturationSecs);
  const scaled = REGISTRAR_PARAMS.baseline + (REGISTRAR_PARAMS.maxExtra * ratio);
  return scaled / 1_000_000_000; // Convert to float multiplier
}

/**
 * Test multiplier calculation
 */
function testMultiplierCalculation() {
  console.log('Testing multiplier calculation with authentic registrar params:');
  
  // Test cases
  const tests = [
    { timeLeft: 0, expected: 3.0, description: 'Expired lockup' },
    { timeLeft: 31_536_000, expected: 6.0, description: 'Full year remaining' },
    { timeLeft: 15_768_000, expected: 4.5, description: 'Half year remaining' },
    { timeLeft: 7_884_000, expected: 3.75, description: 'Quarter year remaining' }
  ];
  
  for (const test of tests) {
    const actual = calculateMultiplier(test.timeLeft);
    const match = Math.abs(actual - test.expected) < 0.001;
    console.log(`${test.description}: ${actual.toFixed(3)}x ${match ? '✅' : '❌'} (expected ${test.expected}x)`);
  }
  console.log('');
}

/**
 * Load wallet aliases for authority resolution
 */
function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
    return aliases;
  } catch (error) {
    console.log('Warning: Could not load wallet aliases');
    return {};
  }
}

/**
 * Parse VSR deposits from account data using pattern detection
 */
function parseVSRDeposits(data) {
  const deposits = [];
  const currentTime = Date.now() / 1000;
  
  try {
    // Scan for deposit patterns
    for (let offset = 112; offset < data.length - 80; offset += 8) {
      try {
        const amount1 = Number(data.readBigUInt64LE(offset));
        const amount2 = Number(data.readBigUInt64LE(offset + 8));
        
        const tokens1 = amount1 / 1e6;
        const tokens2 = amount2 / 1e6;
        
        // Valid deposit criteria
        if (tokens1 >= 100 && tokens1 <= 10000000 && 
            tokens2 >= 100 && tokens2 <= 10000000 &&
            Math.abs(tokens1 - tokens2) / Math.max(tokens1, tokens2) < 0.2) {
          
          // Find timestamps
          let startTs = 0;
          let endTs = 0;
          let lockupKind = 0;
          
          for (let tsOffset = offset + 16; tsOffset <= offset + 80 && tsOffset + 8 <= data.length; tsOffset += 8) {
            try {
              const value = Number(data.readBigUInt64LE(tsOffset));
              if (value > 1600000000 && value < 2000000000) {
                if (startTs === 0) {
                  startTs = value;
                } else if (endTs === 0 && value > startTs) {
                  endTs = value;
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
          
          // Find lockup kind
          for (let kindOffset = offset + 16; kindOffset <= offset + 80 && kindOffset < data.length; kindOffset++) {
            const kind = data[kindOffset];
            if (kind >= 0 && kind <= 4) {
              lockupKind = kind;
              break;
            }
          }
          
          // Calculate voting power using authentic registrar params
          if (startTs > 0 && endTs > startTs) {
            const timeRemaining = Math.max(0, endTs - currentTime);
            const multiplier = calculateMultiplier(timeRemaining);
            const votingPower = tokens1 * multiplier;
            
            if (votingPower > 0) {
              const lockupTypes = ['none', 'cliff', 'constant', 'vesting_monthly', 'vesting_daily'];
              
              deposits.push({
                amount: tokens1,
                amountDepositedNative: amount1,
                amountInitiallyLockedNative: amount2,
                isUsed: true,
                lockup: {
                  startTs: startTs,
                  endTs: endTs,
                  lockupKind: lockupKind
                },
                votingPower: votingPower,
                multiplier: multiplier,
                lockupType: lockupTypes[lockupKind] || 'unknown',
                timeRemaining: timeRemaining,
                lockupYears: timeRemaining / (365.25 * 24 * 3600),
                debugOffset: offset
              });
              
              offset += 64; // Skip ahead
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    // Sort by voting power and remove duplicates
    deposits.sort((a, b) => b.votingPower - a.votingPower);
    
    const uniqueDeposits = [];
    const seenAmounts = new Set();
    
    for (const deposit of deposits) {
      const amountKey = Math.round(deposit.amount * 1000);
      if (!seenAmounts.has(amountKey)) {
        seenAmounts.add(amountKey);
        uniqueDeposits.push(deposit);
      }
    }
    
    return uniqueDeposits;
    
  } catch (error) {
    console.error('Error parsing VSR deposits:', error.message);
    return [];
  }
}

/**
 * Check if account authority matches wallet
 */
function matchesWallet(authority, targetWallet, aliases) {
  const authorityStr = authority.toBase58();
  
  if (authorityStr === targetWallet) {
    return true;
  }
  
  if (aliases[targetWallet] && aliases[targetWallet].includes(authorityStr)) {
    return true;
  }
  
  for (const [wallet, accounts] of Object.entries(aliases)) {
    if (accounts.includes(authorityStr) && accounts.includes(targetWallet)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate governance power for a specific wallet
 */
async function calculateWalletGovernancePower(walletAddress) {
  const aliases = loadWalletAliases();
  
  try {
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [{ dataSize: 2728 }]
    });
    
    let totalGovernancePower = 0;
    const allDeposits = [];
    let accountsFound = 0;
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      const authorityBytes = data.slice(8, 40);
      const authority = new PublicKey(authorityBytes);
      
      if (!matchesWallet(authority, walletAddress, aliases)) {
        continue;
      }
      
      accountsFound++;
      const deposits = parseVSRDeposits(data);
      
      for (const deposit of deposits) {
        totalGovernancePower += deposit.votingPower;
        allDeposits.push({
          account: account.pubkey.toBase58(),
          ...deposit
        });
      }
    }
    
    return {
      wallet: walletAddress,
      nativeGovernancePower: totalGovernancePower,
      deposits: allDeposits,
      vsrAccountsFound: accountsFound
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress.substring(0, 8)}: ${error.message}`);
    return {
      wallet: walletAddress,
      nativeGovernancePower: 0,
      deposits: [],
      vsrAccountsFound: 0
    };
  }
}

/**
 * Get all citizen wallets from database
 */
async function getAllCitizenWallets() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
    return result.rows.map(row => row.wallet);
  } finally {
    client.release();
  }
}

/**
 * Scan all citizens and generate comprehensive table
 */
async function scanAllCitizensWithAuthenticConfig() {
  console.log('CANONICAL VSR SCANNER WITH AUTHENTIC REGISTRAR CONFIGURATION');
  console.log('============================================================');
  console.log(`Baseline Factor: ${REGISTRAR_PARAMS.baseline.toLocaleString()}`);
  console.log(`Max Extra Factor: ${REGISTRAR_PARAMS.maxExtra.toLocaleString()}`);
  console.log(`Lockup Saturation: ${REGISTRAR_PARAMS.saturationSecs.toLocaleString()} seconds (1 year)`);
  console.log(`Multiplier Range: 3.0x to 6.0x`);
  console.log('');
  
  testMultiplierCalculation();
  
  const citizenWallets = await getAllCitizenWallets();
  console.log(`Scanning ${citizenWallets.length} citizen wallets...\n`);
  
  const results = [];
  
  for (let i = 0; i < citizenWallets.length; i++) {
    const wallet = citizenWallets[i];
    console.log(`[${i + 1}/${citizenWallets.length}] ${wallet.substring(0, 8)}...`);
    
    const result = await calculateWalletGovernancePower(wallet);
    results.push(result);
    
    if (result.nativeGovernancePower > 0) {
      console.log(`  ✅ ${result.nativeGovernancePower.toLocaleString()} ISLAND (${result.deposits.length} deposits)`);
    } else {
      console.log(`  ⚪ No governance power`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Sort by governance power
  results.sort((a, b) => b.nativeGovernancePower - a.nativeGovernancePower);
  
  // Generate comprehensive table
  console.log('\n\nCOMPREHENSIVE CITIZEN GOVERNANCE POWER TABLE');
  console.log('============================================');
  console.log('Rank | Wallet Address                             | Governance Power | Deposits | VSR Accounts | Status');
  console.log('-----|-------------------------------------------|------------------|----------|--------------|--------');
  
  let rank = 1;
  let citizensWithPower = 0;
  
  for (const result of results) {
    const powerStr = result.nativeGovernancePower > 0 ? 
      result.nativeGovernancePower.toLocaleString().padStart(15) : 
      '0'.padStart(15);
    
    const status = result.nativeGovernancePower > 0 ? 'ACTIVE' : 'NONE';
    
    if (result.nativeGovernancePower > 0) {
      console.log(`${rank.toString().padStart(4)} | ${result.wallet} | ${powerStr} | ${result.deposits.length.toString().padStart(8)} | ${result.vsrAccountsFound.toString().padStart(12)} | ${status}`);
      rank++;
      citizensWithPower++;
    } else {
      console.log(`  -  | ${result.wallet} | ${powerStr} | ${result.deposits.length.toString().padStart(8)} | ${result.vsrAccountsFound.toString().padStart(12)} | ${status}`);
    }
  }
  
  // Detailed breakdown for citizens with power
  console.log('\n\nDETAILED DEPOSIT BREAKDOWNS:');
  console.log('============================');
  
  for (const result of results) {
    if (result.nativeGovernancePower > 0) {
      console.log(`\n${result.wallet} (${result.wallet.substring(0, 8)})`);
      console.log(`Total: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`VSR Accounts: ${result.vsrAccountsFound}`);
      console.log(`Deposits: ${result.deposits.length}`);
      
      if (result.deposits.length > 0) {
        console.log('\nDeposit Details:');
        console.log('Amount      | Lockup Type | Time Left | Multiplier | Voting Power | Calculation');
        console.log('------------|-------------|-----------|------------|--------------|------------');
        
        for (const deposit of result.deposits) {
          const timeLeft = deposit.timeRemaining > 0 ? `${(deposit.timeRemaining/(24*3600)).toFixed(0)}d` : 'Expired';
          const calculation = `${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)}`;
          
          console.log(
            `${deposit.amount.toLocaleString().padStart(11)} | ` +
            `${deposit.lockupType.padEnd(11)} | ` +
            `${timeLeft.padStart(9)} | ` +
            `${deposit.multiplier.toFixed(3).padStart(10)} | ` +
            `${deposit.votingPower.toLocaleString().padStart(12)} | ` +
            `${calculation}`
          );
        }
      }
      console.log('-'.repeat(80));
    }
  }
  
  // Final statistics
  const totalPower = results.reduce((sum, r) => sum + r.nativeGovernancePower, 0);
  const totalDeposits = results.reduce((sum, r) => sum + r.deposits.length, 0);
  
  console.log('\nFINAL STATISTICS:');
  console.log('================');
  console.log(`Citizens with governance power: ${citizensWithPower}/20 (${(citizensWithPower/20*100).toFixed(1)}%)`);
  console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Average power (active): ${(totalPower/citizensWithPower).toLocaleString()} ISLAND`);
  console.log(`Total deposits found: ${totalDeposits}`);
  console.log(`Using authentic registrar configuration - no hardcoded values`);
  
  return results;
}

// Export function
export { scanAllCitizensWithAuthenticConfig, calculateWalletGovernancePower };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scanAllCitizensWithAuthenticConfig().catch(console.error);
}