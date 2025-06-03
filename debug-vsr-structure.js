/**
 * Debug VSR Account Structure
 * Analyze the actual byte layout to find deposits
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Debug account structure by scanning for ISLAND amounts
 */
function debugAccountStructure(data, accountAddress) {
  console.log(`\nDebugging account ${accountAddress} (${data.length} bytes)`);
  
  // Look for potential ISLAND amounts by scanning for 64-bit values
  const potentialAmounts = [];
  
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const rawValue = Number(data.readBigUInt64LE(offset));
      if (rawValue > 0) {
        const islandValue = rawValue / 1e6;
        
        // Check if this could be a reasonable ISLAND amount
        if (islandValue >= 1000 && islandValue <= 50000000) {
          potentialAmounts.push({
            offset: offset,
            rawValue: rawValue,
            islandValue: islandValue
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  console.log(`Found ${potentialAmounts.length} potential ISLAND amounts:`);
  for (const amount of potentialAmounts.slice(0, 10)) {
    console.log(`  Offset ${amount.offset}: ${amount.islandValue.toFixed(3)} ISLAND (raw: ${amount.rawValue})`);
  }
  
  // Also check the canonical deposit offsets
  console.log('\nChecking canonical deposit offsets:');
  for (let i = 0; i < 5; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const isUsed = data[offset];
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        const lockupKind = data[offset + 24];
        const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
        
        console.log(`  Deposit ${i} (offset ${offset}):`);
        console.log(`    isUsed: ${isUsed}`);
        console.log(`    rawAmount: ${rawAmount} (${rawAmount / 1e6} ISLAND)`);
        console.log(`    lockupKind: ${lockupKind}`);
        console.log(`    lockupEndTs: ${lockupEndTs}`);
      } catch (error) {
        console.log(`    Error reading deposit ${i}: ${error.message}`);
      }
    }
  }
}

/**
 * Debug specific wallets
 */
async function debugWallets() {
  const testWallets = [
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC' // This one worked previously
  ];
  
  console.log('VSR ACCOUNT STRUCTURE DEBUG');
  console.log('===========================');
  
  for (const wallet of testWallets) {
    console.log(`\nAnalyzing wallet: ${wallet}`);
    
    // Find Voter accounts
    const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 8, bytes: wallet } }
      ]
    });
    
    console.log(`Found ${voterAccounts.length} Voter accounts`);
    
    for (const { pubkey, account } of voterAccounts) {
      debugAccountStructure(account.data, pubkey.toBase58());
    }
  }
}

debugWallets()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });