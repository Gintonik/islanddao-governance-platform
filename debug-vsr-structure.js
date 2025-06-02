/**
 * Debug VSR Account Structure
 * Analyze the exact byte layout to find correct deposit entry offsets
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function debugVSRStructure() {
  // Test with GJdR wallet that should have deposits
  const walletAddress = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  
  console.log(`🔍 Debugging VSR structure for: ${walletAddress}`);
  
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
  
  // Look for patterns that could be deposit amounts
  console.log('\n🔍 Scanning for potential deposit amounts:');
  
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    const value = Number(data.readBigUInt64LE(offset));
    const asTokens = value / 1e6;
    
    // Look for values that could be reasonable ISLAND amounts
    if (asTokens > 1000 && asTokens < 1000000) {
      console.log(`Offset ${offset.toString().padStart(4)}: ${value} raw → ${asTokens.toLocaleString()} ISLAND`);
      
      // Check if there's a corresponding isUsed flag nearby
      for (let flagOffset = Math.max(0, offset - 16); flagOffset < Math.min(data.length, offset + 16); flagOffset++) {
        const flag = data[flagOffset];
        if (flag === 1) {
          console.log(`  ✅ Found isUsed=1 at offset ${flagOffset} (relative: ${flagOffset - offset})`);
        }
      }
    }
  }
  
  // Try different deposit entry layouts
  console.log('\n🔍 Testing different deposit entry layouts:');
  
  const possibleOffsets = [72, 64, 80, 88, 96];
  
  for (const startOffset of possibleOffsets) {
    console.log(`\n📦 Testing deposit entries starting at offset ${startOffset}:`);
    
    for (let i = 0; i < 5; i++) { // Test first 5 entries
      const entryOffset = startOffset + (i * 88);
      if (entryOffset + 88 > data.length) break;
      
      const isUsed = data[entryOffset];
      const amount8 = Number(data.readBigUInt64LE(entryOffset + 8)) / 1e6;
      const amount16 = Number(data.readBigUInt64LE(entryOffset + 16)) / 1e6;
      
      console.log(`  Entry ${i}: isUsed=${isUsed}, amount@+8=${amount8.toFixed(2)}, amount@+16=${amount16.toFixed(2)}`);
      
      if (isUsed !== 0 && (amount8 > 0 || amount16 > 0)) {
        console.log(`    🎯 Potential valid entry found!`);
        
        // Show more details for this entry
        for (let j = 0; j < 88; j += 8) {
          if (entryOffset + j + 8 <= data.length) {
            const val = Number(data.readBigUInt64LE(entryOffset + j));
            console.log(`      +${j.toString().padStart(2)}: ${val} (0x${val.toString(16)})`);
          }
        }
      }
    }
  }
  
  // Look for the voter weight record value that should match expected governance power
  console.log('\n🔍 Searching for voter weight record (144,708 ISLAND):');
  const target = Math.round(144708 * 1e6);
  
  for (let offset = 0; offset < data.length - 8; offset++) {
    const value = Number(data.readBigUInt64LE(offset));
    if (Math.abs(value - target) < 1000000) { // Within small margin
      const asTokens = value / 1e6;
      console.log(`🎯 Found close match at offset ${offset}: ${value} → ${asTokens.toLocaleString()} ISLAND`);
    }
  }
}

debugVSRStructure().catch(console.error);