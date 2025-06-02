import governanceSdk from 'governance-idl-sdk';
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const { SplGovernance } = governanceSdk;
const connection = new Connection(process.env.HELIUS_RPC_URL);
const gov = new SplGovernance(connection);

// Test getting voter weight records for IslandDAO realm
const testWallet = "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh";
const islandDaoRealm = "DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE";

console.log(`Testing voter weight record for wallet: ${testWallet}`);

try {
  const voterWeightRecords = await gov.getAllVoterWeightRecords();
  console.log(`Found ${voterWeightRecords.length} total voter weight records`);
  
  // Filter for our test wallet
  const walletRecords = voterWeightRecords.filter(record => 
    record.account.governing_token_owner?.toBase58() === testWallet
  );
  
  console.log(`Found ${walletRecords.length} records for test wallet`);
  if (walletRecords.length > 0) {
    walletRecords.forEach((record, i) => {
      console.log(`Record ${i}:`, {
        pubkey: record.pubkey.toBase58(),
        realm: record.account.realm?.toBase58(),
        governing_token_owner: record.account.governing_token_owner?.toBase58(),
        governing_token_mint: record.account.governing_token_mint?.toBase58(),
        voter_weight: record.account.voter_weight?.toString(),
        voter_weight_expiry: record.account.voter_weight_expiry?.toString()
      });
    });
  }
} catch (err) {
  console.error('Error fetching voter weight records:', err.message);
}