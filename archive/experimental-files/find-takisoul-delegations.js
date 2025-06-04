/**
 * Find All Delegations TO Takisoul
 * Search for VSR accounts that delegate voting power to Takisoul's wallet
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse deposits using proven offset method
 */
function parseDepositsFromOffsets(data) {
  const deposits = [];
  const proven_offsets = [112, 184, 192, 264, 272, 344, 352];
  
  for (const offset of proven_offsets) {
    if (offset + 8 > data.length) continue;
    
    try {
      const rawAmount = data.readBigUInt64LE(offset);
      const amount = Number(rawAmount) / 1e6;
      
      if (amount >= 1 && amount <= 50000000) {
        // Check isUsed flag at nearby positions
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
          deposits.push({
            offset,
            amount,
            votingPower: amount * 1.0 // All lockups expired
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

/**
 * Find all VSR accounts that delegate TO Takisoul
 */
async function findDelegationsToTakisoul() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  console.log(`SEARCHING FOR DELEGATIONS TO TAKISOUL`);
  console.log(`Target delegate: ${takisoulWallet}`);
  console.log('='.repeat(60));
  
  try {
    // Get all VSR program accounts
    console.log('Loading all VSR program accounts...');
    const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    
    console.log(`Found ${allAccounts.length} total VSR accounts`);
    
    let delegationAccounts = [];
    let processedCount = 0;
    
    for (const account of allAccounts) {
      processedCount++;
      
      if (processedCount % 2000 === 0) {
        console.log(`Processed ${processedCount}/${allAccounts.length} accounts...`);
      }
      
      try {
        const data = account.account.data;
        
        // Skip if account is too small to be a Voter account
        if (data.length < 100) continue;
        
        // Extract authority (offset 32) and voter_authority (offset 64)
        const authorityBytes = data.slice(32, 64);
        const authority = new PublicKey(authorityBytes).toString();
        
        const voterAuthorityBytes = data.slice(64, 96);
        const voterAuthority = new PublicKey(voterAuthorityBytes).toString();
        
        // Check if this account delegates TO Takisoul
        // Delegation means: voter_authority === takisoulWallet AND authority !== takisoulWallet
        if (voterAuthority === takisoulWallet && authority !== takisoulWallet) {
          console.log(`\n*** FOUND DELEGATION ${delegationAccounts.length + 1} ***`);
          console.log(`Account: ${account.pubkey.toString()}`);
          console.log(`Size: ${data.length} bytes`);
          console.log(`Owner (authority): ${authority}`);
          console.log(`Delegate (voter_authority): ${voterAuthority}`);
          
          // Parse deposits from this account
          const deposits = parseDepositsFromOffsets(data);
          
          if (deposits.length > 0) {
            console.log(`Delegated deposits:`);
            let totalDelegatedPower = 0;
            for (const deposit of deposits) {
              console.log(`  - ${deposit.amount.toFixed(6)} ISLAND = ${deposit.votingPower.toFixed(2)} power (offset ${deposit.offset})`);
              totalDelegatedPower += deposit.votingPower;
            }
            console.log(`Total delegated power: ${totalDelegatedPower.toFixed(2)} ISLAND`);
            
            delegationAccounts.push({
              pubkey: account.pubkey.toString(),
              authority,
              voterAuthority,
              deposits,
              totalDelegatedPower
            });
          } else {
            console.log(`No valid deposits found in this account`);
          }
        }
        
      } catch (error) {
        continue;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DELEGATION SEARCH RESULTS FOR TAKISOUL`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Processed: ${processedCount} total VSR accounts`);
    console.log(`Delegation accounts found: ${delegationAccounts.length}`);
    
    if (delegationAccounts.length > 0) {
      let grandTotalDelegated = 0;
      
      console.log(`\nDELEGATION ACCOUNTS BREAKDOWN:`);
      for (let i = 0; i < delegationAccounts.length; i++) {
        const account = delegationAccounts[i];
        console.log(`\nDelegation ${i + 1}: ${account.pubkey.slice(0, 8)}...`);
        console.log(`  From: ${account.authority.slice(0, 8)}...`);
        console.log(`  To: ${account.voterAuthority.slice(0, 8)}...`);
        console.log(`  Deposits: ${account.deposits.length}`);
        console.log(`  Delegated Power: ${account.totalDelegatedPower.toFixed(2)} ISLAND`);
        grandTotalDelegated += account.totalDelegatedPower;
      }
      
      console.log(`\n*** TOTAL DELEGATED GOVERNANCE POWER TO TAKISOUL: ${grandTotalDelegated.toFixed(2)} ISLAND ***`);
      console.log(`Expected: ~8.7M ISLAND`);
      console.log(`Difference: ${Math.abs(grandTotalDelegated - 8700000).toFixed(2)} ISLAND`);
    } else {
      console.log(`\nNO DELEGATIONS TO TAKISOUL FOUND!`);
    }
    
  } catch (error) {
    console.error('Error searching for delegations:', error.message);
  }
}

findDelegationsToTakisoul().catch(console.error);