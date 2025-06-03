/**
 * Investigate What Changed - Fgv1 Detection Analysis
 * Compare old working method vs new method that lost detection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);
const TARGET_WALLET = 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1';

// OLD WORKING METHOD: Direct wallet buffer search
async function oldWorkingMethod(walletAddress) {
  console.log('=== OLD WORKING METHOD ===');
  console.log('Searches for wallet buffer directly in VSR account data');
  
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  const governanceAmounts = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
    // Search for wallet reference in account data
    for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
      if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
        console.log(`Found wallet buffer at offset ${walletOffset} in account ${account.pubkey.toBase58()}`);
        
        // Check governance power at discovered offsets
        const checkOffsets = [
          walletOffset + 32,  // Standard: 32 bytes after wallet
          104,                // Alternative offset in larger accounts
          112                 // Secondary alternative offset
        ];
        
        for (const checkOffset of checkOffsets) {
          if (checkOffset + 8 <= data.length) {
            try {
              const rawAmount = data.readBigUInt64LE(checkOffset);
              const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // 6 decimals
              
              // Filter for realistic governance amounts
              if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                console.log(`  Found amount: ${tokenAmount.toLocaleString()} ISLAND at offset ${checkOffset}`);
                governanceAmounts.push({
                  amount: tokenAmount,
                  account: account.pubkey.toString(),
                  offset: checkOffset
                });
              }
            } catch (error) {
              continue;
            }
          }
        }
        break; // Move to next account
      }
    }
  }
  
  const uniqueAmounts = new Map();
  for (const item of governanceAmounts) {
    const key = `${item.account}-${item.offset}`;
    uniqueAmounts.set(key, item.amount);
  }
  
  const totalPower = Array.from(uniqueAmounts.values()).reduce((sum, amount) => sum + amount, 0);
  console.log(`Old method total: ${totalPower.toLocaleString()} ISLAND`);
  return { totalPower, deposits: governanceAmounts };
}

// NEW METHOD: Authority field checking
async function newMethod(walletAddress) {
  console.log('\n=== NEW METHOD ===');
  console.log('Checks authority/voterAuthority fields in VSR account structure');
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  const governanceAmounts = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
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
    
    // Check if either authority matches target wallet
    if (authority === walletAddress || voterAuthority === walletAddress) {
      console.log(`Authority match found in account ${account.pubkey.toBase58()}`);
      console.log(`  Authority: ${authority}`);
      console.log(`  VoterAuthority: ${voterAuthority}`);
      
      // Parse deposits using comprehensive method
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
              console.log(`  Found deposit: ${tokens1.toLocaleString()} ISLAND at offset ${offset}`);
              governanceAmounts.push({
                amount: tokens1,
                account: account.pubkey.toString(),
                offset: offset
              });
              offset += 32;
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  const totalPower = governanceAmounts.reduce((sum, item) => sum + item.amount, 0);
  console.log(`New method total: ${totalPower.toLocaleString()} ISLAND`);
  return { totalPower, deposits: governanceAmounts };
}

// HYBRID METHOD: Combine both approaches
async function hybridMethod(walletAddress) {
  console.log('\n=== HYBRID METHOD ===');
  console.log('Uses both wallet buffer search AND authority field checking');
  
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  const governanceAmounts = [];
  const foundAccounts = new Set();
  
  // Method 1: Direct wallet buffer search (old working method)
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
    for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
      if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
        foundAccounts.add(account.pubkey.toBase58());
        console.log(`Buffer match found in account ${account.pubkey.toBase58()}`);
        
        const checkOffsets = [walletOffset + 32, 104, 112];
        
        for (const checkOffset of checkOffsets) {
          if (checkOffset + 8 <= data.length) {
            try {
              const rawAmount = data.readBigUInt64LE(checkOffset);
              const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
              
              if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                console.log(`  Buffer method found: ${tokenAmount.toLocaleString()} ISLAND`);
                governanceAmounts.push({
                  amount: tokenAmount,
                  account: account.pubkey.toString(),
                  offset: checkOffset,
                  method: 'buffer'
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
  }
  
  // Method 2: Authority field checking (new method)
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    
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
    
    if (authority === walletAddress || voterAuthority === walletAddress) {
      if (!foundAccounts.has(account.pubkey.toBase58())) {
        foundAccounts.add(account.pubkey.toBase58());
        console.log(`Authority match found in account ${account.pubkey.toBase58()}`);
        
        for (let offset = 100; offset < data.length - 80; offset += 8) {
          try {
            const amount1 = Number(data.readBigUInt64LE(offset));
            const tokens1 = amount1 / 1e6;
            
            if (tokens1 >= 1000 && tokens1 <= 10000000) {
              console.log(`  Authority method found: ${tokens1.toLocaleString()} ISLAND`);
              governanceAmounts.push({
                amount: tokens1,
                account: account.pubkey.toString(),
                offset: offset,
                method: 'authority'
              });
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }
    }
  }
  
  const totalPower = governanceAmounts.reduce((sum, item) => sum + item.amount, 0);
  console.log(`Hybrid method total: ${totalPower.toLocaleString()} ISLAND`);
  return { totalPower, deposits: governanceAmounts };
}

async function investigateChange() {
  console.log(`INVESTIGATING FGVL DETECTION CHANGE`);
  console.log(`===================================`);
  console.log(`Target: ${TARGET_WALLET}`);
  console.log(`Expected: ~200k unlocked ISLAND governance power`);
  console.log('');
  
  const oldResult = await oldWorkingMethod(TARGET_WALLET);
  const newResult = await newMethod(TARGET_WALLET);
  const hybridResult = await hybridMethod(TARGET_WALLET);
  
  console.log('\n=== COMPARISON RESULTS ===');
  console.log(`Old working method: ${oldResult.totalPower.toLocaleString()} ISLAND (${oldResult.deposits.length} deposits)`);
  console.log(`New method: ${newResult.totalPower.toLocaleString()} ISLAND (${newResult.deposits.length} deposits)`);
  console.log(`Hybrid method: ${hybridResult.totalPower.toLocaleString()} ISLAND (${hybridResult.deposits.length} deposits)`);
  
  console.log('\n=== ANALYSIS ===');
  
  if (oldResult.totalPower > 0 && newResult.totalPower === 0) {
    console.log('❌ PROBLEM IDENTIFIED: New authority-based method lost detection');
    console.log('🔍 REASON: Fgv1 wallet is not stored in VSR authority fields');
    console.log('✅ SOLUTION: Must use direct wallet buffer search to find unlocked deposits');
  }
  
  if (hybridResult.totalPower > newResult.totalPower) {
    console.log('💡 HYBRID APPROACH NEEDED: Combination detects more governance power');
  }
  
  return {
    oldMethod: oldResult,
    newMethod: newResult,
    hybridMethod: hybridResult
  };
}

investigateChange().catch(console.error);