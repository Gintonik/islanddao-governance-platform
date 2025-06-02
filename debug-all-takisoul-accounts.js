/**
 * Debug All Takisoul VSR Accounts
 * Examine all 3 VSR accounts found for Takisoul's wallet
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const TAKISOUL_WALLET = "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA";

// Known account addresses from hex analysis
const KNOWN_ACCOUNTS = [
  "GSrwtiSq6ePRtf2j8nWMksgMuGawHv8uf2suz1A5iRG", // Original account
  "9dsYHH88bN2Nomgr12qPUgJLsaRwqkX2YYiZNq4kys5L", // Additional account 1
  "C1vgxMvvBzXegFkvfW4Do7CmyPeCKsGJT7SpQevPaSS8"  // Additional account 2
];

async function analyzeAllAccounts() {
  try {
    const connection = new Connection(process.env.HELIUS_RPC_URL);
    
    console.log(`Analyzing all 3 VSR accounts for Takisoul: ${TAKISOUL_WALLET}`);
    
    let totalGovernancePower = 0;
    let allDeposits = [];
    
    for (let i = 0; i < KNOWN_ACCOUNTS.length; i++) {
      const accountPubkey = new PublicKey(KNOWN_ACCOUNTS[i]);
      console.log(`\n=== ACCOUNT ${i + 1}: ${accountPubkey.toBase58()} ===`);
      
      try {
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo) {
          console.log(`Account not found`);
          continue;
        }
        
        const data = accountInfo.data;
        console.log(`Data length: ${data.length} bytes`);
        console.log(`Owner: ${accountInfo.owner.toBase58()}`);
        
        // Parse registrar
        if (data.length >= 72) {
          const registrarBytes = data.slice(40, 72);
          const registrar = new PublicKey(registrarBytes);
          console.log(`Registrar: ${registrar.toBase58()}`);
        }
        
        // Look for large deposit amounts
        console.log(`\nLarge deposits in this account:`);
        const deposits = [];
        
        for (let offset = 0; offset < data.length - 8; offset += 8) {
          const value = Number(data.readBigUInt64LE(offset));
          
          // Look for values that could be large ISLAND amounts (in micro-units)
          if (value > 1000000000000 && value < 100000000000000000) { // 1M to 100B micro-units
            const asTokens = value / 1e6;
            if (asTokens >= 1000) { // At least 1000 ISLAND
              deposits.push({ offset, amount: asTokens, raw: value });
            }
          }
        }
        
        // Remove duplicates (consecutive offsets with same value)
        const uniqueDeposits = [];
        for (let j = 0; j < deposits.length; j++) {
          const current = deposits[j];
          const next = deposits[j + 1];
          
          if (!next || Math.abs(current.amount - next.amount) > 0.1 || 
              Math.abs(current.offset - next.offset) > 8) {
            uniqueDeposits.push(current);
          }
        }
        
        console.log(`Found ${uniqueDeposits.length} unique large deposits:`);
        let accountTotal = 0;
        
        uniqueDeposits.forEach((dep, idx) => {
          console.log(`  ${idx + 1}. ${dep.amount.toLocaleString()} ISLAND (offset ${dep.offset})`);
          accountTotal += dep.amount;
          allDeposits.push({
            account: i + 1,
            amount: dep.amount,
            offset: dep.offset
          });
        });
        
        console.log(`Account ${i + 1} total: ${accountTotal.toLocaleString()} ISLAND`);
        totalGovernancePower += accountTotal;
        
        // Look for timestamps near large deposits
        console.log(`\nTimestamps in this account:`);
        for (let offset = 0; offset < data.length - 8; offset += 8) {
          const value = Number(data.readBigUInt64LE(offset));
          
          if (value > 1600000000 && value < 2000000000) { // Unix timestamps
            const date = new Date(value * 1000);
            console.log(`  Offset ${offset}: ${date.toISOString()}`);
          }
        }
        
      } catch (error) {
        console.log(`Error processing account: ${error.message}`);
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total accounts analyzed: ${KNOWN_ACCOUNTS.length}`);
    console.log(`Total deposits found: ${allDeposits.length}`);
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    console.log(`\nAll deposits by account:`);
    allDeposits.forEach((dep, idx) => {
      console.log(`  ${idx + 1}. Account ${dep.account}: ${dep.amount.toLocaleString()} ISLAND`);
    });
    
    // Check if this matches expected values
    const expectedAmounts = [10000, 37626.98, 25738.99, 3913];
    console.log(`\nComparison with expected deposits:`);
    expectedAmounts.forEach((expected, idx) => {
      const closest = allDeposits.find(dep => Math.abs(dep.amount - expected) < 1000);
      if (closest) {
        console.log(`✅ Expected ${expected} → Found ${closest.amount.toLocaleString()} (Account ${closest.account})`);
      } else {
        console.log(`❌ Expected ${expected} → NOT FOUND`);
      }
    });
    
    if (totalGovernancePower > 5000000) {
      console.log(`\n✅ SUCCESS: Found substantial governance power (${totalGovernancePower.toLocaleString()}) across multiple accounts`);
    } else {
      console.log(`\n⚠️ Still missing governance power. Expected ~8.7M total.`);
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

analyzeAllAccounts();