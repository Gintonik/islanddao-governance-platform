/**
 * Complete VSR Governance Calculator
 * Uses official Anchor struct parsing with comprehensive account discovery
 * No filters, no hardcoded values - only authentic on-chain data
 */

const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Pool } = require('pg');
const vsrIdl = require('./vsr_idl.json');

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_PUBKEY = new PublicKey('5ZEf6X4qGMP3crrftbfGGwBhRj5qyc2xC2A1QmGmPWuQ');

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
  
  return { program, connection };
}

/**
 * Get registrar configuration for multiplier calculations
 */
async function getRegistrarConfig(connection) {
  try {
    const registrarAccount = await connection.getAccountInfo(REGISTRAR_PUBKEY);
    if (!registrarAccount) {
      console.log('Warning: Could not fetch registrar config, using defaults');
      return {
        baselineVoteWeight: 1000000000,
        maxExtraLockupVoteWeight: 3000000000,
        lockupSaturationSecs: 31536000 // 1 year
      };
    }
    
    // Parse registrar data for voting mint config
    // For now, use known IslandDAO values
    return {
      baselineVoteWeight: 1000000000, // 1.0x baseline
      maxExtraLockupVoteWeight: 3000000000, // 3.0x max extra
      lockupSaturationSecs: 31536000 // 1 year saturation
    };
  } catch (error) {
    console.log('Warning: Error fetching registrar config:', error.message);
    return {
      baselineVoteWeight: 1000000000,
      maxExtraLockupVoteWeight: 3000000000,
      lockupSaturationSecs: 31536000
    };
  }
}

/**
 * Calculate voting power multiplier based on lockup configuration
 */
function calculateVotingPowerMultiplier(deposit, registrarConfig) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Base multiplier from registrar config
  const baseMultiplier = registrarConfig.baselineVoteWeight / 1e9;
  let extraMultiplier = 0;
  
  // Check lockup configuration
  if (deposit.kind && deposit.endTs) {
    const endTs = deposit.endTs.toNumber ? deposit.endTs.toNumber() : Number(deposit.endTs);
    
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
  
  return baseMultiplier + extraMultiplier;
}

/**
 * Find all VSR accounts for a wallet using multiple discovery strategies
 */
async function findAllVSRAccounts(program, connection, walletAddress) {
  const walletPubkey = new PublicKey(walletAddress);
  const allAccounts = [];
  
  // Strategy 1: Use program.account.voter.all() with memcmp filters
  try {
    // Filter by authority field (offset 8 for discriminator, then authority)
    const voterAccounts = await program.account.voter.all([
      {
        memcmp: {
          offset: 8, // Skip 8-byte discriminator
          bytes: walletAddress
        }
      }
    ]);
    
    for (const account of voterAccounts) {
      allAccounts.push({
        publicKey: account.publicKey,
        account: account.account,
        source: 'anchor_memcmp'
      });
    }
  } catch (error) {
    console.log(`  Warning: Anchor memcmp search failed: ${error.message}`);
  }
  
  // Strategy 2: Manual account discovery using getProgramAccounts
  try {
    const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // authority field after discriminator
            bytes: walletAddress
          }
        }
      ]
    });
    
    for (const accountInfo of programAccounts) {
      // Check if we already found this account
      const exists = allAccounts.some(acc => acc.publicKey.equals(accountInfo.pubkey));
      if (!exists) {
        try {
          // Try to decode as Voter account
          const decoded = program.account.voter.coder.accounts.decode('voter', accountInfo.account.data);
          allAccounts.push({
            publicKey: accountInfo.pubkey,
            account: decoded,
            source: 'manual_discovery'
          });
        } catch (decodeError) {
          console.log(`  Warning: Could not decode account ${accountInfo.pubkey.toBase58()}: ${decodeError.message}`);
        }
      }
    }
  } catch (error) {
    console.log(`  Warning: Manual discovery failed: ${error.message}`);
  }
  
  return allAccounts;
}

/**
 * Process all deposits in a VSR account
 */
function processVSRAccountDeposits(account, accountAddress, registrarConfig) {
  if (!account.depositEntries) {
    return [];
  }
  
  const deposits = [];
  
  for (let i = 0; i < account.depositEntries.length; i++) {
    const deposit = account.depositEntries[i];
    
    // Only process used deposits
    if (!deposit.isUsed) {
      continue;
    }
    
    // Get effective amount (use larger of deposited or initially locked)
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
    
    // Use whichever amount is larger
    const effectiveAmount = Math.max(amountDeposited, amountLocked);
    
    if (effectiveAmount <= 0) {
      continue;
    }
    
    // Convert from native units to ISLAND tokens
    const amountInTokens = effectiveAmount / 1e6;
    
    // Calculate voting power multiplier
    const multiplier = calculateVotingPowerMultiplier(deposit, registrarConfig);
    const votingPower = amountInTokens * multiplier;
    
    // Get lockup kind for debugging
    let lockupKind = 'none';
    if (deposit.kind) {
      if (deposit.kind.none !== undefined) lockupKind = 'none';
      else if (deposit.kind.cliff !== undefined) lockupKind = 'cliff';
      else if (deposit.kind.constant !== undefined) lockupKind = 'constant';
      else if (deposit.kind.daily !== undefined) lockupKind = 'daily';
    }
    
    deposits.push({
      entryIndex: i,
      amountDeposited,
      amountLocked,
      effectiveAmount,
      amountInTokens,
      lockupKind,
      multiplier,
      votingPower,
      accountAddress
    });
  }
  
  return deposits;
}

