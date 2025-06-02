/**
 * VSR Governance Power API Server
 * Real-time governance power + Citizen Map compatibility
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import { config } from "dotenv";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";
import { SplGovernance } from "./governance-sdk/dist/index.js";
import { getTokenOwnerRecordAddress } from "@solana/spl-governance";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";

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
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

/**
 * Calculate VSR native governance power using canonical Anchor deserialization
 * Only counts deposits from accounts owned by the target wallet
 */
async function calculateNativeGovernancePower(program, walletPublicKey, allVSRAccounts) {
  let totalGovernancePower = 0;
  const currentTime = Date.now() / 1000;
  
  console.log(`🔍 SDK: Calculating native governance power for ${allVSRAccounts.length} VSR accounts`);
  
  for (let accountIndex = 0; accountIndex < allVSRAccounts.length; accountIndex++) {
    const account = allVSRAccounts[accountIndex];
    console.log(`🔍 SDK: Processing VSR account ${accountIndex + 1}: ${account.pubkey.toBase58()}`);
    
    try {
      // Attempt Anchor deserialization first
      const voterAccount = await program.account.voter.fetch(account.pubkey);
      console.log(`✅ Anchor deserialization successful, ${voterAccount.deposits.length} deposits`);
      
      // CRITICAL: Only process accounts owned by the target wallet
      if (!voterAccount.authority.equals(walletPublicKey)) {
        console.log(`⏭️ Skipping account - authority ${voterAccount.authority.toBase58()} != target wallet ${walletPublicKey.toBase58()}`);
        continue;
      }
      
      console.log(`✅ Account authority matches target wallet`);
      
      // Get registrar for this account
      const registrarPubkey = voterAccount.registrar;
      let registrarAccount = null;
      
      try {
        registrarAccount = await program.account.registrar.fetch(registrarPubkey);
        console.log(`✅ Registrar loaded: ${registrarAccount.votingMints.length} voting mints`);
      } catch (regError) {
        console.log(`⚠️ Could not load registrar config: ${regError.message}`);
      }
      
      // Process each deposit entry
      for (let i = 0; i < voterAccount.deposits.length; i++) {
        const deposit = voterAccount.deposits[i];
        
        // Check if deposit is used and has currently locked amount
        if (!deposit.isUsed) {
          console.log(`⏭️ Skipping deposit ${i}: not used`);
          continue;
        }
        
        // Use amountDepositedNative as currently locked amount proxy
        const currentlyLocked = deposit.amountDepositedNative.toNumber();
        if (currentlyLocked === 0) {
          console.log(`⏭️ Skipping deposit ${i}: no currently locked amount`);
          continue;
        }
        
        const depositAmount = currentlyLocked / 1e6; // Convert to ISLAND
        console.log(`📊 Deposit ${i}: ${depositAmount.toLocaleString()} ISLAND currently locked`);
        
        // Check if lockup is still active
        const isLocked = deposit.lockup && deposit.lockup.endTs.toNumber() > currentTime;
        console.log(`🔒 Lockup status: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`);
        
        if (!isLocked) {
          console.log(`⏭️ Skipping expired lockup deposit ${i}`);
          continue;
        }
        
        // Calculate multiplier
        let multiplier = 1.0; // Baseline
        
        if (registrarAccount && deposit.votingMintConfigIdx < registrarAccount.votingMints.length) {
          const votingMintConfig = registrarAccount.votingMints[deposit.votingMintConfigIdx];
          
          const lockupSecs = deposit.lockup.endTs.toNumber() - currentTime;
          const saturationSecs = votingMintConfig.lockupSaturationSecs.toNumber();
          const lockupFactor = Math.min(lockupSecs / saturationSecs, 1.0);
          
          const baselineWeight = votingMintConfig.baselineVoteWeightScaledFactor.toNumber();
          const maxExtraWeight = votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber();
          
          multiplier = (baselineWeight + (lockupFactor * maxExtraWeight)) / 1_000_000_000;
        }
        
        const depositVotingPower = depositAmount * multiplier;
        totalGovernancePower += depositVotingPower;
        
        console.log(`💎 Deposit ${i}: ${depositAmount.toLocaleString()} × ${multiplier.toFixed(6)} = ${depositVotingPower.toLocaleString()} governance power`);
      }
      
    } catch (anchorError) {
      console.log(`❌ Anchor deserialization failed: ${anchorError.message}`);
      console.log(`🔄 Falling back to raw parsing for account ${accountIndex + 1}`);
      
      // Fallback to raw parsing with authority check
      const data = account.account.data;
      
      // Check authority at offset 8 (32 bytes)
      try {
        const authorityBytes = data.slice(8, 40);
        const authority = new PublicKey(authorityBytes);
        
        if (!authority.equals(walletPublicKey)) {
          console.log(`⏭️ Raw parsing: authority ${authority.toBase58()} != target wallet ${walletPublicKey.toBase58()}`);
          continue;
        }
        
        console.log(`✅ Raw parsing: authority matches target wallet`);
      } catch (authError) {
        console.log(`⚠️ Raw parsing: could not parse authority, skipping account`);
        continue;
      }
      
      // Scan for deposit amounts (conservative estimate)
      const depositAmounts = [];
      for (let offset = 0; offset < data.length - 8; offset += 8) {
        const value = Number(data.readBigUInt64LE(offset));
        if (value > 10000000000 && value < 100000000000000) { // 10K to 100M ISLAND in micro-units
          const asTokens = value / 1e6;
          if (asTokens >= 1000 && asTokens <= 100000000) { // 1K to 100M ISLAND
            depositAmounts.push({ offset, amount: asTokens, raw: value });
          }
        }
      }
      
      // Take conservative estimate (smallest reasonable amount)
      if (depositAmounts.length > 0) {
        const amounts = depositAmounts.map(d => d.amount);
        const estimatedAmount = Math.min(...amounts); // Take minimum to avoid overcounting
        totalGovernancePower += estimatedAmount;
        console.log(`🔄 Raw parsing: ${estimatedAmount.toLocaleString()} ISLAND (conservative estimate)`);
      }
    }
  }
  
  console.log(`🏆 Total native governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  return totalGovernancePower;
}

/**
 * Get canonical governance power using exact SDK methodology
 */
async function getCanonicalGovernancePower(walletAddress) {
  const walletPubkey = new PublicKey(walletAddress);
  
  console.log(`🏛️ Getting canonical governance power for: ${walletAddress}`);
  
  try {
    // Set up Anchor context using the exact methodology requested
    const dummyWallet = createDummyWallet();
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
    const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);
    
    console.log(`🔍 SDK: Anchor setup complete`);
    console.log(`🔍 SDK: Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
    console.log(`🔍 SDK: Registrar PDA: ${ISLAND_DAO_REGISTRAR.toBase58()}`);
    
    // Find all VSR accounts for this wallet using proper authority-based search
    console.log(`🔍 SDK: Searching for VSR accounts owned by wallet...`);
    
    // Use memcmp at offset 8 to find accounts where authority = walletPubkey
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // Authority field offset in Voter accounts
            bytes: walletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`🔍 SDK: Found ${allVSRAccounts.length} VSR accounts for wallet`);
    
    // Calculate native governance power using canonical methodology
    const votingPower = await calculateNativeGovernancePower(program, walletPubkey, allVSRAccounts);
    
    if (votingPower > 0) {
      return {
        wallet: walletPubkey.toBase58(),
        nativeGovernancePower: votingPower,
        delegatedGovernancePower: 0,
        totalGovernancePower: votingPower,
        source: "vsr_sdk"
      };
    }
    
    // Check for TokenOwnerRecord if no VSR
    const torResult = await getTokenOwnerRecord(walletPubkey);
    if (torResult.governingTokenDepositAmount > 0) {
      return {
        nativeGovernancePower: torResult.governingTokenDepositAmount,
        delegatedGovernancePower: 0,
        totalGovernancePower: torResult.governingTokenDepositAmount,
        source: "token_owner_record",
        governanceDelegate: torResult.governanceDelegate,
        details: {
          depositAmount: torResult.governingTokenDepositAmount,
          mint: torResult.governingTokenMint
        }
      };
    }
    
    // Return zero power if neither found
    return {
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      source: "none"
    };
    
  } catch (error) {
    console.error(`🔍 SDK: Error in canonical governance calculation: ${error.message}`);
    return {
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      source: "error",
      error: error.message
    };
  }
}

/**
 * Get Token Owner Record by scanning all accounts if PDA fails
 */
async function getTokenOwnerRecord(walletPubkey) {
  try {
    // First try canonical PDA derivation
    const torAddress = await getTokenOwnerRecordAddress(
      SPL_GOVERNANCE_PROGRAM_ID,
      ISLAND_DAO_REALM,
      ISLAND_GOVERNANCE_MINT,
      walletPubkey
    );
    
    console.log(`TOR PDA: ${torAddress.toBase58()}`);
    
    const accountInfo = await connection.getAccountInfo(torAddress);
    if (accountInfo && accountInfo.data) {
      return parseTokenOwnerRecord(accountInfo.data, torAddress);
    }
    
    // If PDA not found, scan all TokenOwnerRecord accounts
    console.log(`PDA not found, scanning all TokenOwnerRecord accounts...`);
    
    const accounts = await connection.getProgramAccounts(SPL_GOVERNANCE_PROGRAM_ID, {
      filters: [{ dataSize: 404 }], // TokenOwnerRecord size
    });
    
    console.log(`Scanning ${accounts.length} TokenOwnerRecord accounts`);
    
    for (const { account, pubkey } of accounts) {
      const data = account.data;
      
      // Parse basic structure to check if it matches our wallet
      const realm = new PublicKey(data.slice(0, 32));
      const governingTokenMint = new PublicKey(data.slice(32, 64));
      const governingTokenOwner = new PublicKey(data.slice(64, 96));
      
      if (realm.equals(ISLAND_DAO_REALM) && 
          governingTokenMint.equals(ISLAND_GOVERNANCE_MINT) && 
          governingTokenOwner.equals(walletPubkey)) {
        
        console.log(`Found TokenOwnerRecord at: ${pubkey.toBase58()}`);
        return parseTokenOwnerRecord(data, pubkey);
      }
    }
    
    return { governingTokenDepositAmount: 0, governanceDelegate: null };
    
  } catch (error) {
    console.error(`TokenOwnerRecord lookup error: ${error.message}`);
    return { governingTokenDepositAmount: 0, governanceDelegate: null };
  }
}

