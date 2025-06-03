/**
 * Debug Voter Account Structure
 * Investigate why 2728-byte account parsing isn't finding expected deposits
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const TARGET_WALLET = "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC";
const EXPECTED_DEPOSITS = [310472.9693, 126344.82227];

async function debugVoterAccountStructure() {
  console.log('DEBUGGING VOTER ACCOUNT STRUCTURE');
  console.log('=================================');
  
  // Get all accounts for kruHL3zJ
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`Total VSR accounts: ${allAccounts.length}`);
  
  // Filter for 2728-byte accounts
  const voterAccounts = allAccounts.filter(({ account }) => account.data.length === 2728);
  console.log(`2728-byte Voter accounts: ${voterAccounts.length}`);
  
  // Find kruHL3zJ accounts
  let kruhlAccounts = [];
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 104) continue;
    
    try {
      const authority = new PublicKey(data.slice(8, 40)).toBase58();
      const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      
      if (authority === TARGET_WALLET || voterAuthority === TARGET_WALLET) {
        kruhlAccounts.push({
          pubkey: pubkey.toBase58(),
          authority,
          voterAuthority,
          size: data.length,
          data
        });
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\nFound ${kruhlAccounts.length} accounts related to kruHL3zJ:`);
  
  for (const account of kruhlAccounts) {
    console.log(`\nAccount: ${account.pubkey.substring(0,8)}`);
    console.log(`  Size: ${account.size} bytes`);
    console.log(`  Authority: ${account.authority.substring(0,8)}`);
    console.log(`  VoterAuthority: ${account.voterAuthority.substring(0,8)}`);
    console.log(`  Authority matches kruHL3zJ: ${account.authority === TARGET_WALLET}`);
    
    // Search for expected deposits at all offsets
    const data = account.data;
    let foundDeposits = [];
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(offset));
        if (rawAmount > 0) {
          const amount = rawAmount / 1e6;
          
          for (const expectedAmount of EXPECTED_DEPOSITS) {
            if (Math.abs(amount - expectedAmount) < 0.01) {
              foundDeposits.push({
                amount,
                expectedAmount,
                offset,
                rawAmount
              });
              
              console.log(`  ✅ Found expected deposit ${expectedAmount} at offset ${offset}`);
              
              // Try to parse deposit entry structure around this offset
              if (offset >= 24 && offset + 48 <= data.length) {
                try {
                  const isUsedOffset = offset - 16; // isUsed is typically 16 bytes before amount
                  const isUsed = isUsedOffset >= 0 ? data[isUsedOffset] : 'unknown';
                  const lockupKind = data[offset + 24] || 0;
                  const lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
                  
                  console.log(`    isUsed (offset ${isUsedOffset}): ${isUsed}`);
                  console.log(`    lockupKind: ${lockupKind}`);
                  console.log(`    lockupEndTs: ${lockupEndTs}`);
                } catch (e) {
                  console.log(`    Could not parse lockup data: ${e.message}`);
                }
              }
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    if (account.size === 2728 && account.authority === TARGET_WALLET) {
      console.log(`\n  Analyzing 2728-byte structure for deposit entries...`);
      
      // Try different starting offsets for deposit entries
      const possibleStartOffsets = [104, 136, 168, 200];
      
      for (const startOffset of possibleStartOffsets) {
        console.log(`\n  Trying deposit entries starting at offset ${startOffset}:`);
        
        for (let i = 0; i < 5; i++) { // Check first 5 entries
          const entryOffset = startOffset + (i * 87);
          if (entryOffset + 87 > data.length) break;
          
          try {
            // Check different positions for isUsed flag
            const isUsedPositions = [24, 32, 40];
            const amountPositions = [8, 16, 24];
            
            for (const isUsedPos of isUsedPositions) {
              for (const amountPos of amountPositions) {
                if (entryOffset + amountPos + 8 <= data.length && entryOffset + isUsedPos < data.length) {
                  const isUsed = data[entryOffset + isUsedPos];
                  const rawAmount = Number(data.readBigUInt64LE(entryOffset + amountPos));
                  const amount = rawAmount / 1e6;
                  
                  if (isUsed === 1 && amount > 1000) {
                    console.log(`    Entry ${i}: isUsed=${isUsed} (offset +${isUsedPos}), amount=${amount.toFixed(3)} (offset +${amountPos})`);
                    
                    // Check if this matches expected deposits
                    for (const expected of EXPECTED_DEPOSITS) {
                      if (Math.abs(amount - expected) < 0.01) {
                        console.log(`      ✅ MATCHES expected ${expected}!`);
                      }
                    }
                  }
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
    }
  }
  
  console.log(`\n\nSUMMARY:`);
  console.log(`Found ${kruhlAccounts.length} accounts for kruHL3zJ`);
  console.log(`2728-byte accounts: ${kruhlAccounts.filter(a => a.size === 2728).length}`);
  console.log(`Authority matches: ${kruhlAccounts.filter(a => a.authority === TARGET_WALLET).length}`);
  
  const totalFoundDeposits = kruhlAccounts.reduce((total, account) => {
    let count = 0;
    const data = account.data;
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
        for (const expected of EXPECTED_DEPOSITS) {
          if (Math.abs(amount - expected) < 0.01) count++;
        }
      } catch (error) {
        continue;
      }
    }
    return total + count;
  }, 0);
  
  console.log(`Total expected deposits found: ${totalFoundDeposits}`);
  
  if (totalFoundDeposits === 0) {
    console.log('\n❌ NO EXPECTED DEPOSITS FOUND');
    console.log('This suggests the Voter account structure parsing needs adjustment.');
  } else {
    console.log('\n✅ Expected deposits found, but struct parsing may be incorrect.');
  }
}

debugVoterAccountStructure()
  .then(() => {
    console.log('\nVoter account structure debugging completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });