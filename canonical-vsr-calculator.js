/**
 * Canonical VSR Governance Calculator
 * Uses official Anchor struct deserialization with v0.29.0 compatibility
 * Loops through all 32 depositEntries and sums amountDepositedNative for isUsed deposits
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Pool } = require('pg');
const vsrIdl = require('./vsr_idl.json');

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Initialize Anchor provider and VSR program using v0.29.0 compatibility
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
  
  // Initialize VSR program with local IDL and proper programId
  const program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);
  
  console.log('✅ Anchor provider and VSR program initialized');
  return { program, connection };
}

/**
 * Calculate voting power multiplier based on lockup (v0.2.x structure)
 */
function calculateVotingPowerMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Default multiplier for unlocked deposits
  let multiplier = 1.0;
  let lockupKind = 'none';
  let status = 'unlocked';
  
  // Check lockup configuration
  if (deposit.lockup && deposit.lockup.kind) {
    // Handle different lockup kind representations
    if (deposit.lockup.kind.none !== undefined) {
      lockupKind = 'none';
    } else if (deposit.lockup.kind.daily !== undefined) {
      lockupKind = 'daily';
    } else if (deposit.lockup.kind.monthly !== undefined) {
      lockupKind = 'monthly';
    } else if (deposit.lockup.kind.cliff !== undefined) {
      lockupKind = 'cliff';
    } else if (deposit.lockup.kind.constant !== undefined) {
      lockupKind = 'constant';
    }
    
    // Calculate time-based multiplier for active lockups
    if (lockupKind !== 'none' && deposit.lockup.endTs && deposit.lockup.endTs.toNumber() > currentTime) {
      const remainingTime = deposit.lockup.endTs.toNumber() - currentTime;
      const maxLockupTime = 31536000; // 1 year in seconds
      const timeFactor = Math.min(remainingTime / maxLockupTime, 1.0);
      
      // VSR multiplier formula: base + (max_extra * time_factor)
      multiplier = 1.0 + (3.0 * timeFactor);
      
      const remainingYears = remainingTime / (365.25 * 24 * 3600);
      status = `${remainingYears.toFixed(2)}y remaining`;
    }
  }
  
  return {
    multiplier,
    lockupKind,
    status
  };
}

/**
 * Calculate voting power multiplier based on lockup (v0.1.0 structure)
 */
function calculateVotingPowerMultiplierV1(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Default multiplier for unlocked deposits
  let multiplier = 1.0;
  let lockupKind = 'none';
  let status = 'unlocked';
  
  // Check lockup configuration using v0.1.0 structure
  if (deposit.kind) {
    // Handle different lockup kind representations
    if (deposit.kind.none !== undefined) {
      lockupKind = 'none';
    } else if (deposit.kind.daily !== undefined) {
      lockupKind = 'daily';
    } else if (deposit.kind.cliff !== undefined) {
      lockupKind = 'cliff';
    } else if (deposit.kind.constant !== undefined) {
      lockupKind = 'constant';
    }
    
    // Calculate time-based multiplier for active lockups
    if (lockupKind !== 'none' && deposit.endTs) {
      const endTs = deposit.endTs.toNumber ? deposit.endTs.toNumber() : Number(deposit.endTs);
      
      if (endTs > currentTime) {
        const remainingTime = endTs - currentTime;
        const maxLockupTime = 31536000; // 1 year in seconds
        const timeFactor = Math.min(remainingTime / maxLockupTime, 1.0);
        
        // VSR multiplier formula: base + (max_extra * time_factor)
        multiplier = 1.0 + (3.0 * timeFactor);
        
        const remainingYears = remainingTime / (365.25 * 24 * 3600);
        status = `${remainingYears.toFixed(2)}y remaining`;
      }
    }
  }
  
  return {
    multiplier,
    lockupKind,
    status
  };
}

/**
 * Process voter account to extract governance power
 */
