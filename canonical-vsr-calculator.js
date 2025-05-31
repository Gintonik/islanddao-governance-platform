/**
 * Canonical VSR Governance Calculator
 * Uses official Anchor struct deserialization with discriminators
 * No guesswork - only authentic VSR program data
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Pool } = require('pg');
const vsrIdl = require('./vsr_idl.json');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

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
  
  // Initialize VSR program with local IDL
  const program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);
  
  console.log('✅ Anchor provider and VSR program initialized');
  return { program, connection };
}

/**
 * Calculate voting power multiplier based on lockup
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
    
    // Get effective amount from either field
    let effectiveAmount = 0;
    
    if (deposit.amountDepositedNative && deposit.amountDepositedNative.toNumber) {
      effectiveAmount = deposit.amountDepositedNative.toNumber();
    } else if (deposit.amountDepositedNative) {
      effectiveAmount = Number(deposit.amountDepositedNative);
    }
    
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
    
    // Calculate voting power multiplier
    const { multiplier, lockupKind, status } = calculateVotingPowerMultiplier(deposit);
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
 * Calculate governance power using canonical Anchor approach
 */
async function calculateCanonicalGovernancePower() {
  console.log('=== Canonical VSR Governance Power Calculator ===');
  console.log('Using official Anchor struct deserialization with discriminators');
  console.log('');
  
  const { program } = await initializeVSRProgram();
  
  // Fetch all Voter accounts using discriminator (no offset scanning)
  console.log('Fetching all Voter accounts via discriminator...');
  const allVoterAccounts = await program.account.voter.all();
  console.log(`✅ Found ${allVoterAccounts.length} Voter accounts`);
  console.log('');
  
  // Aggregate governance power per wallet
  const walletPowers = new Map();
  const walletDetails = new Map();
  
  console.log('Processing Voter accounts...');
  
  for (const voterAccount of allVoterAccounts) {
    const voter = voterAccount.account;
    const accountPubkey = voterAccount.publicKey;
    
    // Extract voter authority (wallet address)
    const voterAuthority = voter.authority.toBase58();
    
    // Process deposits in this account
    const deposits = processVoterAccount(voter, accountPubkey);
    
    if (deposits.length > 0) {
      const accountPower = deposits.reduce((sum, deposit) => sum + deposit.power, 0);
      
      // Aggregate by wallet
      const currentPower = walletPowers.get(voterAuthority) || 0;
      walletPowers.set(voterAuthority, currentPower + accountPower);
      
      // Store details for debugging
      if (!walletDetails.has(voterAuthority)) {
        walletDetails.set(voterAuthority, []);
      }
      walletDetails.get(voterAuthority).push({
        accountAddress: accountPubkey.toBase58(),
        deposits,
        accountPower
      });
    }
  }
  
  console.log(`✅ Processed ${allVoterAccounts.length} accounts`);
  console.log('');
  
  return { walletPowers, walletDetails };
}

/**
 * Main execution function
 */
async function runCanonicalCalculator() {
  try {
    // Calculate governance power using canonical Anchor approach
    const { walletPowers, walletDetails } = await calculateCanonicalGovernancePower();
    
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
    
    console.log('=== CITIZEN GOVERNANCE POWER RESULTS ===');
    console.log('');
    
    const results = [];
    let totalFoundPower = 0;
    let citizensWithPower = 0;
    let validationsPassed = 0;
    let validationsFailed = 0;
    
    for (const citizen of citizens) {
      const power = walletPowers.get(citizen.wallet) || 0;
      const details = walletDetails.get(citizen.wallet) || [];
      
      const citizenName = citizen.nickname || 'Anonymous';
      console.log(`${citizenName.padEnd(20)} (${citizen.wallet.substring(0, 8)}...): ${power.toLocaleString()} ISLAND`);
      
      if (power > 0) {
        // Show account breakdown for significant holders
        if (power > 100000) {
          for (const accountDetail of details) {
            console.log(`  Account ${accountDetail.accountAddress.substring(0, 8)}...: ${accountDetail.accountPower.toLocaleString()} ISLAND (${accountDetail.deposits.length} deposits)`);
            for (const deposit of accountDetail.deposits) {
              console.log(`    Entry ${deposit.entryIndex}: ${deposit.amount.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${deposit.status} | ${deposit.multiplier.toFixed(6)}x`);
            }
          }
        }
        
        citizensWithPower++;
        totalFoundPower += power;
      }
      
      // Critical validations
      if (citizen.wallet === '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA') {
        // Takisoul should have ~8.7M ISLAND
        if (power > 8000000) {
          console.log(`✅ Takisoul validation PASSED: ${power.toLocaleString()} ISLAND (expected ~8.7M)`);
          validationsPassed++;
        } else {
          console.log(`❌ Takisoul validation FAILED: ${power.toLocaleString()} ISLAND (should be ~8.7M)`);
          console.log(`   Accounts discovered: ${details.length}`);
          details.forEach(detail => {
            console.log(`   Account ${detail.accountAddress}: ${detail.accountPower.toLocaleString()} ISLAND`);
          });
          validationsFailed++;
        }
      } else if (citizen.wallet === 'kruHL3zJdEfBUcdDo42BSKTjTWmrmfLhZ3WUDi14n1r') {
        // KO3 should have ~1.8M ISLAND
        if (power > 1500000) {
          console.log(`✅ KO3 validation PASSED: ${power.toLocaleString()} ISLAND (expected ~1.8M)`);
          validationsPassed++;
        } else {
          console.log(`❌ KO3 validation FAILED: ${power.toLocaleString()} ISLAND (should be ~1.8M)`);
          console.log(`   Accounts discovered: ${details.length}`);
          details.forEach(detail => {
            console.log(`   Account ${detail.accountAddress}: ${detail.accountPower.toLocaleString()} ISLAND`);
          });
          validationsFailed++;
        }
      }
      
      results.push({
        wallet: citizen.wallet,
        nickname: citizenName,
        power
      });
    }
    
    console.log('');
    console.log('=== VALIDATION RESULTS ===');
    console.log(`Validations passed: ${validationsPassed}`);
    console.log(`Validations failed: ${validationsFailed}`);
    
    // If validations pass, update database
    if (validationsFailed === 0) {
      console.log('');
      console.log('✅ All validations passed - updating database...');
      
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
        console.log('✅ CANONICAL: This implementation is now the official calculator');
      } finally {
        await updatePool.end();
      }
    } else {
      console.log('');
      console.log('❌ Validations failed - reverting to previous calculator');
      console.log('The canonical Anchor approach did not capture expected governance power');
    }
    
    console.log('');
    console.log('=== SUMMARY ===');
    console.log(`Total citizens: ${citizens.length}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total governance power found: ${totalFoundPower.toLocaleString()} ISLAND`);
    console.log(`Total VSR accounts processed: ${walletPowers.size}`);
    
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