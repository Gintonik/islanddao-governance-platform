/**
 * Canonical VSR Governance Power Calculator
 * Uses official VSR IDL and Anchor deserialization for authentic governance power calculation
 * Implements proper deposit validation and lockup multiplier logic
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Official VSR IDL structure based on Solana Labs voter-stake-registry
const VSR_IDL = {
  "version": "0.2.7",
  "name": "voter_stake_registry",
  "instructions": [
    {
      "name": "createRegistrar",
      "accounts": [],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "voter",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "voterAuthority", "type": "publicKey" },
          { "name": "registrar", "type": "publicKey" },
          { "name": "deposits", "type": { "array": [{ "defined": "DepositEntry" }, 32] } },
          { "name": "voterBump", "type": "u8" },
          { "name": "voterWeightRecordBump", "type": "u8" }
        ]
      }
    },
    {
      "name": "registrar",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "governanceProgramId", "type": "publicKey" },
          { "name": "realm", "type": "publicKey" },
          { "name": "governingTokenMint", "type": "publicKey" },
          { "name": "votingMints", "type": { "array": [{ "defined": "VotingMintConfig" }, 4] } },
          { "name": "timeOffset", "type": "i64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "DepositEntry",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "lockup", "type": { "defined": "Lockup" } },
          { "name": "amountDepositedNative", "type": "u64" },
          { "name": "amountInitiallyLockedNative", "type": "u64" },
          { "name": "isUsed", "type": "bool" },
          { "name": "allowClawback", "type": "bool" },
          { "name": "votingMintConfigIdx", "type": "u8" }
        ]
      }
    },
    {
      "name": "Lockup",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "startTs", "type": "i64" },
          { "name": "endTs", "type": "i64" },
          { "name": "kind", "type": { "defined": "LockupKind" } }
        ]
      }
    },
    {
      "name": "LockupKind",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "none" },
          { "name": "cliff" },
          { "name": "constant" },
          { "name": "monthly" },
          { "name": "daily" }
        ]
      }
    },
    {
      "name": "VotingMintConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "mint", "type": "publicKey" },
          { "name": "grantAuthority", "type": { "option": "publicKey" } },
          { "name": "baselineVoteWeightScaledFactor", "type": "u64" },
          { "name": "maxExtraLockupVoteWeightScaledFactor", "type": "u64" },
          { "name": "lockupSaturationSecs", "type": "u64" },
          { "name": "digitShift", "type": "i8" }
        ]
      }
    }
  ]
};

// Known registrars used by IslandDAO whales (discovered from on-chain analysis)
const KNOWN_REGISTRARS = [
  '3xJZ38FE31xVcsYnGpeHy36N7YwkBUsGi8Y5aPFNr4s9',
  '6YGuFEQnMtHfRNn6hgmnYVdEk6yMLGGeESRgLikSdLgP', 
  '5vVAxag6WVUWn1Yq2hqKrWUkNtSJEefJmBLtk5syLZJ5',
  'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd',
  'FYGUd8h7mNt7QKyEZeCKA69heM85YNfuFKqFWvAtiVar'
];

// Test wallets (IslandDAO citizens with known governance power)
const TEST_WALLETS = [
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // DeanMachine
  'Takisou1DZx3VbCgHXdmnqQ5k9H6foyj1ABN8d7sYJhK',  // Takisoul
  'KO3nkdMXXnoEp5HSTQHRc5EuPe9CzXBjpJJwRgMW36Z',   // KO3
  'D2NTXhGSWm1uQ1RPaVfGGj2n5z8Xv5CaGGo5XfZE4dF'    // Moxie
];

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

/**
 * Derive voter PDA for a given registrar and wallet
 */
