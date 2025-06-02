/**
 * Canonical VSR Account Structure Analyzer
 * Deep analysis of VSR account byte layout to implement accurate deserialization
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

async function analyzeCanonicalVSRStructure() {
  // Test accounts with known deposit amounts
  const testAccounts = [
    {
      name: "Fgv1zrw (200K ISLAND)",
      pubkey: "xGW423w6m34PkGfFsCF6eWzP8LbEAYMHFYp9dvvV2br",
      expectedAmount: 200000
    },
    {
      name: "GJdRQcs (144K ISLAND)", 
      pubkey: "66YJyffJsfar6iC6evo3qAn9ie3AXQ5H3NYogyX7nTY4",
      expectedAmount: 144708.98
    }
  ];
  
  for (const testAccount of testAccounts) {
    console.log(`\n🔍 Analyzing ${testAccount.name}: ${testAccount.pubkey}`);
    
    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(testAccount.pubkey));
      if (!accountInfo) {
        console.log('❌ Account not found');
        continue;
      }
      
      const data = accountInfo.data;
      console.log(`📊 Account data length: ${data.length} bytes`);
      
      // Scan for the expected amount in micro-units
      const targetMicroAmount = testAccount.expectedAmount * 1e6;
      let foundPositions = [];
      
      for (let offset = 0; offset < data.length - 8; offset += 1) {
        try {
          const value = Number(data.readBigUInt64LE(offset));
          if (Math.abs(value - targetMicroAmount) < 1000) {
            foundPositions.push({
              offset: offset,
              value: value,
              asTokens: value / 1e6
            });
          }
        } catch (e) {
          // Skip invalid reads
        }
      }
      
      console.log(`🎯 Found ${foundPositions.length} potential matches for ${testAccount.expectedAmount} ISLAND:`);
      foundPositions.forEach(pos => {
        console.log(`  Offset ${pos.offset}: ${pos.asTokens.toLocaleString()} ISLAND`);
        
        // Check for deposit entry structure around this position
        const entryStart = Math.floor(pos.offset / 88) * 88;
        const offsetInEntry = pos.offset - entryStart;
        
        console.log(`    Likely entry starts at offset ${entryStart}, amount at entry+${offsetInEntry}`);
        
        // Check isUsed flag at entry start
        if (entryStart < data.length) {
          const isUsed = data[entryStart];
          console.log(`    isUsed flag: ${isUsed}`);
        }
        
        // Look for multiplier at various positions relative to amount
        const multiplierPositions = [64, 72, 80];
        for (const multPos of multiplierPositions) {
          const absolutePos = entryStart + multPos;
          if (absolutePos + 8 <= data.length) {
            try {
              const floatMult = data.readDoubleLE(absolutePos);
              if (floatMult > 1.0 && floatMult < 5.0) {
                console.log(`    Multiplier at entry+${multPos}: ${floatMult.toFixed(6)} (Float64LE)`);
              }
            } catch (e) {}
            
            try {
              const intMult = Number(data.readBigUInt64LE(absolutePos)) / 1e9;
              if (intMult > 1.0 && intMult < 5.0) {
                console.log(`    Multiplier at entry+${multPos}: ${intMult.toFixed(6)} (U64LE/1e9)`);
              }
            } catch (e) {}
          }
        }
      });
      
    } catch (error) {
      console.error(`Error analyzing ${testAccount.name}:`, error.message);
    }
  }
}

// Run the canonical structure analysis
analyzeCanonicalVSRStructure().catch(console.error);