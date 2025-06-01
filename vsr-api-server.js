/**
 * VSR Governance Power API Server
 * Real-time governance power + Citizen Map compatibility
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import { Connection, PublicKey } from "@solana/web3.js";

const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Solana connection
const VSR_PROGRAM_ID = new PublicKey(
  "vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ",
);
const connection = new Connection(
  process.env.HELIUS_RPC_URL ||
    "https://mainnet.helius-rpc.com/?api-key=YOUR-API-KEY",
);

app.use(cors());
app.use(express.json());
app.get("/api/governance-power", async (req, res) => {
  const wallet = req.query.wallet;

  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet parameter" });
  }

  try {
    // ✅ Placeholder response for testing
    // Replace with real logic later
    return res.json({
      wallet,
      nativePower: 1234567,
      delegatedPower: 0,
      totalPower: 1234567,
    });
  } catch (err) {
    console.error("Error fetching governance power:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// TODO: Add routes for:
// - GET /power/:wallet (from hybrid-vsr-calculator.js)
// - GET /health
// - POST /power/batch
// - anything else you were running (NFT verification, etc.)

app.listen(port, () => {
  console.log(`✅ VSR API Server running on port ${port}`);
});
