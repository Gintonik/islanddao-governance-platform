/**
 * Analyze Authentic VSR Account Structure
 * Find and examine VSR accounts with actual deposits to understand correct parsing
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Find VSR accounts with significant deposits for structure analysis
 */
async function findAccountsWithDeposits() {
  console.log('ANALYZING AUTHENTIC VSR ACCOUNT STRUCTURE');
  console.log('Finding accounts with significant deposits...');
  console.log('='.repeat(60));
  
  try {
    // Get all VSR program accounts
    const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    
    console.log(`Found ${allAccounts.length} total VSR accounts`);
    
    const accountsWithDeposits = [];
    let processedCount = 0;
    
    for (const account of allAccounts) {
      processedCount++;
      
      if (processedCount % 2000 === 0) {
        console.log(`Processed ${processedCount}/${allAccounts.length} accounts...`);
      }
      
      try {
        const data = account.account.data;
        
        // Skip small accounts
        if (data.length < 1000) continue;
        
        // Search for large ISLAND amounts in the data
        const proven_offsets = [112, 184, 192, 264, 272, 344, 352];
        let totalDeposits = 0;
        let validDeposits = [];
        
        for (const offset of proven_offsets) {
          if (offset + 8 > data.length) continue;
          
          try {
            const rawAmount = data.readBigUInt64LE(offset);
            const amount = Number(rawAmount) / 1e6;
            
            if (amount >= 1000 && amount <= 50000000) {
              // Check if deposit is marked as used
              let isUsed = false;
              const usedCheckOffsets = [offset - 8, offset + 8, offset - 1, offset + 1];
              for (const usedOffset of usedCheckOffsets) {
                if (usedOffset >= 0 && usedOffset < data.length) {
                  const flag = data.readUInt8(usedOffset);
                  if (flag === 1) {
                    isUsed = true;
                    break;
                  }
                }
              }
              
              if (isUsed) {
                validDeposits.push({ offset, amount });
                totalDeposits += amount;
              }
            }
          } catch (error) {
            continue;
          }
        }
        
        // If we found significant deposits, analyze this account
        if (totalDeposits >= 10000) {
          // Extract authority and voter_authority
          const authorityBytes = data.slice(32, 64);
          const authority = new PublicKey(authorityBytes).toString();
          
          const voterAuthorityBytes = data.slice(64, 96);
          const voterAuthority = new PublicKey(voterAuthorityBytes).toString();
          
          accountsWithDeposits.push({
            pubkey: account.pubkey.toString(),
            authority,
            voterAuthority,
            totalDeposits,
            validDeposits,
            accountSize: data.length
          });
        }
        
      } catch (error) {
        continue;
      }
    }
    
    // Sort by total deposits (largest first)
    accountsWithDeposits.sort((a, b) => b.totalDeposits - a.totalDeposits);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`FOUND ${accountsWithDeposits.length} ACCOUNTS WITH SIGNIFICANT DEPOSITS`);
    console.log(`${'='.repeat(60)}`);
    
    // Analyze top 10 accounts
    const topAccounts = accountsWithDeposits.slice(0, 10);
    
    for (let i = 0; i < topAccounts.length; i++) {
      const account = topAccounts[i];
      console.log(`\nAccount ${i + 1}: ${account.pubkey.slice(0, 8)}...`);
      console.log(`  Authority: ${account.authority.slice(0, 8)}...`);
      console.log(`  Voter Authority: ${account.voterAuthority.slice(0, 8)}...`);
      console.log(`  Total Deposits: ${account.totalDeposits.toFixed(2)} ISLAND`);
      console.log(`  Valid Deposits: ${account.validDeposits.length}`);
      console.log(`  Account Size: ${account.accountSize} bytes`);
      
      // Check if authority and voter_authority are the same (native) or different (delegation)
      if (account.authority === account.voterAuthority) {
        console.log(`  Type: NATIVE (owner controls their own voting power)`);
      } else {
        console.log(`  Type: DELEGATION (${account.authority.slice(0, 8)}... delegates to ${account.voterAuthority.slice(0, 8)}...)`);
      }
      
      // Show deposit breakdown
      console.log(`  Deposit breakdown:`);
      for (const deposit of account.validDeposits) {
        console.log(`    - ${deposit.amount.toFixed(6)} ISLAND at offset ${deposit.offset}`);
      }
    }
    
    // Analysis summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`STRUCTURE ANALYSIS SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    
    const nativeAccounts = topAccounts.filter(acc => acc.authority === acc.voterAuthority);
    const delegationAccounts = topAccounts.filter(acc => acc.authority !== acc.voterAuthority);
    
    console.log(`Native accounts (authority === voter_authority): ${nativeAccounts.length}`);
    console.log(`Delegation accounts (authority !== voter_authority): ${delegationAccounts.length}`);
    
    if (nativeAccounts.length > 0) {
      const totalNativeDeposits = nativeAccounts.reduce((sum, acc) => sum + acc.totalDeposits, 0);
      console.log(`Total native deposits: ${totalNativeDeposits.toFixed(2)} ISLAND`);
      
      console.log(`\nNative account authorities (wallet owners):`);
      for (const acc of nativeAccounts) {
        console.log(`  ${acc.authority}: ${acc.totalDeposits.toFixed(2)} ISLAND`);
      }
    }
    
    if (delegationAccounts.length > 0) {
      const totalDelegatedDeposits = delegationAccounts.reduce((sum, acc) => sum + acc.totalDeposits, 0);
      console.log(`Total delegated deposits: ${totalDelegatedDeposits.toFixed(2)} ISLAND`);
    }
    
  } catch (error) {
    console.error('Error analyzing VSR structure:', error.message);
  }
}

findAccountsWithDeposits().catch(console.error);