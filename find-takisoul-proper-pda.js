/**
 * Find Takisoul's Proper Voter PDA Account
 * Check if his derived Voter account exists and contains governance power
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
        
        if (isUsed) {
          deposits.push({
            offset,
            amount,
            votingPower: amount * 1.0
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
 * Find Takisoul's proper Voter PDA account
 */
async function findTakisoulProperPDA() {
  const takisoulWallet = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
  const REGISTRAR_PUBKEY = new PublicKey('C4fMTdvCpRdU4XYP5a8Fp2vJTPHJNpPmQ9gAUddAmQoD');
  
  console.log(`FINDING TAKISOUL'S PROPER VOTER PDA ACCOUNT`);
  console.log(`Wallet: ${takisoulWallet}`);
  console.log(`Registrar: ${REGISTRAR_PUBKEY.toString()}`);
  console.log('='.repeat(60));
  
  try {
    // Derive the Voter PDA for Takisoul
    const [derivedVoterPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('voter'),
        REGISTRAR_PUBKEY.toBuffer(),
        new PublicKey(takisoulWallet).toBuffer()
      ],
      VSR_PROGRAM_ID
    );
    
    console.log(`Derived Voter PDA: ${derivedVoterPDA.toString()}`);
    
    // Check if this account exists
    const account = await connection.getAccountInfo(derivedVoterPDA);
    
    if (!account) {
      console.log(`❌ Derived Voter PDA account does not exist`);
      console.log(`This means Takisoul has never created a VSR account`);
      return;
    }
    
    console.log(`✅ Derived Voter PDA account exists!`);
    console.log(`Account size: ${account.data.length} bytes`);
    console.log(`Owner: ${account.owner.toString()}`);
    
    const data = account.data;
    
    // Verify authority
    const authorityBytes = data.slice(32, 64);
    const authority = new PublicKey(authorityBytes).toString();
    
    const voterAuthorityBytes = data.slice(64, 96);
    const voterAuthority = new PublicKey(voterAuthorityBytes).toString();
    
    console.log(`\nAccount Fields:`);
    console.log(`Authority: ${authority}`);
    console.log(`Voter Authority: ${voterAuthority}`);
    console.log(`Expected Authority: ${takisoulWallet}`);
    
    console.log(`\nValidation:`);
    console.log(`Authority matches Takisoul? ${authority === takisoulWallet ? 'YES' : 'NO'}`);
    
    if (authority === takisoulWallet) {
      console.log(`🎯 FOUND TAKISOUL'S NATIVE VSR ACCOUNT!`);
      
      // Parse deposits
      const deposits = parseDepositsFromOffsets(data);
      
      if (deposits.length > 0) {
        console.log(`\nNative Deposits:`);
        let totalNativePower = 0;
        for (const deposit of deposits) {
          console.log(`  - ${deposit.amount.toFixed(6)} ISLAND = ${deposit.votingPower.toFixed(2)} power (offset ${deposit.offset})`);
          totalNativePower += deposit.votingPower;
        }
        
        console.log(`\n*** TAKISOUL'S NATIVE GOVERNANCE POWER: ${totalNativePower.toFixed(2)} ISLAND ***`);
        console.log(`Expected: ~8.7M ISLAND`);
        console.log(`Difference: ${Math.abs(totalNativePower - 8700000).toFixed(2)} ISLAND`);
        
        if (totalNativePower > 8000000) {
          console.log(`✅ Found the majority of expected governance power!`);
        } else {
          console.log(`⚠️  Still missing significant governance power`);
        }
      } else {
        console.log(`\n❌ No valid deposits found in the derived account`);
      }
    } else {
      console.log(`❌ Authority mismatch - this account doesn't belong to Takisoul`);
    }
    
  } catch (error) {
    console.error('Error finding proper PDA:', error.message);
  }
}

findTakisoulProperPDA().catch(console.error);