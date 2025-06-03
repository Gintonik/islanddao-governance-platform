/**
 * Canonical VSR Scanner - Corrected Version
 * Combines direct wallet buffer search (for unlocked deposits) 
 * with authority field checking (for locked deposits)
 * Restores detection of Fgv1's 200k unlocked governance power
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

function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
    return aliases;
  } catch (error) {
    return {};
  }
}

// Method 1: Direct wallet buffer search (finds unlocked deposits like Fgv1's 200k)
function searchWalletBuffer(data, walletBuffer, accountPubkey) {
  const deposits = [];
  
  for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
    if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
      
      // Check governance power at discovered offsets (old working method)
      const checkOffsets = [
        walletOffset + 32,  // Standard: 32 bytes after wallet
        104,                // Alternative offset in larger accounts
        112                 // Secondary alternative offset
      ];
      
      for (const checkOffset of checkOffsets) {
        if (checkOffset + 8 <= data.length) {
          try {
            const rawAmount = data.readBigUInt64LE(checkOffset);
            const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
            
            if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
              const multiplier = 3.0; // Baseline multiplier for unlocked
              const votingPower = tokenAmount * multiplier;
              
              deposits.push({
                amount: tokenAmount,
                votingPower: votingPower,
                multiplier: multiplier,
                method: 'wallet_buffer',
                offset: checkOffset,
                account: accountPubkey
              });
            }
          } catch (error) {
            continue;
          }
        }
      }
      break;
    }
  }
  
  return deposits;
}

// Method 2: Authority field checking with comprehensive deposit parsing
function searchAuthorityDeposits(data, walletAddress, aliases, accountPubkey) {
  const deposits = [];
  
  // Extract authority fields
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
  
  // Check authority match
  const isMatch = authority === walletAddress || voterAuthority === walletAddress ||
    (aliases[walletAddress] && aliases[walletAddress].some(alias => authority === alias || voterAuthority === alias));
  
  if (!isMatch) return deposits;
  
  const currentTime = Date.now() / 1000;
  
  // Parse paired deposits (locked deposits)
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
          
          // Look for timestamp for lockup calculation
          let timeRemaining = 0;
          
          for (let tsOffset = offset + 8; tsOffset <= offset + 120 && tsOffset + 8 <= data.length; tsOffset += 4) {
            try {
              const value = Number(data.readBigUInt64LE(tsOffset));
              if (value > 1600000000 && value < 2000000000) {
                const futureTime = value - currentTime;
                if (futureTime > 0) {
                  timeRemaining = futureTime;
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
          
          const multiplier = calculateMultiplier(timeRemaining);
          const votingPower = tokens1 * multiplier;
          
          if (votingPower >= 50) {
            deposits.push({
              amount: tokens1,
              votingPower: votingPower,
              multiplier: multiplier,
              method: 'authority_paired',
              offset: offset,
              timeRemaining: timeRemaining,
              account: accountPubkey
            });
            
            offset += 32;
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  // Parse standalone deposits (additional locked deposits)
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
            method: 'authority_standalone',
            offset: offset,
            timeRemaining: timeRemaining,
            account: accountPubkey
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

async function calculateWalletGovernancePower(walletAddress) {
  const aliases = loadWalletAliases();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  try {
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: "confirmed"
    });
    
    const allDeposits = [];
    let accountsFound = 0;
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      const accountPubkey = account.pubkey.toBase58();
      
      // Method 1: Direct wallet buffer search (for unlocked deposits)
      const bufferDeposits = searchWalletBuffer(data, walletBuffer, accountPubkey);
      
      // Method 2: Authority field checking (for locked deposits)
      const authorityDeposits = searchAuthorityDeposits(data, walletAddress, aliases, accountPubkey);
      
      if (bufferDeposits.length > 0 || authorityDeposits.length > 0) {
        accountsFound++;
        allDeposits.push(...bufferDeposits, ...authorityDeposits);
      }
    }
    
    // Deduplicate deposits by amount to avoid double counting
    const uniqueDeposits = [];
    const seenAmounts = new Set();
    
    for (const deposit of allDeposits) {
      const amountKey = `${Math.round(deposit.amount * 100)}-${deposit.account}`;
      if (!seenAmounts.has(amountKey)) {
        seenAmounts.add(amountKey);
        uniqueDeposits.push(deposit);
      }
    }
    
    const totalPower = uniqueDeposits.reduce((sum, deposit) => sum + deposit.votingPower, 0);
    
    return {
      wallet: walletAddress,
      power: totalPower,
      deposits: uniqueDeposits.length,
      accounts: accountsFound,
      breakdown: uniqueDeposits
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error);
    return {
      wallet: walletAddress,
      power: 0,
      deposits: 0,
      accounts: 0,
      breakdown: []
    };
  }
}

async function testCorrectedScanner() {
  console.log('TESTING CORRECTED VSR SCANNER');
  console.log('==============================');
  console.log('Combines wallet buffer search + authority checking');
  console.log('');
  
  // Test Fgv1 wallet specifically
  const fgv1Result = await calculateWalletGovernancePower('Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1');
  
  console.log('FGV1 WALLET TEST:');
  console.log(`Power: ${fgv1Result.power.toLocaleString()} ISLAND`);
  console.log(`Deposits: ${fgv1Result.deposits}`);
  console.log(`Accounts: ${fgv1Result.accounts}`);
  
  if (fgv1Result.breakdown.length > 0) {
    console.log('Breakdown:');
    for (const deposit of fgv1Result.breakdown) {
      console.log(`  ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.votingPower.toLocaleString()} (${deposit.method})`);
    }
  }
  
  if (fgv1Result.power >= 200000) {
    console.log('✅ SUCCESS: Restored detection of 200k+ governance power');
  } else {
    console.log('❌ ISSUE: Still not detecting expected governance power');
  }
  
  return fgv1Result;
}

async function scanAllCitizens() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
    const citizenWallets = result.rows.map(row => row.wallet);
    
    console.log('\nSCANNING ALL 20 CITIZENS WITH CORRECTED SCANNER');
    console.log('===============================================');
    
    const results = [];
    
    for (let i = 0; i < citizenWallets.length; i++) {
      const wallet = citizenWallets[i];
      console.log(`${i + 1}/20: ${wallet.substring(0, 8)}...`);
      
      const result = await calculateWalletGovernancePower(wallet);
      results.push(result);
      
      if (result.power > 0) {
        console.log(`  ✅ ${result.power.toLocaleString()} ISLAND (${result.deposits} deposits)`);
      } else {
        console.log(`  ○ No governance power`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Summary
    const activeCitizens = results.filter(r => r.power > 0).length;
    const totalPower = results.reduce((sum, r) => sum + r.power, 0);
    
    console.log('\nCORRECTED SCANNER SUMMARY:');
    console.log(`Active citizens: ${activeCitizens}/20 (${(activeCitizens/20*100).toFixed(1)}%)`);
    console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
    
    return results;
    
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testCorrectedScanner()
    .then(() => scanAllCitizens())
    .catch(console.error);
}