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
import { SplGovernance } from "./governance-sdk/dist/index.js";
import { getTokenOwnerRecordAddress } from "@solana/spl-governance";

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
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw",
);
const ISLAND_DAO_REALM = new PublicKey(
  "F9VL4wo49aUe8FufjMbU6uhdfyDRqKY54WpzdpncUSk9",
);
const ISLAND_GOVERNANCE_MINT = new PublicKey(
  "Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a",
);
const ISLAND_DAO_REGISTRAR = new PublicKey(
  "5sGLEKcJ35UGdbHtSWMtGbhLqRycQJSCaUAyEpnz6TA2",
);
const connection = new Connection(process.env.HELIUS_RPC_URL);
console.log("🚀 Helius RPC URL:", process.env.HELIUS_RPC_URL);

/**
 * Get Token Owner Record (TOR) for wallets without VSR lockups
 */
async function getTokenOwnerRecord(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    // Derive TOR PDA using SPL Governance
    const torAddress = await getTokenOwnerRecordAddress(
      SPL_GOVERNANCE_PROGRAM_ID,
      ISLAND_DAO_REALM,
      ISLAND_GOVERNANCE_MINT,
      walletPubkey
    );
    
    // Fetch the account data
    const accountInfo = await connection.getAccountInfo(torAddress);
    
    if (!accountInfo || !accountInfo.data) {
      return { governingTokenDepositAmount: 0, governanceDelegate: null };
    }
    
    // Use SPL Governance SDK to decode the account
    try {
      const governance = new SplGovernance(connection);
      const torAccount = await governance.getTokenOwnerRecord(torAddress);
      
      if (torAccount) {
        return {
          governingTokenDepositAmount: torAccount.account.governingTokenDepositAmount?.toNumber() || 0,
          governanceDelegate: torAccount.account.governanceDelegate?.toBase58() || null,
          realm: torAccount.account.realm?.toBase58(),
          governingTokenMint: torAccount.account.governingTokenMint?.toBase58()
        };
      }
    } catch (decodeError) {
      console.log(`TOR decode error for ${walletAddress}:`, decodeError.message);
    }
    
    return { governingTokenDepositAmount: 0, governanceDelegate: null };
    
  } catch (error) {
    console.error(`TOR lookup error for ${walletAddress}:`, error.message);
    return { governingTokenDepositAmount: 0, governanceDelegate: null };
  }
}

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

/**
 * Calculate VSR governance power using canonical Voter account parsing
 */
