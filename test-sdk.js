import governanceSdk from 'governance-idl-sdk';
import { Connection } from "@solana/web3.js";
import { config } from "dotenv";

config();

console.log('SDK imported:', typeof governanceSdk);
console.log('Available functions:', Object.keys(governanceSdk || {}));

const { getLockTokensVotingPowerPerWallet } = governanceSdk;
console.log('Function available:', typeof getLockTokensVotingPowerPerWallet);

// Test with a wallet
const connection = new Connection(process.env.HELIUS_RPC_URL);
const testWallet = "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh";

try {
  const power = await getLockTokensVotingPowerPerWallet(connection, [testWallet]);
  console.log('Governance power:', power);
} catch (err) {
  console.error('SDK error:', err.message);
}