/**
 * Investigate Takisoul's deposit details to verify lockup status
 * Check the additional VSR account mentioned and analyze lockup expiration dates
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');

async function investigateTakisoulDeposits() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  const additionalVSRAccount = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  
  console.log('🔍 Investigating Takisoul\'s deposit lockup status');
  console.log(`Wallet: ${takisoulWallet}\n`);
  
  // Current timestamp for lockup analysis
  const now = Math.floor(Date.now() / 1000);
  console.log(`Current timestamp: ${now} (${new Date().toISOString()})\n`);
  
  try {
    // Find all VSR accounts for Takisoul
    const programId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 8, bytes: takisoulWallet } }
      ]
    });
    
    console.log(`Found ${accounts.length} VSR accounts:`);
    accounts.forEach((account, i) => {
      console.log(`  ${i + 1}. ${account.pubkey.toString()}`);
    });
    
    // Also check the additional account mentioned
    console.log(`\nAdditional account to check: ${additionalVSRAccount}`);
    
    const allAccountsToCheck = [
      ...accounts.map(acc => acc.pubkey.toString()),
      additionalVSRAccount
    ];
    
    for (const accountAddress of allAccountsToCheck) {
      console.log(`\n=== Analyzing ${accountAddress} ===`);
      
      try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(accountAddress));
        if (!accountInfo) {
          console.log('Account not found or invalid');
          continue;
        }
        
        const data = accountInfo.data;
        console.log(`Data length: ${data.length} bytes`);
        
        // Check deposits at known offsets
        const offsets = [104, 112, 184, 264, 344, 424];
        
        for (const offset of offsets) {
          if (offset + 8 <= data.length) {
            const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            if (amount >= 1000) {
              console.log(`\nOffset ${offset}: ${amount.toLocaleString()} ISLAND`);
              
              // Check for lockup metadata around this amount
              const metadataOffsets = [
                { start: offset - 32, end: offset - 24, kind: offset - 16 },
                { start: offset + 48, end: offset + 56, kind: offset + 64 },
                { start: offset + 80, end: offset + 88, kind: offset + 96 }
              ];
              
              for (const meta of metadataOffsets) {
                if (meta.start >= 0 && meta.end + 8 <= data.length && meta.kind < data.length) {
                  try {
                    const startTs = Number(data.readBigUInt64LE(meta.start));
                    const endTs = Number(data.readBigUInt64LE(meta.end));
                    const kind = data[meta.kind];
                    
                    // Valid timestamp range check
                    if (startTs > 1577836800 && endTs > startTs && endTs < 1893456000 && kind >= 1 && kind <= 4) {
                      const startDate = new Date(startTs * 1000).toISOString().split('T')[0];
                      const endDate = new Date(endTs * 1000).toISOString().split('T')[0];
                      const isExpired = endTs <= now;
                      const remainingDays = Math.ceil((endTs - now) / 86400);
                      
                      const lockupTypes = ['None', 'Cliff', 'Constant', 'Vesting', 'Monthly'];
                      
                      console.log(`  Lockup found: ${lockupTypes[kind]} (${startDate} → ${endDate})`);
                      console.log(`  Status: ${isExpired ? 'EXPIRED/UNLOCKED' : `Active (${remainingDays} days remaining)`}`);
                      
                      if (isExpired) {
                        console.log(`  ⚠️  This deposit should be UNLOCKED (expired ${Math.abs(remainingDays)} days ago)`);
                      }
                    }
                  } catch (e) {
                    // Skip invalid metadata
                  }
                }
              }
            }
          }
        }
        
      } catch (error) {
        console.log(`Error analyzing ${accountAddress}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('Investigation failed:', error);
  }
}

investigateTakisoulDeposits();