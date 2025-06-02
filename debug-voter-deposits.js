/**
 * Debug Voter Account Deposit Entries
 * Analyze the actual structure to find correct multiplier offsets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function debugVoterDeposits() {
  // Test with Takisoul's account - should have significant governance power
  const walletAddress = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  
  console.log(`🔍 Debugging Voter deposit entries for: ${walletAddress}`);
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  if (accounts.length === 0) {
    console.log('❌ No Voter accounts found');
    return;
  }
  
  const { pubkey, account } = accounts[0];
  const data = account.data;
  
  console.log(`📋 Voter Account: ${pubkey.toBase58()}`);
  console.log(`📏 Data length: ${data.length} bytes`);
  
  // Analyze first 10 deposit entries
  for (let i = 0; i < 10; i++) {
    const entryOffset = 72 + (i * 88);
    if (entryOffset + 88 > data.length) break;
    
    console.log(`\n📦 Deposit Entry ${i} at offset ${entryOffset}:`);
    
    // isUsed at offset +0
    const isUsed = data[entryOffset];
    console.log(`  isUsed: ${isUsed} (0x${isUsed.toString(16)})`);
    
    if (isUsed > 0) {
      // amount at offset +8
      const amountRaw = Number(data.readBigUInt64LE(entryOffset + 8));
      const amount = amountRaw / 1e6;
      console.log(`  amount: ${amount.toLocaleString()} ISLAND (raw: ${amountRaw})`);
      
      // Check all potential multiplier locations
      console.log(`  Potential multiplier values:`);
      
      for (let offset = 40; offset <= 80; offset += 8) {
        if (entryOffset + offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(entryOffset + offset));
            if (value > 0) {
              const asDecimal = value / 1e9;
              const asDecimal6 = value / 1e6;
              console.log(`    +${offset}: ${value} (${asDecimal.toFixed(9)} | ${asDecimal6.toFixed(6)})`);
            }
          } catch (e) {}
        }
      }
      
      // Check specific offsets mentioned in spec
      try {
        const mult48 = Number(data.readBigUInt64LE(entryOffset + 48));
        const mult56 = Number(data.readBigUInt64LE(entryOffset + 56));
        
        console.log(`  Spec offsets:`);
        console.log(`    numerator (+48): ${mult48}`);
        console.log(`    denominator (+56): ${mult56}`);
        
        if (mult56 > 0) {
          const ratio = mult48 / mult56;
          console.log(`    calculated multiplier: ${ratio.toFixed(6)}`);
        }
      } catch (e) {
        console.log(`    Error reading multiplier: ${e.message}`);
      }
      
      // Look for any values that could represent a reasonable multiplier (1.0 to 6.0)
      console.log(`  Scanning for reasonable multipliers (1.0-6.0):`);
      for (let offset = 0; offset < 88; offset += 8) {
        if (entryOffset + offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(entryOffset + offset));
            
            // Try different scaling factors
            const scalings = [1, 1e6, 1e9, 1e18];
            for (const scale of scalings) {
              const scaled = value / scale;
              if (scaled >= 1.0 && scaled <= 6.0) {
                console.log(`      +${offset}: ${scaled.toFixed(6)} (raw: ${value}, scale: ${scale})`);
              }
            }
          } catch (e) {}
        }
      }
    } else {
      console.log(`  (unused entry)`);
    }
  }
  
  // Look for any large values that could be the target governance power
  console.log(`\n🎯 Scanning entire account for large values (>1M):`);
  const largeValues = [];
  
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const asTokens = value / 1e6;
      
      if (asTokens > 1000000) { // > 1M tokens
        largeValues.push({ offset, value: asTokens });
      }
    } catch (e) {}
  }
  
  if (largeValues.length > 0) {
    console.log(`  Found ${largeValues.length} large values:`);
    for (const { offset, value } of largeValues.slice(0, 10)) {
      console.log(`    +${offset}: ${value.toLocaleString()} ISLAND`);
    }
  } else {
    console.log(`  No large values found in this account`);
  }
}

debugVoterDeposits().catch(console.error);