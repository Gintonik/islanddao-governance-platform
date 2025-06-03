/**
 * Final Citizen Governance Power Table
 * Complete list of all 20 citizens with their governance power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import fs from 'fs';
import pkg from 'pg';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Authentic registrar parameters
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

function extractDualAuthorities(data) {
  let authority = null;
  let voterAuthority = null;
  
  try {
    if (data.length >= 40) {
      authority = new PublicKey(data.slice(8, 40)).toBase58();
    }
  } catch (e) {}
  
  try {
    if (data.length >= 104) {
      voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    }
  } catch (e) {}
  
  return { authority, voterAuthority };
}

function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
    return aliases;
  } catch (error) {
    return {};
  }
}

function isAuthorityMatch(authorities, wallet, aliases) {
  const { authority, voterAuthority } = authorities;
  
  if (authority === wallet || voterAuthority === wallet) {
    return true;
  }
  
  if (aliases[wallet]) {
    for (const alias of aliases[wallet]) {
      if (authority === alias || voterAuthority === alias) {
        return true;
      }
    }
  }
  
  for (const [mainWallet, walletAliases] of Object.entries(aliases)) {
    if (walletAliases.includes(wallet)) {
      if (authority === mainWallet || voterAuthority === mainWallet) {
        return true;
      }
      for (const alias of walletAliases) {
        if (authority === alias || voterAuthority === alias) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function parseVSRDepositsComprehensive(data) {
  const deposits = [];
  const currentTime = Date.now() / 1000;
  
  for (let offset = 100; offset < data.length - 80; offset += 8) {
    try {
      const amount1 = Number(data.readBigUInt64LE(offset));
      const amount2 = Number(data.readBigUInt64LE(offset + 8));
      
      const tokens1 = amount1 / 1e6;
      const tokens2 = amount2 / 1e6;
      
      if (tokens1 >= 50 && tokens1 <= 10000000 && 
          tokens2 >= 50 && tokens2 <= 10000000) {
        
        const tolerance = Math.abs(tokens1 - tokens2) / Math.max(tokens1, tokens2);
        if (tolerance < 0.3) {
          
          let startTs = 0;
          let endTs = 0;
          let lockupKind = 0;
          
          for (let tsOffset = offset + 8; tsOffset <= offset + 120 && tsOffset + 8 <= data.length; tsOffset += 4) {
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
          
          for (let kindOffset = offset; kindOffset <= offset + 120 && kindOffset < data.length; kindOffset++) {
            const kind = data[kindOffset];
            if (kind >= 0 && kind <= 4) {
              lockupKind = kind;
              break;
            }
          }
          
          const timeRemaining = Math.max(0, endTs - currentTime);
          const multiplier = calculateMultiplier(timeRemaining);
          const votingPower = tokens1 * multiplier;
          
          if (votingPower >= 50) {
            deposits.push({
              amount: tokens1,
              votingPower: votingPower,
              multiplier: multiplier,
              timeRemaining: timeRemaining
            });
            
            offset += 32;
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  for (let offset = 40; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const tokens = value / 1e6;
      
      if (tokens >= 1000 && tokens <= 10000000) {
        const alreadyFound = deposits.some(d => Math.abs(d.amount - tokens) < tokens * 0.05);
        
        if (!alreadyFound) {
          let timeRemaining = 0;
          
          for (let scanOffset = offset - 64; scanOffset <= offset + 64 && scanOffset + 8 <= data.length; scanOffset += 8) {
            if (scanOffset < 0) continue;
            try {
              const timestamp = Number(data.readBigUInt64LE(scanOffset));
              if (timestamp > Date.now() / 1000 && timestamp < 2000000000) {
                timeRemaining = Math.max(0, timestamp - Date.now() / 1000);
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          const multiplier = calculateMultiplier(timeRemaining);
          const votingPower = tokens * multiplier;
          
          deposits.push({
            amount: tokens,
            votingPower: votingPower,
            multiplier: multiplier,
            timeRemaining: timeRemaining
          });
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
    const amountKey = Math.round(deposit.amount * 100);
    if (!seenAmounts.has(amountKey)) {
      seenAmounts.add(amountKey);
      uniqueDeposits.push(deposit);
    }
  }
  
  return uniqueDeposits;
}

async function calculateWalletPower(walletAddress) {
  const aliases = loadWalletAliases();
  
  try {
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: "confirmed"
    });
    
    let totalPower = 0;
    const allDeposits = [];
    let accountsFound = 0;
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      const authorities = extractDualAuthorities(data);
      
      if (!isAuthorityMatch(authorities, walletAddress, aliases)) {
        continue;
      }
      
      accountsFound++;
      const deposits = parseVSRDepositsComprehensive(data);
      
      for (const deposit of deposits) {
        totalPower += deposit.votingPower;
        allDeposits.push(deposit);
      }
    }
    
    return {
      wallet: walletAddress,
      power: totalPower,
      deposits: allDeposits.length,
      accounts: accountsFound
    };
    
  } catch (error) {
    return {
      wallet: walletAddress,
      power: 0,
      deposits: 0,
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

async function generateFinalTable() {
  console.log('FINAL CITIZEN GOVERNANCE POWER TABLE');
  console.log('====================================');
  console.log('');
  
  const citizenWallets = await getAllCitizens();
  const results = [];
  
  console.log('Scanning all 20 citizens...');
  
  for (let i = 0; i < citizenWallets.length; i++) {
    const wallet = citizenWallets[i];
    console.log(`Processing ${i + 1}/20: ${wallet.substring(0, 8)}...`);
    
    const result = await calculateWalletPower(wallet);
    results.push(result);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  results.sort((a, b) => b.power - a.power);
  
  console.log('\nCOMPLETE CITIZEN GOVERNANCE POWER TABLE');
  console.log('=======================================');
  console.log('Rank | Wallet Address                             | Governance Power (ISLAND) | Deposits | VSR Accounts | Status');
  console.log('-----|-------------------------------------------|----------------------------|----------|--------------|--------');
  
  let rank = 1;
  let activeCitizens = 0;
  
  for (const result of results) {
    const powerStr = result.power > 0 ? 
      result.power.toLocaleString().padStart(25) : 
      '0'.padStart(25);
    
    const status = result.power > 0 ? 'ACTIVE' : 'NONE';
    
    if (result.power > 0) {
      console.log(`${rank.toString().padStart(4)} | ${result.wallet} | ${powerStr} | ${result.deposits.toString().padStart(8)} | ${result.accounts.toString().padStart(12)} | ${status}`);
      rank++;
      activeCitizens++;
    } else {
      console.log(`  -  | ${result.wallet} | ${powerStr} | ${result.deposits.toString().padStart(8)} | ${result.accounts.toString().padStart(12)} | ${status}`);
    }
  }
  
  const totalPower = results.reduce((sum, r) => sum + r.power, 0);
  const totalDeposits = results.reduce((sum, r) => sum + r.deposits, 0);
  
  console.log('\nSUMMARY STATISTICS');
  console.log('==================');
  console.log(`Citizens with governance power: ${activeCitizens}/20 (${(activeCitizens/20*100).toFixed(1)}%)`);
  console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Average power (active): ${activeCitizens > 0 ? (totalPower/activeCitizens).toLocaleString() : '0'} ISLAND`);
  console.log(`Total deposits: ${totalDeposits}`);
  console.log(`Using authentic registrar configuration with comprehensive scanning`);
  
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateFinalTable().catch(console.error);
}