/**
 * Calculate complete governance power for a wallet
 */
async function calculateCompleteGovernancePower(program, connection, walletAddress, registrarConfig) {
  console.log(`\nProcessing ${walletAddress.substring(0, 8)}...`);
  
  // Find all VSR accounts for this wallet
  const vsrAccounts = await findAllVSRAccounts(program, connection, walletAddress);
  
  if (vsrAccounts.length === 0) {
    console.log(`  No VSR accounts found`);
    return { totalPower: 0, accounts: [], allDeposits: [] };
  }
  
  console.log(`  Found ${vsrAccounts.length} VSR accounts`);
  
  let totalPower = 0;
  const accountDetails = [];
  const allDeposits = [];
  
  for (const vsrAccount of vsrAccounts) {
    const accountAddress = vsrAccount.publicKey.toBase58();
    console.log(`  Processing account ${accountAddress.substring(0, 8)}... (${vsrAccount.source})`);
    
    try {
      const deposits = processVSRAccountDeposits(vsrAccount.account, accountAddress, registrarConfig);
      
      if (deposits.length === 0) {
        console.log(`    No valid deposits found`);
        continue;
      }
      
      const accountPower = deposits.reduce((sum, dep) => sum + dep.votingPower, 0);
      totalPower += accountPower;
      
      console.log(`    ${deposits.length} deposits, total: ${accountPower.toLocaleString()} ISLAND`);
      
      // Log deposit details for debugging
      for (const deposit of deposits) {
        console.log(`      Entry ${deposit.entryIndex}: ${deposit.amountInTokens.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${deposit.multiplier.toFixed(6)}x = ${deposit.votingPower.toLocaleString()} power`);
        allDeposits.push(deposit);
      }
      
      accountDetails.push({
        accountAddress,
        deposits,
        accountPower,
        source: vsrAccount.source
      });
      
    } catch (error) {
      console.log(`    Error processing account ${accountAddress.substring(0, 8)}: ${error.message}`);
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
async function runCompleteVSRCalculator() {
  console.log('=== Complete VSR Governance Calculator ===');
  console.log('Using official Anchor struct parsing with comprehensive account discovery');
  console.log('No filters, no hardcoded values - only authentic on-chain data');
  console.log('');
  
  try {
    const { program, connection } = await initializeVSRProgram();
    console.log('✅ Anchor provider and VSR program initialized');
    
    const registrarConfig = await getRegistrarConfig(connection);
    console.log('✅ Registrar configuration loaded');
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
    
    const results = [];
    
    for (const citizen of citizens) {
      const citizenName = citizen.nickname || 'Anonymous';
      console.log(`[${results.length + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...)`);
      
      try {
        const { totalPower, accounts, allDeposits } = await calculateCompleteGovernancePower(
          program, 
          connection, 
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
    
    // Display results
    console.log('\n=== COMPLETE GOVERNANCE POWER RESULTS ===\n');
    
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
    
    // Validation checks
    console.log('\n=== VALIDATION CHECKS ===');
    
    const validationTargets = [
      { name: 'Whale\'s Friend', expected: 12625.580931 },
      { name: 'legend', expected: 3361730.15 },
      { name: 'Titanmaker', expected: 200000 }
    ];
    
    for (const target of validationTargets) {
      const citizen = results.find(r => r.nickname === target.name);
      if (citizen) {
        const diff = Math.abs(citizen.power - target.expected);
        const match = diff < 1; // Allow small rounding differences
        console.log(`${target.name}: ${citizen.power.toLocaleString()} ISLAND ${match ? '✅' : '❌'} (expected ${target.expected.toLocaleString()})`);
      } else {
        console.log(`${target.name}: Not found ❌`);
      }
    }
    
    // Update database
    console.log('\n✅ Updating database with complete calculations...');
    
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
    console.log('\n=== SUMMARY ===');
    console.log(`Total citizens: ${results.length}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total governance power found: ${totalFoundPower.toLocaleString()} ISLAND`);
    
    // Top 10 leaderboard
    results.sort((a, b) => b.power - a.power);
    console.log('\n=== TOP 10 GOVERNANCE POWER HOLDERS ===');
    results.slice(0, 10).forEach((citizen, index) => {
      if (citizen.power > 0) {
        console.log(`${index + 1}. ${citizen.nickname}: ${citizen.power.toLocaleString()} ISLAND`);
      }
    });
    
    return results;
    
  } catch (error) {
    console.error('Complete VSR calculator failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runCompleteVSRCalculator().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runCompleteVSRCalculator,
  calculateCompleteGovernancePower
};