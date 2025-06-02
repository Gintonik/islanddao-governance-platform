/**
 * Debug Deposit Parsing for Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1
 * Analyze the actual Voter account structure to find the 200k deposit
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const TARGET_WALLET = "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1";
const VOTER_ACCOUNT = "xGW423w6m34PkGfFsCF6eWzP8LbEAYMHFYp9dvvV2br";

function parseDepositEntry(data, offset) {
  try {
    const isUsed = data[offset] === 1;
    const allowClawback = data[offset + 1] === 1;
    const votingMintConfigIdx = data[offset + 2];
    const amountDepositedNative = Number(data.readBigUInt64LE(offset + 8));
    const amountInitiallyLockedNative = Number(data.readBigUInt64LE(offset + 16));
    const lockupKind = data[offset + 24];
    const lockupStartTs = Number(data.readBigUInt64LE(offset + 32));
    const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
    const lockupPeriods = Number(data.readBigUInt64LE(offset + 48));
    
    return {
      isUsed,
      allowClawback,
      votingMintConfigIdx,
      amountDepositedNative,
      amountInitiallyLockedNative,
      lockupKind,
      lockupStartTs,
      lockupEndTs,
      lockupPeriods,
      isLocked: () => {
        const now = Math.floor(Date.now() / 1000);
        return lockupKind > 0 && lockupEndTs > now;
      }
    };
  } catch (error) {
    return null;
  }
}

async function debugDepositParsing() {
  console.log('🔍 DEBUGGING DEPOSIT PARSING');
  console.log('============================');
  console.log(`Target wallet: ${TARGET_WALLET}`);
  console.log(`Voter account: ${VOTER_ACCOUNT}`);
  
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(VOTER_ACCOUNT));
    
    if (!accountInfo) {
      console.log('❌ Account not found');
      return;
    }
    
    const data = accountInfo.data;
    console.log(`📊 Account size: ${data.length} bytes`);
    
    // Look for deposits at different starting offsets
    const startOffsets = [100, 150, 200, 250, 300];
    
    for (const startOffset of startOffsets) {
      console.log(`\n🔍 Checking deposits starting at offset ${startOffset}:`);
      
      let foundDeposits = 0;
      for (let i = 0; i < 32; i++) {
        const depositOffset = startOffset + (i * 72);
        if (depositOffset + 72 > data.length) break;
        
        const deposit = parseDepositEntry(data, depositOffset);
        if (deposit && (deposit.isUsed || deposit.amountDepositedNative > 0)) {
          foundDeposits++;
          const amount = deposit.amountDepositedNative / 1e6;
          const locked = deposit.isLocked() ? "locked" : "unlocked";
          
          console.log(`   Deposit ${i}: ${amount.toLocaleString()} ISLAND (${locked})`);
          console.log(`     isUsed: ${deposit.isUsed}`);
          console.log(`     lockupKind: ${deposit.lockupKind}`);
          console.log(`     lockupStart: ${new Date(deposit.lockupStartTs * 1000).toISOString()}`);
          console.log(`     lockupEnd: ${new Date(deposit.lockupEndTs * 1000).toISOString()}`);
          
          if (amount >= 199000) { // Close to 200k
            console.log(`     🎯 FOUND TARGET DEPOSIT: ${amount.toLocaleString()} ISLAND`);
          }
        }
      }
      
      if (foundDeposits === 0) {
        console.log(`   No deposits found at offset ${startOffset}`);
      } else {
        console.log(`   Total deposits found: ${foundDeposits}`);
      }
    }
    
    // Hex dump the first 500 bytes to see structure
    console.log('\n📄 Account structure (first 500 bytes):');
    for (let i = 0; i < Math.min(500, data.length); i += 32) {
      const end = Math.min(i + 32, data.length);
      const hex = Array.from(data.slice(i, end))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`${i.toString().padStart(3, '0')}: ${hex}`);
    }
    
    // Look for large numbers (potential 200k deposit = 200,000,000,000 micro-tokens)
    console.log('\n🔍 Searching for large amounts (200k = 200,000,000,000):');
    const target = 200000000000; // 200k in micro-tokens
    
    for (let i = 0; i <= data.length - 8; i += 8) {
      try {
        const value = Number(data.readBigUInt64LE(i));
        if (value >= 199000000000 && value <= 201000000000) { // Within 1k of 200k
          const amount = value / 1e6;
          console.log(`   Found ${amount.toLocaleString()} ISLAND at offset ${i}`);
        }
      } catch (error) {
        // Continue
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugDepositParsing().catch(console.error);