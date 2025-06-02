/**
 * Debug Takisoul VSR Details
 * Analyze why wallet 7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA shows ~1.7K instead of ~8.7M ISLAND
 * Expected deposits: 10K (1.07x), 37,627 (1.98x), 25,739 (2.04x), 3,913 (1.70x)
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import fs from "fs";
import { config } from "dotenv";

config();

// Load VSR IDL
const vsrIdl = JSON.parse(fs.readFileSync("vsr_idl.json", "utf8"));

// VSR Program ID
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Takisoul's wallet
const TAKISOUL_WALLET = "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA";

// Expected deposits for validation
const EXPECTED_DEPOSITS = [
  { amount: 10000, multiplier: 1.07, type: "vesting" },
  { amount: 37626.98, multiplier: 1.98, type: "constant" },
  { amount: 25738.99, multiplier: 2.04, type: "cliff" },
  { amount: 3913, multiplier: 1.70, type: "cliff" }
];

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
 * Calculate VSR multiplier from lockup configuration
 */
function calculateVSRMultiplier(deposit, registrarConfig, currentTime) {
  if (!registrarConfig || !registrarConfig.votingMints || registrarConfig.votingMints.length === 0) {
    return 1.0; // Baseline if no config
  }
  
  const votingMintConfig = registrarConfig.votingMints[deposit.votingMintConfigIdx || 0];
  if (!votingMintConfig) {
    return 1.0;
  }
  
  let lockupFactor = 0;
  if (deposit.lockup && deposit.lockup.endTs > currentTime) {
    const lockupSecs = deposit.lockup.endTs - currentTime;
    const saturationSecs = votingMintConfig.lockupSaturationSecs?.toNumber() || (5 * 365.25 * 24 * 3600);
    lockupFactor = Math.min(lockupSecs / saturationSecs, 1.0);
  }
  
  const baselineWeight = votingMintConfig.baselineVoteWeightScaledFactor?.toNumber() || 1000000000;
  const maxExtraWeight = votingMintConfig.maxExtraLockupVoteWeightScaledFactor?.toNumber() || 2000000000;
  
  return (baselineWeight + (lockupFactor * maxExtraWeight)) / 1000000000;
}

/**
 * Parse deposits using raw account data (fallback method)
 */
function parseDepositsFromRawData(data) {
  console.log(`📊 Parsing deposits from raw account data (${data.length} bytes)`);
  
  const deposits = [];
  
  // Scan for deposit amounts
  for (let offset = 72; offset < Math.min(data.length - 8, 2000); offset += 8) {
    const value = Number(data.readBigUInt64LE(offset));
    const asTokens = value / 1e6;
    
    // Look for reasonable token amounts
    if (value > 1000000 && value < 100000000000) { // 1 to 100K tokens
      if (asTokens >= 1000 && asTokens <= 100000) { // Focus on larger amounts
        deposits.push({ 
          offset, 
          amountDepositedNative: asTokens, 
          raw: value,
          source: 'raw_parsing'
        });
      }
    }
  }
  
  console.log(`📊 Found ${deposits.length} potential deposits from raw parsing`);
  return deposits;
}

/**
 * Debug Takisoul's VSR details
 */
async function debugTakisoulVSR() {
  try {
    console.log(`🔍 DEBUG: Takisoul VSR Analysis`);
    console.log(`🔍 Wallet: ${TAKISOUL_WALLET}`);
    console.log(`🔍 Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
    console.log(`🔍 Expected total: ~8.7M ISLAND from 4 deposits`);
    
    // Set up connection
    const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
    const dummyWallet = createDummyWallet();
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
    const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);
    
    const walletPubkey = new PublicKey(TAKISOUL_WALLET);
    
    // Find all VSR accounts for Takisoul
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // Authority field offset
            bytes: walletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`\n🔍 Found ${vsrAccounts.length} VSR accounts for Takisoul`);
    
    let totalRawDeposits = 0;
    let totalVotingPowerCalculated = 0;
    let totalExpectedVotingPower = 0;
    let allDepositsFound = [];
    
    for (let i = 0; i < vsrAccounts.length; i++) {
      const account = vsrAccounts[i];
      const data = account.account.data;
      
      console.log(`\n=== VSR ACCOUNT ${i + 1} ===`);
      console.log(`Address: ${account.pubkey.toBase58()}`);
      console.log(`Data Length: ${data.length} bytes`);
      
      // Parse registrar
      const registrarBytes = data.slice(40, 72);
      const registrar = new PublicKey(registrarBytes);
      console.log(`Registrar: ${registrar.toBase58()}`);
      
      try {
        // Try Anchor parsing first
        console.log(`\n📋 Attempting Anchor IDL parsing...`);
        const voterAccount = await program.account.voter.fetch(account.pubkey);
        
        console.log(`✅ Anchor parsing successful!`);
        console.log(`Deposits array length: ${voterAccount.deposits.length}`);
        
        // Get registrar config for multiplier calculation
        let registrarAccount = null;
        try {
          registrarAccount = await program.account.registrar.fetch(registrar);
          console.log(`Registrar config loaded: ${registrarAccount.votingMints.length} voting mints`);
        } catch (regError) {
          console.log(`⚠️ Could not load registrar config: ${regError.message}`);
        }
        
        const currentTime = Date.now() / 1000;
        
        // Process each deposit using Anchor data
        for (let j = 0; j < voterAccount.deposits.length; j++) {
          const deposit = voterAccount.deposits[j];
          
          console.log(`\n--- Deposit ${j + 1} (Anchor) ---`);
          console.log(`isUsed: ${deposit.isUsed}`);
          console.log(`amountDepositedNative: ${deposit.amountDepositedNative.toString()} (${deposit.amountDepositedNative.toNumber() / 1e6} ISLAND)`);
          console.log(`amountInitiallyLockedNative: ${deposit.amountInitiallyLockedNative.toString()}`);
          console.log(`allowClawback: ${deposit.allowClawback}`);
          console.log(`votingMintConfigIdx: ${deposit.votingMintConfigIdx}`);
          
          if (deposit.lockup) {
            console.log(`Lockup kind: ${Object.keys(deposit.lockup.kind)[0]}`);
            console.log(`Start time: ${new Date(deposit.lockup.startTs.toNumber() * 1000).toISOString()}`);
            console.log(`End time: ${new Date(deposit.lockup.endTs.toNumber() * 1000).toISOString()}`);
            
            const isUnlocked = deposit.lockup.endTs.toNumber() <= currentTime;
            console.log(`isUnlocked: ${isUnlocked}`);
          }
          
          if (deposit.isUsed && deposit.amountDepositedNative.gt(0)) {
            const amount = deposit.amountDepositedNative.toNumber() / 1e6;
            totalRawDeposits += amount;
            
            // Calculate multiplier
            const multiplier = calculateVSRMultiplier(deposit, registrarAccount, currentTime);
            const votingPower = amount * multiplier;
            
            console.log(`Calculated multiplier: ${multiplier.toFixed(6)}`);
            console.log(`Voting power: ${amount.toLocaleString()} × ${multiplier.toFixed(6)} = ${votingPower.toLocaleString()}`);
            
            totalVotingPowerCalculated += votingPower;
            allDepositsFound.push({ amount, multiplier, votingPower, source: 'anchor' });
            
            // Check against expected deposits
            const expectedMatch = EXPECTED_DEPOSITS.find(exp => Math.abs(exp.amount - amount) < 1);
            if (expectedMatch) {
              console.log(`✅ Matches expected: ${expectedMatch.amount} ISLAND (${expectedMatch.type})`);
              totalExpectedVotingPower += expectedMatch.amount * expectedMatch.multiplier;
            } else {
              console.log(`❓ No expected match found for ${amount} ISLAND`);
            }
          } else {
            console.log(`⏭️ SKIPPED: isUsed=${deposit.isUsed}, amount=${deposit.amountDepositedNative.toString()}`);
          }
        }
        
      } catch (anchorError) {
        console.log(`❌ Anchor parsing failed: ${anchorError.message}`);
        console.log(`🔄 Falling back to raw data parsing...`);
        
        // Fallback to raw parsing
        const rawDeposits = parseDepositsFromRawData(data);
        
        for (let k = 0; k < rawDeposits.length; k++) {
          const deposit = rawDeposits[k];
          console.log(`\n--- Raw Deposit ${k + 1} ---`);
          console.log(`Amount: ${deposit.amountDepositedNative.toLocaleString()} ISLAND`);
          console.log(`Offset: ${deposit.offset}`);
          console.log(`Raw value: ${deposit.raw}`);
          
          totalRawDeposits += deposit.amountDepositedNative;
          
          // Estimate voting power (assume 1.5x average multiplier)
          const estimatedVotingPower = deposit.amountDepositedNative * 1.5;
          totalVotingPowerCalculated += estimatedVotingPower;
          
          console.log(`Estimated voting power: ${estimatedVotingPower.toLocaleString()}`);
          
          allDepositsFound.push({ 
            amount: deposit.amountDepositedNative, 
            multiplier: 1.5, 
            votingPower: estimatedVotingPower, 
            source: 'raw' 
          });
        }
      }
    }
    
    // Final summary
    console.log(`\n🔍 === FINAL ANALYSIS ===`);
    console.log(`Total VSR accounts: ${vsrAccounts.length}`);
    console.log(`Total deposits found: ${allDepositsFound.length}`);
    console.log(`Total raw deposit amount: ${totalRawDeposits.toLocaleString()} ISLAND`);
    console.log(`Total voting power calculated: ${totalVotingPowerCalculated.toLocaleString()} ISLAND`);
    console.log(`Total expected voting power: ${totalExpectedVotingPower.toLocaleString()} ISLAND`);
    
    console.log(`\n📊 Expected vs Found:`);
    EXPECTED_DEPOSITS.forEach((expected, idx) => {
      const found = allDepositsFound.find(dep => Math.abs(dep.amount - expected.amount) < 1);
      if (found) {
        console.log(`✅ Expected ${expected.amount} (${expected.type}) → Found ${found.amount} (${found.source})`);
      } else {
        console.log(`❌ Expected ${expected.amount} (${expected.type}) → NOT FOUND`);
      }
    });
    
    if (totalVotingPowerCalculated < 5000000) {
      console.log(`\n⚠️ ISSUE DETECTED: Calculated power (${totalVotingPowerCalculated.toLocaleString()}) much lower than expected (~8.7M)`);
      console.log(`Possible causes:`);
      console.log(`- Deposits are marked as inactive/unused`);
      console.log(`- Lockups have expired (unlocked)`);
      console.log(`- Multiplier calculation is incorrect`);
      console.log(`- Some VSR accounts are missing`);
      console.log(`- IDL structure mismatch`);
    }
    
  } catch (error) {
    console.error(`❌ Error in Takisoul VSR analysis: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the analysis
debugTakisoulVSR();