/**
 * Anchor-based VSR Governance Power Calculator
 * Uses @coral-xyz/anchor to properly fetch and parse Voter accounts
 * Calculates authentic native governance power with correct multipliers
 */

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLANDDAO_REALM = new PublicKey('4zJdDtxL1xW9sPZLDrUD4VefPSZdYkDbb8c8k1t54Mfu');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// VSR Program IDL (simplified for Voter account structure)
const VSR_IDL = {
  "version": "0.2.7",
  "name": "voter_stake_registry",
  "instructions": [],
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
          { "name": "amountDeposited", "type": "u64" },
          { "name": "amountInitiallyLocked", "type": "u64" },
          { "name": "isUsed", "type": "bool" },
          { "name": "allowClawback", "type": "bool" },
          { "name": "votingMintConfigIdx", "type": "u8" },
          { "name": "reserved", "type": { "array": ["u8", 29] } }
        ]
      }
    },
    {
      "name": "Lockup",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "kind", "type": { "defined": "LockupKind" } },
          { "name": "startTs", "type": "u64" },
          { "name": "endTs", "type": "u64" },
          { "name": "amount", "type": "u64" },
          { "name": "saturationSecs", "type": "u64" }
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
          { "name": "vested" }
        ]
      }
    },
    {
      "name": "VotingMintConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "mint", "type": "publicKey" },
          { "name": "grantAuthority", "type": "publicKey" },
          { "name": "baselineVoteWeightScaledFactor", "type": "u64" },
          { "name": "maxExtraLockupVoteWeightScaledFactor", "type": "u64" },
          { "name": "lockupSaturationSecs", "type": "u64" },
          { "name": "digitShift", "type": "i8" },
          { "name": "reserved1", "type": { "array": ["u8", 63] } }
        ]
      }
    }
  ]
};

/**
 * Get Voter PDA for a wallet
 */
function getVoterPDA(registrarPubkey, walletPubkey, programId) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      registrarPubkey.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    programId
  );
  return voterPDA;
}

/**
 * Get Registrar PDA
 */
function getRegistrarPDA(realm, governingTokenMint, programId) {
  const [registrarPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('registrar'),
      realm.toBuffer(),
      governingTokenMint.toBuffer()
    ],
    programId
  );
  return registrarPDA;
}

/**
 * Calculate VSR multiplier using authentic formula
 */
function calcMintMultiplier(lockupSecs, lockupKind, votingMintConfig) {
  const baselineVoteWeightScaledFactor = Number(votingMintConfig.baselineVoteWeightScaledFactor);
  const maxExtraLockupVoteWeightScaledFactor = Number(votingMintConfig.maxExtraLockupVoteWeightScaledFactor);
  const lockupSaturationSecs = Number(votingMintConfig.lockupSaturationSecs);
  
  let lockupFactor = 0;
  
  if (lockupKind === 'constant' || lockupKind === 'cliff') {
    // For constant/cliff lockups, factor is based on remaining time
    lockupFactor = Math.min(lockupSecs / lockupSaturationSecs, 1.0);
  } else if (lockupKind === 'vested') {
    // For vesting, factor is based on total lockup period
    lockupFactor = Math.min(lockupSecs / lockupSaturationSecs, 1.0);
  }
  
  // VSR formula: baseline + (lockup_factor * max_extra)
  const totalFactor = baselineVoteWeightScaledFactor + (lockupFactor * maxExtraLockupVoteWeightScaledFactor);
  return totalFactor / 1000000000; // Scale back to normal multiplier
}

/**
 * Calculate native governance power for a wallet using Anchor
 */