/**
 * Parse TokenOwnerRecord account data
 */
function parseTokenOwnerRecord(data, pubkey) {
  try {
    // TokenOwnerRecord structure:
    // 0-32: realm
    // 32-64: governing_token_mint
    // 64-96: governing_token_owner
    // 96-104: governing_token_deposit_amount (u64)
    // 104-105: has_governance_delegate (bool)
    // 105-137: governance_delegate (optional Pubkey)
    
    const realm = new PublicKey(data.slice(0, 32));
    const governingTokenMint = new PublicKey(data.slice(32, 64));
    const governingTokenOwner = new PublicKey(data.slice(64, 96));
    const governingTokenDepositAmount = Number(data.readBigUInt64LE(96));
    
    let governanceDelegate = null;
    if (data.length > 104 && data[104] === 1) {
      governanceDelegate = new PublicKey(data.slice(105, 137)).toBase58();
    }
    
    console.log(`TokenOwnerRecord parsed:`);
    console.log(`  Address: ${pubkey.toBase58()}`);
    console.log(`  Deposit Amount: ${governingTokenDepositAmount}`);
    console.log(`  Governance Delegate: ${governanceDelegate || 'None'}`);
    
    return {
      governingTokenDepositAmount,
      governanceDelegate,
      realm: realm.toBase58(),
      governingTokenMint: governingTokenMint.toBase58(),
      governingTokenOwner: governingTokenOwner.toBase58()
    };
    
  } catch (error) {
    console.error(`Error parsing TokenOwnerRecord: ${error.message}`);
    return { governingTokenDepositAmount: 0, governanceDelegate: null };
  }
}

/**
 * Get VSR governance power with detailed lockup analysis
 */
