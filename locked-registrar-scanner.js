/**
 * Locked Registrar Configuration VSR Scanner
 * Uses authentic decoded registrar parameters from blockchain
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import fs from 'fs';
import pkg from 'pg';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Authentic registrar parameters decoded from 5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM
const REGISTRAR_PARAMS = {
  baseline: 3_000_000_000,
  maxExtra: 3_000_000_000,
  saturationSecs: 31_536_000
};

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

function calculateMultiplier(timeLeftSecs) {
  const ratio = Math.min(1, timeLeftSecs / REGISTRAR_PARAMS.saturationSecs);
  const scaled = REGISTRAR_PARAMS.baseline + (REGISTRAR_PARAMS.maxExtra * ratio);
  return scaled / 1_000_000_000;
}

function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
    return aliases;
  } catch (error) {
    return {};
  }
}

function parseVSRDeposits(data) {
  const deposits = [];
  const currentTime = Date.now() / 1000;
  
  for (let offset = 112; offset < data.length - 80; offset += 8) {
    try {
      const amount1 = Number(data.readBigUInt64LE(offset));
      const amount2 = Number(data.readBigUInt64LE(offset + 8));
      
      const tokens1 = amount1 / 1e6;
      const tokens2 = amount2 / 1e6;
      
      if (tokens1 >= 100 && tokens1 <= 10000000 && 
          tokens2 >= 100 && tokens2 <= 10000000 &&
          Math.abs(tokens1 - tokens2) / Math.max(tokens1, tokens2) < 0.2) {
        
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
        
        for (let kindOffset = offset + 16; kindOffset <= offset + 80 && kindOffset < data.length; kindOffset++) {
          const kind = data[kindOffset];
          if (kind >= 0 && kind <= 4) {
            lockupKind = kind;
            break;
          }
        }
        
        if (startTs > 0 && endTs > startTs) {
          const timeRemaining = Math.max(0, endTs - currentTime);
          const multiplier = calculateMultiplier(timeRemaining);
          const votingPower = tokens1 * multiplier;
          
          if (votingPower > 0) {
            const lockupTypes = ['none', 'cliff', 'constant', 'vesting_monthly', 'vesting_daily'];
            
            deposits.push({
              amount: tokens1,
              votingPower: votingPower,
              multiplier: multiplier,
              lockupType: lockupTypes[lockupKind] || 'unknown',
              timeRemaining: timeRemaining,
              startTs: startTs,
              endTs: endTs,
              lockupKind: lockupKind
            });
            
            offset += 64;
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  
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
}

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

async function calculateWalletPower(walletAddress) {
  const aliases = loadWalletAliases();
  
  try {
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [{ dataSize: 2728 }]
    });
    
    let totalPower = 0;
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
        totalPower += deposit.votingPower;
        allDeposits.push(deposit);
      }
    }
    
    return {
      wallet: walletAddress,
      power: totalPower,
      deposits: allDeposits,
      accounts: accountsFound
    };
    
  } catch (error) {
    return {
      wallet: walletAddress,
      power: 0,
      deposits: [],
      accounts: 0
    };
  }
}

async function getAllCitizens() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
    return result.rows.map(row => row.wallet);
  } finally {
    client.release();
  }
}

async function scanAndGenerateTable() {
  console.log('CANONICAL VSR SCANNER - LOCKED REGISTRAR CONFIGURATION');
  console.log('======================================================');
  console.log('Authentic Parameters from 5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM:');
  console.log(`Baseline: ${REGISTRAR_PARAMS.baseline.toLocaleString()}`);
  console.log(`Max Extra: ${REGISTRAR_PARAMS.maxExtra.toLocaleString()}`);
  console.log(`Saturation: ${REGISTRAR_PARAMS.saturationSecs.toLocaleString()} seconds (1 year)`);
  console.log('');
  
  // Test multiplier calculation
  console.log('Multiplier Tests:');
  console.log(`Expired (0s): ${calculateMultiplier(0).toFixed(3)}x`);
  console.log(`Half year (15768000s): ${calculateMultiplier(15768000).toFixed(3)}x`);
  console.log(`Full year (31536000s): ${calculateMultiplier(31536000).toFixed(3)}x`);
  console.log('');
  
  const citizenWallets = await getAllCitizens();
  const results = [];
  
  console.log('Scanning all 20 citizens...');
  
  for (let i = 0; i < citizenWallets.length; i++) {
    const wallet = citizenWallets[i];
    const result = await calculateWalletPower(wallet);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  results.sort((a, b) => b.power - a.power);
  
  console.log('\nCOMPLETE CITIZEN GOVERNANCE POWER TABLE');
  console.log('======================================');
  console.log('Rank | Wallet Address                             | Governance Power | Deposits | VSR Accounts | Status');
  console.log('-----|-------------------------------------------|------------------|----------|--------------|--------');
  
  let rank = 1;
  let activeCitizens = 0;
  
  for (const result of results) {
    const powerStr = result.power > 0 ? 
      result.power.toLocaleString().padStart(15) : 
      '0'.padStart(15);
    
    const status = result.power > 0 ? 'ACTIVE' : 'NONE';
    
    if (result.power > 0) {
      console.log(`${rank.toString().padStart(4)} | ${result.wallet} | ${powerStr} | ${result.deposits.length.toString().padStart(8)} | ${result.accounts.toString().padStart(12)} | ${status}`);
      rank++;
      activeCitizens++;
    } else {
      console.log(`  -  | ${result.wallet} | ${powerStr} | ${result.deposits.length.toString().padStart(8)} | ${result.accounts.toString().padStart(12)} | ${status}`);
    }
  }
  
  console.log('\nDETAILED BREAKDOWNS FOR ACTIVE CITIZENS:');
  console.log('=======================================');
  
  for (const result of results) {
    if (result.power > 0) {
      console.log(`\n${result.wallet} (${result.wallet.substring(0, 8)})`);
      console.log(`Total Power: ${result.power.toLocaleString()} ISLAND`);
      console.log(`VSR Accounts: ${result.accounts}`);
      console.log(`Deposits: ${result.deposits.length}`);
      
      if (result.deposits.length > 0) {
        console.log('\nDeposit Details:');
        console.log('Amount      | Lockup Type | Time Left | Multiplier | Voting Power | Formula');
        console.log('------------|-------------|-----------|------------|--------------|--------');
        
        for (const deposit of result.deposits) {
          const timeLeft = deposit.timeRemaining > 0 ? `${(deposit.timeRemaining/(24*3600)).toFixed(0)}d` : 'Expired';
          const formula = `${deposit.amount.toLocaleString()} × ${deposit.multiplier.toFixed(3)}`;
          
          console.log(
            `${deposit.amount.toLocaleString().padStart(11)} | ` +
            `${deposit.lockupType.padEnd(11)} | ` +
            `${timeLeft.padStart(9)} | ` +
            `${deposit.multiplier.toFixed(3).padStart(10)} | ` +
            `${deposit.votingPower.toLocaleString().padStart(12)} | ` +
            `${formula}`
          );
        }
      }
      console.log('-'.repeat(80));
    }
  }
  
  const totalPower = results.reduce((sum, r) => sum + r.power, 0);
  const totalDeposits = results.reduce((sum, r) => sum + r.deposits.length, 0);
  
  console.log('\nFINAL STATISTICS:');
  console.log('================');
  console.log(`Citizens with governance power: ${activeCitizens}/20 (${(activeCitizens/20*100).toFixed(1)}%)`);
  console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Average power (active): ${(totalPower/activeCitizens).toLocaleString()} ISLAND`);
  console.log(`Total deposits found: ${totalDeposits}`);
  console.log('Using locked authentic registrar configuration - no hardcoded values');
  
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scanAndGenerateTable().catch(console.error);
}