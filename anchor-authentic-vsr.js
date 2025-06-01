/**
 * Authentic Anchor-based VSR Governance Power Calculator
 * Uses proper Anchor struct deserialization with VSR IDL
 * Calculates real-time governance power from individual deposit entries
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor');

// VSR Program ID
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO Configuration
const ISLAND_DAO_REALM = new PublicKey('FEbFRw7pauKbFhbgLmJ7ogbZjHFQQBUKdZ1qLw9dUYfq');
const ISLAND_TOKEN_MINT = new PublicKey('4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby');

// VSR IDL from governance-ui
const VSR_IDL = {
  version: "0.2.4",
  name: "voter_stake_registry",
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

/**
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

/**
 * Get Registrar PDA
 */
function getRegistrarPDA(realm, governingTokenMint, programId) {
  const [registrar, registrarBump] = PublicKey.findProgramAddressSync(
    [realm.toBuffer(), Buffer.from('registrar'), governingTokenMint.toBuffer()],
    programId
  );
  return { registrar, registrarBump };
}

/**
 * Get Voter PDA
 */
function getVoterPDA(registrarPubkey, walletPubkey, programId) {
  const [voter, voterBump] = PublicKey.findProgramAddressSync(
    [registrarPubkey.toBuffer(), Buffer.from('voter'), walletPubkey.toBuffer()],
    programId
  );
  return { voter, voterBump };
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
    // Vested calculation (monthly/daily lockups)
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
 * Calculate authentic governance power for a wallet using Anchor
 */
async function calculateAuthenticGovernancePower(walletAddress) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`AUTHENTIC VSR CALCULATION FOR: ${walletAddress}`);
    console.log(`${'='.repeat(80)}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);

    // Get registrar PDA for IslandDAO
    const { registrar: registrarPk } = getRegistrarPDA(ISLAND_DAO_REALM, ISLAND_TOKEN_MINT, VSR_PROGRAM_ID);
    
    // Get voter PDA for the wallet
    const walletPubkey = new PublicKey(walletAddress);
    const { voter: voterPk } = getVoterPDA(registrarPk, walletPubkey, VSR_PROGRAM_ID);
    
    console.log(`Registrar PDA: ${registrarPk.toBase58()}`);
    console.log(`Voter PDA: ${voterPk.toBase58()}`);
    
    // Fetch registrar and voter accounts using Anchor
    const [registrarAccount, voterAccount] = await Promise.all([
      program.account.registrar.fetchNullable(registrarPk),
      program.account.voter.fetchNullable(voterPk)
    ]);
    
    if (!registrarAccount) {
      console.log('❌ No registrar account found');
      return 0;
    }
    
    if (!voterAccount) {
      console.log('❌ No voter account found');
      return 0;
    }
    
    console.log(`✅ Found registrar with ${registrarAccount.votingMints.length} voting mints`);
    console.log(`✅ Found voter with ${voterAccount.deposits.length} deposits`);
    
    // Get voting mint config for ISLAND token
    const votingMintConfig = registrarAccount.votingMints.find(
      mint => mint.mint.toBase58() === ISLAND_TOKEN_MINT.toBase58()
    );
    
    if (!votingMintConfig) {
      console.log('❌ No voting mint config found for ISLAND token');
      return 0;
    }
    
    console.log('\nVoting Mint Config:');
    console.log(`  Baseline Vote Weight Factor: ${votingMintConfig.baselineVoteWeightScaledFactor.toString()}`);
    console.log(`  Max Extra Lockup Factor: ${votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toString()}`);
    console.log(`  Lockup Saturation Secs: ${votingMintConfig.lockupSaturationSecs.toString()}`);
    
    const currentTimestamp = Math.floor(Date.now() / 1000);
    console.log(`\nCurrent timestamp: ${currentTimestamp} (${new Date().toISOString()})`);
    
    let totalGovernancePower = 0;
    let validDeposits = 0;
    
    console.log(`\nProcessing ${voterAccount.deposits.length} deposits:`);
    console.log('-'.repeat(80));
    
    // Process each deposit entry
    voterAccount.deposits.forEach((deposit, index) => {
      console.log(`\nDeposit ${index}:`);
      console.log(`  Amount Deposited: ${deposit.amountDepositedNative.div(new BN(1e6)).toString()} ISLAND`);
      console.log(`  Is Used: ${deposit.isUsed}`);
      console.log(`  Start TS: ${deposit.lockup.startTs.toString()} (${new Date(deposit.lockup.startTs.toNumber() * 1000).toISOString()})`);
      console.log(`  End TS: ${deposit.lockup.endTs.toString()} (${new Date(deposit.lockup.endTs.toNumber() * 1000).toISOString()})`);
      console.log(`  Lockup Kind: ${getLockupType(deposit.lockup.kind)}`);
      
      // Validation checks
      if (deposit.amountDepositedNative.isZero()) {
        console.log(`  ❌ SKIPPED: Zero amount`);
        return;
      }
      
      if (!deposit.isUsed) {
        console.log(`  ❌ SKIPPED: Not used`);
        return;
      }
      
      if (deposit.lockup.endTs.toNumber() <= currentTimestamp) {
        console.log(`  ❌ SKIPPED: Lockup expired`);
        return;
      }
      
      // Calculate remaining lockup time
      const lockupSecsRemaining = deposit.lockup.endTs.toNumber() - currentTimestamp;
      const lockupDaysRemaining = Math.round(lockupSecsRemaining / 86400);
      
      console.log(`  Lockup Days Remaining: ${lockupDaysRemaining}`);
      
      // Determine if this is a vested lockup
      const lockupType = getLockupType(deposit.lockup.kind);
      const isVested = lockupType === 'monthly' || lockupType === 'daily';
      
      // Calculate multiplier using authentic governance-ui formula
      const multiplier = calcMultiplier({
        depositScaledFactor: votingMintConfig.baselineVoteWeightScaledFactor.toNumber(),
        maxExtraLockupVoteWeightScaledFactor: votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber(),
        lockupSecs: lockupSecsRemaining,
        lockupSaturationSecs: votingMintConfig.lockupSaturationSecs.toNumber(),
        isVested
      });
      
      // Calculate voting power: amount * multiplier / 1e12 (VSR uses 1e12 scaling)
      const depositAmount = deposit.amountDepositedNative.toNumber();
      const votingPower = (depositAmount * multiplier) / 1e12;
      
      console.log(`  Multiplier: ${multiplier.toFixed(6)}x`);
      console.log(`  ✅ Voting Power: ${votingPower.toLocaleString()} ISLAND`);
      
      totalGovernancePower += votingPower;
      validDeposits++;
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`SUMMARY FOR ${walletAddress}:`);
    console.log(`Valid Deposits: ${validDeposits}/${voterAccount.deposits.length}`);
    console.log(`Total Governance Power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log('='.repeat(80));
    
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Test specific wallets with authentic Anchor calculation
 */
async function testAuthenticCalculation() {
  const testWallets = [
    { name: 'DeanMachine', address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt' },
    { name: 'legend', address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG' },
    { name: 'Titanmaker', address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1' },
    { name: 'Whale\'s Friend', address: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4' }
  ];
  
  console.log('🔥 AUTHENTIC ANCHOR-BASED VSR GOVERNANCE POWER CALCULATION');
  console.log('Using real-time deposit entries with proper multiplier calculations\n');
  
  const results = [];
  
  for (const wallet of testWallets) {
    try {
      const governancePower = await calculateAuthenticGovernancePower(wallet.address);
      results.push({ name: wallet.name, address: wallet.address, power: governancePower });
      
      // Brief pause between wallets
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error processing ${wallet.name}:`, error.message);
      results.push({ name: wallet.name, address: wallet.address, power: 0, error: error.message });
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(100));
  console.log('FINAL AUTHENTIC GOVERNANCE POWER RESULTS');
  console.log('='.repeat(100));
  
  results.forEach(result => {
    console.log(`${result.name.padEnd(20)} | ${result.power.toLocaleString().padStart(15)} ISLAND`);
  });
  
  console.log('='.repeat(100));
}

// Run the test
testAuthenticCalculation();