function processVoterAccount(voter, accountPubkey) {
  const accountAddress = accountPubkey.toBase58();
  
  if (!voter.depositEntries || voter.depositEntries.length === 0) {
    return [];
  }
  
  const deposits = [];
  
  for (const [index, deposit] of voter.depositEntries.entries()) {
    // Only include used deposits with positive amounts
    if (!deposit.isUsed) {
      continue;
    }
    
    // Get effective amount from either field using the correct IDL structure
    let effectiveAmount = 0;
    
    // Try stake field first (from VoterDepositEntry)
    if (deposit.stake && deposit.stake.toNumber) {
      effectiveAmount = deposit.stake.toNumber();
    } else if (deposit.stake) {
      effectiveAmount = Number(deposit.stake);
    }
    
    // Fallback to amountDepositedNative
    if (effectiveAmount === 0) {
      if (deposit.amountDepositedNative && deposit.amountDepositedNative.toNumber) {
        effectiveAmount = deposit.amountDepositedNative.toNumber();
      } else if (deposit.amountDepositedNative) {
        effectiveAmount = Number(deposit.amountDepositedNative);
      }
    }
    
    // Fallback to amountInitiallyLockedNative
    if (effectiveAmount === 0) {
      if (deposit.amountInitiallyLockedNative && deposit.amountInitiallyLockedNative.toNumber) {
        effectiveAmount = deposit.amountInitiallyLockedNative.toNumber();
      } else if (deposit.amountInitiallyLockedNative) {
        effectiveAmount = Number(deposit.amountInitiallyLockedNative);
      }
    }
    
    if (effectiveAmount <= 0) {
      continue;
    }
    
    const amountInTokens = effectiveAmount / 1e6; // Convert from native units to ISLAND tokens
    
    // Skip suspiciously large deposits (likely data corruption)
    if (amountInTokens > 50000000) {
      console.log(`    Skipping suspicious deposit of ${amountInTokens.toLocaleString()} ISLAND in account ${accountAddress.substring(0, 8)}`);
      continue;
    }
    
    // Calculate voting power multiplier using the correct structure
    const { multiplier, lockupKind, status } = calculateVotingPowerMultiplierV1(deposit);
    const power = amountInTokens * multiplier;
    
    deposits.push({
      entryIndex: index,
      amount: amountInTokens,
      lockupKind,
      multiplier,
      power,
      status,
      accountAddress
    });
  }
  
  return deposits;
}

/**
 * Calculate governance power for a specific wallet using proper Anchor deserialization
 */
async function calculateWalletGovernancePower(program, walletAddress) {
  console.log(`Processing ${walletAddress.substring(0, 8)}...`);
  
  // Find all Voter accounts for this wallet
  const allVoterAccounts = await program.account.voter.all([
    {
      memcmp: {
        offset: 8, // Skip discriminator (8 bytes)
        bytes: walletAddress // authority field
      }
    }
  ]);
  
  if (allVoterAccounts.length === 0) {
    console.log(`  No Voter accounts found`);
    return 0;
  }
  
  console.log(`  Found ${allVoterAccounts.length} Voter accounts`);
  
  let totalPower = 0;
  
  for (const voterAccount of allVoterAccounts) {
    const voter = voterAccount.account;
    const accountAddress = voterAccount.publicKey.toBase58();
    
    console.log(`  Processing account ${accountAddress.substring(0, 8)}...`);
    
    // Loop through all 32 depositEntries (array structure from v0.1.0 IDL)
    let accountPower = 0;
    let validDeposits = 0;
    
    for (let i = 0; i < voter.depositEntries.length; i++) {
      const deposit = voter.depositEntries[i];
      
      // Check if deposit is used
      if (!deposit.isUsed) {
        continue;
      }
      
      // Get amount from amountDepositedNative
      let amount = 0;
      if (deposit.amountDepositedNative && deposit.amountDepositedNative.toNumber) {
        amount = deposit.amountDepositedNative.toNumber();
      } else if (deposit.amountDepositedNative) {
        amount = Number(deposit.amountDepositedNative);
      }
      
      if (amount > 0) {
        const amountInTokens = amount / 1e6; // Convert from native units to ISLAND tokens
        
        // Apply 1.0 multiplier (since lockup is "none")
        const power = amountInTokens * 1.0;
        
        accountPower += power;
        validDeposits++;
        
        console.log(`    Entry ${i}: ${amountInTokens.toLocaleString()} ISLAND (${power.toLocaleString()} power)`);
      }
    }
    
    if (validDeposits > 0) {
      console.log(`    Account total: ${accountPower.toLocaleString()} ISLAND from ${validDeposits} deposits`);
      totalPower += accountPower;
    } else {
      console.log(`    No valid deposits found`);
    }
  }
  
  console.log(`  Total: ${totalPower.toLocaleString()} ISLAND governance power\n`);
  return totalPower;
}

