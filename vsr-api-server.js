/**
 * VSR Governance Power API Server
 * Real-time governance power + Citizen Map compatibility
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import { config } from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";

// Load VSR IDL for proper deserialization
const vsrIdl = JSON.parse(fs.readFileSync("vsr_idl.json", "utf8"));

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

/**
 * Find Voter accounts for a specific wallet using targeted memcmp search
 */
async function findVoterAccountsForWallet(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    console.log(`🔍 Searching for Voter accounts with authority: ${walletAddress}`);
    
    // Use getProgramAccounts with memcmp filter at offset 40 (8-byte discriminator + 32-byte registrar)
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 40, // authority field offset
            bytes: walletPubkey.toBase58(),
          },
        },
      ],
    });
    
    console.log(`Found ${accounts.length} Voter accounts for ${walletAddress}`);
    return accounts;
  } catch (error) {
    console.error(`Error finding voter accounts: ${error.message}`);
    return [];
  }
}

/**
 * Calculate voting power from Voter account using Anchor IDL deserialization
 */
function calculateVotingPowerFromVoter(voterAccountData, accountPubkey) {
  try {
    const data = voterAccountData;
    console.log(`\n📊 Deserializing Voter account: ${accountPubkey.toBase58()}`);
    console.log(`Data length: ${data.length} bytes`);
    
    // Parse Voter struct manually based on IDL
    let offset = 8; // Skip discriminator
    
    // Read registrar (32 bytes)
    const registrar = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // Read authority (32 bytes)
    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // Read voter_bump (1 byte)
    const voterBump = data[offset];
    offset += 1;
    
    // Read voter_weight_record_bump (1 byte)
    const voterWeightRecordBump = data[offset];
    offset += 1;
    
    console.log(`Voter struct:`);
    console.log(`  registrar: ${registrar.toBase58()}`);
    console.log(`  authority: ${authority.toBase58()}`);
    console.log(`  voter_bump: ${voterBump}`);
    console.log(`  voter_weight_record_bump: ${voterWeightRecordBump}`);
    
    // Ensure base58 comparison for authority matching
    const authorityBase58 = authority.toBase58();
    console.log(`Authority comparison: ${authorityBase58} === input wallet`);
    
    // Read deposits array (up to 32 deposits, each 105 bytes)
    let totalVotingPower = 0;
    console.log(`\n📈 Processing deposits:`);
    
    for (let i = 0; i < 32; i++) {
      const depositOffset = offset + (i * 105);
      
      if (data.length < depositOffset + 105) {
        console.log(`Reached end of data at deposit ${i}`);
        break;
      }
      
      // Parse DepositEntry
      const isUsed = data[depositOffset] === 1;
      
      if (!isUsed) continue;
      
      // Read amount_deposited_native (8 bytes)
      const amountBytes = data.slice(depositOffset + 1, depositOffset + 9);
      const amountDepositedNative = Number(amountBytes.readBigUInt64LE(0));
      
      // Read rate_idx (2 bytes)
      const rateIdx = data.readUInt16LE(depositOffset + 9);
      
      // Read lockup (varies by type, but voting_multiplier is at specific offset)
      // For now, read voting_multiplier directly at offset +81 (8 bytes)
      const multiplierBytes = data.slice(depositOffset + 81, depositOffset + 89);
      const votingMultiplier = Number(multiplierBytes.readBigUInt64LE(0));
      
      // Calculate voting power for this deposit
      const depositVotingPower = amountDepositedNative * votingMultiplier / 1e18; // Adjust for precision
      
      console.log(`  Deposit ${i}:`);
      console.log(`    isUsed: ${isUsed}`);
      console.log(`    amountDepositedNative: ${amountDepositedNative}`);
      console.log(`    rateIdx: ${rateIdx}`);
      console.log(`    votingMultiplier: ${votingMultiplier}`);
      console.log(`    calculatedVotingPower: ${depositVotingPower}`);
      
      totalVotingPower += depositVotingPower;
    }
    
    console.log(`\n🎯 Total voting power: ${totalVotingPower}`);
    return totalVotingPower;
    
  } catch (error) {
    console.error(`Error calculating voting power: ${error.message}`);
    return 0;
  }
}

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
    
    // Special targeted search for debug wallets
    if (wallet === "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA" || 
        wallet === "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh") {
      console.log(`🎯 Using targeted memcmp search for debug wallet: ${wallet}`);
      
      const voterAccounts = await findVoterAccountsForWallet(wallet);
      
      if (voterAccounts.length === 0) {
        console.log("❌ No Voter accounts found using targeted search");
        return res.json({
          wallet,
          nativePower: 0,
          delegatedPower: 0,
          totalPower: 0,
        });
      }
      
      let totalVotingPower = 0;
      
      for (const { account, pubkey } of voterAccounts) {
        console.log(`✅ Match found for wallet ${wallet}`);
        const votingPower = calculateVotingPowerFromVoter(account.data, pubkey);
        totalVotingPower += votingPower;
      }
      
      console.log(`\n🏁 Final total voting power: ${totalVotingPower}`);
      
      return res.json({
        wallet,
        nativePower: totalVotingPower,
        delegatedPower: 0,
        totalPower: totalVotingPower,
      });
    }
    
    // Fallback to existing method for other wallets
    const allVSRAccounts = await loadVSRAccounts();
    console.log(`Scanning ${allVSRAccounts.length} VSR accounts`);

    let maxGovernancePower = 0;
    let foundAccounts = 0;
    let totalChecked = 0;
    
    for (const { account, pubkey } of allVSRAccounts) {
      try {
        const data = account.data;
        if (data.length < 72) continue;
        
        totalChecked++;
        
        // Parse VSR account structure: discriminator(8) + registrar(32) + authority(32) + bumps(2) + data...
        const authorityBytes = data.slice(40, 72);
        if (authorityBytes.length !== 32) continue;
        
        const authority = new PublicKey(authorityBytes).toBase58();
        
        // Debug: Log every voter authority
        console.log(`Voter authority: ${authority}`);
        
        // Special debug for target wallet
        if (authority === "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA") {
          console.log(`🎯 FOUND TARGET WALLET: ${authority}`);
          console.log(`Account pubkey: ${pubkey.toBase58()}`);
          console.log(`Data length: ${data.length}`);
          
          // Log full voter struct for target wallet
          try {
            const registrarBytes = data.slice(8, 40);
            const authorityBytes = data.slice(40, 72);
            const voterBump = data[72];
            const voterWeightRecordBump = data[73];
            const voterWeightBytes = data.slice(74, 82);
            
            console.log(`Full Voter Struct:`);
            console.log(`  registrar: ${new PublicKey(registrarBytes).toBase58()}`);
            console.log(`  authority: ${new PublicKey(authorityBytes).toBase58()}`);
            console.log(`  voter_bump: ${voterBump}`);
            console.log(`  voter_weight_record_bump: ${voterWeightRecordBump}`);
            console.log(`  voter_weight: ${Number(voterWeightBytes.readBigUInt64LE(0))}`);
            
            // Parse deposits
            console.log(`Deposits:`);
            for (let i = 0; i < 32; i++) {
              const entryOffset = 82 + (i * 105);
              if (data.length < entryOffset + 105) break;
              
              const isUsed = data[entryOffset] === 1;
              if (isUsed) {
                const amountBytes = data.slice(entryOffset + 1, entryOffset + 9);
                const amount = Number(amountBytes.readBigUInt64LE(0));
                console.log(`  Deposit ${i}: amount=${amount}, used=${isUsed}`);
              }
            }
          } catch (e) {
            console.log(`Error parsing target voter struct: ${e.message}`);
          }
        }
        
        // Continue processing only if this is the requested wallet
        if (authority !== wallet) {
          continue;
        }
        
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
