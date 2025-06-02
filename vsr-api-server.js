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
    const walletKey = new PublicKey(wallet);

    // Use getProgramAccounts to fetch all voter accounts
    console.log(`🔍 Fetching voter accounts for wallet: ${wallet}`);
    const allVoterAccountInfos = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          dataSize: 1376, // VSR Voter account size
        },
      ],
    });

    console.log(`📊 Found ${allVoterAccountInfos.length} total voter accounts`);

    // Filter and deserialize accounts for this wallet
    const relevantVoterAccounts = [];
    for (const accountInfo of allVoterAccountInfos) {
      try {
        // Deserialize using Anchor
        const voter = program.coder.accounts.decode("voter", accountInfo.account.data);
        
        // Check if authority matches our wallet
        if (voter.authority.toString() === walletKey.toString()) {
          relevantVoterAccounts.push({ account: voter, publicKey: accountInfo.pubkey });
        }
      } catch (deserializeError) {
        // Skip accounts that can't be deserialized as voter accounts
        continue;
      }
    }

    console.log(`🎯 Found ${relevantVoterAccounts.length} voter accounts for wallet ${wallet}`);

    let nativePower = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const { account: voter } of relevantVoterAccounts) {
      for (const entry of voter.depositEntries) {
        if (!entry.isUsed || entry.amountDepositedNative.toNumber() === 0)
          continue;
        if (entry.votingMintConfigIdx !== 0) continue;

        const lockupStart = entry.lockup.startTs.toNumber();
        const lockupEnd = entry.lockup.endTs.toNumber();
        if (now < lockupStart || now >= lockupEnd) continue;

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

        console.log(`💪 Found deposit: ${amount} tokens, multiplier: ${adjustedMultiplier}, power: ${power}`);
      }
    }

    console.log(`🏆 Total native power for ${wallet}: ${nativePower}`);

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