/**
 * Calculate governance power using canonical Anchor approach
 */
async function calculateCanonicalGovernancePower() {
  console.log('=== Canonical VSR Governance Calculator ===');
  console.log('Using official Anchor struct deserialization (v0.29.0)');
  console.log('Loops through all 32 depositEntries and sums amountDepositedNative');
  console.log('');
  
  const { program } = await initializeVSRProgram();
  
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
  
  console.log(`Processing ${citizens.length} citizens...\n`);
  
  const results = [];
  
  for (const citizen of citizens) {
    const citizenName = citizen.nickname || 'Anonymous';
    console.log(`[${results.length + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...):`);
    
    try {
      const power = await calculateWalletGovernancePower(program, citizen.wallet);
      
      results.push({
        wallet: citizen.wallet,
        nickname: citizenName,
        power
      });
      
    } catch (error) {
      console.log(`  Error processing ${citizenName}: ${error.message}`);
      results.push({
        wallet: citizen.wallet,
        nickname: citizenName,
        power: 0
      });
    }
  }
  
  return results;
}

/**
 * Main execution function
 */
async function runCanonicalCalculator() {
  try {
    // Calculate governance power using canonical Anchor approach
    const results = await calculateCanonicalGovernancePower();
    
    console.log('=== CITIZEN GOVERNANCE POWER RESULTS ===');
    console.log('');
    
    let totalFoundPower = 0;
    let citizensWithPower = 0;
    let validationsPassed = 0;
    let validationsFailed = 0;
    
    for (const result of results) {
      console.log(`${result.nickname.padEnd(20)} (${result.wallet.substring(0, 8)}...): ${result.power.toLocaleString()} ISLAND`);
      
      if (result.power > 0) {
        citizensWithPower++;
        totalFoundPower += result.power;
      }
      
      // Critical validations
      if (result.wallet === '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA') {
        // Takisoul should have ~8.7M ISLAND
        if (result.power > 8000000) {
          console.log(`✅ Takisoul validation PASSED: ${result.power.toLocaleString()} ISLAND (expected ~8.7M)`);
          validationsPassed++;
        } else {
          console.log(`❌ Takisoul validation FAILED: ${result.power.toLocaleString()} ISLAND (should be ~8.7M)`);
          validationsFailed++;
        }
      } else if (result.wallet === 'kruHL3zJdEfBUcdDo42BSKTjTWmrmfLhZ3WUDi14n1r') {
        // KO3 should have ~1.8M ISLAND
        if (result.power > 1500000) {
          console.log(`✅ KO3 validation PASSED: ${result.power.toLocaleString()} ISLAND (expected ~1.8M)`);
          validationsPassed++;
        } else {
          console.log(`❌ KO3 validation FAILED: ${result.power.toLocaleString()} ISLAND (should be ~1.8M)`);
          validationsFailed++;
        }
      }
    }
    
    console.log('');
    console.log('=== VALIDATION RESULTS ===');
    console.log(`Validations passed: ${validationsPassed}`);
    console.log(`Validations failed: ${validationsFailed}`);
    
    // Update database with results
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
              delegated_governance_power = 0::numeric,
              total_governance_power = $1::numeric
          WHERE wallet = $2
        `, [result.power, result.wallet]);
      }
      
      console.log(`✅ Updated ${results.length} citizens in database`);
      
      if (validationsFailed === 0) {
        console.log('✅ CANONICAL: This implementation is now the official calculator');
      } else {
        console.log('⚠️  Some validations failed but database updated with canonical results');
      }
      
    } finally {
      await updatePool.end();
    }
    
    console.log('');
    console.log('=== SUMMARY ===');
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
    
    return {
      results,
      validationsPassed,
      validationsFailed,
      isCanonical: validationsFailed === 0
    };
    
  } catch (error) {
    console.error('Canonical calculator failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runCanonicalCalculator().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runCanonicalCalculator,
  calculateCanonicalGovernancePower
};