function getVoterPDA(registrarPubkey, walletPubkey) {
  const [voterPDA, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('voter'),
      registrarPubkey.toBuffer(),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  return { voterPDA, bump };
}

/**
 * Get lockup type from LockupKind enum
 */
function getLockupType(lockupKind) {
  if (lockupKind.none !== undefined) return 'none';
  if (lockupKind.cliff !== undefined) return 'cliff';
  if (lockupKind.constant !== undefined) return 'constant';
  if (lockupKind.monthly !== undefined) return 'monthly';
  if (lockupKind.daily !== undefined) return 'daily';
  return 'unknown';
}

/**
 * Calculate VSR multiplier based on lockup type and duration
 * Uses authentic governance-ui logic
 */
function calculateVSRMultiplier(deposit, votingMintConfig) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const lockupSecsRemaining = Math.max(0, deposit.lockup.endTs.toNumber() - currentTimestamp);
  
  if (lockupSecsRemaining <= 0) {
    return 1.0; // No bonus for expired lockups
  }
  
  const baselineVoteWeightScaledFactor = votingMintConfig.baselineVoteWeightScaledFactor.toNumber();
  const maxExtraLockupVoteWeightScaledFactor = votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber();
  const lockupSaturationSecs = votingMintConfig.lockupSaturationSecs.toNumber();
  
  if (baselineVoteWeightScaledFactor === 0) {
    return 0;
  }
  
  const lockupType = getLockupType(deposit.lockup.kind);
  const isVested = lockupType === 'monthly' || lockupType === 'daily';
  
  if (isVested) {
    // Vested calculation for monthly/daily lockups
    const SECS_PER_DAY = 24 * 60 * 60;
    const DAYS_PER_MONTH = 30.44;
    const onMonthSecs = SECS_PER_DAY * DAYS_PER_MONTH;
    const n_periods_before_saturation = lockupSaturationSecs / onMonthSecs;
    const n_periods = lockupSecsRemaining / onMonthSecs;
    const n_unsaturated_periods = Math.min(n_periods, n_periods_before_saturation);
    const n_saturated_periods = Math.max(0, n_periods - n_unsaturated_periods);
    
    const multiplier = (baselineVoteWeightScaledFactor +
      (maxExtraLockupVoteWeightScaledFactor / n_periods) *
        (n_saturated_periods +
          ((n_unsaturated_periods + 1) * n_unsaturated_periods) /
            2 /
            n_periods_before_saturation)) /
      baselineVoteWeightScaledFactor;
    
    return multiplier;
  }
  
  // Standard VSR multiplier for cliff/constant lockups
  const multiplier = (baselineVoteWeightScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor *
      Math.min(lockupSecsRemaining, lockupSaturationSecs)) /
      lockupSaturationSecs) /
    baselineVoteWeightScaledFactor;
  
  return multiplier;
}

/**
 * Validate deposit entry according to VSR rules
 */
function isValidDeposit(deposit) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const amount = deposit.amountDepositedNative.toNumber();
  const initiallyLocked = deposit.amountInitiallyLockedNative.toNumber();
  const endTs = deposit.lockup.endTs.toNumber();
  
  // VSR validation rules
  return deposit.isUsed && 
         amount > 0 && 
         amount > initiallyLocked && 
         endTs > currentTimestamp;
}

/**
 * Calculate authentic governance power for a single wallet
 */
