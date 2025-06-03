/**
 * Debug kruHL3zJ Deposit Detection
 * Investigate why expected deposits are not being found
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const TARGET_WALLET = "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC";
const EXPECTED_DEPOSITS = [310472.9693, 126344.82227];

/**
 * Search for deposits using all known parsing methods
 */
function findDepositsAllMethods(data, walletAddress) {
  const foundDeposits = [];
  
  console.log(`Analyzing ${data.length}-byte account for ${walletAddress.substring(0,8)}`);
  
  // Method 1: Parse authority/voterAuthority first
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    
    console.log(`  Authority: ${authority.substring(0,8)}`);
    console.log(`  VoterAuthority: ${voterAuthority.substring(0,8)}`);
    console.log(`  Target: ${walletAddress.substring(0,8)}`);
    console.log(`  Authority matches: ${authority === walletAddress}`);
    console.log(`  VoterAuthority matches: ${voterAuthority === walletAddress}`);
  } catch (error) {
    console.log(`  Failed to parse authorities: ${error.message}`);
  }
  
  // Method 2: Scan for expected deposit amounts at all offsets
  console.log(`  Scanning for expected deposits: ${EXPECTED_DEPOSITS.join(', ')}`);
  
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const rawAmount = Number(data.readBigUInt64LE(offset));
      if (rawAmount > 0) {
        const amount = rawAmount / 1e6;
        
        // Check if this matches any expected deposit
        for (const expectedAmount of EXPECTED_DEPOSITS) {
          if (Math.abs(amount - expectedAmount) < 0.01) {
            console.log(`  ✅ FOUND expected deposit ${expectedAmount} at offset ${offset}: ${amount}`);
            
            // Try to extract lockup data
            let lockupKind = 0;
            let lockupEndTs = 0;
            
            if (offset + 48 <= data.length) {
              try {
                lockupKind = data[offset + 24];
                lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
                console.log(`    Lockup kind: ${lockupKind}, End timestamp: ${lockupEndTs}`);
              } catch (e) {
                console.log(`    Could not extract lockup data: ${e.message}`);
              }
            }
            
            foundDeposits.push({
              amount,
              expectedAmount,
              offset,
              lockupKind,
              lockupEndTs,
              rawAmount
            });
          }
        }
        
        // Also check for any large amounts that might be relevant
        if (amount >= 10000) {
          console.log(`  Large amount found at offset ${offset}: ${amount.toFixed(3)} ISLAND`);
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return foundDeposits;
}

/**
 * Analyze all VSR accounts for kruHL3zJ
 */
async function debugKruhlDeposits() {
  console.log('DEBUGGING kruHL3zJ DEPOSIT DETECTION');
  console.log('===================================');
  console.log(`Target wallet: ${TARGET_WALLET}`);
  console.log(`Expected deposits: ${EXPECTED_DEPOSITS.join(', ')} ISLAND`);
  
  // Load all VSR accounts
  const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`\nLoaded ${programAccounts.length} VSR accounts`);
  
  let relevantAccounts = 0;
  let totalFoundDeposits = [];
  
  for (const { pubkey, account } of programAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      // Check if this account is relevant to kruHL3zJ
      if (authority === TARGET_WALLET || voterAuthority === TARGET_WALLET) {
        relevantAccounts++;
        console.log(`\nRelevant Account #${relevantAccounts}: ${pubkey.toBase58()}`);
        
        const foundDeposits = findDepositsAllMethods(data, TARGET_WALLET);
        
        if (foundDeposits.length > 0) {
          totalFoundDeposits.push(...foundDeposits);
          console.log(`  Found ${foundDeposits.length} expected deposits in this account`);
        } else {
          console.log(`  No expected deposits found in this account`);
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\nSUMMARY:`);
  console.log(`========`);
  console.log(`Relevant accounts for kruHL3zJ: ${relevantAccounts}`);
  console.log(`Total expected deposits found: ${totalFoundDeposits.length}/${EXPECTED_DEPOSITS.length}`);
  
  if (totalFoundDeposits.length > 0) {
    console.log(`\nFound deposits:`);
    for (const deposit of totalFoundDeposits) {
      console.log(`  ${deposit.amount.toFixed(3)} ISLAND (expected: ${deposit.expectedAmount})`);
      console.log(`    Offset: ${deposit.offset}, Lockup: ${deposit.lockupKind}, End: ${deposit.lockupEndTs}`);
    }
  } else {
    console.log(`\n❌ NO EXPECTED DEPOSITS FOUND`);
    console.log(`This suggests:`);
    console.log(`1. Deposits may have been withdrawn/moved`);
    console.log(`2. Parsing logic may need adjustment`);
    console.log(`3. Account structure may be different than expected`);
  }
  
  // Additional analysis: Check if deposits exist but under different authority
  console.log(`\nADDITIONAL ANALYSIS:`);
  console.log(`===================`);
  console.log(`Scanning ALL accounts for expected deposit amounts...`);
  
  let globalFoundDeposits = 0;
  
  for (const { pubkey, account } of programAccounts) {
    const data = account.data;
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          
          for (const expectedAmount of EXPECTED_DEPOSITS) {
            if (Math.abs(amount - expectedAmount) < 0.01) {
              globalFoundDeposits++;
              
              try {
                const authority = new PublicKey(data.slice(8, 40)).toBase58();
                const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
                
                console.log(`  Found ${expectedAmount} ISLAND in account ${pubkey.toBase58().substring(0,8)}`);
                console.log(`    Authority: ${authority.substring(0,8)}`);
                console.log(`    VoterAuthority: ${voterAuthority.substring(0,8)}`);
                console.log(`    Offset: ${offset}, Account size: ${data.length}`);
              } catch (e) {
                console.log(`  Found ${expectedAmount} ISLAND in account ${pubkey.toBase58().substring(0,8)} (parsing error)`);
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  console.log(`\nGlobal scan found ${globalFoundDeposits} instances of expected deposit amounts`);
}

debugKruhlDeposits()
  .then(() => {
    console.log('\nDeposit debugging completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });