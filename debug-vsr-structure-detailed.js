/**
 * Debug VSR Account Structure in Detail
 * Analyze the exact byte layout of known VSR accounts to fix parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import fs from 'fs';

// Load environment and VSR IDL
const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Known VSR accounts from previous analysis
const knownVSRAccounts = [
  'GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG', // Takisoul account 1
  '66YJyffJsfar6iC6evo3qAn9ie3AXQ5H3NYogyX7nTY4', // GJdR account
  'xGW423w6m34PkGfFsCF6eWzP8LbEAYMHFYp9dvvV2br'  // Fgv1 account
];

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

async function analyzeVSRAccountStructure(accountPubkey) {
  try {
    console.log(`\n🔍 Analyzing VSR account: ${accountPubkey}`);
    
    const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
    if (!accountInfo) {
      console.log('❌ Account not found');
      return;
    }
    
    const data = accountInfo.data;
    console.log(`📊 Account data length: ${data.length} bytes`);
    
    // Parse basic structure
    console.log('\n📋 Basic Structure:');
    console.log(`Discriminator (0-8): ${Array.from(data.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}`);
    
    if (data.length >= 40) {
      const voterAuthority = new PublicKey(data.slice(8, 40));
      console.log(`Voter Authority (8-40): ${voterAuthority.toBase58()}`);
    }
    
    if (data.length >= 72) {
      const registrar = new PublicKey(data.slice(40, 72));
      console.log(`Registrar (40-72): ${registrar.toBase58()}`);
    }
    
    // Try to find deposit patterns by scanning for large numbers
    console.log('\n🔍 Scanning for deposit patterns...');
    
    const significantAmounts = [];
    
    // Scan every 8-byte aligned position for potential amounts
    for (let offset = 72; offset < data.length - 8; offset += 8) {
      try {
        const value = Number(data.readBigUInt64LE(offset));
        
        // Look for values that could be token amounts (between 1M and 10B micro-tokens)
        if (value >= 1000000 && value <= 10000000000) {
          const tokens = value / 1e6;
          
          // Look for multipliers around this position
          let multiplier = null;
          for (const relOffset of [-64, -56, -48, -40, -32, -24, -16, -8, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80]) {
            const multPos = offset + relOffset;
            if (multPos >= 0 && multPos + 8 <= data.length) {
              try {
                // Try as scaled integer (1e9)
                const intMult = Number(data.readBigUInt64LE(multPos)) / 1e9;
                if (intMult > 1.0 && intMult <= 5.0) {
                  multiplier = intMult;
                  break;
                }
              } catch (e) {}
              
              try {
                // Try as float
                const floatMult = data.readDoubleLE(multPos);
                if (floatMult > 1.0 && floatMult <= 5.0 && !isNaN(floatMult)) {
                  multiplier = floatMult;
                  break;
                }
              } catch (e) {}
            }
          }
          
          significantAmounts.push({
            offset: offset,
            value: value,
            tokens: tokens,
            multiplier: multiplier,
            votingPower: multiplier ? tokens * multiplier : tokens
          });
        }
      } catch (e) {
        // Continue scanning
      }
    }
    
    if (significantAmounts.length > 0) {
      console.log('\n💰 Found significant amounts:');
      significantAmounts.forEach(amount => {
        console.log(`  Offset ${amount.offset}: ${amount.tokens.toLocaleString()} ISLAND${amount.multiplier ? ` × ${amount.multiplier} = ${amount.votingPower.toLocaleString()}` : ''}`);
      });
    } else {
      console.log('❌ No significant amounts found');
    }
    
    // Try raw deposit entry parsing at standard offsets
    console.log('\n🔍 Checking standard deposit entry structure (88-byte entries):');
    
    for (let i = 0; i < 5; i++) { // Check first 5 entries
      const entryOffset = 72 + (i * 88);
      if (entryOffset + 88 > data.length) break;
      
      console.log(`\nDeposit Entry ${i} (offset ${entryOffset}):`);
      
      // Check isUsed flag
      const isUsed = data[entryOffset];
      console.log(`  isUsed (${entryOffset}): ${isUsed} (${isUsed === 1 ? 'TRUE' : 'FALSE'})`);
      
      if (isUsed === 1) {
        // Parse amount
        const amount = Number(data.readBigUInt64LE(entryOffset + 1)) / 1e6;
        console.log(`  amount (${entryOffset + 1}): ${amount.toLocaleString()} ISLAND`);
        
        // Parse lockup info at various offsets
        for (const testOffset of [25, 33, 41, 49]) {
          if (entryOffset + testOffset + 8 <= data.length) {
            const timestamp = Number(data.readBigUInt64LE(entryOffset + testOffset));
            if (timestamp > 1600000000 && timestamp < 2000000000) { // Reasonable timestamp range
              console.log(`  timestamp (${entryOffset + testOffset}): ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
            }
          }
        }
        
        // Parse multiplier at various offsets
        for (const testOffset of [65, 72, 80]) {
          if (entryOffset + testOffset + 8 <= data.length) {
            const multValue = Number(data.readBigUInt64LE(entryOffset + testOffset));
            const multiplier = multValue / 1e9;
            if (multiplier > 0.5 && multiplier <= 5.0) {
              console.log(`  multiplier (${entryOffset + testOffset}): ${multiplier} (raw: ${multValue})`);
            }
          }
        }
      }
    }
    
    // Hex dump of first deposit entry for manual analysis
    console.log('\n📋 Hex dump of first deposit entry (offset 72-159):');
    if (data.length >= 160) {
      const hexData = Array.from(data.slice(72, 160))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(hexData);
    }
    
  } catch (error) {
    console.error(`❌ Error analyzing account ${accountPubkey}:`, error.message);
  }
}

async function debugAllKnownAccounts() {
  console.log('🔍 Debugging VSR Account Structures for Known Accounts');
  
  for (const accountPubkey of knownVSRAccounts) {
    await analyzeVSRAccountStructure(accountPubkey);
    console.log('\n' + '='.repeat(80));
  }
}

debugAllKnownAccounts();