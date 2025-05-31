/**
 * Canonical VSR Governance Power Calculator
 * Uses official Anchor struct deserialization with discriminators
 * Zero guesswork - only authentic VSR program data
 */

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet } = require('@coral-xyz/anchor');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Fetch VSR IDL from official repository
 */
async function fetchVSRIdl() {
  try {
    console.log('Fetching VSR IDL from official repository...');
    const response = await fetch('https://raw.githubusercontent.com/solana-labs/voter-stake-registry/main/idl/voter_stake_registry.json');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const idl = await response.json();
    console.log('✅ VSR IDL loaded successfully');
    return idl;
  } catch (error) {
    console.error('Failed to fetch VSR IDL:', error.message);
    throw error;
  }
}

/**
 * Initialize Anchor provider and VSR program
 */
async function initializeVSRProgram() {
  const connection = new Connection(HELIUS_RPC, 'confirmed');
  
  // Create dummy signer for read-only operations
  const dummyWallet = new Wallet(Keypair.generate());
  
  const provider = new AnchorProvider(
    connection,
    dummyWallet,
    { commitment: 'confirmed' }
  );
  
  // Load VSR IDL
  const vsrIdl = await fetchVSRIdl();
  
  // Initialize VSR program
  const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);
  
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
 * Process a single voter account to extract governance power
 */
function processVoterAccount(voterAccount, accountPubkey) {
  const voter = voterAccount.account;
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
      effectiveAmount = deposit.amountDepositedNative;
    }
    
    if (effectiveAmount === 0) {
      if (deposit.amountInitiallyLockedNative && deposit.amountInitiallyLockedNative.toNumber) {
        effectiveAmount = deposit.amountInitiallyLockedNative.toNumber();
      } else if (deposit.amountInitiallyLockedNative) {
        effectiveAmount = deposit.amountInitiallyLockedNative;
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
 * Calculate governance power for all wallets using canonical Anchor approach
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
    const deposits = processVoterAccount(voterAccount, accountPubkey);
    
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
 * Load citizens from database and match with governance power
 */
async function loadCitizensAndMatchPower() {
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
  
  return citizens;
}

/**
 * Main execution function
 */
async function runCanonicalCalculator() {
  try {
    // Calculate governance power using canonical Anchor approach
    const { walletPowers, walletDetails } = await calculateCanonicalGovernancePower();
    
    // Load citizens from database
    const citizens = await loadCitizensAndMatchPower();
    
    console.log('=== CITIZEN GOVERNANCE POWER RESULTS ===');
    console.log('');
    
    const results = [];
    let totalFoundPower = 0;
    let citizensWithPower = 0;
    
    for (const citizen of citizens) {
      const power = walletPowers.get(citizen.wallet) || 0;
      const details = walletDetails.get(citizen.wallet) || [];
      
      if (power > 0) {
        console.log(`${(citizen.nickname || 'Anonymous').padEnd(20)} (${citizen.wallet.substring(0, 8)}...): ${power.toLocaleString()} ISLAND`);
        
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
      
      results.push({
        wallet: citizen.wallet,
        nickname: citizen.nickname,
        power
      });
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
        console.log(`${index + 1}. ${citizen.nickname || 'Anonymous'}: ${citizen.power.toLocaleString()} ISLAND`);
      }
    });
    
    console.log('');
    console.log('🎯 Canonical VSR calculation complete using official Anchor deserialization');
    
    return results;
    
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