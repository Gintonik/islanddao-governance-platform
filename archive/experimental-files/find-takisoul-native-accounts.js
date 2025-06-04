/**
 * Find All Native VSR Accounts for Takisoul
 * Comprehensive search to find VSR accounts where authority === Takisoul's wallet
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
 * Find all VSR accounts owned by Takisoul
 */
async function findTakisoulNativeAccounts() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  console.log(`SEARCHING FOR NATIVE VSR ACCOUNTS FOR TAKISOUL`);
  console.log(`Wallet: ${takisoulWallet}`);
  console.log('='.repeat(60));
  
  try {
    // Get all VSR program accounts
    console.log('Loading all VSR program accounts...');
    const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      commitment: 'confirmed',
      encoding: 'base64'
    });
    
    console.log(`Found ${allAccounts.length} total VSR accounts`);
    
    let nativeAccounts = [];
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
        
        // Extract authority from offset 32 (32 bytes)
        const authorityBytes = data.slice(32, 64);
        const authority = new PublicKey(authorityBytes).toString();
        
        // Check if this account is owned by Takisoul
        if (authority === takisoulWallet) {
          console.log(`\n*** FOUND NATIVE ACCOUNT ${nativeAccounts.length + 1} ***`);
          console.log(`Account: ${account.pubkey.toString()}`);
          console.log(`Size: ${data.length} bytes`);
          console.log(`Authority: ${authority}`);
          
          // Parse deposits from this account
          const deposits = parseDepositsFromOffsets(data);
          
          if (deposits.length > 0) {
            console.log(`Deposits found:`);
            let totalPower = 0;
            for (const deposit of deposits) {
              console.log(`  - ${deposit.amount.toFixed(6)} ISLAND = ${deposit.votingPower.toFixed(2)} power (offset ${deposit.offset})`);
              totalPower += deposit.votingPower;
            }
            console.log(`Total power from this account: ${totalPower.toFixed(2)} ISLAND`);
            
            nativeAccounts.push({
              pubkey: account.pubkey.toString(),
              authority,
              deposits,
              totalPower
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
    console.log(`NATIVE ACCOUNT SEARCH RESULTS FOR TAKISOUL`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Processed: ${processedCount} total VSR accounts`);
    console.log(`Native accounts found: ${nativeAccounts.length}`);
    
    if (nativeAccounts.length > 0) {
      let grandTotal = 0;
      
      console.log(`\nNATIVE ACCOUNTS BREAKDOWN:`);
      for (let i = 0; i < nativeAccounts.length; i++) {
        const account = nativeAccounts[i];
        console.log(`\nAccount ${i + 1}: ${account.pubkey.slice(0, 8)}...`);
        console.log(`  Authority: ${account.authority}`);
        console.log(`  Deposits: ${account.deposits.length}`);
        console.log(`  Power: ${account.totalPower.toFixed(2)} ISLAND`);
        grandTotal += account.totalPower;
      }
      
      console.log(`\n*** TOTAL NATIVE GOVERNANCE POWER: ${grandTotal.toFixed(2)} ISLAND ***`);
      console.log(`Expected: ~8.7M ISLAND`);
      console.log(`Difference: ${Math.abs(grandTotal - 8700000).toFixed(2)} ISLAND`);
    } else {
      console.log(`\nNO NATIVE VSR ACCOUNTS FOUND!`);
      console.log(`This suggests Takisoul's governance power comes from delegation.`);
    }
    
  } catch (error) {
    console.error('Error searching for native accounts:', error.message);
  }
}

findTakisoulNativeAccounts().catch(console.error);