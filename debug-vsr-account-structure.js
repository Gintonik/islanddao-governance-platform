/**
 * Debug VSR Account Structure
 * Analyze the actual byte layout of VSR accounts to understand correct parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

async function debugVSRAccountStructure() {
  // Test with Takisoul's known VSR account
  const accountPubkey = new PublicKey('GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG');
  
  console.log(`🔍 Debugging VSR account structure: ${accountPubkey.toBase58()}`);
  
  try {
    const accountInfo = await connection.getAccountInfo(accountPubkey);
    if (!accountInfo) {
      console.log('❌ Account not found');
      return;
    }
    
    const data = accountInfo.data;
    console.log(`📊 Account data length: ${data.length} bytes`);
    
    // Parse header fields
    console.log('\n🔍 Header Analysis:');
    console.log(`Discriminator (0-8): ${Array.from(data.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // Authority (bytes 8-40)
    const authorityBytes = data.slice(8, 40);
    const authority = new PublicKey(authorityBytes);
    console.log(`Authority (8-40): ${authority.toBase58()}`);
    
    // Registrar (bytes 40-72)
    const registrarBytes = data.slice(40, 72);
    const registrar = new PublicKey(registrarBytes);
    console.log(`Registrar (40-72): ${registrar.toBase58()}`);
    
    // Look for deposit patterns starting from different offsets
    console.log('\n🔍 Searching for deposit patterns:');
    
    const testOffsets = [72, 80, 88, 96, 104, 112, 120, 128];
    
    for (const startOffset of testOffsets) {
      console.log(`\nTesting deposits starting at offset ${startOffset}:`);
      
      for (let i = 0; i < 5 && startOffset + (i * 88) + 88 <= data.length; i++) {
        const entryOffset = startOffset + (i * 88);
        
        // Check if first byte could be isUsed flag
        const isUsed = data[entryOffset];
        
        // Try parsing amount at different positions within entry
        const amountPositions = [1, 8, 16, 24];
        
        for (const amountPos of amountPositions) {
          try {
            const amount = Number(data.readBigUInt64LE(entryOffset + amountPos));
            const amountTokens = amount / 1e6; // Try micro-units first
            
            if (amountTokens > 1000 && amountTokens < 10000000) {
              console.log(`  Entry ${i}, Amount at +${amountPos}: ${amountTokens.toLocaleString()} ISLAND (isUsed: ${isUsed})`);
            }
          } catch (e) {
            // Skip invalid reads
          }
        }
      }
    }
    
    // Look for known Takisoul amounts in raw data
    console.log('\n🔍 Searching for known Takisoul deposit amounts:');
    const knownAmounts = [
      10000 * 1e6,      // 10,000 ISLAND in micro-units
      37626.98 * 1e6,   // 37,626.98 ISLAND in micro-units  
      25738.99 * 1e6,   // 25,738.99 ISLAND in micro-units
      3913 * 1e6        // 3,913 ISLAND in micro-units
    ];
    
    for (const targetAmount of knownAmounts) {
      for (let offset = 0; offset < data.length - 8; offset += 8) {
        try {
          const value = Number(data.readBigUInt64LE(offset));
          if (Math.abs(value - targetAmount) < 1000) { // Close match
            const tokens = value / 1e6;
            console.log(`  Found ${tokens.toLocaleString()} ISLAND at offset ${offset}`);
          }
        } catch (e) {
          // Skip
        }
      }
    }
    
  } catch (error) {
    console.error('Error debugging VSR account:', error);
  }
}

// Run the debug analysis
debugVSRAccountStructure().catch(console.error);