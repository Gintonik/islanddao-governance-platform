/**
 * VSR Governance Power API Server
 * Real-time governance power + Citizen Map compatibility
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import { config } from "dotenv";
import fs from "fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

config(); // ✅ Load .env
console.log("✅ Loaded ENV - Helius RPC URL:", `"${process.env.HELIUS_RPC_URL}"`);

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
const connection = new Connection(process.env.HELIUS_RPC_URL);
console.log("🚀 Helius RPC URL:", process.env.HELIUS_RPC_URL);

app.use(cors());
app.use(express.json());

app.get("/api/governance-power", async (req, res) => {
  const voterStakeRegistryIdl = JSON.parse(
    await fs.readFile("./vsr-idl.json", "utf-8"),
  );

  const wallet = req.query.wallet;
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet parameter" });
  }

  try {
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

    // Fetch all VSR accounts with no memcmp filters
    console.log(`Fetching all VSR accounts for wallet: ${wallet}`);
    const allVoterAccountInfos = await connection.getProgramAccounts(VSR_PROGRAM_ID);

    console.log(`Total VSR accounts fetched: ${allVoterAccountInfos.length}`);

    // Scan all accounts and find matches for this wallet
    let matchedAccounts = 0;
    let nativePower = 0;
    const now = Math.floor(Date.now() / 1000);
    
    for (const accountInfo of allVoterAccountInfos) {
      try {
        // Deserialize using Anchor
        const decoded = program.coder.accounts.decode("voter", accountInfo.account.data);
        
        // Filter only those where authority matches the wallet exactly
        if (decoded.authority.toBase58() === wallet) {
          matchedAccounts++;
          
          // Loop over depositEntries for this voter
          for (const entry of decoded.depositEntries) {
            // Skip if entry is not used or has no deposited amount
            if (!entry.isUsed || entry.amountDepositedNative.toNumber() === 0) {
              continue;
            }
            
            // Skip if not voting mint config index 0
            if (entry.votingMintConfigIdx !== 0) {
              continue;
            }
            
            const lockupStart = entry.lockup.startTs.toNumber();
            const lockupEnd = entry.lockup.endTs.toNumber();
            
            // Skip if current time is before startTs or after endTs
            if (now < lockupStart || now >= lockupEnd) {
              continue;
            }

            // Calculate multiplier with time decay
            const baseMultiplier = entry.lockup.kind.multiplier.toNumber() / 10000;
            const totalDuration = lockupEnd - lockupStart;
            const timeRemaining = lockupEnd - now;

            let adjustedMultiplier = baseMultiplier;
            if (totalDuration > 0) {
              adjustedMultiplier = baseMultiplier * (timeRemaining / totalDuration);
            }

            const amount = entry.amountDepositedNative.toNumber();
            const power = Math.floor(amount * adjustedMultiplier);
            nativePower += power;
          }
        }
      } catch (deserializeError) {
        // Skip accounts that can't be deserialized as voter accounts
        continue;
      }
    }

    console.log(`How many matched the wallet: ${matchedAccounts}`);
    console.log(`Final governance power calculated: ${nativePower}`);

    return res.json({
      wallet,
      nativePower,
      delegatedPower: 0,
      totalPower: nativePower,
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
