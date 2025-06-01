/**
 * Authentic Anchor Deposits Calculator
 * Uses proper VSR IDL deserialization to calculate real-time governance power
 * Processes individual deposit entries with live multiplier calculations
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Complete VSR IDL with all required structures
const VSR_IDL = {
  version: "0.2.4",
  name: "voter_stake_registry",
  instructions: [
    {
      name: "createRegistrar",
      accounts: [],
      args: []
    }
  ],
  accounts: [
    {
      name: "registrar",
      type: {
        kind: "struct",
        fields: [
          { name: "governanceProgramId", type: "publicKey" },
          { name: "realm", type: "publicKey" },
          { name: "governingTokenMint", type: "publicKey" },
          { name: "votingMints", type: { vec: { defined: "VotingMintConfig" } } }
        ]
      }
    },
    {
      name: "voter",
      type: {
        kind: "struct",
        fields: [
          { name: "voterAuthority", type: "publicKey" },
          { name: "registrar", type: "publicKey" },
          { name: "deposits", type: { vec: { defined: "DepositEntry" } } }
        ]
      }
    }
  ],
  types: [
    {
      name: "VotingMintConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "mint", type: "publicKey" },
          { name: "grantAuthority", type: { option: "publicKey" } },
          { name: "baselineVoteWeightScaledFactor", type: "u64" },
          { name: "maxExtraLockupVoteWeightScaledFactor", type: "u64" },
          { name: "lockupSaturationSecs", type: "u64" },
          { name: "digitShift", type: "i8" }
        ]
      }
    },
    {
      name: "DepositEntry",
      type: {
        kind: "struct",
        fields: [
          { name: "lockup", type: { defined: "Lockup" } },
          { name: "amountDepositedNative", type: "u64" },
          { name: "amountInitiallyLockedNative", type: "u64" },
          { name: "isUsed", type: "bool" },
          { name: "allowClawback", type: "bool" },
          { name: "votingMintConfigIdx", type: "u8" }
        ]
      }
    },
    {
      name: "Lockup",
      type: {
        kind: "struct",
        fields: [
          { name: "startTs", type: "i64" },
          { name: "endTs", type: "i64" },
          { name: "kind", type: { defined: "LockupKind" } }
        ]
      }
    },
    {
      name: "LockupKind",
      type: {
        kind: "enum",
        variants: [
          { name: "none" },
          { name: "cliff" },
          { name: "constant" },
          { name: "monthly" },
          { name: "daily" }
        ]
      }
    }
  ]
};

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

/**
 * Calculate multiplier using authentic governance-ui formula
 */
function calcMultiplier({
  depositScaledFactor,
  maxExtraLockupVoteWeightScaledFactor,
  lockupSecs,
  lockupSaturationSecs,
  isVested = false
}) {
  if (depositScaledFactor === 0) return 0;
  
  if (isVested) {
    // Vested calculation for monthly/daily lockups
    const SECS_PER_DAY = 24 * 60 * 60;
    const DAYS_PER_MONTH = 30.44;
    const onMonthSecs = SECS_PER_DAY * DAYS_PER_MONTH;
    const n_periods_before_saturation = lockupSaturationSecs / onMonthSecs;
    const n_periods = lockupSecs / onMonthSecs;
    const n_unsaturated_periods = Math.min(n_periods, n_periods_before_saturation);
    const n_saturated_periods = Math.max(0, n_periods - n_unsaturated_periods);
    
    const calc = (depositScaledFactor +
      (maxExtraLockupVoteWeightScaledFactor / n_periods) *
        (n_saturated_periods +
          ((n_unsaturated_periods + 1) * n_unsaturated_periods) /
            2 /
            n_periods_before_saturation)) /
      depositScaledFactor;
    
    return calc;
  }
  
  // Standard VSR multiplier calculation
  const calc = (depositScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor *
      Math.min(lockupSecs, lockupSaturationSecs)) /
      lockupSaturationSecs) /
    depositScaledFactor;
  
  return calc;
}

/**
 * Get lockup type from deposit
 */
