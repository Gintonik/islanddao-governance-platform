/**
 * Debug VSR Account Structure
 * Analyze the actual byte layout of VSR accounts to understand deposit parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Analyze specific VSR account byte structure
 */
async function analyzeVSRAccount(accountPubkey) {
  try {
    const account = await connection.getAccountInfo(new PublicKey(accountPubkey));
    if (!account) {
      console.log(`Account ${accountPubkey} not found`);
      return;
    }

    const data = account.data;
    console.log(`\n=== Analyzing VSR Account ${accountPubkey.slice(0, 8)} ===`);
    console.log(`Account size: ${data.length} bytes`);
    console.log(`Owner: ${account.owner.toString()}`);

    // Extract authority from known offset (offset 32, 32 bytes)
    const authorityBytes = data.slice(32, 64);
    const authority = new PublicKey(authorityBytes).toString();
    console.log(`Authority: ${authority}`);

    // Look for deposit patterns in the data
    console.log(`\n--- Searching for deposit patterns ---`);
    
    // Method 1: Search for large numbers that could be ISLAND amounts
    for (let i = 0; i < data.length - 8; i += 8) {
      try {
        const value = data.readBigUInt64LE(i);
        const asISLAND = Number(value) / 1e6;
        
        // Look for reasonable ISLAND amounts (1-50M range)
        if (asISLAND >= 1 && asISLAND <= 50000000) {
          console.log(`  Offset ${i}: ${asISLAND.toFixed(6)} ISLAND (raw: ${value.toString()})`);
          
          // Check nearby bytes for deposit structure
          if (i >= 8 && i + 32 < data.length) {
            const isUsedBefore = data.readUInt8(i - 8);
            const isUsedAfter = data.readUInt8(i + 8);
            const nextValue = data.readBigUInt64LE(i + 8);
            
            console.log(`    isUsed before (-8): ${isUsedBefore}`);
            console.log(`    isUsed after (+8): ${isUsedAfter}`);
            console.log(`    Next 8 bytes: ${nextValue.toString()}`);
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Method 2: Try to parse using known VSR deposit structure
    console.log(`\n--- Attempting structured deposit parsing ---`);
    
    // VSR deposits typically start around offset 232 with 80-byte entries
    const depositAreaStart = 232;
    if (data.length >= depositAreaStart + 80) {
      console.log(`Trying structured parsing from offset ${depositAreaStart}...`);
      
      for (let i = 0; i < 5; i++) { // Check first 5 deposit slots
        const depositOffset = depositAreaStart + (i * 80);
        if (depositOffset + 80 > data.length) break;
        
        try {
          const isUsed = data.readUInt8(depositOffset);
          const amount = data.readBigUInt64LE(depositOffset + 8);
          const lockupKind = data.readUInt8(depositOffset + 32);
          
          console.log(`  Deposit ${i}: isUsed=${isUsed}, amount=${Number(amount)/1e6}, lockup=${lockupKind}`);
        } catch (e) {
          console.log(`  Deposit ${i}: Parse error`);
        }
      }
    }

    // Method 3: Hex dump of relevant sections
    console.log(`\n--- Hex dump of deposit area (offset 232-400) ---`);
    if (data.length > 400) {
      const hexSection = data.slice(232, 400).toString('hex');
      for (let i = 0; i < hexSection.length; i += 32) {
        const offset = 232 + (i / 2);
        console.log(`${offset.toString().padStart(4, '0')}: ${hexSection.slice(i, i + 32)}`);
      }
    }

  } catch (error) {
    console.error(`Error analyzing account ${accountPubkey}:`, error.message);
  }
}

/**
 * Debug the known VSR accounts for Takisoul
 */
async function debugTakisoulAccounts() {
  console.log('DEBUGGING TAKISOUL VSR ACCOUNT STRUCTURE');
  console.log('========================================');
  
  // Takisoul's known VSR account
  const takisoulVSR = 'GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG';
  await analyzeVSRAccount(takisoulVSR);
}

debugTakisoulAccounts().catch(console.error);