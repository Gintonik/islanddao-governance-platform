/**
 * VSR Governance Power API Server
 * Real-time governance power + Citizen Map compatibility
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import fs from "fs/promises";

import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

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
    const voterStakeRegistryIdl = JSON.parse(
      await fs.readFile("./vsr-idl.json", "utf-8")
    );
    const provider = new AnchorProvider(
      connection,
      {},
      AnchorProvider.defaultOptions(),
    );
    const program = new Program(
      voterStakeRegistryIdl,
      VSR_PROGRAM_ID,
      provider,
    );
    const walletKey = new PublicKey(wallet);

    const allVoterAccounts = await program.account.voter.all([
      {
        memcmp: {
          offset: 8, // 'authority' field in Voter struct
          bytes: walletKey.toBase58(),
        },
      },
    ]);

    let nativePower = 0;

    for (const { account: voter } of allVoterAccounts) {
      for (const entry of voter.depositEntries) {
        if (!entry.isUsed || entry.amountDepositedNative.toNumber() === 0)
          continue;

        const lockupEnd = entry.lockup.endTs.toNumber();
        const now = Math.floor(Date.now() / 1000);
        if (lockupEnd <= now) continue; // Only count locked tokens

        const multiplier = entry.lockup.kind.multiplier.toNumber() / 10000;
        const power = Math.floor(
          entry.amountDepositedNative.toNumber() * multiplier,
        );
        nativePower += power;
      }
    }

    return res.json({
      wallet,
      nativePower,
      delegatedPower: 0, // We'll add this next
      totalPower: nativePower,
    });
  } catch (err) {
    console.error("Governance power error:", err);
    return res
      .status(500)
      .json({ error: "Failed to calculate governance power" });
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
