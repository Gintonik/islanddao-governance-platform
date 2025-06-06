/**
 * Quick blockchain check for specific citizens
 * Uses targeted approach instead of scanning all VSR accounts
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const connection = new Connection(process.env.HELIUS_RPC_URL);

// Target citizens
const CITIZENS = {
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA": "Takisoul",
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG": "legend", 
  "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA": "Moxie",
  "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6": "Icoder"
};

async function quickCheck() {
  console.log('Real Blockchain Check Results:');
  console.log('='.repeat(40));
  
  for (const [wallet, nickname] of Object.entries(CITIZENS)) {
    try {
      // Check account balance
      const balance = await connection.getBalance(new PublicKey(wallet));
      console.log(`${nickname}: ${balance / 1e9} SOL balance`);
      
      // Check if account exists and is active
      const accountInfo = await connection.getAccountInfo(new PublicKey(wallet));
      if (accountInfo) {
        console.log(`  Account active: ${accountInfo.lamports / 1e9} SOL`);
      } else {
        console.log(`  Account not found or empty`);
      }
      
    } catch (error) {
      console.log(`${nickname}: Error - ${error.message}`);
    }
  }
}

quickCheck().catch(console.error);