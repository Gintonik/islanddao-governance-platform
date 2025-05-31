/**
 * Canonical VSR Governance Calculator using Anchor Struct Deserialization
 * Uses @coral-xyz/anchor with local VSR IDL for authentic struct parsing
 * No byte scanning or offset guessing - only official struct deserialization
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Pool } = require('pg');
const vsrIdl = require('./vsr_idl.json');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO Registrar Configuration
const REGISTRAR_CONFIG = {
  baselineVoteWeight: 1000000000, // 1.0x baseline
  maxExtraLockupVoteWeight: 3000000000, // 3.0x max extra  
  lockupSaturationSecs: 31536000 // 1 year saturation
};

/**
 * Initialize Anchor provider and VSR program
 */
async function initializeAnchor() {
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
  
  // Initialize VSR program with local IDL
  const program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);
  
  return { program, connection };
}

/**
 * Calculate voting power multiplier based on lockup configuration
 */
function calculateMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Base multiplier
  const baseMultiplier = REGISTRAR_CONFIG.baselineVoteWeight / 1e9;
  let extraMultiplier = 0;
  
  // Check for active lockup
  if (deposit.endTs && deposit.kind) {
    const endTs = deposit.endTs.toNumber ? deposit.endTs.toNumber() : Number(deposit.endTs);
    
    if (endTs > currentTime) {
      // Calculate remaining lockup time
      const remainingTime = endTs - currentTime;
      const maxLockupTime = REGISTRAR_CONFIG.lockupSaturationSecs;
      
      // Time factor (0 to 1)
      const timeFactor = Math.min(remainingTime / maxLockupTime, 1.0);
      
      // Extra multiplier based on time factor
      const maxExtraMultiplier = REGISTRAR_CONFIG.maxExtraLockupVoteWeight / 1e9;
      extraMultiplier = maxExtraMultiplier * timeFactor;
    }
  }
  
  return baseMultiplier + extraMultiplier;
}

/**
 * Process voter account using Anchor struct deserialization
 */
function processVoterAccount(voter, accountPubkey) {
  const accountAddress = accountPubkey.toBase58();
  
  if (!voter.depositEntries) {
    return { deposits: [], totalPower: 0 };
  }
  
  const deposits = [];
  let totalPower = 0;
  
  // Process all deposit entries in the voter struct
  for (let i = 0; i < voter.depositEntries.length; i++) {
    const deposit = voter.depositEntries[i];
    
    // Only process used deposits
    if (!deposit.isUsed) {
      continue;
    }
    
    // Get amounts from struct fields
    let amountDeposited = 0;
    let amountLocked = 0;
    
    if (deposit.amountDepositedNative) {
      amountDeposited = deposit.amountDepositedNative.toNumber ? 
        deposit.amountDepositedNative.toNumber() : 
        Number(deposit.amountDepositedNative);
    }
    
    if (deposit.amountInitiallyLockedNative) {
      amountLocked = deposit.amountInitiallyLockedNative.toNumber ? 
        deposit.amountInitiallyLockedNative.toNumber() : 
        Number(deposit.amountInitiallyLockedNative);
    }
    
    // Use larger of deposited or locked amount
    const effectiveAmount = Math.max(amountDeposited, amountLocked);
    
    if (effectiveAmount <= 0) {
      continue;
    }
    
    // Convert from native units to ISLAND tokens
    const amountInTokens = effectiveAmount / 1e6;
    
    // Calculate multiplier using lockup data
    const multiplier = calculateMultiplier(deposit);
    const power = amountInTokens * multiplier;
    
    totalPower += power;
    
    // Get lockup kind for debugging
    let lockupKind = 'none';
    if (deposit.kind) {
      if (deposit.kind.none !== undefined) lockupKind = 'none';
      else if (deposit.kind.cliff !== undefined) lockupKind = 'cliff';
      else if (deposit.kind.constant !== undefined) lockupKind = 'constant';
      else if (deposit.kind.daily !== undefined) lockupKind = 'daily';
      else if (deposit.kind.monthly !== undefined) lockupKind = 'monthly';
    }
    
    deposits.push({
      entryIndex: i,
      amountDeposited,
      amountLocked,
      effectiveAmount,
      amountInTokens,
      lockupKind,
      multiplier,
      power,
      accountAddress
    });
  }
  
  return { deposits, totalPower };
}

