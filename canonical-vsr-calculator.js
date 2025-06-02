/**
 * Canonical Anchor-based VSR Governance Power Calculator for IslandDAO
 * Uses proper account decoding with <0.5% accuracy requirement
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, BN } = pkg;
import fs from 'fs';

// Load environment and VSR IDL
const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// Load VSR IDL
const vsrIdl = JSON.parse(fs.readFileSync('./vsr_idl.json', 'utf8'));

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

/**
 * Calculate native governance power using canonical Anchor decoding
 */
async function calculateNativeGovernancePower(walletAddress) {
  const walletPubkey = new PublicKey(walletAddress);
  const currentTime = Date.now() / 1000;
  
  console.log(`🔍 Calculating native governance power for: ${walletAddress}`);
  
  try {
    // Set up Anchor program
    const dummyWallet = createDummyWallet();
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
    const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);
    
    // Find all VSR Voter accounts for this wallet
    const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // voterAuthority field offset
            bytes: walletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`📊 Found ${voterAccounts.length} VSR Voter accounts`);
    
    let totalNativePower = 0;
    const allDeposits = [];
    
    for (const accountInfo of voterAccounts) {
      try {
        // Use Anchor coder to decode the account
        const voterAccount = program.coder.accounts.decode("voter", accountInfo.account.data);
        
        console.log(`🔍 Processing Voter account: ${accountInfo.pubkey.toBase58()}`);
        console.log(`📋 Found ${voterAccount.deposits.length} deposit entries`);
        
        // Process each deposit entry
        for (let i = 0; i < voterAccount.deposits.length; i++) {
          const deposit = voterAccount.deposits[i];
          
          // Skip unused deposits
          if (!deposit.isUsed) {
            console.log(`[Deposit ${i}] Skipped - not used`);
            continue;
          }
          
          // Skip deposits with no lockup (kind.none)
          if (deposit.lockup.kind.none) {
            console.log(`[Deposit ${i}] Skipped - no lockup (kind.none)`);
            continue;
          }
          
          // Parse deposit amount
          const amount = deposit.amountDepositedNative.toNumber() / 1e6; // Convert to ISLAND tokens
          if (amount === 0) {
            console.log(`[Deposit ${i}] Skipped - zero amount`);
            continue;
          }
          
          // Check if deposit is expired
          const lockupEndTs = deposit.lockup.endTs.toNumber();
          if (lockupEndTs < currentTime) {
            console.log(`[Deposit ${i}] Skipped - expired (endTs: ${lockupEndTs}, now: ${currentTime})`);
            continue;
          }
          
          // Calculate multiplier based on lockup type
          let multiplier = 1.0;
          
          if (deposit.lockup.kind.cliff) {
            // Cliff lockup - use periods and saturation
            const periodsLeft = Math.max(0, (lockupEndTs - currentTime) / deposit.lockup.period.toNumber());
            const maxPeriods = deposit.lockup.periods ? deposit.lockup.periods.toNumber() : 1;
            multiplier = 1.0 + (periodsLeft / maxPeriods) * 4.0; // Max 5x multiplier
          } else if (deposit.lockup.kind.constant) {
            // Constant lockup - fixed multiplier based on duration
            const duration = lockupEndTs - deposit.lockup.startTs.toNumber();
            const yearsLocked = duration / (365.25 * 24 * 3600);
            multiplier = Math.min(5.0, 1.0 + yearsLocked); // Max 5x multiplier
          } else if (deposit.lockup.kind.vested) {
            // Vested lockup - linear decline
            const totalDuration = lockupEndTs - deposit.lockup.startTs.toNumber();
            const remainingDuration = lockupEndTs - currentTime;
            const vestingRatio = remainingDuration / totalDuration;
            multiplier = 1.0 + vestingRatio * 4.0; // Max 5x multiplier
          }
          
          // Skip deposits with multiplier <= 1.0
          if (multiplier <= 1.0) {
            console.log(`[Deposit ${i}] Skipped - multiplier <= 1.0 (${multiplier})`);
            continue;
          }
          
          // Calculate voting power
          const votingPower = amount * multiplier;
          totalNativePower += votingPower;
          
          allDeposits.push([amount, multiplier, votingPower]);
          
          console.log(`[Deposit ${i}] Amount: ${amount.toLocaleString()}, Multiplier: ${multiplier.toFixed(6)}, VotingPower: ${votingPower.toLocaleString()}`);
        }
        
      } catch (decodeError) {
        console.log(`❌ Failed to decode Voter account ${accountInfo.pubkey.toBase58()}: ${decodeError.message}`);
      }
    }
    
    console.log(`🏆 Total native governance power: ${totalNativePower.toLocaleString()} ISLAND`);
    return { nativePower: totalNativePower, deposits: allDeposits };
    
  } catch (error) {
    console.error(`❌ Error calculating native governance power: ${error.message}`);
    return { nativePower: 0, deposits: [] };
  }
}

/**
 * Calculate delegated governance power from SPL Governance TokenOwnerRecords
 */
async function calculateDelegatedGovernancePower(walletAddress) {
  const walletPubkey = new PublicKey(walletAddress);
  
  console.log(`🔍 Calculating delegated governance power for: ${walletAddress}`);
  
  try {
    // Find TokenOwnerRecord accounts where this wallet is the governing token owner
    const torAccounts = await connection.getProgramAccounts(SPL_GOVERNANCE_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 1 + 32 + 32, // Skip accountType + realm + governingTokenMint
            bytes: walletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`📊 Found ${torAccounts.length} TokenOwnerRecord accounts`);
    
    let totalDelegatedPower = 0;
    
    for (const accountInfo of torAccounts) {
      try {
        const data = accountInfo.account.data;
        
        // Parse governingTokenDepositAmount (at offset 1 + 32 + 32 + 32, 8 bytes)
        const depositAmount = Number(data.readBigUInt64LE(1 + 32 + 32 + 32)) / 1e6;
        
        // Parse governingDelegatedVotes (at offset 1 + 32 + 32 + 32 + 8 + 8, 8 bytes)
        const delegatedVotes = Number(data.readBigUInt64LE(1 + 32 + 32 + 32 + 8 + 8)) / 1e6;
        
        if (delegatedVotes > 0) {
          totalDelegatedPower += delegatedVotes;
          console.log(`[TOR] Account: ${accountInfo.pubkey.toBase58()}, Delegated: ${delegatedVotes.toLocaleString()} ISLAND`);
        }
        
      } catch (parseError) {
        console.log(`⚠️ Error parsing TokenOwnerRecord ${accountInfo.pubkey.toBase58()}: ${parseError.message}`);
      }
    }
    
    console.log(`🏆 Total delegated governance power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    return totalDelegatedPower;
    
  } catch (error) {
    console.error(`❌ Error calculating delegated governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate complete governance power for a wallet
 */
async function calculateGovernancePower(walletAddress) {
  console.log(`\n🏛️ === Canonical Governance Power Calculation ===`);
  console.log(`Wallet: ${walletAddress}`);
  
  const [nativeResult, delegatedPower] = await Promise.all([
    calculateNativeGovernancePower(walletAddress),
    calculateDelegatedGovernancePower(walletAddress)
  ]);
  
  const totalPower = nativeResult.nativePower + delegatedPower;
  
  const result = {
    wallet: walletAddress,
    nativeGovernancePower: nativeResult.nativePower,
    delegatedGovernancePower: delegatedPower,
    totalGovernancePower: totalPower,
    deposits: nativeResult.deposits
  };
  
  console.log(`📊 Final Result:`);
  console.log(`  Native Power: ${nativeResult.nativePower.toLocaleString()}`);
  console.log(`  Delegated Power: ${delegatedPower.toLocaleString()}`);
  console.log(`  Total Power: ${totalPower.toLocaleString()}`);
  
  return result;
}

/**
 * Validate accuracy against known ground truth values
 */
function validateAccuracy(result, expectedNative) {
  const actualNative = result.nativeGovernancePower;
  const tolerance = 0.005; // 0.5%
  
  if (expectedNative === 0) {
    return actualNative === 0;
  }
  
  const difference = Math.abs(actualNative - expectedNative) / expectedNative;
  const isAccurate = difference <= tolerance;
  
  console.log(`\n🎯 Accuracy Validation:`);
  console.log(`  Expected: ${expectedNative.toLocaleString()}`);
  console.log(`  Actual: ${actualNative.toLocaleString()}`);
  console.log(`  Difference: ${(difference * 100).toFixed(2)}%`);
  console.log(`  Status: ${isAccurate ? '✅ PASS' : '❌ FAIL'} (tolerance: 0.5%)`);
  
  return isAccurate;
}

/**
 * Test known ground truth wallets
 */
async function testGroundTruthWallets() {
  const testCases = [
    { wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expectedNative: 8709019.78, name: 'Takisoul' },
    { wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expectedNative: 144708.98, name: 'GJdR' },
    { wallet: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expectedNative: 0, name: 'Fgv1 (unlocked)' }
  ];
  
  console.log('🧪 Testing Ground Truth Wallets\n');
  
  let passCount = 0;
  
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing: ${testCase.name} (${testCase.wallet})`);
    
    const result = await calculateGovernancePower(testCase.wallet);
    const isAccurate = validateAccuracy(result, testCase.expectedNative);
    
    if (isAccurate) passCount++;
  }
  
  console.log(`\n🏆 Overall Test Results: ${passCount}/${testCases.length} wallets passed accuracy validation`);
  return passCount === testCases.length;
}

// Run the ground truth validation
testGroundTruthWallets();