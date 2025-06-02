/**
 * Debug VSR Deposit Entry Structure
 * Analyze the actual byte layout to find correct multiplier offsets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function debugDepositStructure() {
  // Test with Takisoul's wallet - should have 8.7M governance power
  const walletAddress = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  
  console.log(`🔍 Debugging deposit structure for: ${walletAddress}`);
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  if (accounts.length === 0) {
    console.log('❌ No accounts found');
    return;
  }
  
  const { pubkey, account } = accounts[0];
  const data = account.data;
  
  console.log(`📋 Account: ${pubkey.toBase58()}`);
  console.log(`📏 Data length: ${data.length} bytes`);
  
  // Analyze first few deposit entries
  for (let i = 0; i < 5; i++) {
    const entryOffset = 72 + (i * 88);
    if (entryOffset + 88 > data.length) break;
    
    console.log(`\n📦 Entry ${i} at offset ${entryOffset}:`);
    
    // isUsed
    const isUsed = data[entryOffset];
    console.log(`  isUsed: ${isUsed}`);
    
    if (isUsed > 0) {
      // amount at offset 8
      const amountRaw = Number(data.readBigUInt64LE(entryOffset + 8));
      const amount = amountRaw / 1e6;
      console.log(`  amount: ${amount.toLocaleString()} ISLAND (raw: ${amountRaw})`);
      
      // Check all u64 values in this entry for potential multipliers
      console.log(`  All u64 values in this entry:`);
      for (let offset = 0; offset < 88; offset += 8) {
        if (entryOffset + offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(entryOffset + offset));
            const asFloat = value / 1e9; // Try different scaling
            const asFloat6 = value / 1e6;
            
            if (value > 0) {
              console.log(`    +${offset.toString().padStart(2)}: ${value} (${asFloat.toFixed(9)} | ${asFloat6.toFixed(6)})`);
            }
          } catch (e) {}
        }
      }
      
      // Look for multiplier patterns
      const mult48 = Number(data.readBigUInt64LE(entryOffset + 48));
      const mult56 = Number(data.readBigUInt64LE(entryOffset + 56));
      const mult40 = Number(data.readBigUInt64LE(entryOffset + 40));
      
      console.log(`  Potential multipliers:`);
      console.log(`    offset 48: ${mult48} (${mult48/1e9})`);
      console.log(`    offset 56: ${mult56} (${mult56/1e9})`);
      console.log(`    offset 40: ${mult40} (${mult40/1e9})`);
      
      if (mult56 > 0) {
        const ratio = mult48 / mult56;
        console.log(`    ratio 48/56: ${ratio.toFixed(6)}`);
      }
    }
  }
  
  // Look for the target voting power value (8.7M)
  console.log(`\n🎯 Searching for target voting power (≈8.7M):`);
  const target = 8709019.78 * 1e6; // Convert to micro units
  
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const asTokens = value / 1e6;
      
      if (Math.abs(asTokens - 8709019.78) < 100000) {
        console.log(`📍 Close match at offset ${offset}: ${asTokens.toLocaleString()} ISLAND`);
      }
    } catch (e) {}
  }
}

debugDepositStructure().catch(console.error);