async function getVSRGovernancePower(walletPubkey) {
  try {
    console.log(`🗳️ Getting VSR governance power for: ${walletPubkey.toBase58()}`);
    
    // First try PDA derivation
    const [voterPDA] = PublicKey.findProgramAddressSync(
      [
        ISLAND_DAO_REGISTRAR.toBuffer(),
        Buffer.from("voter"),
        walletPubkey.toBuffer(),
      ],
      VSR_PROGRAM_ID
    );
    
    console.log(`Voter PDA: ${voterPDA.toBase58()}`);
    
    let voterAccount = await connection.getAccountInfo(voterPDA);
    let voterAddress = voterPDA;
    
    // If PDA not found, scan all Voter accounts
    if (!voterAccount || !voterAccount.data) {
      console.log(`PDA not found, scanning all Voter accounts...`);
      
      const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
      
      console.log(`Scanning ${accounts.length} Voter accounts`);
      
      for (const { account, pubkey } of accounts) {
        const data = account.data;
        if (data.length < 72) continue;
        
        // Parse authority from Voter struct (offset 40)
        const authority = new PublicKey(data.slice(40, 72));
        
        // Debug for Takisoul specifically
        if (walletPubkey.toBase58() === "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA") {
          console.log(`Checking account ${pubkey.toBase58()}: authority=${authority.toBase58()}`);
        }
        
        if (authority.equals(walletPubkey)) {
          console.log(`Found Voter account at: ${pubkey.toBase58()}`);
          voterAccount = account;
          voterAddress = pubkey;
          break;
        }
      }
    }
    
    if (!voterAccount || !voterAccount.data) {
      return {
        nativeGovernancePower: 0,
        delegatedGovernancePower: 0,
        totalGovernancePower: 0,
        source: "vsr",
        details: {}
      };
    }
    
    // Parse Voter account using VSR IDL structure
    return parseVoterAccount(voterAccount.data, voterAddress);
    
  } catch (error) {
    console.error(`VSR governance power error: ${error.message}`);
    return {
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      source: "vsr",
      details: {}
    };
  }
}

/**
 * Parse Voter account using VSR IDL structure
 */
function parseVoterAccount(data, pubkey) {
  try {
    console.log(`Parsing Voter account: ${pubkey.toBase58()}`);
    
    // Voter struct layout:
    // 0-8: discriminator
    // 8-40: registrar
    // 40-72: authority
    // 72: voter_bump
    // 73: voter_weight_record_bump
    // 74-82: voter_weight (u64)
    // 82+: deposit_entries (array of DepositEntry, 32 max)
    
    const registrar = new PublicKey(data.slice(8, 40));
    const authority = new PublicKey(data.slice(40, 72));
    const voterWeight = Number(data.readBigUInt64LE(74));
    
    console.log(`Voter details:`);
    console.log(`  Registrar: ${registrar.toBase58()}`);
    console.log(`  Authority: ${authority.toBase58()}`);
    console.log(`  Voter Weight: ${voterWeight}`);
    
    // Parse deposit entries starting at offset 82
    const depositEntries = [];
    let totalVotingPower = 0;
    
    for (let i = 0; i < 32; i++) {
      const entryOffset = 82 + (i * 105); // DepositEntry is 105 bytes
      
      if (data.length < entryOffset + 105) break;
      
      const isUsed = data[entryOffset] === 1;
      if (!isUsed) continue;
      
      const entry = parseDepositEntry(data, entryOffset, i);
      if (entry && entry.amount > 0) {
        depositEntries.push(entry);
        totalVotingPower += entry.votingPower;
        
        console.log(`Deposit ${i}: ${entry.lockupKind}, amount=${entry.amount}, multiplier=${entry.multiplier}, power=${entry.votingPower}`);
      }
    }
    
    return {
      nativeGovernancePower: totalVotingPower,
      delegatedGovernancePower: 0,
      totalGovernancePower: totalVotingPower,
      source: "vsr",
      details: depositEntries.reduce((acc, entry, idx) => {
        acc[`deposit${idx + 1}`] = {
          type: entry.lockupKind,
          amount: entry.amount,
          multiplier: entry.multiplier,
          votingPower: entry.votingPower,
          lockupExpiration: entry.lockupExpiration
        };
        return acc;
      }, {})
    };
    
  } catch (error) {
    console.error(`Error parsing Voter account: ${error.message}`);
    return {
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      source: "vsr",
      details: {}
    };
  }
}

/**
 * Parse individual DepositEntry from Voter account
 */
function parseDepositEntry(data, offset, index) {
  try {
    // DepositEntry layout:
    // 0: is_used (1 byte)
    // 1-9: amount_deposited_native (u64)
    // 9-17: amount_initially_locked_native (u64)
    // 17: lockup_kind (1 byte: 0=None, 1=Cliff, 2=Constant, 3=Vested)
    // 18-26: lockup_start_ts (i64)
    // 26-34: lockup_duration_seconds (u64)
    // 34-42: lockup_cooldown_seconds (u64)
    // 42+: additional fields...
    
    const amount = Number(data.readBigUInt64LE(offset + 1));
    const amountLocked = Number(data.readBigUInt64LE(offset + 9));
    const lockupKindByte = data[offset + 17];
    const lockupStartTs = Number(data.readBigInt64LE(offset + 18));
    const lockupDuration = Number(data.readBigUInt64LE(offset + 26));
    
    const lockupKinds = ['none', 'cliff', 'constant', 'vested'];
    const lockupKind = lockupKinds[lockupKindByte] || 'unknown';
    
    // Calculate lockup expiration
    const lockupExpiration = lockupStartTs + lockupDuration;
    const currentTime = Math.floor(Date.now() / 1000);
    const remainingSeconds = Math.max(0, lockupExpiration - currentTime);
    
    // Calculate multiplier based on lockup type and remaining time
    const multiplier = calculateLockupMultiplier(lockupKind, remainingSeconds, lockupDuration);
    const votingPower = Math.floor(amount * multiplier);
    
    return {
      amount,
      amountLocked,
      lockupKind,
      lockupStartTs,
      lockupDuration,
      lockupExpiration,
      remainingSeconds,
      multiplier,
      votingPower
    };
    
  } catch (error) {
    console.error(`Error parsing deposit entry ${index}: ${error.message}`);
    return null;
  }
}

/**
 * Calculate lockup multiplier based on IslandDAO VSR configuration
 */
function calculateLockupMultiplier(lockupKind, remainingSeconds, originalDuration) {
  // IslandDAO VSR multiplier configuration (approximate)
  const BASELINE_MULTIPLIER = 1.0;
  const MAX_MULTIPLIER = 5.0;
  const YEAR_SECONDS = 365 * 24 * 60 * 60;
  
  if (lockupKind === 'none' || remainingSeconds <= 0) {
    return BASELINE_MULTIPLIER;
  }
  
  // Calculate years remaining
  const yearsRemaining = remainingSeconds / YEAR_SECONDS;
  
  // Apply multiplier based on lockup type
  switch (lockupKind) {
    case 'cliff':
    case 'constant':
      // Linear scaling: 1x for 0 years, up to 5x for 4+ years
      return Math.min(BASELINE_MULTIPLIER + (yearsRemaining * 1.0), MAX_MULTIPLIER);
    
    case 'vested':
      // Slightly lower multiplier for vested tokens
      return Math.min(BASELINE_MULTIPLIER + (yearsRemaining * 0.8), MAX_MULTIPLIER);
    
    default:
      return BASELINE_MULTIPLIER;
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
    console.log(`\n🏛️ === Canonical Governance Power Calculation ===`);
    console.log(`Wallet: ${wallet}`);
    
    const result = await getCanonicalGovernancePower(wallet);
    
    console.log(`\n📊 Final Result:`);
    console.log(`  Native Power: ${result.nativeGovernancePower}`);
    console.log(`  Total Power: ${result.totalGovernancePower}`);
    console.log(`  Source: ${result.source}`);
    
    return res.json(result);
    
  } catch (error) {
    console.error("Canonical governance power error:", error.message);
    return res.status(500).json({ 
      error: "Failed to calculate governance power",
      details: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`✅ VSR API Server running on port ${port}`);
});
