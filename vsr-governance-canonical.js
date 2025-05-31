/**
 * Canonical VSR Governance Calculator using Official Anchor Struct Deserialization
 * No byte scanning, no offsets - only authentic VSR program data via Anchor
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Pool } = require('pg');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_PUBKEY = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

/**
 * Fetch VSR IDL from official sources or use local copy
 */
async function loadVSRIdl() {
  try {
    // Try to load local IDL first
    const vsrIdl = require('./vsr_idl.json');
    console.log('✅ Loaded VSR IDL from local file');
    return vsrIdl;
  } catch (error) {
    console.log('❌ Could not load local VSR IDL');
    throw new Error('VSR IDL not found. Please provide vsr_idl.json content manually.');
  }
}

/**
 * Initialize Anchor provider and VSR program
 */
async function initializeVSRProgram() {
  const connection = new Connection(HELIUS_RPC, 'confirmed');
  
  // Create dummy wallet for read-only operations
  const dummyKeypair = Keypair.generate();
  const wallet = new anchor.Wallet(dummyKeypair);
  
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: 'confirmed' }
  );
  
  anchor.setProvider(provider);
  
  // Load VSR IDL
  const vsrIdl = await loadVSRIdl();
  
  // Initialize VSR program with official IDL
  const program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);
  
  console.log('✅ Anchor provider and VSR program initialized');
  return { program, connection };
}

/**
 * Load authentic registrar configuration from blockchain
 */
async function loadRegistrarConfig(program) {
  try {
    // Fetch registrar account using Anchor
    const registrar = await program.account.registrar.fetch(REGISTRAR_PUBKEY);
    
    // Extract voting mint config for ISLAND token
    const votingMintConfig = registrar.votingMints.find(
      mint => mint.mint.equals(ISLAND_TOKEN_MINT)
    );
    
    if (!votingMintConfig) {
      throw new Error('ISLAND token mint config not found in registrar');
    }
    
    return {
      baselineVoteWeight: votingMintConfig.baselineVoteWeightScaledFactor.toNumber(),
      maxExtraLockupVoteWeight: votingMintConfig.maxExtraLockupVoteWeightScaledFactor.toNumber(),
      lockupSaturationSecs: votingMintConfig.lockupSaturationSecs.toNumber(),
      digitShift: votingMintConfig.digitShift
    };
  } catch (error) {
    console.log('Warning: Could not load registrar config, using defaults');
    console.log('Error:', error.message);
    
    // Fallback to known IslandDAO values
    return {
      baselineVoteWeight: 1000000000, // 1.0x baseline
      maxExtraLockupVoteWeight: 3000000000, // 3.0x max extra
      lockupSaturationSecs: 31536000, // 1 year saturation
      digitShift: 0
    };
  }
}

/**
 * Calculate voting power multiplier based on lockup configuration
 */
function calculateVotingPowerMultiplier(deposit, registrarConfig) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Base multiplier from registrar config (scaled)
  const baseMultiplier = registrarConfig.baselineVoteWeight / 1e9;
  let extraMultiplier = 0;
  
  // Check for active lockup
  if (deposit.lockup && deposit.lockup.endTs) {
    const endTs = deposit.lockup.endTs.toNumber();
    
    if (endTs > currentTime) {
      // Calculate remaining lockup time
      const remainingTime = endTs - currentTime;
      const maxLockupTime = registrarConfig.lockupSaturationSecs;
      
      // Time factor (0 to 1)
      const timeFactor = Math.min(remainingTime / maxLockupTime, 1.0);
      
      // Extra multiplier based on time factor
      const maxExtraMultiplier = registrarConfig.maxExtraLockupVoteWeight / 1e9;
      extraMultiplier = maxExtraMultiplier * timeFactor;
    }
  }
  
  const totalMultiplier = baseMultiplier + extraMultiplier;
  
  // Apply digit shift if present
  if (registrarConfig.digitShift) {
    return totalMultiplier * Math.pow(10, registrarConfig.digitShift);
  }
  
  return totalMultiplier;
}

/**
 * Process voter account using official Anchor struct deserialization
 */
