/**
 * Investigate Legend's 2,000 ISLAND governance power discrepancy
 * Should show 0 but calculator reports 2,000 - find the root cause
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');

async function investigateLegendGovernance() {
  console.log('INVESTIGATING LEGEND GOVERNANCE POWER DISCREPANCY');
  console.log('================================================');
  console.log('Expected: 0 ISLAND');
  console.log('Calculator shows: 2,000 ISLAND');
  console.log('Need to find: Why the discrepancy exists\n');
  
  const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
  
  try {
    // 1. Get live API response
    console.log('1. CHECKING LIVE API RESPONSE');
    console.log('=============================');
    const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${legendWallet}`);
    const apiData = await response.json();
    console.log('API Response:', JSON.stringify(apiData, null, 2));
    
    // 2. Check VSR accounts for Legend
    console.log('\n2. SCANNING VSR ACCOUNTS FOR LEGEND');
    console.log('===================================');
    
    const vsrProgramId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
    const legendPublicKey = new PublicKey(legendWallet);
    
    // Find all VSR accounts for Legend
    const vsrAccounts = await connection.getProgramAccounts(vsrProgramId, {
      filters: [
        {
          memcmp: {
            offset: 40, // Standard voter authority offset
            bytes: legendPublicKey.toBase58()
          }
        }
      ]
    });
    
    console.log(`Found ${vsrAccounts.length} VSR accounts for Legend:`);
    
    vsrAccounts.forEach((account, index) => {
      console.log(`\nVSR Account ${index + 1}:`);
      console.log(`  Address: ${account.pubkey.toBase58()}`);
      console.log(`  Data length: ${account.account.data.length} bytes`);
      console.log(`  Owner: ${account.account.owner.toBase58()}`);
      
      // Extract basic info from raw data
      const data = account.account.data;
      console.log(`  Raw data preview: ${data.slice(0, 100).toString('hex')}`);
      
      // Look for deposit entries at standard offsets
      console.log('\n  Checking for deposits at standard offsets:');
      for (let offset = 112; offset < data.length - 64; offset += 88) {
        if (offset + 64 <= data.length) {
          const amountBytes = data.slice(offset, offset + 8);
          const amount = amountBytes.readBigUInt64LE();
          
          if (amount > 0) {
            const amountISLAND = Number(amount) / 1_000_000; // Convert from lamports
            console.log(`    Offset ${offset}: ${amountISLAND.toFixed(6)} ISLAND`);
            
            // Check if this deposit is marked as used/withdrawn
            const isUsedOffset = offset + 72; // Standard isUsed flag position
            if (isUsedOffset < data.length) {
              const isUsed = data[isUsedOffset];
              console.log(`      isUsed flag: ${isUsed} (${isUsed === 1 ? 'WITHDRAWN' : 'ACTIVE'})`);
            }
            
            // Check lockup timestamps
            const startTsOffset = offset + 40;
            const endTsOffset = offset + 48;
            if (endTsOffset + 8 <= data.length) {
              const startTs = data.readBigUInt64LE(startTsOffset);
              const endTs = data.readBigUInt64LE(endTsOffset);
              console.log(`      Start: ${new Date(Number(startTs) * 1000).toISOString()}`);
              console.log(`      End: ${new Date(Number(endTs) * 1000).toISOString()}`);
              
              const now = Math.floor(Date.now() / 1000);
              const isExpired = Number(endTs) < now;
              console.log(`      Status: ${isExpired ? 'EXPIRED' : 'ACTIVE'}`);
            }
          }
        }
      }
    });
    
    // 3. Check what the VSR calculator logic actually processes
    console.log('\n3. VSR CALCULATOR LOGIC ANALYSIS');
    console.log('================================');
    
    // Load all VSR accounts for processing (same as calculator)
    const allVSRAccountsResponse = await connection.getProgramAccounts(vsrProgramId);
    console.log(`Total VSR accounts in program: ${allVSRAccountsResponse.length}`);
    
    // Find which accounts the calculator identifies as Legend-controlled
    const legendControlledAccounts = [];
    
    for (const account of allVSRAccountsResponse) {
      const data = account.account.data;
      
      // Check multiple authority positions
      const authorityOffsets = [40, 8, 72]; // Common positions for voter authority
      
      for (const offset of authorityOffsets) {
        if (offset + 32 <= data.length) {
          const authorityBytes = data.slice(offset, offset + 32);
          try {
            const authority = new PublicKey(authorityBytes);
            if (authority.toBase58() === legendWallet) {
              legendControlledAccounts.push({
                address: account.pubkey.toBase58(),
                authorityOffset: offset,
                dataLength: data.length
              });
              break;
            }
          } catch (e) {
            // Invalid public key, continue
          }
        }
      }
    }
    
    console.log(`Calculator found ${legendControlledAccounts.length} controlled accounts:`);
    legendControlledAccounts.forEach((acc, i) => {
      console.log(`  ${i + 1}. ${acc.address} (authority at offset ${acc.authorityOffset})`);
    });
    
    // 4. Simulate the exact calculator logic
    console.log('\n4. SIMULATING CALCULATOR LOGIC');
    console.log('==============================');
    
    let totalCalculatedPower = 0;
    const currentTime = Math.floor(Date.now() / 1000);
    
    for (const controlledAccount of legendControlledAccounts) {
      console.log(`\nProcessing account: ${controlledAccount.address}`);
      
      const accountData = await connection.getAccountInfo(new PublicKey(controlledAccount.address));
      if (!accountData) continue;
      
      const data = accountData.data;
      let accountPower = 0;
      
      // Parse deposits using the same logic as the calculator
      for (let offset = 112; offset < data.length - 64; offset += 88) {
        if (offset + 64 <= data.length) {
          const amountBytes = data.slice(offset, offset + 8);
          const amount = amountBytes.readBigUInt64LE();
          
          if (amount > 0) {
            const amountISLAND = Number(amount) / 1_000_000;
            
            // Check withdrawal flags (same as calculator)
            const isUsedOffset = offset + 72;
            const isUsed = isUsedOffset < data.length ? data[isUsedOffset] : 0;
            
            console.log(`  Deposit: ${amountISLAND} ISLAND, isUsed: ${isUsed}`);
            
            // Calculator filters out deposits with isUsed === 1
            if (isUsed === 1) {
              console.log(`    ❌ FILTERED OUT: Stale deposit (isUsed = 1)`);
              continue;
            }
            
            // Check lockup expiration
            const endTsOffset = offset + 48;
            if (endTsOffset + 8 <= data.length) {
              const endTs = data.readBigUInt64LE(endTsOffset);
              const isExpired = Number(endTs) < currentTime;
              
              if (isExpired) {
                console.log(`    ❌ FILTERED OUT: Expired lockup`);
                continue;
              }
            }
            
            // If we reach here, calculator would count this deposit
            console.log(`    ✅ COUNTED: ${amountISLAND} ISLAND`);
            accountPower += amountISLAND;
          }
        }
      }
      
      console.log(`  Account total: ${accountPower} ISLAND`);
      totalCalculatedPower += accountPower;
    }
    
    console.log(`\nFINAL CALCULATED POWER: ${totalCalculatedPower} ISLAND`);
    console.log(`API REPORTED POWER: ${apiData.nativeGovernancePower || 0} ISLAND`);
    console.log(`DISCREPANCY: ${Math.abs(totalCalculatedPower - (apiData.nativeGovernancePower || 0))} ISLAND`);
    
    // 5. Root cause analysis
    console.log('\n5. ROOT CAUSE ANALYSIS');
    console.log('======================');
    
    if (totalCalculatedPower === 2000) {
      console.log('✓ Reproduced the 2,000 ISLAND calculation');
      console.log('➜ Need to investigate why this deposit is not properly filtered');
      console.log('➜ Possible causes:');
      console.log('  - isUsed flag not set correctly');
      console.log('  - Lockup expiration not detected');
      console.log('  - Wrong offset calculations');
      console.log('  - Stale data in VSR account');
    } else {
      console.log('❌ Could not reproduce the calculation');
      console.log('➜ API may be using different logic or cached data');
    }
    
  } catch (error) {
    console.error('Investigation failed:', error);
  }
}

investigateLegendGovernance().catch(console.error);