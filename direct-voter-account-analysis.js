/**
 * Direct Voter Account Analysis
 * Uses the actual voter account addresses found on-chain to calculate governance power
 * Bypasses PDA derivation and works with real account data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Complete VSR IDL
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

// Actual DeanMachine voter accounts discovered on-chain
const DEANMACHINE_VOTER_ACCOUNTS = [
  'ghdaFEBVGe8FjvEenZwuccfioymkRZM7Vwe6pBpYoDP',
  '7U3jK7nSANP3yAcUpYPrxjZsxBAhPFsdX94khkVJ5zjj',
  '9bNjjZ8Y5SbaHzBQWmgoEaBTdMJU67AkKMgaHJE8wnrE',
  'DqH7YkHB2MKT936DEDw1N7d14MGFbg5eUQHSVT2yuNsW',
  'FGQxAkrADYB9zsXDrBLfzCiugnBqePBLS6hkSCsMnR4W'
];

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

function getLockupType(lockupKind) {
  if (lockupKind.none !== undefined) return 'none';
  if (lockupKind.cliff !== undefined) return 'cliff';
  if (lockupKind.constant !== undefined) return 'constant';
  if (lockupKind.monthly !== undefined) return 'monthly';
  if (lockupKind.daily !== undefined) return 'daily';
  return 'unknown';
}

function calculateVSRMultiplier(deposit, votingMintConfig) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const lockupSecsRemaining = Math.max(0, deposit.lockup.endTs.toNumber() - currentTimestamp);
  
  if (lockupSecsRemaining <= 0) {
    return 1.0;
  }
  
  const baselineVoteWeightScaledFactor = votingMintConfig.baselineVoteWeightScaledFactor.toNumber();
  const maxExtraLockupVoteWeightScaledFactor = votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber();
  const lockupSaturationSecs = votingMintConfig.lockupSaturationSecs.toNumber();
  
  if (baselineVoteWeightScaledFactor === 0) {
    // Use default VSR values for calculation
    const defaultBaseline = 1000000000; // 1e9
    const defaultMaxExtra = 1000000000; // 1e9
    const defaultSaturation = 5 * 365 * 24 * 60 * 60; // 5 years
    
    const multiplier = (defaultBaseline +
      (defaultMaxExtra * Math.min(lockupSecsRemaining, defaultSaturation)) / defaultSaturation) /
      defaultBaseline;
    
    return multiplier;
  }
  
  const lockupType = getLockupType(deposit.lockup.kind);
  const isVested = lockupType === 'monthly' || lockupType === 'daily';
  
  if (isVested) {
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
          ((n_unsaturated_periods + 1) * n_unsaturated_periods) / 2 / n_periods_before_saturation)) /
      baselineVoteWeightScaledFactor;
    
    return multiplier;
  }
  
  const multiplier = (baselineVoteWeightScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor * Math.min(lockupSecsRemaining, lockupSaturationSecs)) /
      lockupSaturationSecs) /
    baselineVoteWeightScaledFactor;
  
  return multiplier;
}

function isValidDeposit(deposit) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const amount = deposit.amountDepositedNative.toNumber();
  const initiallyLocked = deposit.amountInitiallyLockedNative.toNumber();
  const endTs = deposit.lockup.endTs.toNumber();
  
  return deposit.isUsed && 
         amount > 0 && 
         amount > initiallyLocked && 
         endTs > currentTimestamp;
}

async function analyzeDirectVoterAccounts() {
  try {
    console.log('🔥 DIRECT VOTER ACCOUNT ANALYSIS FOR DEANMACHINE');
    console.log('Using actual on-chain voter account addresses with Anchor deserialization\n');
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    let totalGovernancePower = 0;
    let totalValidDeposits = 0;
    const depositDetails = [];
    
    console.log(`Analyzing ${DEANMACHINE_VOTER_ACCOUNTS.length} discovered voter accounts:\n`);
    
    for (const voterAccountAddress of DEANMACHINE_VOTER_ACCOUNTS) {
      try {
        console.log(`${'='.repeat(80)}`);
        console.log(`VOTER ACCOUNT: ${voterAccountAddress}`);
        console.log(`${'='.repeat(80)}`);
        
        const voterPubkey = new PublicKey(voterAccountAddress);
        
        // Try Anchor deserialization
        let voterAccount;
        try {
          voterAccount = await program.account.voter.fetch(voterPubkey);
          console.log('✅ Successfully deserialized with Anchor');
        } catch (anchorError) {
          console.log(`❌ Anchor deserialization failed: ${anchorError.message}`);
          console.log('Attempting manual parsing...\n');
          
          // Fall back to manual parsing for this account
          const accountInfo = await connection.getAccountInfo(voterPubkey);
          if (accountInfo) {
            const manualResult = parseVoterAccountManually(accountInfo.data);
            if (manualResult.totalPower > 0) {
              totalGovernancePower += manualResult.totalPower;
              totalValidDeposits += manualResult.validDeposits;
              console.log(`✅ Manual parsing successful: ${manualResult.totalPower.toLocaleString()} ISLAND power`);
            }
          }
          continue;
        }
        
        console.log(`Voter Authority: ${voterAccount.voterAuthority.toBase58()}`);
        console.log(`Registrar: ${voterAccount.registrar.toBase58()}`);
        console.log(`Deposits Array Length: ${voterAccount.deposits.length}`);
        
        // Load registrar configuration
        let registrarAccount;
        try {
          registrarAccount = await program.account.registrar.fetch(voterAccount.registrar);
          console.log('✅ Loaded registrar configuration');
        } catch (registrarError) {
          console.log(`❌ Could not load registrar: ${registrarError.message}`);
          continue;
        }
        
        // Find valid voting mint configuration
        let votingMintConfig = registrarAccount.votingMints.find(mint => 
          mint.baselineVoteWeightScaledFactor.toNumber() > 0
        );
        
        if (!votingMintConfig) {
          // Use first available if no valid config found
          votingMintConfig = registrarAccount.votingMints[0];
        }
        
        console.log(`\nUsing Voting Mint: ${votingMintConfig.mint.toBase58()}`);
        console.log(`Baseline Factor: ${votingMintConfig.baselineVoteWeightScaledFactor.toString()}`);
        console.log(`Max Extra Factor: ${votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toString()}`);
        console.log(`Saturation Secs: ${votingMintConfig.lockupSaturationSecs.toString()}`);
        
        let accountPower = 0;
        let validDepositsInAccount = 0;
        
        console.log(`\nProcessing ${voterAccount.deposits.length} deposits:`);
        console.log('-'.repeat(80));
        
        for (let i = 0; i < voterAccount.deposits.length; i++) {
          const deposit = voterAccount.deposits[i];
          const amount = deposit.amountDepositedNative.toNumber();
          const initiallyLocked = deposit.amountInitiallyLockedNative.toNumber();
          const endTs = deposit.lockup.endTs.toNumber();
          const lockupType = getLockupType(deposit.lockup.kind);
          
          console.log(`\nDeposit ${i}:`);
          console.log(`  Amount Deposited: ${(amount / 1e6).toLocaleString()} ISLAND`);
          console.log(`  Initially Locked: ${(initiallyLocked / 1e6).toLocaleString()} ISLAND`);
          console.log(`  Is Used: ${deposit.isUsed}`);
          console.log(`  Lockup Type: ${lockupType}`);
          console.log(`  End Timestamp: ${endTs} (${new Date(endTs * 1000).toISOString()})`);
          
          if (!isValidDeposit(deposit)) {
            console.log(`  ❌ SKIPPED: Invalid or expired deposit`);
            continue;
          }
          
          const multiplier = calculateVSRMultiplier(deposit, votingMintConfig);
          const votingPower = (amount * multiplier) / 1e12;
          
          console.log(`  Multiplier: ${multiplier.toFixed(6)}x`);
          console.log(`  ✅ Voting Power: ${votingPower.toLocaleString()} ISLAND`);
          
          accountPower += votingPower;
          validDepositsInAccount++;
          
          depositDetails.push({
            account: voterAccountAddress,
            amount: amount / 1e6,
            lockupType,
            endTs: new Date(endTs * 1000).toISOString(),
            multiplier: multiplier.toFixed(6),
            votingPower: votingPower.toFixed(2)
          });
        }
        
        console.log(`\nAccount Summary:`);
        console.log(`  Valid Deposits: ${validDepositsInAccount}`);
        console.log(`  Account Power: ${accountPower.toLocaleString()} ISLAND`);
        
        totalGovernancePower += accountPower;
        totalValidDeposits += validDepositsInAccount;
        
      } catch (error) {
        console.log(`❌ Error processing voter account ${voterAccountAddress}: ${error.message}`);
      }
    }
    
    console.log('\n' + '🎯 FINAL AUTHENTIC RESULTS:');
    console.log('='.repeat(80));
    console.log(`DeanMachine Wallet: 3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt`);
    console.log(`Total Voter Accounts: ${DEANMACHINE_VOTER_ACCOUNTS.length}`);
    console.log(`Total Valid Deposits: ${totalValidDeposits}`);
    console.log(`Total Native Governance Power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log('='.repeat(80));
    
    if (depositDetails.length > 0) {
      console.log(`\nDeposit Breakdown:`);
      depositDetails.forEach((detail, index) => {
        console.log(`${index + 1}. ${detail.amount.toLocaleString()} ISLAND × ${detail.multiplier}x = ${detail.votingPower} power`);
        console.log(`   ${detail.lockupType} lockup, expires ${detail.endTs}`);
      });
    }
    
    return {
      walletAddress: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
      nativeGovernancePower: totalGovernancePower,
      totalValidDeposits,
      depositDetails
    };
    
  } catch (error) {
    console.error('Error in direct voter account analysis:', error);
    return null;
  }
}

function parseVoterAccountManually(data) {
  try {
    // Manual parsing fallback for corrupted accounts
    let offset = 8 + 32 + 32; // Skip discriminator + voter_authority + registrar
    
    let totalPower = 0;
    let validDeposits = 0;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    // Try to read some deposits manually
    for (let i = 0; i < 32 && offset + 56 < data.length; i++) {
      try {
        const startTs = Number(data.readBigInt64LE(offset));
        const endTs = Number(data.readBigInt64LE(offset + 8));
        offset += 24; // Skip lockup structure
        
        const amountDeposited = Number(data.readBigUInt64LE(offset));
        const amountInitiallyLocked = Number(data.readBigUInt64LE(offset + 8));
        offset += 16;
        
        const isUsed = data.readUInt8(offset) === 1;
        offset += 8; // Skip to next deposit
        
        if (isUsed && amountDeposited > 0 && amountDeposited > amountInitiallyLocked && endTs > currentTimestamp) {
          // Use basic multiplier calculation
          const lockupSecsRemaining = endTs - currentTimestamp;
          const multiplier = Math.min(2.0, 1.0 + (lockupSecsRemaining / (5 * 365 * 24 * 60 * 60)));
          const votingPower = (amountDeposited * multiplier) / 1e12;
          
          totalPower += votingPower;
          validDeposits++;
        }
        
      } catch (error) {
        offset += 56; // Move to next deposit
      }
    }
    
    return { totalPower, validDeposits };
    
  } catch (error) {
    return { totalPower: 0, validDeposits: 0 };
  }
}

analyzeDirectVoterAccounts();