/**
 * Investigate Exact Values
 * Find what changed from when we were getting the correct exact values
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

// Test wallets with their EXACT expected values
const EXACT_EXPECTED = {
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1': 200000.0,
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.580931
};

async function findExactAmountsInVSRAccounts(walletAddress, expectedAmount) {
  console.log(`\nSEARCHING FOR EXACT AMOUNT: ${expectedAmount.toLocaleString()} ISLAND`);
  console.log(`Wallet: ${walletAddress}`);
  console.log('='.repeat(80));
  
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  const expectedRaw = Math.round(expectedAmount * 1e6); // Convert to raw units
  
  console.log(`Looking for raw amount: ${expectedRaw.toLocaleString()}`);
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  const matches = [];
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    const accountKey = account.pubkey.toBase58();
    
    // Method 1: Check if wallet buffer exists in this account
    let walletFound = false;
    let walletOffsets = [];
    
    for (let offset = 0; offset <= data.length - 32; offset += 8) {
      if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
        walletFound = true;
        walletOffsets.push(offset);
      }
    }
    
    // Method 2: Scan for the exact expected amount
    let amountOffsets = [];
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const rawAmount = data.readBigUInt64LE(offset);
        if (Number(rawAmount) === expectedRaw) {
          amountOffsets.push(offset);
        }
      } catch (e) {
        continue;
      }
    }
    
    if (walletFound && amountOffsets.length > 0) {
      console.log(`\n✅ MATCH FOUND in account: ${accountKey}`);
      console.log(`   Wallet found at offsets: ${walletOffsets.join(', ')}`);
      console.log(`   Amount found at offsets: ${amountOffsets.join(', ')}`);
      
      // Check authority fields
      let authority = null;
      let voterAuthority = null;
      
      try {
        if (data.length >= 40) {
          authority = new PublicKey(data.slice(8, 40)).toBase58();
        }
      } catch (e) {}
      
      try {
        if (data.length >= 104) {
          voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
        }
      } catch (e) {}
      
      console.log(`   Authority: ${authority}`);
      console.log(`   VoterAuthority: ${voterAuthority}`);
      console.log(`   Account size: ${data.length} bytes`);
      
      matches.push({
        account: accountKey,
        walletOffsets,
        amountOffsets,
        authority,
        voterAuthority,
        size: data.length
      });
    } else if (amountOffsets.length > 0) {
      console.log(`\n⚠️  Amount found but no wallet match in: ${accountKey}`);
      console.log(`   Amount at offsets: ${amountOffsets.join(', ')}`);
    }
  }
  
  return matches;
}

async function testCurrentDetectionMethods(walletAddress) {
  console.log(`\nTESTING CURRENT DETECTION METHODS`);
  console.log(`Wallet: ${walletAddress}`);
  console.log('='.repeat(50));
  
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  let method1Results = []; // Wallet buffer + offset checking
  let method2Results = []; // Authority field checking
  
  for (const account of allVSRAccounts) {
    const data = account.account.data;
    const accountKey = account.pubkey.toBase58();
    
    // Method 1: Original working method
    for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
      if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
        
        const checkOffsets = [walletOffset + 32, 104, 112];
        
        for (const checkOffset of checkOffsets) {
          if (checkOffset + 8 <= data.length) {
            try {
              const rawAmount = data.readBigUInt64LE(checkOffset);
              const tokenAmount = Number(rawAmount) / 1e6;
              
              if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                method1Results.push({
                  account: accountKey,
                  amount: tokenAmount,
                  offset: checkOffset,
                  walletOffset: walletOffset
                });
              }
            } catch (error) {
              continue;
            }
          }
        }
        break;
      }
    }
    
    // Method 2: Authority checking
    let authority = null;
    let voterAuthority = null;
    
    try {
      if (data.length >= 40) {
        authority = new PublicKey(data.slice(8, 40)).toBase58();
      }
    } catch (e) {}
    
    try {
      if (data.length >= 104) {
        voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
      }
    } catch (e) {}
    
    if (authority === walletAddress || voterAuthority === walletAddress) {
      // Scan for deposits
      for (let offset = 100; offset < data.length - 8; offset += 8) {
        try {
          const rawAmount = data.readBigUInt64LE(offset);
          const tokenAmount = Number(rawAmount) / 1e6;
          
          if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
            method2Results.push({
              account: accountKey,
              amount: tokenAmount,
              offset: offset,
              authorityType: authority === walletAddress ? 'authority' : 'voterAuthority'
            });
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  console.log(`\nMethod 1 (Wallet Buffer Search) Results:`);
  method1Results.forEach(r => {
    console.log(`  ${r.amount.toLocaleString()} ISLAND at offset ${r.offset} (wallet at ${r.walletOffset})`);
  });
  
  console.log(`\nMethod 2 (Authority Checking) Results:`);
  method2Results.forEach(r => {
    console.log(`  ${r.amount.toLocaleString()} ISLAND at offset ${r.offset} (${r.authorityType})`);
  });
  
  const method1Total = method1Results.reduce((sum, r) => sum + r.amount, 0);
  const method2Total = method2Results.reduce((sum, r) => sum + r.amount, 0);
  
  console.log(`\nTotals:`);
  console.log(`  Method 1 Total: ${method1Total.toLocaleString()} ISLAND`);
  console.log(`  Method 2 Total: ${method2Total.toLocaleString()} ISLAND`);
  
  return { method1Results, method2Results, method1Total, method2Total };
}

async function investigateExactValues() {
  console.log('INVESTIGATING EXACT VALUES DETECTION');
  console.log('====================================');
  
  for (const [wallet, expectedAmount] of Object.entries(EXACT_EXPECTED)) {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`WALLET: ${wallet}`);
    console.log(`EXPECTED: ${expectedAmount.toLocaleString()} ISLAND`);
    
    // Find exact amounts in VSR accounts
    await findExactAmountsInVSRAccounts(wallet, expectedAmount);
    
    // Test current detection methods
    const results = await testCurrentDetectionMethods(wallet);
    
    console.log(`\nANALYSIS:`);
    if (Math.abs(results.method1Total - expectedAmount) < 1) {
      console.log(`✅ Method 1 matches expected value`);
    } else {
      console.log(`❌ Method 1 differs: ${results.method1Total.toLocaleString()} vs ${expectedAmount.toLocaleString()}`);
    }
    
    if (Math.abs(results.method2Total - expectedAmount) < 1) {
      console.log(`✅ Method 2 matches expected value`);
    } else {
      console.log(`❌ Method 2 differs: ${results.method2Total.toLocaleString()} vs ${expectedAmount.toLocaleString()}`);
    }
  }
  
  console.log('\n' + '='.repeat(100));
  console.log('INVESTIGATION COMPLETE');
  console.log('Need to identify which method was working before and what changed');
}

investigateExactValues().catch(console.error);