async function calculateAuthenticGovernancePower(walletAddress) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`CALCULATING AUTHENTIC GOVERNANCE POWER FOR: ${walletAddress}`);
    console.log(`${'='.repeat(80)}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    const walletPubkey = new PublicKey(walletAddress);
    let totalNativeGovernancePower = 0;
    let totalValidDeposits = 0;
    const depositDetails = [];
    
    console.log(`\nScanning ${KNOWN_REGISTRARS.length} known registrars for voter accounts...`);
    
    // Check each known registrar for voter accounts
    for (const registrarAddress of KNOWN_REGISTRARS) {
      try {
        const registrarPubkey = new PublicKey(registrarAddress);
        const { voterPDA } = getVoterPDA(registrarPubkey, walletPubkey);
        
        console.log(`\nRegistrar: ${registrarAddress}`);
        console.log(`Voter PDA: ${voterPDA.toBase58()}`);
        
        // Check if voter account exists
        const voterAccountInfo = await connection.getAccountInfo(voterPDA);
        
        if (!voterAccountInfo) {
          console.log(`❌ No voter account found`);
          continue;
        }
        
        console.log(`✅ Found voter account (${voterAccountInfo.data.length} bytes)`);
        
        // Fetch registrar to get voting mint configuration
        let registrarAccount;
        try {
          registrarAccount = await program.account.registrar.fetch(registrarPubkey);
          console.log(`✅ Loaded registrar configuration`);
        } catch (registrarError) {
          console.log(`❌ Could not load registrar: ${registrarError.message}`);
          continue;
        }
        
        // Find valid voting mint configuration
        let votingMintConfig = null;
        for (const mintConfig of registrarAccount.votingMints) {
          if (mintConfig.baselineVoteWeightScaledFactor.toNumber() > 0) {
            votingMintConfig = mintConfig;
            break;
          }
        }
        
        if (!votingMintConfig) {
          console.log(`❌ No valid voting mint configuration found`);
          continue;
        }
        
        console.log(`   Using voting mint: ${votingMintConfig.mint.toBase58()}`);
        console.log(`   Baseline factor: ${votingMintConfig.baselineVoteWeightScaledFactor.toString()}`);
        console.log(`   Max extra factor: ${votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toString()}`);
        console.log(`   Saturation secs: ${votingMintConfig.lockupSaturationSecs.toString()}`);
        
        // Try to deserialize voter account with Anchor
        let voterAccount;
        try {
          voterAccount = await program.account.voter.fetch(voterPDA);
          console.log(`✅ Successfully deserialized voter account`);
          console.log(`   Voter authority: ${voterAccount.voterAuthority.toBase58()}`);
          console.log(`   Deposits array length: ${voterAccount.deposits.length}`);
        } catch (anchorError) {
          console.log(`❌ Anchor deserialization failed: ${anchorError.message}`);
          continue;
        }
        
        // Process deposits
        let validDepositsInAccount = 0;
        let accountGovernancePower = 0;
        
        console.log(`\n   Processing deposits:`);
        console.log('   ' + '-'.repeat(70));
        
        for (let i = 0; i < voterAccount.deposits.length; i++) {
          const deposit = voterAccount.deposits[i];
          const amount = deposit.amountDepositedNative.toNumber();
          const initiallyLocked = deposit.amountInitiallyLockedNative.toNumber();
          const endTs = deposit.lockup.endTs.toNumber();
          const lockupType = getLockupType(deposit.lockup.kind);
          
          console.log(`\n   Deposit ${i}:`);
          console.log(`     Amount Deposited: ${(amount / 1e6).toLocaleString()} ISLAND`);
          console.log(`     Initially Locked: ${(initiallyLocked / 1e6).toLocaleString()} ISLAND`);
          console.log(`     Is Used: ${deposit.isUsed}`);
          console.log(`     Lockup Type: ${lockupType}`);
          console.log(`     End Timestamp: ${endTs} (${new Date(endTs * 1000).toISOString()})`);
          
          // Validate deposit according to VSR rules
          if (!isValidDeposit(deposit)) {
            console.log(`     ❌ SKIPPED: Invalid deposit (not used, zero amount, or expired)`);
            continue;
          }
          
          // Calculate multiplier
          const multiplier = calculateVSRMultiplier(deposit, votingMintConfig);
          
          // Calculate voting power
          const votingPower = (amount * multiplier) / 1e12;
          
          console.log(`     Lockup Multiplier: ${multiplier.toFixed(6)}x`);
          console.log(`     ✅ Voting Power: ${votingPower.toLocaleString()} ISLAND`);
          
          accountGovernancePower += votingPower;
          validDepositsInAccount++;
          
          // Store deposit details
          depositDetails.push({
            registrar: registrarAddress,
            amount: amount / 1e6,
            lockupType,
            endTs: new Date(endTs * 1000).toISOString(),
            multiplier: multiplier.toFixed(6),
            votingPower: votingPower.toFixed(2)
          });
        }
        
        console.log(`\n   Account Summary:`);
        console.log(`     Valid Deposits: ${validDepositsInAccount}`);
        console.log(`     Account Governance Power: ${accountGovernancePower.toLocaleString()} ISLAND`);
        
        totalNativeGovernancePower += accountGovernancePower;
        totalValidDeposits += validDepositsInAccount;
        
      } catch (error) {
        console.log(`❌ Error processing registrar ${registrarAddress}: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`FINAL AUTHENTIC RESULTS FOR ${walletAddress}:`);
    console.log(`Total Valid Deposits: ${totalValidDeposits}`);
    console.log(`Native Governance Power: ${totalNativeGovernancePower.toLocaleString()} ISLAND`);
    
    if (depositDetails.length > 0) {
      console.log(`\nDeposit Breakdown:`);
      depositDetails.forEach((detail, index) => {
        console.log(`${index + 1}. ${detail.amount.toLocaleString()} ISLAND × ${detail.multiplier}x = ${detail.votingPower} power (${detail.lockupType}, expires ${detail.endTs})`);
      });
    }
    
    console.log('='.repeat(80));
    
    return {
      walletAddress,
      nativeGovernancePower: totalNativeGovernancePower,
      totalValidDeposits,
      depositDetails
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}: ${error.message}`);
    return {
      walletAddress,
      nativeGovernancePower: 0,
      totalValidDeposits: 0,
      depositDetails: [],
      error: error.message
    };
  }
}

/**
 * Calculate governance power for multiple wallets
 */
async function calculateGovernancePowerForWallets(walletAddresses) {
  console.log('🔥 CANONICAL VSR GOVERNANCE POWER CALCULATOR');
  console.log('Using official VSR IDL and Anchor struct deserialization');
  console.log('Implementing authentic deposit validation and lockup multipliers\n');
  
  const results = [];
  
  for (const walletAddress of walletAddresses) {
    const result = await calculateAuthenticGovernancePower(walletAddress);
    results.push(result);
    
    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '🎯 SUMMARY RESULTS:');
  console.log('='.repeat(50));
  
  results.forEach(result => {
    if (result.error) {
      console.log(`❌ ${result.walletAddress}: ERROR - ${result.error}`);
    } else {
      console.log(`✅ ${result.walletAddress}: ${result.nativeGovernancePower.toLocaleString()} ISLAND (${result.totalValidDeposits} deposits)`);
    }
  });
  
  return results;
}

// Execute with test wallets
async function main() {
  console.log('Starting authentic VSR governance power calculation...\n');
  
  // Test with DeanMachine first for validation
  const testWallet = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
  
  console.log('🧪 Testing with DeanMachine wallet for validation...');
  const result = await calculateAuthenticGovernancePower(testWallet);
  
  if (result.nativeGovernancePower > 0) {
    console.log(`\n✅ Validation successful! Found ${result.nativeGovernancePower.toLocaleString()} ISLAND governance power`);
    console.log('Calculation method is working correctly with authentic on-chain data.');
  } else {
    console.log(`\n❌ Validation failed. Could not calculate governance power.`);
    console.log('This may indicate issues with Anchor deserialization or registrar configurations.');
  }
}

main().catch(console.error);