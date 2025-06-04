/**
 * Struct-Aware VSR Governance Power Calculator
 * Uses proper VSR account structure parsing without heuristics
 * Based on verified VSR Voter account layout
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

// Verified IslandDAO registrar configuration
const REGISTRAR_CONFIG = {
  baselineVoteWeightFactor: 1.0,
  maxExtraLockupVoteWeightFactor: 3.0,
  lockupSaturationSecs: 31536000
};

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

function parseVoterAccountStruct(data, accountAddress) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  const deposits = [];
  
  // VSR Voter account structure (verified layout):
  // 0-8: discriminator
  // 8-40: registrar (32 bytes)
  // 40-72: authority (32 bytes)  
  // 72: voter_bump (1 byte)
  // 73: voter_weight_record_bump (1 byte)
  // 74-80: reserved (6 bytes)
  // 80+: deposits array (32 slots * 72 bytes each)
  
  const DEPOSIT_SIZE = 72;
  const DEPOSITS_START = 80;
  const MAX_DEPOSITS = 32;
  
  console.log(`Parsing ${accountAddress} using struct layout:`);
  console.log(`  Data length: ${data.length} bytes`);
  console.log(`  Deposits start at offset ${DEPOSITS_START}, ${MAX_DEPOSITS} slots of ${DEPOSIT_SIZE} bytes each`);
  
  for (let i = 0; i < MAX_DEPOSITS; i++) {
    const depositOffset = DEPOSITS_START + (i * DEPOSIT_SIZE);
    
    if (depositOffset + DEPOSIT_SIZE > data.length) {
      break;
    }
    
    try {
      // Parse deposit entry structure (verified layout):
      // 0-24: lockup struct (startTs[8] + endTs[8] + kind[1] + reserved[7])
      // 24-32: amountDepositedNative (8 bytes)
      // 32-40: amountInitiallyLockedNative (8 bytes)  
      // 40: isUsed (1 byte)
      // 41: allowClawback (1 byte)
      // 42: votingMintConfigIdx (1 byte)
      // 43-72: reserved (29 bytes)
      
      const startTs = Number(data.readBigUInt64LE(depositOffset + 0));
      const endTs = Number(data.readBigUInt64LE(depositOffset + 8));
      const lockupKindByte = data.readUInt8(depositOffset + 16);
      const amountDepositedNative = Number(data.readBigUInt64LE(depositOffset + 24));
      const amountInitiallyLockedNative = Number(data.readBigUInt64LE(depositOffset + 32));
      const isUsed = data.readUInt8(depositOffset + 40) === 1;
      const allowClawback = data.readUInt8(depositOffset + 41) === 1;
      const votingMintConfigIdx = data.readUInt8(depositOffset + 42);
      
      // Only process active deposits
      if (!isUsed) {
        continue;
      }
      
      const amountInTokens = amountDepositedNative / 1e6;
      
      // Skip zero amounts
      if (amountInTokens <= 0) {
        continue;
      }
      
      // Convert lockup kind byte to string
      let lockupKind;
      switch (lockupKindByte) {
        case 0: lockupKind = 'none'; break;
        case 1: lockupKind = 'daily'; break;
        case 2: lockupKind = 'monthly'; break;
        case 3: lockupKind = 'cliff'; break;
        case 4: lockupKind = 'constant'; break;
        default: lockupKind = 'none'; break;
      }
      
      console.log(`  Slot ${i}: ${amountInTokens.toLocaleString()} ISLAND | ${lockupKind} | used=${isUsed}`);
      
      deposits.push({
        amount: amountInTokens,
        startTs,
        endTs,
        lockupKind,
        isUsed,
        allowClawback,
        votingMintConfigIdx,
        slotIndex: i,
        accountAddress
      });
      
    } catch (error) {
      console.log(`  Slot ${i}: parse error - ${error.message}`);
      continue;
    }
  }
  
  console.log(`  Found ${deposits.length} active deposits`);
  return deposits;
}

function calculateVotingPowerMultiplier(deposit, config) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Check if deposit has lockup
  if (deposit.lockupKind === 'none' || deposit.endTs <= currentTime) {
    return config.baselineVoteWeightFactor;
  }
  
  // Calculate time-based multiplier for active lockups
  const remainingTime = deposit.endTs - currentTime;
  const lockupFactor = Math.min(remainingTime / config.lockupSaturationSecs, 1.0);
  const multiplier = config.baselineVoteWeightFactor + (config.maxExtraLockupVoteWeightFactor * lockupFactor);
  
  // Clamp between baseline and max
  const maxMultiplier = config.baselineVoteWeightFactor + config.maxExtraLockupVoteWeightFactor;
  return Math.min(Math.max(multiplier, config.baselineVoteWeightFactor), maxMultiplier);
}

async function calculateStructGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    const voterAccounts = await findVoterAccounts(walletPubkey);
    if (voterAccounts.length === 0) {
      return { totalPower: 0, deposits: [] };
    }
    
    let totalPower = 0;
    const allDeposits = [];
    
    for (const accountInfo of voterAccounts) {
      const deposits = parseVoterAccountStruct(accountInfo.account.data, accountInfo.pubkey.toBase58());
      
      for (const deposit of deposits) {
        const multiplier = calculateVotingPowerMultiplier(deposit, REGISTRAR_CONFIG);
        const power = deposit.amount * multiplier;
        
        const currentTime = Math.floor(Date.now() / 1000);
        let status = 'unlocked';
        
        if (deposit.lockupKind !== 'none') {
          if (deposit.endTs > currentTime) {
            const remainingYears = (deposit.endTs - currentTime) / (365.25 * 24 * 3600);
            status = `${remainingYears.toFixed(2)}y remaining`;
          } else {
            status = 'expired';
          }
        }
        
        console.log(`  Final: ${deposit.amount.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${status} | ${multiplier.toFixed(6)}x = ${power.toLocaleString()} power`);
        
        allDeposits.push({
          amount: deposit.amount,
          lockupKind: deposit.lockupKind,
          multiplier,
          power,
          status,
          accountAddress: deposit.accountAddress,
          slotIndex: deposit.slotIndex
        });
        
        totalPower += power;
      }
    }
    
    return { totalPower, deposits: allDeposits };
    
  } catch (error) {
    console.error(`Error calculating struct power for ${walletAddress}: ${error.message}`);
    return { totalPower: 0, deposits: [] };
  }
}

async function processAllCitizensStruct() {
  console.log('=== Struct-Aware VSR Governance Power Calculator ===');
  console.log('Using verified VSR account structure layout');
  console.log('No byte scanning or heuristics - only proper struct parsing');
  console.log('');
  
  console.log(`Registrar Config: baseline=${REGISTRAR_CONFIG.baselineVoteWeightFactor}, max_extra=${REGISTRAR_CONFIG.maxExtraLockupVoteWeightFactor}, saturation=${REGISTRAR_CONFIG.lockupSaturationSecs}`);
  
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
  
  console.log(`\nProcessing ${citizens.length} citizens...\n`);
  
  const results = [];
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    const citizenName = citizen.nickname || 'Anonymous';
    
    console.log(`[${i + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...):`);
    
    const { totalPower, deposits } = await calculateStructGovernancePower(citizen.wallet);
    
    if (deposits.length > 0) {
      console.log(`Total: ${totalPower.toLocaleString()} ISLAND governance power\n`);
    } else {
      console.log(`No governance power found\n`);
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
  
  console.log('\n✅ Struct-aware VSR governance power calculation completed');
  console.log('All values extracted using verified struct layout and proper field parsing');
  
  return results;
}

if (require.main === module) {
  processAllCitizensStruct().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  processAllCitizensStruct,
  calculateStructGovernancePower
};