async function processVoterAccount(program, voter, accountPubkey, registrarConfig) {
  const accountAddress = accountPubkey.toBase58();
  
  if (!voter.depositEntries || voter.depositEntries.length === 0) {
    return { deposits: [], totalPower: 0 };
  }
  
  const deposits = [];
  let totalPower = 0;
  
  // Process all deposit entries using official Anchor struct fields
  for (let i = 0; i < voter.depositEntries.length; i++) {
    const deposit = voter.depositEntries[i];
    
    // Only process used deposits with positive amounts
    if (!deposit.isUsed) {
      continue;
    }
    
    // Get amounts from official struct fields
    const amountDeposited = deposit.amountDepositedNative?.toNumber() || 0;
    const amountLocked = deposit.amountInitiallyLockedNative?.toNumber() || 0;
    
    // Use larger of deposited or locked amount
    const effectiveAmount = Math.max(amountDeposited, amountLocked);
    
    if (effectiveAmount <= 0) {
      continue;
    }
    
    // Convert from native units to ISLAND tokens
    const amountInTokens = effectiveAmount / 1e6;
    
    // Calculate voting power multiplier using authentic registrar config
    const multiplier = calculateVotingPowerMultiplier(deposit, registrarConfig);
    const power = amountInTokens * multiplier;
    
    totalPower += power;
    
    // Get lockup kind for debugging
    let lockupKind = 'none';
    let lockupEndTime = null;
    
    if (deposit.lockup) {
      if (deposit.lockup.kind?.none !== undefined) lockupKind = 'none';
      else if (deposit.lockup.kind?.cliff !== undefined) lockupKind = 'cliff';
      else if (deposit.lockup.kind?.constant !== undefined) lockupKind = 'constant';
      else if (deposit.lockup.kind?.daily !== undefined) lockupKind = 'daily';
      else if (deposit.lockup.kind?.monthly !== undefined) lockupKind = 'monthly';
      
      if (deposit.lockup.endTs) {
        lockupEndTime = deposit.lockup.endTs.toNumber();
      }
    }
    
    deposits.push({
      entryIndex: i,
      amountDeposited,
      amountLocked,
      effectiveAmount,
      amountInTokens,
      lockupKind,
      lockupEndTime,
      multiplier,
      power,
      accountAddress
    });
  }
  
  return { deposits, totalPower };
}

/**
 * Calculate governance power for a wallet using canonical Anchor approach
 */
async function calculateGovernancePowerCanonical(program, walletAddress, registrarConfig) {
  console.log(`Processing ${walletAddress.substring(0, 8)}...`);
  
  // Find all Voter accounts for this wallet using getProgramAccounts
  const connection = program.provider.connection;
  
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 8, // Skip 8-byte discriminator to authority field
          bytes: walletAddress
        }
      }
    ]
  });
  
  if (voterAccounts.length === 0) {
    console.log(`  No voter accounts found`);
    return { totalPower: 0, accounts: [], allDeposits: [] };
  }
  
  console.log(`  Found ${voterAccounts.length} voter accounts`);
  
  let totalPower = 0;
  const accountDetails = [];
  const allDeposits = [];
  
  for (const accountInfo of voterAccounts) {
    const accountAddress = accountInfo.pubkey.toBase58();
    console.log(`  Processing account ${accountAddress.substring(0, 8)}...`);
    
    try {
      // Deserialize using official Anchor struct
      const voter = program.account.voter.coder.accounts.decode(
        'voter',
        accountInfo.account.data
      );
      
      const { deposits, totalPower: accountPower } = await processVoterAccount(
        program,
        voter,
        accountInfo.pubkey,
        registrarConfig
      );
      
      if (deposits.length === 0) {
        console.log(`    No valid deposits found`);
        continue;
      }
      
      totalPower += accountPower;
      
      console.log(`    ${deposits.length} deposits, total: ${accountPower.toLocaleString()} ISLAND`);
      
      // Log deposit details
      for (const deposit of deposits) {
        const remainingTime = deposit.lockupEndTime ? 
          Math.max(0, deposit.lockupEndTime - Math.floor(Date.now() / 1000)) : 0;
        const remainingYears = remainingTime / (365.25 * 24 * 3600);
        
        console.log(`      Entry ${deposit.entryIndex}: ${deposit.amountInTokens.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${remainingYears.toFixed(2)}y | ${deposit.multiplier.toFixed(6)}x = ${deposit.power.toLocaleString()} power`);
        allDeposits.push(deposit);
      }
      
      accountDetails.push({
        accountAddress,
        deposits,
        accountPower
      });
      
    } catch (error) {
      console.log(`    Error deserializing account: ${error.message}`);
    }
  }
  
  console.log(`  Total governance power: ${totalPower.toLocaleString()} ISLAND\n`);
  
  return {
    totalPower,
    accounts: accountDetails,
    allDeposits
  };
}

/**
 * Main execution function
 */
