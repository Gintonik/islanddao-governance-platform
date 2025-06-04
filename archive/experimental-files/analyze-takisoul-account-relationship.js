/**
 * Analyze Takisoul's VSR Account Relationship
 * Deep dive into the GSrwtiSq account to understand the connection
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

/**
 * Analyze the relationship between Takisoul and the found VSR account
 */
async function analyzeTakisoulVSRRelationship() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  const vsrAccount = 'GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG';
  
  console.log(`ANALYZING TAKISOUL VSR ACCOUNT RELATIONSHIP`);
  console.log(`Takisoul Wallet: ${takisoulWallet}`);
  console.log(`VSR Account: ${vsrAccount}`);
  console.log('='.repeat(60));
  
  try {
    const account = await connection.getAccountInfo(new PublicKey(vsrAccount));
    if (!account) {
      console.log('VSR account not found');
      return;
    }
    
    const data = account.data;
    console.log(`Account size: ${data.length} bytes`);
    console.log(`Owner: ${account.owner.toString()}`);
    
    // Extract key fields from VSR account
    const authorityBytes = data.slice(32, 64);
    const authority = new PublicKey(authorityBytes).toString();
    
    const voterAuthorityBytes = data.slice(64, 96);
    const voterAuthority = new PublicKey(voterAuthorityBytes).toString();
    
    console.log(`\nVSR Account Fields:`);
    console.log(`Authority (owner): ${authority}`);
    console.log(`Voter Authority (delegate): ${voterAuthority}`);
    
    // Check relationships
    console.log(`\nRelationship Analysis:`);
    console.log(`Is Takisoul the owner? ${authority === takisoulWallet ? 'YES' : 'NO'}`);
    console.log(`Is Takisoul the delegate? ${voterAuthority === takisoulWallet ? 'YES' : 'NO'}`);
    
    if (authority === takisoulWallet) {
      console.log(`✅ This is Takisoul's NATIVE VSR account`);
    } else if (voterAuthority === takisoulWallet) {
      console.log(`📋 This account DELEGATES to Takisoul`);
      console.log(`   Real owner: ${authority.slice(0, 8)}...`);
    } else {
      console.log(`❌ No direct relationship found`);
    }
    
    // Parse deposits using proven offsets
    console.log(`\nDeposit Analysis:`);
    const proven_offsets = [112, 184, 192, 264, 272, 344, 352];
    let totalDeposits = 0;
    
    for (const offset of proven_offsets) {
      if (offset + 8 > data.length) continue;
      
      try {
        const rawAmount = data.readBigUInt64LE(offset);
        const amount = Number(rawAmount) / 1e6;
        
        if (amount >= 1 && amount <= 50000000) {
          // Check isUsed flag
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
          
          console.log(`Offset ${offset}: ${amount.toFixed(6)} ISLAND, isUsed=${isUsed}`);
          if (isUsed) {
            totalDeposits += amount;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    console.log(`\nTotal deposits in account: ${totalDeposits.toFixed(2)} ISLAND`);
    
    // Conclusion
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CONCLUSION`);
    console.log(`${'='.repeat(60)}`);
    
    if (authority === takisoulWallet) {
      console.log(`This account contains Takisoul's NATIVE governance power: ${totalDeposits.toFixed(2)} ISLAND`);
      if (totalDeposits < 8700000) {
        console.log(`⚠️  Expected ~8.7M ISLAND but found ${totalDeposits.toFixed(2)} ISLAND`);
        console.log(`   Difference: ${(8700000 - totalDeposits).toFixed(2)} ISLAND missing`);
        console.log(`   This suggests additional native accounts or delegation sources exist`);
      }
    } else if (voterAuthority === takisoulWallet) {
      console.log(`This account delegates ${totalDeposits.toFixed(2)} ISLAND to Takisoul`);
      console.log(`Delegator: ${authority}`);
    }
    
  } catch (error) {
    console.error('Error analyzing account relationship:', error.message);
  }
}

analyzeTakisoulVSRRelationship().catch(console.error);