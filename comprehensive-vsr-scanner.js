/**
 * Comprehensive VSR Scanner
 * Searches all VSR program accounts to find the source of expected governance power
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

async function scanAllVSRAccounts() {
  console.log('🔍 Scanning ALL VSR program accounts for governance power patterns...');
  
  // Get all VSR program accounts
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  console.log(`📊 Found ${allAccounts.length} total VSR accounts`);
  
  // Group by data size to understand different account types
  const accountTypes = new Map();
  
  for (const { pubkey, account } of allAccounts) {
    const size = account.data.length;
    if (!accountTypes.has(size)) {
      accountTypes.set(size, []);
    }
    accountTypes.get(size).push({ pubkey, account });
  }
  
  console.log('\n📋 Account types by size:');
  for (const [size, accounts] of accountTypes.entries()) {
    console.log(`  ${size} bytes: ${accounts.length} accounts`);
  }
  
  // Look for target values (8.7M, 144K, etc.)
  const targetValues = [
    { value: 8709019.78, name: 'Takisoul 8.7M' },
    { value: 144708.98, name: 'GJdR 144K' },
    { value: 12625.58, name: '4pT6 12.6K' },
    { value: 200000, name: 'Fgv1 200K' }
  ];
  
  console.log('\n🎯 Searching for target governance power values...');
  
  for (const target of targetValues) {
    console.log(`\nSearching for ${target.name} (${target.value.toLocaleString()}):`);
    
    let found = false;
    
    for (const { pubkey, account } of allAccounts) {
      const data = account.data;
      
      // Search through all u64 positions
      for (let offset = 0; offset < data.length - 8; offset += 8) {
        try {
          const value = Number(data.readBigUInt64LE(offset));
          
          // Try different scaling factors
          const scalings = [
            { scale: 1, suffix: '' },
            { scale: 1e6, suffix: ' (micro)' },
            { scale: 1e9, suffix: ' (nano)' }
          ];
          
          for (const { scale, suffix } of scalings) {
            const scaled = value / scale;
            
            // Check if close to target (within 1%)
            if (Math.abs(scaled - target.value) / target.value < 0.01) {
              console.log(`  ✅ Found at ${pubkey.toBase58()} offset ${offset}: ${scaled.toLocaleString()}${suffix}`);
              
              // Show surrounding data for context
              console.log(`     Context (±32 bytes):`);
              const start = Math.max(0, offset - 32);
              const end = Math.min(data.length, offset + 40);
              
              for (let ctx = start; ctx < end; ctx += 8) {
                if (ctx + 8 <= data.length) {
                  const ctxValue = Number(data.readBigUInt64LE(ctx));
                  const marker = ctx === offset ? ' <-- TARGET' : '';
                  console.log(`       +${ctx}: ${ctxValue}${marker}`);
                }
              }
              
              found = true;
              break;
            }
          }
          
          if (found) break;
        } catch (e) {
          // Continue scanning
        }
      }
      
      if (found) break;
    }
    
    if (!found) {
      console.log(`  ❌ ${target.name} not found in any VSR account`);
    }
  }
}

async function scanWalletSpecificAccounts() {
  console.log('\n🔍 Scanning wallet-specific VSR accounts...');
  
  const testWallets = [
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Takisoul
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', // GJdR
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // 4pT6
    'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1'  // Fgv1
  ];
  
  for (const wallet of testWallets) {
    console.log(`\n📋 Wallet: ${wallet}`);
    
    // Try different offset positions for authority field
    const authorityOffsets = [8, 40, 32, 64, 72];
    
    for (const offset of authorityOffsets) {
      try {
        const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
          filters: [
            { memcmp: { offset: offset, bytes: wallet } }
          ]
        });
        
        if (accounts.length > 0) {
          console.log(`  Found ${accounts.length} accounts with authority at offset ${offset}`);
          
          for (const { pubkey, account } of accounts) {
            console.log(`    ${pubkey.toBase58()} (${account.data.length} bytes)`);
            
            // Quick scan for large values in this account
            const data = account.data;
            const largeValues = [];
            
            for (let i = 0; i < data.length - 8; i += 8) {
              try {
                const value = Number(data.readBigUInt64LE(i));
                const asTokens = value / 1e6;
                
                if (asTokens > 10000) { // Look for values > 10K tokens
                  largeValues.push({ offset: i, value: asTokens });
                }
              } catch (e) {}
            }
            
            if (largeValues.length > 0) {
              console.log(`      Large values found:`);
              for (const { offset, value } of largeValues.slice(0, 5)) {
                console.log(`        +${offset}: ${value.toLocaleString()} ISLAND`);
              }
            }
          }
        }
      } catch (e) {
        // Continue with next offset
      }
    }
  }
}

async function main() {
  try {
    await scanAllVSRAccounts();
    await scanWalletSpecificAccounts();
  } catch (error) {
    console.error('Error during comprehensive scan:', error);
  }
}

main().catch(console.error);