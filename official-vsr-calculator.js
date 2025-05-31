/**
 * Official VSR Governance Power Calculator
 * Uses proper struct-aware deserialization with official VSR IDL
 * No byte scanning, heuristics, or hardcoded values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet } = require('@coral-xyz/anchor');
const { Pool } = require('pg');
const https = require('https');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

let vsrIdl = null;
let vsrProgram = null;
let registrarConfig = null;

// Create dummy wallet for read-only operations
function createDummyWallet() {
  return {
    publicKey: PublicKey.default,
    signTransaction: async () => { throw new Error('Read-only wallet'); },
    signAllTransactions: async () => { throw new Error('Read-only wallet'); }
  };
}

async function fetchVSRIdl() {
  if (vsrIdl) return vsrIdl;
  
  return new Promise((resolve, reject) => {
    const url = 'https://raw.githubusercontent.com/solana-labs/voter-stake-registry/main/idl/voter_stake_registry.json';
    
    console.log('Fetching official VSR IDL...');
    
    https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          vsrIdl = JSON.parse(data);
          console.log(`✅ Loaded VSR IDL version ${vsrIdl.version}`);
          resolve(vsrIdl);
        } catch (error) {
          reject(new Error(`Failed to parse VSR IDL: ${error.message}`));
        }
      });
      
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch VSR IDL: ${error.message}`));
    });
  });
}

async function initializeVSRProgram() {
  if (vsrProgram) return vsrProgram;
  
  const idl = await fetchVSRIdl();
  const wallet = createDummyWallet();
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  
  vsrProgram = new Program(idl, VSR_PROGRAM_ID, provider);
  console.log('✅ Initialized VSR program with official IDL');
  
  return vsrProgram;
}

async function loadRegistrarConfig() {
  if (registrarConfig) return registrarConfig;
  
  const program = await initializeVSRProgram();
  
  try {
    console.log('Loading registrar configuration...');
    const registrarAccount = await program.account.registrar.fetch(REGISTRAR_ADDRESS);
    
    // Find ISLAND mint configuration
    const islandConfig = registrarAccount.votingMints.find(config => 
      config.mint.equals(ISLAND_MINT)
    );
    
    if (!islandConfig) {
      throw new Error('ISLAND mint not found in registrar voting mints');
    }
    
    // Extract configuration values (handle BN objects)
    const baselineVoteWeightFactor = Number(islandConfig.baselineVoteWeightScaledFactor) / 1e9;
    const maxExtraLockupVoteWeightFactor = Number(islandConfig.maxExtraLockupVoteWeightScaledFactor) / 1e9;
    const lockupSaturationSecs = Number(islandConfig.lockupSaturationSecs);
    
    registrarConfig = {
      baselineVoteWeightFactor,
      maxExtraLockupVoteWeightFactor,
      lockupSaturationSecs,
      digitShift: islandConfig.digitShift
    };
    
    console.log('✅ Loaded registrar config:', {
      baseline: registrarConfig.baselineVoteWeightFactor,
      maxExtra: registrarConfig.maxExtraLockupVoteWeightFactor,
      saturation: registrarConfig.lockupSaturationSecs
    });
    
    return registrarConfig;
    
  } catch (error) {
    console.error('Failed to load registrar config:', error.message);
    throw error;
  }
}

async function findVoterAccounts(walletPubkey) {
  const accounts = [];
  
  // Find accounts by authority
  const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
    ]
  });
  accounts.push(...authAccounts);
  
  // Find Voter PDA
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      REGISTRAR_ADDRESS.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  const voterAccount = await connection.getAccountInfo(voterPDA);
  if (voterAccount) {
    accounts.push({ pubkey: voterPDA, account: voterAccount });
  }
  
  // Remove duplicates
  const uniqueAccounts = [];
  const seenPubkeys = new Set();
  
  for (const account of accounts) {
    const pubkeyStr = account.pubkey?.toBase58() || 'unknown';
    if (!seenPubkeys.has(pubkeyStr)) {
      seenPubkeys.add(pubkeyStr);
      uniqueAccounts.push(account);
    }
  }
  
  return uniqueAccounts;
}

function calculateVotingPowerMultiplier(deposit, config) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Check if deposit has lockup
  if (!deposit.lockup || deposit.lockup.kind.none !== undefined) {
    return config.baselineVoteWeightFactor;
  }
  
  // Check if lockup is expired
  const endTs = Number(deposit.lockup.endTs);
  if (endTs <= currentTime) {
    return config.baselineVoteWeightFactor;
  }
  
  // Calculate time-based multiplier for active lockups
  const remainingTime = endTs - currentTime;
  const lockupFactor = Math.min(remainingTime / config.lockupSaturationSecs, 1.0);
  const multiplier = config.baselineVoteWeightFactor + (config.maxExtraLockupVoteWeightFactor * lockupFactor);
  
  // Clamp between baseline and max
  const maxMultiplier = config.baselineVoteWeightFactor + config.maxExtraLockupVoteWeightFactor;
  return Math.min(Math.max(multiplier, config.baselineVoteWeightFactor), maxMultiplier);
}

function getLockupKindString(lockupKind) {
  if (lockupKind.none !== undefined) return 'none';
  if (lockupKind.daily !== undefined) return 'daily';
  if (lockupKind.monthly !== undefined) return 'monthly';
  if (lockupKind.cliff !== undefined) return 'cliff';
  if (lockupKind.constant !== undefined) return 'constant';
  return 'unknown';
}

async function calculateOfficialGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const program = await initializeVSRProgram();
    const config = await loadRegistrarConfig();
    
    const voterAccounts = await findVoterAccounts(walletPubkey);
    if (voterAccounts.length === 0) {
      return { totalPower: 0, deposits: [] };
    }
    
    let totalPower = 0;
    const allDeposits = [];
    
    for (const accountInfo of voterAccounts) {
      try {
        // Deserialize using official IDL
        const voterAccount = await program.account.voter.fetch(accountInfo.pubkey);
        
        console.log(`Processing voter account: ${accountInfo.pubkey.toBase58()}`);
        console.log(`Found ${voterAccount.deposits.length} deposit entries`);
        
        for (let i = 0; i < voterAccount.deposits.length; i++) {
          const deposit = voterAccount.deposits[i];
          
          // Only process active deposits (isUsed = true)
          if (!deposit.isUsed) {
            continue;
          }
          
          const amountInTokens = Number(deposit.amountDepositedNative) / 1e6;
          
          // Skip zero amounts
          if (amountInTokens <= 0) {
            continue;
          }
          
          const multiplier = calculateVotingPowerMultiplier(deposit, config);
          const power = amountInTokens * multiplier;
          
          const currentTime = Math.floor(Date.now() / 1000);
          let status = 'unlocked';
          let lockupKindStr = getLockupKindString(deposit.lockup.kind);
          
          if (deposit.lockup && lockupKindStr !== 'none') {
            const endTs = Number(deposit.lockup.endTs);
            if (endTs > currentTime) {
              const remainingYears = (endTs - currentTime) / (365.25 * 24 * 3600);
              status = `${remainingYears.toFixed(2)}y remaining`;
            } else {
              status = 'expired';
            }
          }
          
          console.log(`  Deposit ${i}: ${amountInTokens.toLocaleString()} ISLAND | ${lockupKindStr} | ${status} | ${multiplier.toFixed(6)}x = ${power.toLocaleString()} power`);
          
          allDeposits.push({
            amount: amountInTokens,
            lockupKind: lockupKindStr,
            multiplier,
            power,
            status,
            accountAddress: accountInfo.pubkey.toBase58(),
            depositIndex: i
          });
          
          totalPower += power;
        }
        
      } catch (fetchError) {
        console.error(`Failed to fetch voter account ${accountInfo.pubkey.toBase58()}: ${fetchError.message}`);
        continue;
      }
    }
    
    return { totalPower, deposits: allDeposits };
    
  } catch (error) {
    console.error(`Error calculating official power for ${walletAddress}: ${error.message}`);
    return { totalPower: 0, deposits: [] };
  }
}

async function processAllCitizensOfficial() {
  console.log('=== Official VSR Governance Power Calculator ===');
  console.log('Using official VSR IDL and proper struct deserialization');
  console.log('');
  
  // Initialize program and config
  await initializeVSRProgram();
  const config = await loadRegistrarConfig();
  
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
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    const citizenName = citizen.nickname || 'Anonymous';
    
    console.log(`[${i + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...):`);
    
    const { totalPower, deposits } = await calculateOfficialGovernancePower(citizen.wallet);
    
    if (deposits.length > 0) {
      console.log(`Total: ${totalPower.toLocaleString()} ISLAND governance power`);
    } else {
      console.log(`No governance power found`);
    }
    
    // Validation for test wallets
    if (citizen.wallet === 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1') {
      if (Math.abs(totalPower - 200000) < 1) {
        console.log(`✅ TITANMAKER VALIDATION PASSED: ${totalPower} = 200,000`);
      } else {
        console.log(`❌ TITANMAKER VALIDATION FAILED: ${totalPower} ≠ 200,000`);
      }
    } else if (citizen.wallet === 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG') {
      console.log(`🔍 LEGEND verification: ${totalPower.toLocaleString()} ISLAND (expect ~3,361,730)`);
    }
    
    results.push({
      wallet: citizen.wallet,
      nickname: citizenName,
      totalPower: Math.round(totalPower * 1000000) / 1000000
    });
  }
  
  // Update database
  const updatePool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    for (const result of results) {
      await updatePool.query(`
        UPDATE citizens 
        SET native_governance_power = $1
        WHERE wallet = $2
      `, [result.totalPower, result.wallet]);
    }
    
    console.log(`\n✅ Updated ${results.length} citizens in database`);
  } finally {
    await updatePool.end();
  }
  
  // Final summary
  const totalGovernancePower = results.reduce((sum, r) => sum + r.totalPower, 0);
  const citizensWithPower = results.filter(r => r.totalPower > 0);
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Citizens processed: ${citizens.length}`);
  console.log(`Citizens with power: ${citizensWithPower.length}`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  
  // Top 10 leaderboard
  results.sort((a, b) => b.totalPower - a.totalPower);
  console.log('\n=== TOP 10 LEADERBOARD ===');
  results.slice(0, 10).forEach((citizen, index) => {
    console.log(`${index + 1}. ${citizen.nickname}: ${citizen.totalPower.toLocaleString()} ISLAND`);
  });
  
  console.log('\n✅ Official VSR governance power calculation completed');
  console.log('All values extracted using official IDL and proper struct deserialization');
  
  return results;
}

if (require.main === module) {
  processAllCitizensOfficial().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  processAllCitizensOfficial,
  calculateOfficialGovernancePower
};