async function getLockTokensVotingPowerPerWallet({ connection, walletAddress, registrar }) {
  try {
    console.log(`📊 Getting VSR governance power for: ${walletAddress.toBase58()}`);
    
    // Derive Voter PDA using the VSR registrar
    const [voterPDA] = PublicKey.findProgramAddressSync(
      [
        registrar.toBuffer(),
        Buffer.from("voter"),
        walletAddress.toBuffer(),
      ],
      VSR_PROGRAM_ID
    );
    
    console.log(`Voter PDA: ${voterPDA.toBase58()}`);
    
    // Fetch the Voter account
    const accountInfo = await connection.getAccountInfo(voterPDA);
    
    if (accountInfo && accountInfo.data) {
      console.log(`Found Voter account, data length: ${accountInfo.data.length}`);
      console.log(`Account data (hex):`, accountInfo.data.toString('hex'));
      
      // Parse Voter account using canonical VSR structure
      const data = accountInfo.data;
      
      // VSR Voter account layout:
      // 0-8: discriminator
      // 8-40: registrar (32 bytes)
      // 40-72: authority (32 bytes) 
      // 72: authority_seed_len (1 byte)
      // 73: voter_bump (1 byte)
      // 74-82: voter_weight_record_bump (1 byte + 7 padding)
      // 82-90: voter_weight (8 bytes)
      
      if (data.length >= 90) {
        // Extract voter_weight at offset 82
        const voterWeightBytes = data.slice(82, 90);
        const voterWeight = Number(voterWeightBytes.readBigUInt64LE(0));
        console.log(`VSR voter_weight: ${voterWeight}`);
        
        // Also check for deposit entries after the base structure
        let offset = 90;
        let totalDepositAmount = 0;
        
        // Parse deposits if they exist
        while (offset + 72 <= data.length) { // Each deposit entry is ~72 bytes
          try {
            // Deposit entry structure:
            // 0-1: lockup_kind (1 byte + padding)
            // 8-16: start_ts (8 bytes)
            // 16-24: end_ts (8 bytes) 
            // 24-32: original_amount (8 bytes)
            // 32-40: amount_deposited_native (8 bytes)
            // 40-48: amount_initially_locked_native (8 bytes)
            // 48-56: voting_mint_config_idx (8 bytes)
            
            const amountDepositedBytes = data.slice(offset + 32, offset + 40);
            const amountDeposited = Number(amountDepositedBytes.readBigUInt64LE(0));
            
            if (amountDeposited > 0) {
              console.log(`Found deposit: ${amountDeposited} tokens`);
              totalDepositAmount += amountDeposited;
            }
            
            offset += 72; // Move to next deposit entry
          } catch (e) {
            console.log(`Error parsing deposit at offset ${offset}: ${e.message}`);
            break;
          }
        }
        
        console.log(`Total deposit amount: ${totalDepositAmount}`);
        
        // Return the higher of voter_weight or total deposits
        const finalPower = Math.max(voterWeight, totalDepositAmount);
        console.log(`Final VSR governance power: ${finalPower}`);
        return finalPower;
      } else {
        console.log(`Voter account data too short: ${data.length} bytes`);
        return 0;
      }
    }
    
    console.log(`No Voter account found`);
    return 0;
    
  } catch (error) {
    console.error(`Error getting VSR governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate VSR governance power using IslandDAO registrar
 */
async function calculateVSRGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    console.log(`🏝️ Calculating VSR governance power using IslandDAO registrar for: ${walletAddress}`);
    
    // Derive Voter PDA using IslandDAO registrar
    const [voterPDA] = PublicKey.findProgramAddressSync(
      [
        ISLAND_DAO_REGISTRAR.toBuffer(),
        Buffer.from("voter"),
        walletPubkey.toBuffer(),
      ],
      VSR_PROGRAM_ID
    );
    
    console.log(`Voter PDA: ${voterPDA.toBase58()}`);
    
    // Fetch the Voter account
    try {
      const accountInfo = await connection.getAccountInfo(voterPDA);
      
      if (accountInfo && accountInfo.data) {
        console.log(`Found Voter account, data length: ${accountInfo.data.length}`);
        
        // Parse Voter account structure
        const data = accountInfo.data;
        let offset = 8; // Skip discriminator
        
        // Skip registrar (32 bytes) + authority (32 bytes) + voter_bump (1 byte) + voter_weight_record_bump (1 byte)
        offset = 8 + 32 + 32 + 1 + 1;
        
        // Read voter_weight (8 bytes)
        if (data.length >= offset + 8) {
          const voterWeightBytes = data.slice(offset, offset + 8);
          const voterWeight = Number(voterWeightBytes.readBigUInt64LE(0));
          console.log(`VSR governance power: ${voterWeight}`);
          
          return voterWeight;
        }
      } else {
        console.log(`No Voter account found for wallet`);
      }
    } catch (error) {
      console.log(`Voter account not found: ${error.message}`);
    }
    
    return 0;
    
  } catch (error) {
    console.error(`Error calculating VSR governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate governance power from SPL Token Owner Records
 */
async function calculateTokenOwnerRecordPower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    console.log(`🏛️ Calculating Token Owner Record power for: ${walletAddress}`);
    
    // Find Token Owner Record PDA for this wallet using exact derivation
    const [tokenOwnerRecordPDA] = PublicKey.findProgramAddressSync([
      Buffer.from("token-owner-record"),
      new PublicKey("F9VL4wo49aUe8FufjMbU6uhdfyDRqKY54WpzdpncUSk9").toBuffer(), // realm
      new PublicKey("Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a").toBuffer(), // governance mint
      walletPubkey.toBuffer(), // wallet
    ], new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw")); // governance program
    
    console.log(`Token Owner Record PDA: ${tokenOwnerRecordPDA.toBase58()}`);
    
    let nativePower = 0;
    let delegatedPower = 0;
    
    // Fetch the Token Owner Record account
    try {
      const accountInfo = await connection.getParsedAccountInfo(tokenOwnerRecordPDA);
      
      if (accountInfo && accountInfo.value && accountInfo.value.data) {
        console.log(`Found Token Owner Record account`);
        
        // Try parsed data first
        if (typeof accountInfo.value.data === 'object' && accountInfo.value.data.parsed) {
          const parsed = accountInfo.value.data.parsed;
          if (parsed.info && parsed.info.governingTokenDepositAmount) {
            nativePower = Number(parsed.info.governingTokenDepositAmount);
            console.log(`Native governance power (parsed): ${nativePower}`);
          }
        } else if (Buffer.isBuffer(accountInfo.value.data)) {
          // Fallback to manual parsing
          const data = accountInfo.value.data;
          console.log(`Manual parsing, data length: ${data.length}`);
          
          // Parse TokenOwnerRecord structure
          // Skip discriminator (8 bytes) + realm (32 bytes) + governing_token_mint (32 bytes) + governing_token_owner (32 bytes)
          let offset = 8 + 32 + 32 + 32;
          
          // Read governing_token_deposit_amount (8 bytes)
          if (data.length >= offset + 8) {
            const depositBytes = data.slice(offset, offset + 8);
            nativePower = Number(depositBytes.readBigUInt64LE(0));
            console.log(`Native governance power (manual): ${nativePower}`);
          }
        }
      } else {
        console.log(`No Token Owner Record found for wallet`);
      }
    } catch (error) {
      console.log(`Token Owner Record not found: ${error.message}`);
    }
    
    // Find delegated power - look for other Token Owner Records that delegate to this wallet
    console.log(`🔍 Searching for delegated governance power...`);
    
    try {
      // Get all Token Owner Records for this realm and governance mint
      const allTokenOwnerRecords = await connection.getProgramAccounts(
        SPL_GOVERNANCE_PROGRAM_ID,
        {
          filters: [
            {
              memcmp: {
                offset: 8, // After discriminator
                bytes: ISLAND_DAO_REALM.toBase58(),
              },
            },
            {
              memcmp: {
                offset: 8 + 32, // After discriminator + realm
                bytes: ISLAND_GOVERNANCE_MINT.toBase58(),
              },
            },
          ],
        }
      );
      
      console.log(`Found ${allTokenOwnerRecords.length} Token Owner Records`);
      
      for (const { account } of allTokenOwnerRecords) {
        try {
          const data = account.data;
          if (data.length < 8 + 32 + 32 + 32 + 8 + 1) continue;
          
          let offset = 8 + 32 + 32 + 32 + 8; // Skip to governance_delegate field
          
          // Check if has_governance_delegate (1 byte)
          const hasDelegate = data[offset] === 1;
          offset += 1;
          
          if (hasDelegate) {
            // Read governance_delegate (32 bytes)
            const delegateBytes = data.slice(offset, offset + 32);
            const delegate = new PublicKey(delegateBytes);
            
            if (delegate.toBase58() === walletAddress) {
              // This record delegates to our wallet - add its deposit amount
              const depositOffset = 8 + 32 + 32 + 32;
              const depositBytes = data.slice(depositOffset, depositOffset + 8);
              const delegatedAmount = Number(depositBytes.readBigUInt64LE(0));
              
              delegatedPower += delegatedAmount;
              console.log(`Found delegation: ${delegatedAmount} tokens`);
            }
          }
        } catch (e) {
          continue;
        }
      }
      
    } catch (error) {
      console.log(`Error searching for delegations: ${error.message}`);
    }
    
    console.log(`📊 Final Token Owner Record power - Native: ${nativePower}, Delegated: ${delegatedPower}`);
    
    return {
      nativePower,
      delegatedPower,
      totalPower: nativePower + delegatedPower,
    };
    
  } catch (error) {
    console.error(`Error calculating Token Owner Record power: ${error.message}`);
    return {
      nativePower: 0,
      delegatedPower: 0,
      totalPower: 0,
    };
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
        
        // Try VSR SDK-style governance power calculation
        console.log("🔄 Trying VSR SDK-style governance power calculation");
        const votingPower = await getLockTokensVotingPowerPerWallet({
          connection,
          walletAddress: new PublicKey(wallet),
          registrar: ISLAND_DAO_REGISTRAR
        });
        
        if (votingPower > 0) {
          return res.json({
            wallet,
            nativePower: votingPower,
            delegatedPower: 0,
            totalPower: votingPower,
          });
        }
        
        // Fallback to Token Owner Record calculation
        console.log("🔄 Falling back to Token Owner Record calculation");
        const torData = await getTokenOwnerRecord(wallet);
        
        return res.json({
          wallet,
          nativeGovernancePower: torData.governingTokenDepositAmount,
          delegatedPower: 0,
          totalPower: torData.governingTokenDepositAmount,
          governanceDelegate: torData.governanceDelegate,
          source: "token_owner_record"
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

    // If no VSR governance power found, try VSR registrar calculation
    if (maxGovernancePower === 0) {
      console.log("🔄 No VSR power found, trying SDK-style calculation");
      const votingPower = await getLockTokensVotingPowerPerWallet({
        connection,
        walletAddress: new PublicKey(wallet),
        registrar: ISLAND_DAO_REGISTRAR
      });
      
      if (votingPower > 0) {
        return res.json({
          wallet,
          nativeGovernancePower: votingPower,
          delegatedPower: 0,
          totalPower: votingPower,
          source: "vsr_lockup"
        });
      }
      
      console.log("🔄 No VSR power found, falling back to Token Owner Record calculation");
      const torData = await getTokenOwnerRecord(wallet);
      
      return res.json({
        wallet,
        nativeGovernancePower: torData.governingTokenDepositAmount,
        delegatedPower: 0,
        totalPower: torData.governingTokenDepositAmount,
        governanceDelegate: torData.governanceDelegate,
        source: "token_owner_record"
      });
    }

    return res.json({
      wallet,
      nativeGovernancePower: maxGovernancePower,
      delegatedPower: 0,
      totalPower: maxGovernancePower,
      source: "vsr_account"
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
