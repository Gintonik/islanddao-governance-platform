/**
 * Analyze VSR account structure to understand deposit entry layout
 * Find the correct position and values for deposit validity flags
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');

async function analyzeVSRStructure() {
  const vsrAccount = '6yujo5tRQNZrh6upsm2MnAHv1LrLYVjKnDtLbHR4rwhr';
  
  console.log(`\n🔍 Analyzing VSR account structure: ${vsrAccount}`);
  
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(vsrAccount));
    const data = accountInfo.data;
    
    console.log(`Account data length: ${data.length} bytes`);
    
    // Analyze the area around our known amount offsets
    const offsets = [104, 112];
    
    for (const offset of offsets) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      
      console.log(`\n=== OFFSET ${offset} ===`);
      console.log(`Amount: ${amount.toLocaleString()} ISLAND`);
      
      // Check surrounding bytes in detail
      const start = Math.max(0, offset - 20);
      const end = Math.min(data.length, offset + 20);
      
      console.log(`\nHex dump [${start}-${end-1}]:`);
      for (let i = start; i < end; i += 16) {
        const hexRow = [];
        const asciiRow = [];
        
        for (let j = 0; j < 16 && i + j < end; j++) {
          const byte = data[i + j];
          hexRow.push(byte.toString(16).padStart(2, '0'));
          asciiRow.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
        }
        
        console.log(`${(i).toString().padStart(4, '0')}: ${hexRow.join(' ')} | ${asciiRow.join('')}`);
      }
      
      // Look for potential flag patterns
      console.log(`\nPotential flag positions:`);
      for (let flagPos = offset - 16; flagPos < offset; flagPos++) {
        if (flagPos >= 0) {
          const flagValue = data[flagPos];
          console.log(`  Position ${flagPos}: ${flagValue} (0x${flagValue.toString(16).padStart(2, '0')})`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeVSRStructure();