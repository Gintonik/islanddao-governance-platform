/**
 * Investigate Takisoul for similar expired deposit issues
 * Check if any deposits should be filtered but aren't
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');

async function investigateTakisoulSimilarIssues() {
  console.log('INVESTIGATING TAKISOUL FOR SIMILAR EXPIRED DEPOSIT ISSUES');
  console.log('========================================================');
  
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  
  try {
    // 1. Get current API calculation
    console.log('1. CURRENT TAKISOUL CALCULATION');
    console.log('===============================');
    const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${takisoulWallet}`);
    const apiData = await response.json();
    console.log(`API Result: ${apiData.nativeGovernancePower?.toLocaleString()} ISLAND`);
    console.log(`Deposits found: ${apiData.deposits?.length || 0}`);
    
    if (apiData.deposits) {
      apiData.deposits.forEach((deposit, i) => {
        console.log(`  ${i + 1}. ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(3)}x = ${deposit.power.toLocaleString()} power (offset ${deposit.offset})`);
      });
    }
    
    // 2. Detailed VSR account analysis
    console.log('\n2. DETAILED VSR ACCOUNT ANALYSIS');
    console.log('================================');
    
    const vsrProgramId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
    const takisoulPublicKey = new PublicKey(takisoulWallet);
    
    // Find Takisoul's VSR accounts
    const vsrAccounts = await connection.getProgramAccounts(vsrProgramId, {
      filters: [
        {
          memcmp: {
            offset: 8, // Check authority at offset 8
            bytes: takisoulPublicKey.toBase58()
          }
        }
      ]
    });
    
    console.log(`Found ${vsrAccounts.length} VSR accounts for Takisoul:`);
    
    const currentTime = Math.floor(Date.now() / 1000);
    let totalSuspiciousDeposits = 0;
    
    for (const [index, account] of vsrAccounts.entries()) {
      console.log(`\nVSR Account ${index + 1}: ${account.pubkey.toBase58()}`);
      console.log(`  Data length: ${account.account.data.length} bytes`);
      
      const data = account.account.data;
      const suspiciousDeposits = [];
      
      // Check for deposits at various offsets
      const checkOffsets = [104, 112, 184, 264, 344, 424];
      
      for (const offset of checkOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const amountBytes = data.slice(offset, offset + 8);
            const amount = Number(amountBytes.readBigUInt64LE()) / 1_000_000;
            
            if (amount > 1000) {
              // Check isUsed flag patterns
              const isUsedOffset = offset + 72;
              const isUsed = isUsedOffset < data.length ? data[isUsedOffset] : 0;
              
              // Check lockup timestamps if available
              let lockupStatus = 'unknown';
              const startTsOffset = offset + 40;
              const endTsOffset = offset + 48;
              
              if (endTsOffset + 8 <= data.length) {
                try {
                  const startTs = Number(data.readBigUInt64LE(startTsOffset));
                  const endTs = Number(data.readBigUInt64LE(endTsOffset));
                  
                  if (startTs > 0 && endTs > 0) {
                    const isExpired = endTs < currentTime;
                    const remainingDays = Math.max(0, (endTs - currentTime) / (24 * 3600));
                    lockupStatus = isExpired ? `EXPIRED (${Math.floor((currentTime - endTs) / (24 * 3600))} days ago)` : `ACTIVE (${Math.floor(remainingDays)} days remaining)`;
                  }
                } catch (e) {
                  lockupStatus = 'invalid_timestamps';
                }
              }
              
              console.log(`    Offset ${offset}: ${amount.toLocaleString()} ISLAND`);
              console.log(`      isUsed: ${isUsed} (${isUsed === 1 ? 'WITHDRAWN' : 'UNKNOWN'})`);
              console.log(`      Lockup: ${lockupStatus}`);
              
              // Flag suspicious deposits (expired but still being counted)
              if (lockupStatus.includes('EXPIRED') && isUsed !== 1) {
                suspiciousDeposits.push({
                  amount,
                  offset,
                  isUsed,
                  status: 'SUSPICIOUS: Expired but not marked as withdrawn'
                });
                totalSuspiciousDeposits++;
                console.log(`      ⚠️  SUSPICIOUS: Expired deposit not properly filtered`);
              }
              
              // Flag unusual isUsed values
              if (isUsed !== 0 && isUsed !== 1) {
                console.log(`      ⚠️  UNUSUAL isUsed VALUE: ${isUsed}`);
              }
            }
          } catch (e) {
            // Skip invalid data
          }
        }
      }
      
      if (suspiciousDeposits.length > 0) {
        console.log(`\n  ⚠️  Found ${suspiciousDeposits.length} suspicious deposits in this account:`);
        suspiciousDeposits.forEach(dep => {
          console.log(`    - ${dep.amount.toLocaleString()} ISLAND at offset ${dep.offset}: ${dep.status}`);
        });
      }
    }
    
    // 3. Comparison with realms.today expected values
    console.log('\n3. REALMS.TODAY COMPARISON');
    console.log('=========================');
    console.log('Expected Takisoul power: ~8.7M ISLAND (based on user reports)');
    console.log(`Current calculator: ${apiData.nativeGovernancePower?.toLocaleString()} ISLAND`);
    
    const discrepancy = Math.abs((apiData.nativeGovernancePower || 0) - 8700000);
    if (discrepancy > 100000) {
      console.log(`⚠️  SIGNIFICANT DISCREPANCY: ${discrepancy.toLocaleString()} ISLAND difference`);
    } else {
      console.log('✅ Calculation appears reasonable');
    }
    
    // 4. Summary and recommendations
    console.log('\n4. SUMMARY AND RECOMMENDATIONS');
    console.log('==============================');
    console.log(`Total suspicious deposits found: ${totalSuspiciousDeposits}`);
    
    if (totalSuspiciousDeposits > 0) {
      console.log('⚠️  ISSUES DETECTED:');
      console.log('  - Expired deposits not being properly filtered');
      console.log('  - Similar pattern to Legend\'s issue');
      console.log('  - May need targeted filtering for Takisoul as well');
    } else {
      console.log('✅ No obvious issues detected');
      console.log('  - All deposits appear to be properly validated');
      console.log('  - Filtering logic working correctly');
    }
    
  } catch (error) {
    console.error('Investigation failed:', error);
  }
}

investigateTakisoulSimilarIssues().catch(console.error);