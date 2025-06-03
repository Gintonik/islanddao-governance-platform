/**
 * Debug Delegation Account Structure
 * Analyze specific delegation accounts to understand why deposits aren't being parsed
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Deep analysis of a specific delegation account
 */
async function analyzeDelegationAccount(accountPubkey) {
  console.log(`\nAnalyzing delegation account: ${accountPubkey}`);
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(accountPubkey));
  if (!accountInfo) {
    console.log('Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Account size: ${data.length} bytes`);
  
  // Parse authorities
  if (data.length >= 104) {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    console.log(`Authority: ${authority}`);
    console.log(`VoterAuthority: ${voterAuthority}`);
  }
  
  // Scan for any 8-byte amounts throughout the account
  console.log('\nScanning for amounts:');
  const foundAmounts = [];
  
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const rawAmount = Number(data.readBigUInt64LE(offset));
      if (rawAmount > 0) {
        const islandAmount = rawAmount / 1e6;
        
        if (islandAmount >= 1000 && islandAmount <= 50000000) {
          foundAmounts.push({
            offset: offset,
            rawAmount: rawAmount,
            islandAmount: islandAmount
          });
          console.log(`  Offset ${offset}: ${islandAmount.toFixed(3)} ISLAND (raw: ${rawAmount})`);
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  if (foundAmounts.length === 0) {
    console.log('  No significant amounts found');
  }
  
  // Try standard VSR deposit parsing
  console.log('\nTrying standard VSR deposit parsing:');
  const timestamp = Math.floor(Date.now() / 1000);
  
  for (let i = 0; i < 32; i++) {
    const offset = 104 + (87 * i);
    if (offset + 48 <= data.length) {
      try {
        const isUsedByte = data[offset];
        const rawAmount = Number(data.readBigUInt64LE(offset + 8));
        
        if (rawAmount > 0) {
          const islandAmount = rawAmount / 1e6;
          
          if (islandAmount >= 1) {
            const lockupKind = data[offset + 24];
            const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
            const isActiveLockup = lockupKind !== 0 && lockupEndTs > timestamp;
            const multiplier = isActiveLockup ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
            
            console.log(`  Deposit ${i}: ${islandAmount.toFixed(3)} ISLAND × ${multiplier.toFixed(2)}x = ${(islandAmount * multiplier).toFixed(3)} (used: ${isUsedByte}, lockup: ${lockupKind})`);
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return foundAmounts;
}

/**
 * Analyze all delegation accounts for 3PKhzE9w
 */
async function analyzeAllDelegations() {
  console.log('DELEGATION ACCOUNT STRUCTURE ANALYSIS');
  console.log('====================================');
  
  const targetWallet = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
  
  // Known delegation accounts from previous scan
  const delegationAccounts = [
    'N7qqtGiSKbk15nKSj1JsyGBAdpYqB1ohtQW6JAoo7Qa', // from ELEXG9cT
    '2QqyEyU1pjj1YXR3aUGV5feBDUDwHvxoFgnAhMNvyibb', // from 6GC6bAce
    '7YMyAEU3vJ9iPQmJiK7U9JyPMXghChkAmHNFXXdvb4CN', // from F9V4Lwo4
    '9bcDrX3JCvPjvoMcbuLoExH1E8ZenUU9VDSCTTDGjt8D', // from EGYbpow8
    'GMb1DmHWxg163Yy3EdfArzTkhpGSqVWPeVNEXYWR7aWM', // from 7vrFDrK9
    'HB2ZmBRgTC3m3jZVNujmwXEFAYkzrXLgFWBZb2VksTdm'  // from 84pGFuy1
  ];
  
  let totalFoundAmounts = 0;
  
  for (const accountPubkey of delegationAccounts) {
    const amounts = await analyzeDelegationAccount(accountPubkey);
    totalFoundAmounts += amounts.length;
  }
  
  console.log(`\nSummary: Found ${totalFoundAmounts} significant amounts across ${delegationAccounts.length} delegation accounts`);
  
  if (totalFoundAmounts === 0) {
    console.log('\nThe delegation accounts contain no detectable deposits.');
    console.log('This suggests either:');
    console.log('1. The deposits are stored in a different format');
    console.log('2. The delegation relationships have changed');
    console.log('3. The ground truth data reflects historical state');
  }
}

// Run the analysis
analyzeAllDelegations()
  .then(() => {
    console.log('\nDelegation structure analysis completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });