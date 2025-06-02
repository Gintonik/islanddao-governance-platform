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
    
    // Direct blockchain approach: Find VSR accounts by scanning program accounts
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 40, // Authority field offset in Voter account
            bytes: wallet,
          },
        },
      ],
    });

    console.log(`Found ${vsrAccounts.length} VSR accounts for wallet`);

    let maxGovernancePower = 0;

    // Extract governance power from each VSR account
    for (const accountInfo of vsrAccounts) {
      try {
        const data = accountInfo.account.data;
        
        // Read voter_weight field at offset 232 (8 bytes, little endian)
        const voterWeightBytes = data.slice(232, 240);
        const voterWeight = Number(
          voterWeightBytes.readBigUInt64LE(0)
        );

        console.log(`VSR account ${accountInfo.pubkey.toBase58()}: voter_weight = ${voterWeight}`);
        
        // Take the maximum governance power across all accounts
        if (voterWeight > maxGovernancePower) {
          maxGovernancePower = voterWeight;
        }
      } catch (err) {
        console.error(`Error parsing VSR account ${accountInfo.pubkey.toBase58()}:`, err.message);
      }
    }

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