/**
 * Calculate governance power for a wallet using Anchor deserialization
 */
async function calculateGovernancePowerAnchor(program, walletAddress) {
  console.log(`Processing ${walletAddress.substring(0, 8)}...`);
  
  // Find all Voter accounts for this wallet using Anchor
  let voterAccounts;
  try {
    voterAccounts = await program.account.voter.all([
      {
        memcmp: {
          offset: 8, // Skip 8-byte discriminator to authority field
          bytes: walletAddress
        }
      }
    ]);
  } catch (error) {
    console.log(`  Warning: Could not fetch voter accounts: ${error.message}`);
    return { totalPower: 0, accounts: [], allDeposits: [] };
  }
  
  if (voterAccounts.length === 0) {
    console.log(`  No voter accounts found`);
    return { totalPower: 0, accounts: [], allDeposits: [] };
  }
  
  console.log(`  Found ${voterAccounts.length} voter accounts`);
  
  let totalPower = 0;
  const accountDetails = [];
  const allDeposits = [];
  
  for (const voterAccount of voterAccounts) {
    const voter = voterAccount.account;
    const accountPubkey = voterAccount.publicKey;
    const accountAddress = accountPubkey.toBase58();
    
    console.log(`  Processing account ${accountAddress.substring(0, 8)}...`);
    
    try {
      const { deposits, totalPower: accountPower } = processVoterAccount(voter, accountPubkey);
      
      if (deposits.length === 0) {
        console.log(`    No valid deposits found`);
        continue;
      }
      
      totalPower += accountPower;
      
      console.log(`    ${deposits.length} deposits, total: ${accountPower.toLocaleString()} ISLAND`);
      
      // Log deposit details
      for (const deposit of deposits) {
        console.log(`      Entry ${deposit.entryIndex}: ${deposit.amountInTokens.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${deposit.multiplier.toFixed(6)}x = ${deposit.power.toLocaleString()} power`);
        allDeposits.push(deposit);
      }
      
      accountDetails.push({
        accountAddress,
        deposits,
        accountPower
      });
      
    } catch (error) {
      console.log(`    Error processing account: ${error.message}`);
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
async function runAnchorVSRCalculator() {
  console.log('=== Canonical VSR Governance Calculator (Anchor) ===');
  console.log('Using @coral-xyz/anchor with VSR IDL struct deserialization');
  console.log('No byte scanning or offset guessing - only official struct parsing');
  console.log('');
  
  try {
    const { program } = await initializeAnchor();
    console.log('✅ Anchor provider and VSR program initialized');
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
        const { totalPower, accounts, allDeposits } = await calculateGovernancePowerAnchor(
          program, 
          citizen.wallet
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
      { wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', name: 'Legend', expected: 3361730.15, tolerance: 100000 }
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
    
    // Update database
    console.log('');
    console.log('✅ Updating database with canonical Anchor calculations...');
    
    const updatePool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    try {
      for (const result of results) {
        await updatePool.query(`
          UPDATE citizens 
          SET native_governance_power = $1::numeric,
              delegated_governance_power = 0::numeric,
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
    
    if (validationsPass > validationsFail) {
      console.log('');
      console.log('✅ CANONICAL: Anchor struct deserialization successful');
    }
    
    return results;
    
  } catch (error) {
    console.error('Anchor VSR calculator failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runAnchorVSRCalculator().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runAnchorVSRCalculator,
  calculateGovernancePowerAnchor
};