function getLockupType(lockupKind) {
  if (lockupKind.monthly !== undefined) return 'monthly';
  if (lockupKind.cliff !== undefined) return 'cliff';
  if (lockupKind.constant !== undefined) return 'constant';
  if (lockupKind.daily !== undefined) return 'daily';
  if (lockupKind.none !== undefined) return 'none';
  return 'none';
}

/**
 * Calculate authentic governance power using Anchor deserialization
 */
async function calculateAuthenticGovernancePowerAnchor(walletAddress) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`AUTHENTIC ANCHOR CALCULATION FOR: ${walletAddress}`);
    console.log(`${'='.repeat(80)}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);

    // Find all VSR accounts for this wallet to get the registrars they use
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    console.log(`Found ${allVSRAccounts.length} total VSR accounts`);
    console.log(`Searching for accounts containing wallet: ${walletAddress}`);
    
    const voterAccounts = [];
    const registrarAddresses = new Set();
    
    // Find voter accounts that reference this wallet
    for (const account of allVSRAccounts) {
      try {
        const data = account.account.data;
        
        // Check if wallet is referenced in this account
        let walletFound = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
            walletFound = true;
            break;
          }
        }
        
        if (!walletFound) continue;
        
        // Check if this looks like a voter account (2728 bytes)
        if (data.length === 2728) {
          // Extract registrar reference from voter account
          try {
            const registrarPubkey = new PublicKey(data.slice(40, 72));
            registrarAddresses.add(registrarPubkey.toBase58());
            voterAccounts.push(account.pubkey);
            
            console.log(`Found voter account: ${account.pubkey.toBase58()}`);
            console.log(`  References registrar: ${registrarPubkey.toBase58()}`);
          } catch (error) {
            // Skip invalid registrar extraction
          }
        }
      } catch (error) {
        // Skip problematic accounts
      }
    }
    
    console.log(`\nFound ${voterAccounts.length} voter accounts`);
    console.log(`Found ${registrarAddresses.size} unique registrars`);
    
    if (voterAccounts.length === 0) {
      console.log('❌ No voter accounts found for this wallet');
      return 0;
    }
    
    let totalGovernancePower = 0;
    let totalValidDeposits = 0;
    
    // Process each voter account
    for (const voterPubkey of voterAccounts) {
      try {
        console.log(`\n📊 Processing voter account: ${voterPubkey.toBase58()}`);
        
        // Try to fetch using Anchor
        let voterAccount = null;
        try {
          voterAccount = await program.account.voter.fetch(voterPubkey);
          console.log('✅ Successfully deserialized with Anchor');
        } catch (anchorError) {
          console.log(`❌ Anchor deserialization failed: ${anchorError.message}`);
          continue;
        }
        
        if (!voterAccount || !voterAccount.deposits) {
          console.log('❌ No deposits found in voter account');
          continue;
        }
        
        console.log(`   Voter Authority: ${voterAccount.voterAuthority.toBase58()}`);
        console.log(`   Registrar: ${voterAccount.registrar.toBase58()}`);
        console.log(`   Deposits: ${voterAccount.deposits.length}`);
        
        // Fetch the registrar to get voting mint configuration
        let registrarAccount = null;
        try {
          registrarAccount = await program.account.registrar.fetch(voterAccount.registrar);
          console.log('✅ Successfully fetched registrar');
        } catch (registrarError) {
          console.log(`❌ Could not fetch registrar: ${registrarError.message}`);
          continue;
        }
        
        if (!registrarAccount.votingMints || registrarAccount.votingMints.length === 0) {
          console.log('❌ No voting mints in registrar');
          continue;
        }
        
        // Find ISLAND token configuration (or use first available)
        let votingMintConfig = registrarAccount.votingMints.find(
          mint => mint.mint.toBase58() === '4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby'
        );
        
        if (!votingMintConfig && registrarAccount.votingMints.length > 0) {
          votingMintConfig = registrarAccount.votingMints[0];
          console.log(`Using first available voting mint: ${votingMintConfig.mint.toBase58()}`);
        }
        
        if (!votingMintConfig) {
          console.log('❌ No suitable voting mint configuration found');
          continue;
        }
        
        console.log(`\n   Voting Mint Config:`);
        console.log(`     Baseline Factor: ${votingMintConfig.baselineVoteWeightScaledFactor.toString()}`);
        console.log(`     Max Extra Factor: ${votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toString()}`);
        console.log(`     Saturation Secs: ${votingMintConfig.lockupSaturationSecs.toString()}`);
        
        const currentTimestamp = Math.floor(Date.now() / 1000);
        console.log(`   Current timestamp: ${currentTimestamp}`);
        
        let accountPower = 0;
        let validDepositsInAccount = 0;
        
        console.log(`\n   Processing ${voterAccount.deposits.length} deposits:`);
        console.log('   ' + '-'.repeat(70));
        
        // Process each deposit entry
        voterAccount.deposits.forEach((deposit, index) => {
          const amount = deposit.amountDepositedNative.toNumber();
          const endTs = deposit.lockup.endTs.toNumber();
          const lockupType = getLockupType(deposit.lockup.kind);
          
          console.log(`\n   Deposit ${index}:`);
          console.log(`     Amount: ${(amount / 1e6).toLocaleString()} ISLAND`);
          console.log(`     Is Used: ${deposit.isUsed}`);
          console.log(`     Lockup Type: ${lockupType}`);
          console.log(`     End TS: ${endTs} (${new Date(endTs * 1000).toISOString()})`);
          
          // Validation checks
          if (amount === 0) {
            console.log(`     ❌ SKIPPED: Zero amount`);
            return;
          }
          
          if (!deposit.isUsed) {
            console.log(`     ❌ SKIPPED: Not used`);
            return;
          }
          
          if (endTs <= currentTimestamp) {
            console.log(`     ❌ SKIPPED: Lockup expired`);
            return;
          }
          
          // Calculate remaining lockup time
          const lockupSecsRemaining = endTs - currentTimestamp;
          const lockupDaysRemaining = Math.round(lockupSecsRemaining / 86400);
          
          console.log(`     Lockup Days Remaining: ${lockupDaysRemaining}`);
          
          // Determine if this is a vested lockup
          const isVested = lockupType === 'monthly' || lockupType === 'daily';
          
          // Calculate multiplier using authentic formula
          const multiplier = calcMultiplier({
            depositScaledFactor: votingMintConfig.baselineVoteWeightScaledFactor.toNumber(),
            maxExtraLockupVoteWeightScaledFactor: votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber(),
            lockupSecs: lockupSecsRemaining,
            lockupSaturationSecs: votingMintConfig.lockupSaturationSecs.toNumber(),
            isVested
          });
          
          // Calculate voting power: amount * multiplier / 1e12
          const votingPower = (amount * multiplier) / 1e12;
          
          console.log(`     Multiplier: ${multiplier.toFixed(6)}x`);
          console.log(`     ✅ Voting Power: ${votingPower.toLocaleString()} ISLAND`);
          
          accountPower += votingPower;
          validDepositsInAccount++;
        });
        
        console.log(`\n   Account Summary:`);
        console.log(`     Valid Deposits: ${validDepositsInAccount}`);
        console.log(`     Account Power: ${accountPower.toLocaleString()} ISLAND`);
        
        totalGovernancePower += accountPower;
        totalValidDeposits += validDepositsInAccount;
        
      } catch (error) {
        console.error(`   Error processing voter account ${voterPubkey.toBase58()}: ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`FINAL SUMMARY FOR ${walletAddress}:`);
    console.log(`Total Voter Accounts: ${voterAccounts.length}`);
    console.log(`Total Valid Deposits: ${totalValidDeposits}`);
    console.log(`Total Governance Power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log('='.repeat(80));
    
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating authentic governance power: ${error.message}`);
    return 0;
  }
}

// Test with DeanMachine
async function testDeanMachine() {
  const deanMachineAddress = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
  
  console.log('🔥 AUTHENTIC ANCHOR DEPOSIT CALCULATION');
  console.log('Using real-time Anchor deserialization of deposit entries\n');
  
  const governancePower = await calculateAuthenticGovernancePowerAnchor(deanMachineAddress);
  
  console.log(`\n🎯 FINAL RESULT: ${governancePower.toLocaleString()} ISLAND governance power`);
}

testDeanMachine();