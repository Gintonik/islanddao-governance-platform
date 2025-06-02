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

// Cache VSR accounts to avoid repeated fetching
let vsrAccountsCache = null;

async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    return vsrAccountsCache;
  }
  
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  vsrAccountsCache = accounts;
  console.log(`Cached ${accounts.length} VSR accounts`);
  return accounts;
}

app.get("/api/governance-power", async (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet parameter" });
  }

  try {
    console.log(`Fetching governance power for wallet: ${wallet}`);
    
    const allVSRAccounts = await loadVSRAccounts();
    console.log(`Scanning ${allVSRAccounts.length} VSR accounts`);

    let maxGovernancePower = 0;
    let foundAccounts = 0;
    
    for (const { account, pubkey } of allVSRAccounts) {
      try {
        const data = account.data;
        if (data.length < 72) continue;
        
        // Parse VSR account structure: discriminator(8) + registrar(32) + authority(32) + bumps(2) + data...
        const authorityBytes = data.slice(40, 72);
        if (authorityBytes.length !== 32) continue;
        
        const authority = new PublicKey(authorityBytes).toBase58();
        
        if (authority === wallet) {
          foundAccounts++;
          console.log(`✅ Found VSR account: ${pubkey.toBase58()}`);
          
          // Method 1: Extract governance power from voter_weight at offset 72
          if (data.length >= 80) {
            try {
              const voterWeightBytes = data.slice(72, 80);
              const voterWeight = Number(voterWeightBytes.readBigUInt64LE(0));
              
              if (voterWeight > 0) {
                console.log(`Direct voter weight: ${voterWeight}`);
                maxGovernancePower = Math.max(maxGovernancePower, voterWeight);
              }
            } catch (e) {
              // Continue with other methods
            }
          }
          
          // Method 2: Scan for large values that could be governance power
          for (let offset = 72; offset <= data.length - 8; offset += 8) {
            try {
              const value = Number(data.slice(offset, offset + 8).readBigUInt64LE(0));
              // Look for values in reasonable governance power range (1M to 100B)
              if (value >= 1000000 && value <= 100000000000) {
                console.log(`Potential governance power at offset ${offset}: ${value}`);
                maxGovernancePower = Math.max(maxGovernancePower, value);
              }
            } catch (e) {
              continue;
            }
          }
          
          // Method 3: Parse deposit entries manually
          try {
            const depositStartOffset = 74; // After registrar + authority + bumps
            let totalDeposited = 0;
            
            for (let i = 0; i < 32; i++) {
              const entryOffset = depositStartOffset + (i * 105);
              
              if (data.length < entryOffset + 105) break;
              
              const isUsed = data[entryOffset] === 1;
              if (!isUsed) continue;
              
              const amountBytes = data.slice(entryOffset + 1, entryOffset + 9);
              const amount = Number(amountBytes.readBigUInt64LE(0));
              
              if (amount > 0) {
                totalDeposited += amount;
              }
            }
            
            if (totalDeposited > 0) {
              console.log(`Total deposited amount: ${totalDeposited}`);
              maxGovernancePower = Math.max(maxGovernancePower, totalDeposited);
            }
          } catch (e) {
            // Continue without deposit parsing
          }
        }
      } catch (err) {
        continue;
      }
    }

    console.log(`Found ${foundAccounts} VSR accounts for ${wallet}`);
    console.log(`Final governance power: ${maxGovernancePower}`);

    return res.json({
      wallet,
      nativePower: maxGovernancePower,
      delegatedPower: 0,
      totalPower: maxGovernancePower,
    });
  } catch (err) {
    console.error("Governance power error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to calculate governance power" });
  }
});

app.listen(port, () => {
  console.log(`✅ VSR API Server running on port ${port}`);
});
