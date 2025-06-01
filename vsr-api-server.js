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

// TODO: Add routes for:
// - GET /power/:wallet (from hybrid-vsr-calculator.js)
// - GET /health
// - POST /power/batch
// - anything else you were running (NFT verification, etc.)

app.listen(port, () => {
  console.log(`✅ VSR API Server running on port ${port}`);
});
