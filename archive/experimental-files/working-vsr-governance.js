/**
 * Working VSR Governance Calculator
 * Uses authentic on-chain data with proper VSR account filtering
 * Eliminates double-counting across multiple VSR accounts per wallet
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

const REGISTRAR_CONFIG = {
  baselineVoteWeight: 1.0,
  maxExtraLockupVoteWeight: 3.0,
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

function parseVoterAccountDeposits(data, accountAddress) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  const deposits = [];
  
  // VSR Voter account structure:
  // 0-8: discriminator
  // 8-40: registrar (32 bytes)
  // 40-72: authority (32 bytes)
  // 72: voter_bump (1 byte)
  // 73: voter_weight_record_bump (1 byte)
  // 74-80: reserved (6 bytes)
  // 80+: deposit_entries array (32 items × 72 bytes each)
  
  const DEPOSIT_SIZE = 72;
  const DEPOSITS_START = 80;
  const MAX_DEPOSITS = 32;
  
  for (let i = 0; i < MAX_DEPOSITS; i++) {
    const entryOffset = DEPOSITS_START + (i * DEPOSIT_SIZE);
    
    if (entryOffset + DEPOSIT_SIZE > data.length) {
      break;
    }
    
    try {
      // DepositEntry layout:
      // 0-8: start_ts (i64)
      // 8-16: end_ts (i64)
      // 16: lockup_kind (1 byte)
      // 17-24: reserved (7 bytes)
      // 24-32: amount_deposited_native (u64)
      // 32-40: amount_initially_locked_native (u64)
      // 40: is_used (bool - 1 byte)
      // 41: allow_clawback (bool - 1 byte)
      // 42: voting_mint_config_idx (u8)
      // 43-72: reserved (29 bytes)
      
      const startTs = Number(data.readBigUInt64LE(entryOffset + 0));
      const endTs = Number(data.readBigUInt64LE(entryOffset + 8));
      const lockupKindByte = data.readUInt8(entryOffset + 16);
      const amountDepositedNative = Number(data.readBigUInt64LE(entryOffset + 24));
      const amountInitiallyLockedNative = Number(data.readBigUInt64LE(entryOffset + 32));
      const isUsed = data.readUInt8(entryOffset + 40) === 1;
      const allowClawback = data.readUInt8(entryOffset + 41) === 1;
      const votingMintConfigIdx = data.readUInt8(entryOffset + 42);
      
      // Filter: must be used and have positive amount
      if (!isUsed || amountDepositedNative <= 0) {
        continue;
      }
      
      const amountInTokens = amountDepositedNative / 1e6;
      
      // Convert lockup kind
      let lockupKind;
      switch (lockupKindByte) {
        case 0: lockupKind = 'none'; break;
        case 1: lockupKind = 'daily'; break;
        case 2: lockupKind = 'monthly'; break;
        case 3: lockupKind = 'cliff'; break;
        case 4: lockupKind = 'constant'; break;
        default: lockupKind = 'none'; break;
      }
      
      deposits.push({
        amount: amountInTokens,
        startTs,
        endTs,
        lockupKind,
        isUsed,
        allowClawback,
        votingMintConfigIdx,
        entryIndex: i,
        accountAddress
      });
      
    } catch (error) {
      continue;
    }
  }
  
  return deposits;
}

function selectPrimaryAccount(accounts, deposits) {
  // For wallets with multiple VSR accounts, select the one with the largest total value
  // This avoids counting small dust deposits from secondary accounts
  
  const accountTotals = new Map();
  
  for (const deposit of deposits) {
    const currentTotal = accountTotals.get(deposit.accountAddress) || 0;
    accountTotals.set(deposit.accountAddress, currentTotal + deposit.amount);
  }
  
  if (accountTotals.size === 0) return null;
  
  // Find account with highest total value
  let primaryAccount = null;
  let maxTotal = 0;
  
  for (const [account, total] of accountTotals) {
    if (total > maxTotal) {
      maxTotal = total;
      primaryAccount = account;
    }
  }
  
  return primaryAccount;
}

function calculateVotingPowerMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // No lockup or expired lockup
  if (deposit.lockupKind === 'none' || deposit.endTs <= currentTime) {
    return REGISTRAR_CONFIG.baselineVoteWeight;
  }
  
  // Active lockup - calculate time-based multiplier
  const remainingTime = deposit.endTs - currentTime;
  const factor = Math.min(remainingTime / REGISTRAR_CONFIG.lockupSaturationSecs, 1.0);
  const multiplier = REGISTRAR_CONFIG.baselineVoteWeight + 
                    (REGISTRAR_CONFIG.maxExtraLockupVoteWeight * factor);
  
  return multiplier;
}

async function calculateWorkingGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    const voterAccounts = await findVoterAccounts(walletPubkey);
    if (voterAccounts.length === 0) {
      return { totalPower: 0, deposits: [] };
    }
    
    // Parse deposits from all accounts
    const allDeposits = [];
    
    for (const account of voterAccounts) {
      const deposits = parseVoterAccountDeposits(account.account.data, account.pubkey?.toBase58());
      allDeposits.push(...deposits);
    }
    
    if (allDeposits.length === 0) {
      return { totalPower: 0, deposits: [] };
    }
    
    // Select primary account to avoid double counting
    const primaryAccount = selectPrimaryAccount(voterAccounts, allDeposits);
    
    // Only count deposits from primary account
    const primaryDeposits = allDeposits.filter(d => d.accountAddress === primaryAccount);
    
    console.log(`\nProcessing ${voterAccounts.length} VSR accounts, selected primary: ${primaryAccount?.substring(0, 8)}...`);
    console.log(`Found ${primaryDeposits.length} deposits in primary account:`);
    
    let totalPower = 0;
    const finalDeposits = [];
    
    for (const deposit of primaryDeposits) {
      const multiplier = calculateVotingPowerMultiplier(deposit);
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
      
      console.log(`  Entry ${deposit.entryIndex}: ${deposit.amount.toLocaleString()} ISLAND | ${deposit.lockupKind} | ${status} | ${multiplier.toFixed(6)}x = ${power.toLocaleString()} power`);
      
      finalDeposits.push({
        amount: deposit.amount,
        lockupKind: deposit.lockupKind,
        multiplier,
        power,
        status,
        accountAddress: deposit.accountAddress,
        entryIndex: deposit.entryIndex
      });
      
      totalPower += power;
    }
    
    return { totalPower, deposits: finalDeposits };
    
  } catch (error) {
    console.error(`Error calculating working power for ${walletAddress}: ${error.message}`);
    return { totalPower: 0, deposits: [] };
  }
}

async function processAllCitizensWorking() {
  console.log('=== Working VSR Governance Power Calculator ===');
  console.log('Uses authentic on-chain data with proper account selection');
  console.log('Eliminates double-counting by selecting primary VSR account per wallet');
  console.log('Filters deposits by isUsed=true and amount>0');
  console.log('');
  
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
    
    const { totalPower, deposits } = await calculateWorkingGovernancePower(citizen.wallet);
    
    if (deposits.length > 0) {
      console.log(`Total: ${totalPower.toLocaleString()} ISLAND governance power`);
    } else {
      console.log(`No governance power found`);
    }
    
    // Validation for key wallets
    if (citizen.wallet === 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG') {
      if (Math.abs(totalPower - 3361730.15) < 0.01) {
        console.log(`✅ Legend validation passed: ${totalPower.toLocaleString()} = 3,361,730.15`);
      } else {
        console.log(`❌ Legend validation failed: ${totalPower.toLocaleString()} ≠ 3,361,730.15`);
      }
    } else if (citizen.wallet === 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1') {
      if (Math.abs(totalPower - 200000) < 1) {
        console.log(`✅ Titanmaker validation passed: ${totalPower} = 200,000`);
      } else {
        console.log(`❌ Titanmaker validation failed: ${totalPower} ≠ 200,000`);
      }
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
  
  console.log('\n✅ Working VSR governance power calculation completed');
  console.log('Results based on authentic on-chain data with proper account filtering');
  
  return results;
}

if (require.main === module) {
  processAllCitizensWorking().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  processAllCitizensWorking,
  calculateWorkingGovernancePower
};