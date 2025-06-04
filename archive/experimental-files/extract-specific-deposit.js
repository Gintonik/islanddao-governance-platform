/**
 * Extract the specific 200k deposit for Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1
 * Use the exact offset we found (112) to read the deposit correctly
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const TARGET_WALLET = "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1";
const VOTER_ACCOUNT = "xGW423w6m34PkGfFsCF6eWzP8LbEAYMHFYp9dvvV2br";

async function extractSpecificDeposit() {
  console.log('🔍 EXTRACTING SPECIFIC DEPOSIT');
  console.log('==============================');
  
  try {
    const accountInfo = await connection.getAccountInfo(new PublicKey(VOTER_ACCOUNT));
    const data = accountInfo.data;
    
    // Read the deposit at offset 112 where we found 200k ISLAND
    const depositOffset = 112;
    console.log(`Reading deposit at offset ${depositOffset}:`);
    
    // Read as raw u64 value
    const rawValue = Number(data.readBigUInt64LE(depositOffset));
    const islandAmount = rawValue / 1e6;
    
    console.log(`Raw value: ${rawValue}`);
    console.log(`ISLAND amount: ${islandAmount.toLocaleString()}`);
    
    // This should show 200,000 ISLAND
    if (islandAmount >= 199000 && islandAmount <= 201000) {
      console.log('✅ Successfully found the 200k deposit!');
      return {
        wallet: TARGET_WALLET,
        governancePower: islandAmount,
        source: "Direct deposit extraction",
        rawValue: rawValue
      };
    } else {
      console.log('❌ Deposit amount not in expected range');
      return null;
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

extractSpecificDeposit().then(result => {
  if (result) {
    console.log('\n🎯 RESULT:');
    console.log(JSON.stringify(result, null, 2));
  }
});