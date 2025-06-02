/**
 * VSR Governance Power API Server
 * Real-time governance power + Citizen Map compatibility
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import { config } from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";

config(); // ✅ Load .env
console.log("✅ Loaded ENV - Helius RPC URL:", `"${process.env.HELIUS_RPC_URL}"`);

const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Solana connection
const VSR_PROGRAM_ID = new PublicKey(
  "vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ",
);
const connection = new Connection(process.env.HELIUS_RPC_URL);
console.log("🚀 Helius RPC URL:", process.env.HELIUS_RPC_URL);

app.use(cors());
app.use(express.json());

app.get("/api/governance-power", async (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet parameter" });
  }

  try {
    console.log(`Fetching governance power for wallet: ${wallet}`);
    
    // Get all VSR accounts and scan for wallet matches
    const allVsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Scanning ${allVsrAccounts.length} total VSR accounts`);

    let maxGovernancePower = 0;
    let foundAccounts = 0;

    // Scan all VSR accounts for this wallet
    for (const accountInfo of allVsrAccounts) {
      try {
        const data = accountInfo.account.data;
        
        // Extract authority field (32 bytes starting at offset 40)
        const authorityBytes = data.slice(40, 72);
        const authority = new PublicKey(authorityBytes).toBase58();
        
        if (authority === wallet) {
          foundAccounts++;
          
          // Read voter_weight field at offset 232 (8 bytes, little endian)
          const voterWeightBytes = data.slice(232, 240);
          const voterWeight = Number(
            voterWeightBytes.readBigUInt64LE(0)
          );

          console.log(`Found VSR account ${accountInfo.pubkey.toBase58()}: voter_weight = ${voterWeight}`);
          
          // Take the maximum governance power across all accounts
          if (voterWeight > maxGovernancePower) {
            maxGovernancePower = voterWeight;
          }
        }
      } catch (err) {
        // Skip accounts that can't be parsed
        continue;
      }
    }

    console.log(`Found ${foundAccounts} VSR accounts for wallet`);
    console.log(`Max governance power: ${maxGovernancePower}`);

    console.log(`Final governance power: ${maxGovernancePower}`);

    return res.json({
      wallet,
      nativePower: maxGovernancePower,
      delegatedPower: 0,
      totalPower: maxGovernancePower,
    });
  } catch (err) {
    console.error("Governance power error:\n", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to calculate governance power" });
  }
});

app.listen(port, () => {
  console.log(`✅ VSR API Server running on port ${port}`);
});
