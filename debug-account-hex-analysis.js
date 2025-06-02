/**
 * Hex Analysis of Takisoul's VSR Account
 * Deep dive into the raw account data to understand the structure
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const TAKISOUL_WALLET = "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA";

async function analyzeAccountHex() {
  try {
    const connection = new Connection(process.env.HELIUS_RPC_URL);
    const walletPubkey = new PublicKey(TAKISOUL_WALLET);
    
    // Get Takisoul's VSR accounts
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [{
        memcmp: {
          offset: 8,
          bytes: walletPubkey.toBase58()
        }
      }]
    });
    
    console.log(`Found ${vsrAccounts.length} VSR accounts`);
    
    for (let i = 0; i < vsrAccounts.length; i++) {
      const account = vsrAccounts[i];
      const data = account.account.data;
      
      console.log(`\n=== ACCOUNT ${i + 1}: ${account.pubkey.toBase58()} ===`);
      console.log(`Data length: ${data.length} bytes`);
      
      // Show hex dump in 32-byte chunks
      console.log(`\nHex dump (first 512 bytes):`);
      for (let offset = 0; offset < Math.min(data.length, 512); offset += 32) {
        const chunk = data.slice(offset, offset + 32);
        const hex = chunk.toString('hex').match(/.{2}/g).join(' ');
        const ascii = chunk.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
        console.log(`${offset.toString(16).padStart(4, '0')}: ${hex.padEnd(95, ' ')} |${ascii}|`);
      }
      
      // Look for large numbers that could be deposit amounts
      console.log(`\nScanning for large numbers (potential deposits):`);
      for (let offset = 0; offset < data.length - 8; offset += 8) {
        const value = Number(data.readBigUInt64LE(offset));
        
        // Check for values that could be large ISLAND amounts
        if (value > 1000000000000 && value < 100000000000000000) { // 1M to 100B in micro-units
          const asTokens = value / 1e6;
          if (asTokens >= 1000) {
            console.log(`  Offset ${offset}: ${value} (${asTokens.toLocaleString()} ISLAND)`);
          }
        }
      }
      
      // Look for timestamps
      console.log(`\nScanning for timestamps:`);
      for (let offset = 0; offset < data.length - 8; offset += 8) {
        const value = Number(data.readBigUInt64LE(offset));
        
        if (value > 1600000000 && value < 2000000000) { // Unix timestamps 2020-2033
          const date = new Date(value * 1000);
          console.log(`  Offset ${offset}: ${value} (${date.toISOString()})`);
        }
      }
    }
    
    // Also check if there are other VSR-related accounts we might have missed
    console.log(`\n=== BROADER VSR SEARCH ===`);
    console.log(`Searching for all accounts containing wallet pubkey...`);
    
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Total VSR accounts in program: ${allVSRAccounts.length}`);
    
    let foundAccounts = 0;
    const walletBuffer = walletPubkey.toBuffer();
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Search for wallet pubkey anywhere in the account data
      for (let offset = 0; offset <= data.length - 32; offset++) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          foundAccounts++;
          if (foundAccounts <= 5) { // Limit output
            console.log(`Found wallet at offset ${offset} in account: ${account.pubkey.toBase58()}`);
          }
          break;
        }
      }
    }
    
    console.log(`Total accounts containing wallet: ${foundAccounts}`);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

analyzeAccountHex();