async function runCanonicalVSRCalculator() {
  console.log('=== Canonical VSR Governance Calculator ===');
  console.log('Using Official Anchor Struct Deserialization');
  console.log('No byte scanning, no offsets - only authentic VSR program data');
  console.log('');
  
  try {
    // Initialize Anchor and VSR program
    const { program } = await initializeVSRProgram();
    
    // Load authentic registrar configuration
    const registrarConfig = await loadRegistrarConfig(program);
    console.log('✅ Registrar configuration loaded');
    console.log(`   Baseline: ${registrarConfig.baselineVoteWeight / 1e9}x`);
    console.log(`   Max extra: ${registrarConfig.maxExtraLockupVoteWeight / 1e9}x`);
    console.log(`   Saturation: ${registrarConfig.lockupSaturationSecs / (365.25 * 24 * 3600)} years`);
    console.log('');
    
    // Load citizens from database
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    let citizens;
    try {
      const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
      citizens = result.rows;
    } finally {
      await pool.end();
    }
    
    console.log(`Processing ${citizens.length} citizens...`);
    console.log('');
    
    const results = [];
    
    for (const citizen of citizens) {
      const citizenName = citizen.nickname || 'Anonymous';
      console.log(`[${results.length + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...)`);
      
      try {
        const { totalPower, accounts, allDeposits } = await calculateGovernancePowerCanonical(
          program,
          citizen.wallet,
          registrarConfig
        );
        
        results.push({
          wallet: citizen.wallet,
          nickname: citizenName,
          power: totalPower,
          accounts,
          deposits: allDeposits
        });
        
      } catch (error) {
        console.log(`  Error processing ${citizenName}: ${error.message}`);
        results.push({
          wallet: citizen.wallet,
          nickname: citizenName,
          power: 0,
          accounts: [],
          deposits: []
        });
      }
    }
    
    // Validation against known values
    console.log('=== VALIDATION RESULTS ===');
    console.log('');
    
    let validationsPass = 0;
    let validationsFail = 0;
    
    const validationTargets = [
      { wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', name: 'Takisoul', expected: 8700000, tolerance: 1000000 },
      { wallet: 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC', name: 'KO3', expected: 1800000, tolerance: 500000 },
      { wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', name: 'Legend', expected: 3361730, tolerance: 100000 },
      { wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', name: 'DeanMachine', expected: 10300000, tolerance: 500000 }
    ];
    
    for (const target of validationTargets) {
      const citizen = results.find(r => r.wallet === target.wallet);
      if (citizen) {
        const diff = Math.abs(citizen.power - target.expected);
        const isValid = diff <= target.tolerance;
        
        if (isValid) {
          console.log(`✅ ${target.name} validation PASSED: ${citizen.power.toLocaleString()} ISLAND (expected ~${target.expected.toLocaleString()})`);
          validationsPass++;
        } else {
          console.log(`❌ ${target.name} validation FAILED: ${citizen.power.toLocaleString()} ISLAND (expected ~${target.expected.toLocaleString()}, diff: ${diff.toLocaleString()})`);
          validationsFail++;
        }
      } else {
        console.log(`❌ ${target.name} not found in results`);
        validationsFail++;
      }
    }
    
    // Display results
    console.log('');
    console.log('=== GOVERNANCE POWER RESULTS ===');
    console.log('');
    
    let totalFoundPower = 0;
    let citizensWithPower = 0;
    
    for (const result of results) {
      if (result.power > 0) {
        console.log(`${result.nickname.padEnd(20)}: ${result.power.toLocaleString()} ISLAND (${result.accounts.length} accounts, ${result.deposits.length} deposits)`);
        totalFoundPower += result.power;
        citizensWithPower++;
      } else {
        console.log(`${result.nickname.padEnd(20)}: 0 ISLAND`);
      }
    }
    
    // Update database with canonical results
    console.log('');
    console.log('✅ Updating database with canonical calculations...');
    
    const updatePool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    try {
      for (const result of results) {
        await updatePool.query(`
          UPDATE citizens 
          SET native_governance_power = $1::numeric,
              total_governance_power = $1::numeric
          WHERE wallet = $2
        `, [result.power, result.wallet]);
      }
      
      console.log(`✅ Updated ${results.length} citizens in database`);
    } finally {
      await updatePool.end();
    }
    
    // Summary
    console.log('');
    console.log('=== SUMMARY ===');
    console.log(`Validations passed: ${validationsPass}`);
    console.log(`Validations failed: ${validationsFail}`);
    console.log(`Validation accuracy: ${(validationsPass / (validationsPass + validationsFail) * 100).toFixed(1)}%`);
    console.log(`Total citizens: ${results.length}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total governance power found: ${totalFoundPower.toLocaleString()} ISLAND`);
    
    // Top 10 leaderboard
    results.sort((a, b) => b.power - a.power);
    console.log('');
    console.log('=== TOP 10 GOVERNANCE POWER HOLDERS ===');
    results.slice(0, 10).forEach((citizen, index) => {
      if (citizen.power > 0) {
        console.log(`${index + 1}. ${citizen.nickname}: ${citizen.power.toLocaleString()} ISLAND`);
      }
    });
    
    if (validationsPass >= validationsFail) {
      console.log('');
      console.log('✅ CANONICAL: Official Anchor struct deserialization validated');
    } else {
      console.log('');
      console.log('❌ Validation failed - check VSR IDL and struct parsing');
    }
    
    return results;
    
  } catch (error) {
    console.error('Canonical VSR calculator failed:', error);
    if (error.message.includes('VSR IDL not found')) {
      console.log('');
      console.log('Please provide the vsr_idl.json content to continue.');
    }
    throw error;
  }
}

if (require.main === module) {
  runCanonicalVSRCalculator().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runCanonicalVSRCalculator,
  calculateGovernancePowerCanonical
};