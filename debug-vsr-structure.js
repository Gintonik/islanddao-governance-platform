/**
 * Debug VSR Account Structure
 * Examine actual VSR accounts to understand the correct deposit parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

async function debugVSRStructure() {
  console.log('Debugging VSR account structure...');
  
  // Use Takisoul's known VSR account
  const vsrAccount = new PublicKey('GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG');
  
  try {
    const accountInfo = await connection.getAccountInfo(vsrAccount);
    
    if (!accountInfo) {
      console.log('Account not found');
      return;
    }
    
    const data = accountInfo.data;
    console.log(`Account size: ${data.length} bytes`);
    
    // Examine the first 200 bytes in detail
    console.log('\nFirst 200 bytes (hex):');
    console.log(data.slice(0, 200).toString('hex'));
    
    console.log('\nFirst 200 bytes (structured):');
    for (let i = 0; i < Math.min(200, data.length); i += 8) {
      const slice = data.slice(i, i + 8);
      try {
        const value = data.readBigUInt64LE(i);
        const floatValue = Number(value) / 1e6;
        console.log(`Offset ${i.toString().padStart(3)}: ${slice.toString('hex').padEnd(16)} = ${value.toString().padEnd(20)} (${floatValue.toLocaleString()} tokens)`);
      } catch (e) {
        console.log(`Offset ${i.toString().padStart(3)}: ${slice.toString('hex').padEnd(16)} = <read error>`);
      }
    }
    
    // Look for patterns that could be ISLAND amounts (in the millions)
    console.log('\nScanning for potential ISLAND amounts (1M+ tokens):');
    for (let offset = 0; offset <= data.length - 8; offset += 4) {
      try {
        const value = data.readBigUInt64LE(offset);
        const tokens = Number(value) / 1e6;
        
        if (tokens >= 1000000 && tokens <= 10000000) { // 1M to 10M ISLAND
          console.log(`Offset ${offset}: ${tokens.toLocaleString()} ISLAND (${value} raw)`);
        }
      } catch (e) {
        continue;
      }
    }
    
    // Look for timestamp patterns (values that could be Unix timestamps)
    console.log('\nScanning for potential timestamps:');
    for (let offset = 0; offset <= data.length - 8; offset += 4) {
      try {
        const value = data.readBigUInt64LE(offset);
        const timestamp = Number(value);
        
        if (timestamp > 1600000000 && timestamp < 2000000000) { // Reasonable Unix timestamp range
          const date = new Date(timestamp * 1000);
          console.log(`Offset ${offset}: ${timestamp} = ${date.toISOString()}`);
        }
      } catch (e) {
        continue;
      }
    }
    
    // Examine authority field (should be at offset 8)
    console.log('\nAuthority field check:');
    const authorityBytes = data.slice(8, 40);
    const authority = new PublicKey(authorityBytes);
    console.log(`Authority at offset 8: ${authority.toBase58()}`);
    
    // Check if this matches Takisoul's wallet
    const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
    console.log(`Expected Takisoul wallet: ${takisoulWallet}`);
    console.log(`Authority matches: ${authority.toBase58() === takisoulWallet}`);
    
    // Try different offset interpretations for deposits
    console.log('\nTrying different deposit offset interpretations:');
    
    const possibleDepositOffsets = [136, 168, 200, 232, 264];
    
    for (const startOffset of possibleDepositOffsets) {
      console.log(`\nTrying deposit start at offset ${startOffset}:`);
      
      for (let i = 0; i < 3; i++) { // Check first 3 potential deposits
        const offset = startOffset + (i * 184); // Assuming 184 bytes per deposit
        
        if (offset + 32 > data.length) break;
        
        try {
          // Try reading as amount at different sub-offsets
          for (let subOffset = 0; subOffset <= 24; subOffset += 8) {
            try {
              const value = data.readBigUInt64LE(offset + subOffset);
              const tokens = Number(value) / 1e6;
              
              if (tokens > 1000 && tokens < 10000000) {
                console.log(`  Deposit ${i}, suboffset +${subOffset}: ${tokens.toLocaleString()} ISLAND`);
              }
            } catch (e) {
              continue;
            }
          }
        } catch (e) {
          continue;
        }
      }
    }
    
  } catch (error) {
    console.error('Error debugging VSR structure:', error.message);
  }
}

// Run debug
debugVSRStructure().catch(console.error);