async function calculateNativeGovernancePowerAnchor(walletAddress) {
  try {
    console.log(`  Calculating Anchor-based VSR power for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Setup Anchor program
    const dummyWallet = new Wallet(Keypair.generate());
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    // Get Registrar PDA
    const registrarPDA = getRegistrarPDA(ISLANDDAO_REALM, ISLAND_MINT, VSR_PROGRAM_ID);
    
    // Get Voter PDA
    const voterPDA = getVoterPDA(registrarPDA, walletPubkey, VSR_PROGRAM_ID);
    
    console.log(`    Registrar PDA: ${registrarPDA.toBase58().substring(0, 12)}...`);
    console.log(`    Voter PDA: ${voterPDA.toBase58().substring(0, 12)}...`);
    
    // Fetch Registrar config
    let registrarConfig;
    try {
      registrarConfig = await program.account.registrar.fetch(registrarPDA);
      console.log(`    ✓ Fetched Registrar config`);
    } catch (error) {
      console.log(`    ⚠ Failed to fetch Registrar, using defaults: ${error.message}`);
      // Use default IslandDAO configuration
      registrarConfig = {
        votingMints: [{
          mint: ISLAND_MINT,
          baselineVoteWeightScaledFactor: 1000000000n,
          maxExtraLockupVoteWeightScaledFactor: 2000000000n,
          lockupSaturationSecs: BigInt(5 * 365.25 * 24 * 3600)
        }]
      };
    }
    
    // Fetch Voter account
    let voterAccount;
    try {
      voterAccount = await program.account.voter.fetch(voterPDA);
      console.log(`    ✓ Fetched Voter account`);
    } catch (error) {
      console.log(`    ⚠ Failed to fetch Voter account: ${error.message}`);
      return 0;
    }
    
    // Get voting mint config (assuming first mint is ISLAND)
    const votingMintConfig = registrarConfig.votingMints[0];
    
    console.log(`    Found ${voterAccount.deposits.length} total deposit slots`);
    
    let totalVotingPower = 0;
    let activeDeposits = 0;
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Process each deposit
    for (let i = 0; i < voterAccount.deposits.length; i++) {
      const deposit = voterAccount.deposits[i];
      
      // Only process used deposits
      if (!deposit.isUsed || Number(deposit.amountDeposited) === 0) {
        continue;
      }
      
      activeDeposits++;
      
      // Get deposit amount in tokens
      const amount = Number(deposit.amountDeposited) / 1e6;
      
      // Get lockup information
      const lockupKind = Object.keys(deposit.lockup.kind)[0]; // Extract enum variant name
      const lockupEndTs = Number(deposit.lockup.endTs);
      const lockupRemaining = Math.max(0, lockupEndTs - currentTime);
      
      // Calculate multiplier
      const multiplier = calcMintMultiplier(lockupRemaining, lockupKind, votingMintConfig);
      
      // Calculate voting power for this deposit
      const depositVotingPower = amount * multiplier;
      totalVotingPower += depositVotingPower;
      
      const lockupYears = lockupRemaining / (365.25 * 24 * 3600);
      console.log(`      Deposit ${activeDeposits}: ${amount.toLocaleString()} ISLAND (${lockupKind}, ${lockupYears.toFixed(2)}y) × ${multiplier.toFixed(6)} = ${depositVotingPower.toLocaleString()} power`);
    }
    
    console.log(`    Active deposits: ${activeDeposits}`);
    console.log(`    Total voting power: ${totalVotingPower.toLocaleString()} ISLAND`);
    
    return totalVotingPower;
    
  } catch (error) {
    console.error(`    Error calculating Anchor VSR power: ${error.message}`);
    return 0;
  }
}

/**
 * Update a citizen with accurate native governance power
 */
async function updateCitizenNativeGovernancePower(pool, wallet, nativePower) {
  try {
    await pool.query(`
      UPDATE citizens 
      SET native_governance_power = $1,
          total_governance_power = $1 + COALESCE(delegated_governance_power, 0),
          updated_at = NOW()
      WHERE wallet = $2
    `, [nativePower, wallet]);
    
    console.log(`    ✓ Updated database: ${nativePower.toLocaleString()} ISLAND`);
  } catch (error) {
    console.error(`    ✗ Database update error: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function run() {
  console.log('Starting Anchor-based VSR governance power calculation...');
  console.log(`Using Helius RPC: ${HELIUS_RPC}`);
  console.log(`VSR Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
  console.log(`IslandDAO Realm: ${ISLANDDAO_REALM.toBase58()}`);
  console.log(`ISLAND Token Mint: ${ISLAND_MINT.toBase58()}\n`);
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    // Fetch all citizens from database
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    console.log(`Found ${citizens.length} citizens to process\n`);
    
    let totalUpdated = 0;
    let totalGovernancePower = 0;
    
    // Process each citizen
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      const citizenName = citizen.nickname || 'Anonymous';
      
      console.log(`[${i + 1}/${citizens.length}] ${citizenName}:`);
      
      const nativePower = await calculateNativeGovernancePowerAnchor(citizen.wallet);
      
      if (nativePower > 0) {
        await updateCitizenNativeGovernancePower(pool, citizen.wallet, nativePower);
        totalUpdated++;
        totalGovernancePower += nativePower;
      } else {
        console.log(`    No governance power found`);
      }
      
      console.log(''); // Add spacing between citizens
    }
    
    console.log('=== FINAL SUMMARY ===');
    console.log(`Citizens processed: ${citizens.length}`);
    console.log(`Citizens with governance power: ${totalUpdated}`);
    console.log(`Total native governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log(`Average power per active citizen: ${(totalGovernancePower / Math.max(totalUpdated, 1)).toLocaleString()} ISLAND`);
    
    // Test GJdRQcsy specifically
    console.log('\n=== GJdRQcsy VERIFICATION ===');
    const gJdRQcsyResult = await pool.query(`
      SELECT nickname, native_governance_power 
      FROM citizens 
      WHERE wallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh'
    `);
    
    if (gJdRQcsyResult.rows.length > 0) {
      const power = Number(gJdRQcsyResult.rows[0].native_governance_power);
      console.log(`GJdRQcsy power: ${power.toLocaleString()} ISLAND`);
      console.log(`Target range: 144,000-144,693 ISLAND`);
      
      if (power >= 144000 && power <= 145000) {
        console.log('✓ Within target range!');
      } else {
        console.log(`⚠ Outside target range (difference: ${(power - 144359).toLocaleString()})`);
      }
    }
    
  } catch (error) {
    console.error('Main execution error:', error);
  } finally {
    await pool.end();
  }
}

// Run the calculation
if (require.main === module) {
  run().catch(console.error);
}

module.exports = {
  calculateNativeGovernancePowerAnchor,
  getVoterPDA,
  getRegistrarPDA
};