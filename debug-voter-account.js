/**
 * Debug Voter Account Search
 * Investigate why Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1 isn't found
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const TARGET_WALLET = "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1";

async function debugVoterAccountSearch() {
  console.log('🔍 DEBUGGING VOTER ACCOUNT SEARCH');
  console.log('=================================');
  console.log(`Target wallet: ${TARGET_WALLET}`);
  console.log(`VSR Program: ${VSR_PROGRAM_ID.toBase58()}`);
  
  try {
    // Try different search strategies
    console.log('\n1. Search for 2728-byte accounts with wallet at offset 40:');
    const voterAccounts1 = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 40, bytes: TARGET_WALLET } }
      ]
    });
    console.log(`   Found ${voterAccounts1.length} accounts`);
    
    console.log('\n2. Search for any 2728-byte accounts:');
    const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [{ dataSize: 2728 }]
    });
    console.log(`   Found ${allVoterAccounts.length} total 2728-byte accounts`);
    
    console.log('\n3. Search for ALL VSR accounts containing wallet:');
    const allAccountsWithWallet = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: TARGET_WALLET } }
      ]
    });
    console.log(`   Found ${allAccountsWithWallet.length} accounts with wallet at offset 0`);
    
    // Try different offsets
    for (let offset of [8, 16, 24, 32, 40, 48, 56, 64, 72, 80]) {
      try {
        const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
          filters: [
            { memcmp: { offset: offset, bytes: TARGET_WALLET } }
          ]
        });
        if (accounts.length > 0) {
          console.log(`   Found ${accounts.length} accounts with wallet at offset ${offset}`);
          for (const { pubkey, account } of accounts) {
            console.log(`     - ${pubkey.toBase58()} (${account.data.length} bytes)`);
          }
        }
      } catch (error) {
        // Skip invalid offsets
      }
    }
    
    console.log('\n4. Check if we have ANY accounts for this wallet:');
    
    // Get all accounts owned by the wallet itself
    const walletAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: TARGET_WALLET } }
      ]
    });
    
    console.log(`   Wallet-owned VSR accounts: ${walletAccounts.length}`);
    
    // Look for 176-byte accounts we know work
    const vwrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 176 },
        { memcmp: { offset: 72, bytes: TARGET_WALLET } }
      ]
    });
    
    console.log(`   176-byte VWR accounts: ${vwrAccounts.length}`);
    
    if (vwrAccounts.length > 0) {
      console.log('\n   VWR Account Details:');
      for (const { pubkey, account } of vwrAccounts) {
        console.log(`     - ${pubkey.toBase58()}`);
        const powerRaw = Number(account.data.readBigUInt64LE(104));
        const power = powerRaw / 1e6;
        console.log(`       Power: ${power.toLocaleString()} ISLAND`);
      }
    }
    
    // Check all account sizes for this wallet
    console.log('\n5. All VSR account sizes for this wallet:');
    const allSizes = new Set();
    
    for (let offset = 0; offset <= 100; offset += 8) {
      try {
        const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
          filters: [
            { memcmp: { offset: offset, bytes: TARGET_WALLET } }
          ]
        });
        
        for (const { account } of accounts) {
          allSizes.add(account.data.length);
        }
      } catch (error) {
        // Continue
      }
    }
    
    console.log(`   Account sizes found: ${Array.from(allSizes).sort((a, b) => a - b).join(', ')}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugVoterAccountSearch().catch(console.error);