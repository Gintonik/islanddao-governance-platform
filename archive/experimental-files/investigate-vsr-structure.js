/**
 * Investigate VSR Structure for Multi-Lockup Accounts
 * Deep analysis of how locked deposits are actually stored
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const connection = new Connection(process.env.HELIUS_RPC_URL);

async function analyzeVSRAccount(accountPubkey, walletAddress, expectedAmounts) {
  console.log(`\nAnalyzing VSR account: ${accountPubkey}`);
  console.log(`Expected amounts: ${expectedAmounts.join(', ')}`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Account size: ${data.length} bytes`);
  
  // Check authority fields
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    console.log(`Authority: ${authority}`);
    console.log(`VoterAuthority: ${voterAuthority}`);
    console.log(`Matches wallet: ${authority === walletAddress}`);
  } catch (e) {
    console.log('Error reading authorities');
  }
  
  // Scan for expected amounts throughout the account data
  console.log('\nScanning for expected amounts:');
  for (const expectedAmount of expectedAmounts) {
    const expectedRaw = Math.round(expectedAmount * 1e6);
    console.log(`\nLooking for ${expectedAmount} ISLAND (${expectedRaw} raw):`);
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const rawValue = Number(data.readBigUInt64LE(offset));
        if (rawValue === expectedRaw) {
          console.log(`  Found at offset ${offset}`);
          
          // Check surrounding data for lockup info
          if (offset >= 8) {
            const prevValue = Number(data.readBigUInt64LE(offset - 8));
            console.log(`    Previous 8 bytes: ${prevValue}`);
          }
          if (offset + 16 <= data.length) {
            const nextValue = Number(data.readBigUInt64LE(offset + 8));
            console.log(`    Next 8 bytes: ${nextValue}`);
          }
          
          // Check for potential lockup data nearby
          for (let scanOffset = offset - 32; scanOffset <= offset + 32; scanOffset += 8) {
            if (scanOffset >= 0 && scanOffset + 8 <= data.length && scanOffset !== offset) {
              try {
                const scanValue = Number(data.readBigUInt64LE(scanOffset));
                // Check if this looks like a timestamp (2020-2030 range)
                if (scanValue > 1577836800 && scanValue < 1893456000) {
                  const date = new Date(scanValue * 1000);
                  console.log(`    Potential timestamp at offset ${scanOffset}: ${date.toISOString().split('T')[0]}`);
                }
                // Check for lockup kind (0-4)
                if (scanOffset < data.length) {
                  const kindByte = data[scanOffset];
                  if (kindByte >= 0 && kindByte <= 4) {
                    console.log(`    Potential lockup kind at offset ${scanOffset}: ${kindByte}`);
                  }
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  // Analyze deposit entry structure
  console.log('\nAnalyzing formal deposit entries:');
  const depositEntrySize = 56;
  const maxDeposits = 32;
  
  for (let i = 0; i < maxDeposits; i++) {
    const offset = 104 + (i * depositEntrySize);
    
    if (offset + depositEntrySize > data.length) break;
    
    try {
      const isUsed = data[offset];
      const amountRaw = Number(data.readBigUInt64LE(offset + 8));
      const amount = amountRaw / 1e6;
      const lockupKind = data[offset + 32];
      const startTs = Number(data.readBigUInt64LE(offset + 40));
      const endTs = Number(data.readBigUInt64LE(offset + 48));
      
      if (isUsed === 1 || amount > 0) {
        console.log(`  Entry ${i}: isUsed=${isUsed}, amount=${amount.toLocaleString()}, kind=${lockupKind}`);
        if (startTs > 0) console.log(`    Start: ${new Date(startTs * 1000).toISOString().split('T')[0]}`);
        if (endTs > 0) console.log(`    End: ${new Date(endTs * 1000).toISOString().split('T')[0]}`);
      }
    } catch (e) {
      continue;
    }
  }
}

async function investigateMultiLockup() {
  console.log('INVESTIGATING MULTI-LOCKUP VSR STRUCTURE');
  console.log('========================================');
  
  // Get VSR accounts for our test wallets
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  const testWallets = [
    {
      wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
      expectedAmounts: [1500000, 2000000, 3682784.632186], // Known deposit amounts
      name: 'Takisoul'
    },
    {
      wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh',
      expectedAmounts: [10000, 37626.982836, 25738.998886, 3913], // Known deposit amounts
      name: 'GJdRQcsy'
    }
  ];
  
  for (const testCase of testWallets) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`INVESTIGATING ${testCase.name.toUpperCase()}`);
    
    // Find VSR account for this wallet
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      try {
        let authority = null;
        if (data.length >= 40) {
          authority = new PublicKey(data.slice(8, 40)).toBase58();
        }
        
        if (authority === testCase.wallet) {
          await analyzeVSRAccount(account.pubkey.toBase58(), testCase.wallet, testCase.expectedAmounts);
          break;
        }
      } catch (e) {}
    }
  }
}

investigateMultiLockup().catch(console.error);