/**
 * Targeted Stale Deposit Detection
 * Identify specific patterns that indicate phantom deposits
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');

async function analyzePhantomPattern() {
  console.log('🔍 Analyzing phantom deposit patterns\n');
  
  // GintoniK's problematic VSR account
  const vsrAccount = '6yujo5tRQNZrh6upsm2MnAHv1LrLYVjKnDtLbHR4rwhr';
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(vsrAccount));
  const data = accountInfo.data;
  
  console.log(`Analyzing VSR account: ${vsrAccount}`);
  console.log(`Data length: ${data.length} bytes\n`);
  
  // Check both deposits
  const offsets = [104, 112];
  
  for (const offset of offsets) {
    const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
    console.log(`=== Offset ${offset}: ${amount.toLocaleString()} ISLAND ===`);
    
    // Detailed byte analysis
    console.log('Raw bytes around amount:');
    for (let i = offset - 16; i <= offset + 32; i += 8) {
      if (i >= 0 && i + 8 <= data.length) {
        const value = Number(data.readBigUInt64LE(i));
        const bytes = [];
        for (let j = 0; j < 8; j++) {
          bytes.push(data[i + j].toString(16).padStart(2, '0'));
        }
        console.log(`  ${i.toString().padStart(3, '0')}: ${bytes.join(' ')} = ${value} (${(value / 1e6).toLocaleString()})`);
      }
    }
    
    // Check if this appears to be overlapping data
    const prev8 = Number(data.readBigUInt64LE(offset - 8)) / 1e6;
    const next8 = Number(data.readBigUInt64LE(offset + 8)) / 1e6;
    
    console.log(`Previous 8 bytes as amount: ${prev8.toLocaleString()}`);
    console.log(`Next 8 bytes as amount: ${next8.toLocaleString()}`);
    
    // Look for duplicate patterns
    let isDuplicate = false;
    for (let checkOffset = 96; checkOffset <= 128; checkOffset += 8) {
      if (checkOffset !== offset && checkOffset + 8 <= data.length) {
        const checkAmount = Number(data.readBigUInt64LE(checkOffset)) / 1e6;
        if (Math.abs(checkAmount - amount) < 0.01 && checkAmount > 1000) {
          console.log(`!! Duplicate detected at offset ${checkOffset}: ${checkAmount.toLocaleString()}`);
          isDuplicate = true;
        }
      }
    }
    
    console.log(`Is potential phantom: ${isDuplicate ? 'YES' : 'NO'}\n`);
  }
  
  // Check if offset 112 data overlaps with offset 104 structure
  console.log('=== Overlap Analysis ===');
  const offset104Amount = Number(data.readBigUInt64LE(104)) / 1e6;
  const offset112Amount = Number(data.readBigUInt64LE(112)) / 1e6;
  
  console.log(`Offset 104 amount: ${offset104Amount.toLocaleString()}`);
  console.log(`Offset 112 amount: ${offset112Amount.toLocaleString()}`);
  
  // Check if 112 is reading into the middle of 104's data structure
  const structStart104 = 104;
  const structEnd104 = 104 + 32; // Assume 32-byte deposit structure
  
  if (112 >= structStart104 && 112 < structEnd104) {
    console.log('!! Offset 112 overlaps with offset 104 structure');
    console.log('This suggests 112 is phantom data from incomplete parsing');
  }
}

analyzePhantomPattern();