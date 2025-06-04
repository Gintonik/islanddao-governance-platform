/**
 * Quick VSR Test for Target Wallets
 * Tests native deposit extraction without delegation scanning
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Extract deposits from VSR account data
 */
function extractDeposits(data, verbose = false) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  
  if (verbose) {
    console.log(`     Scanning account data (${data.length} bytes)`);
  }
  
  // Scan VSR deposit entries at canonical offsets
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const isUsedByte = data[offset];
        const isUsed = isUsedByte !== 0;
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        const lockupKind = data[offset + 24];
        const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
        
        // Check for valid amounts regardless of isUsed flag for some edge cases
        if (rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 1000 && islandAmount <= 50000000) {
            const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
            const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
            
            deposits.push({
              amount: islandAmount,
              multiplier: multiplier,
              power: islandAmount * multiplier,
              isActive: isActiveLockup,
              offset: offset
            });
            
            if (verbose) {
              const status = isActiveLockup ? 'ACTIVE' : 'EXPIRED';
              console.log(`       Deposit ${i}: ${islandAmount.toFixed(3)} × ${multiplier.toFixed(2)}x = ${(islandAmount * multiplier).toFixed(3)} ISLAND (${status})`);
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return deposits;
}

/**
 * Test native governance power for a wallet
 */
async function testNativeGovernancePower(walletAddress, verbose = false) {
  console.log(`Testing ${walletAddress.substring(0,8)}...`);
  
  // Find Voter accounts where wallet is authority
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });
  
  console.log(`  Found ${voterAccounts.length} Voter accounts where wallet is authority`);
  
  let totalNativePower = 0;
  const allDeposits = [];
  
  for (const { pubkey, account } of voterAccounts) {
    if (verbose) {
      console.log(`   Analyzing account: ${pubkey.toBase58()}`);
    }
    
    const deposits = extractDeposits(account.data, verbose);
    allDeposits.push(...deposits);
    
    for (const deposit of deposits) {
      totalNativePower += deposit.power;
    }
    
    if (verbose && deposits.length === 0) {
      console.log(`     No valid deposits found in this account`);
    }
  }
  
  console.log(`🏛️ VWR Total: N/A`);
  console.log(`🟢 Native from Deposits: ${totalNativePower.toFixed(3)}`);
  console.log(`🟡 Delegated from Others: 0.000`);
  console.log(`🧠 Inference Used? false`);
  console.log(`  Total deposits found: ${allDeposits.length}`);
  console.log(`  Total native power: ${totalNativePower.toFixed(3)} ISLAND`);
  console.log('');
  
  return { totalNativePower, deposits: allDeposits, accountCount: voterAccounts.length };
}

/**
 * Test target wallets
 */
async function testTargetWallets() {
  console.log('QUICK VSR NATIVE POWER TEST');
  console.log('===========================');
  console.log('');
  
  const testWallets = [
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1'
  ];
  
  for (const wallet of testWallets) {
    try {
      await testNativeGovernancePower(wallet, true);
    } catch (error) {
      console.log(`  Error testing ${wallet}: ${error.message}`);
      console.log('');
    }
  }
}

// Run test
testTargetWallets()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });