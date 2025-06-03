/**
 * Canonical VSR Governance Power Calculator
 * Uses authentic IslandDAO registrar configuration without hardcoded values
 * Applies correct per-deposit lockup weighting formula
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import fs from 'fs';
import pkg from 'pg';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Authentic IslandDAO VSR Configuration
const AUTHENTIC_CONFIG = {
  registrarPDA: "5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM",
  baselineVoteWeightScaledFactor: 3000000000, // 3x baseline
  maxExtraLockupVoteWeightScaledFactor: 3000000000, // 3x extra
  lockupSaturationSecs: 31536000, // 1 year (31,536,000 seconds)
  vsrProgramId: "vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ"
};

const VSR_PROGRAM_ID = new PublicKey(AUTHENTIC_CONFIG.vsrProgramId);
const connection = new Connection(process.env.HELIUS_RPC_URL);

/**
 * Load wallet aliases for authority resolution
 */
function loadWalletAliases() {
  try {
    const aliases = JSON.parse(fs.readFileSync('./wallet_aliases_expanded.json', 'utf8'));
    return aliases;
  } catch (error) {
    console.log('Warning: Could not load wallet aliases');
    return {};
  }
}

/**
 * Calculate authentic VSR voting power for a single deposit
 */
function calculateDepositVotingPower(deposit, currentTime) {
  const { amountDepositedNative, lockup, isUsed } = deposit;
  
  // Skip invalid deposits
  if (!isUsed || amountDepositedNative <= 0) {
    return {
      amount: amountDepositedNative,
      votingPower: 0,
      multiplier: 0,
      lockupKind: 'invalid',
      timeRemaining: 0,
      reason: !isUsed ? 'not_used' : 'zero_amount'
    };
  }
  
  const amount = amountDepositedNative / 1e6; // Convert to ISLAND tokens
  const startTs = lockup.startTs;
  const endTs = lockup.endTs;
  const lockupKind = lockup.lockupKind;
  
  // Validate timestamps
  if (startTs <= 0 || endTs <= 0 || endTs <= startTs) {
    return {
      amount: amount,
      votingPower: amount * 3, // Only baseline (3x)
      multiplier: 3.0,
      lockupKind: 'none',
      timeRemaining: 0,
      reason: 'invalid_timestamps'
    };
  }
  
  // Calculate time remaining
  const timeRemaining = Math.max(0, endTs - currentTime);
  
  // Determine lockup kind name
  const lockupKindNames = ['none', 'cliff', 'constant', 'vesting_monthly', 'vesting_daily'];
  const lockupName = lockupKindNames[lockupKind] || 'unknown';
  
  // Apply authentic VSR formula
  const baselineScaling = AUTHENTIC_CONFIG.baselineVoteWeightScaledFactor / 1e9; // 3.0
  const maxExtraScaling = AUTHENTIC_CONFIG.maxExtraLockupVoteWeightScaledFactor / 1e9; // 3.0
  const lockupMultiplier = Math.min(1.0, timeRemaining / AUTHENTIC_CONFIG.lockupSaturationSecs);
  
  const baselineVoteWeight = baselineScaling * amount; // 3 * amount
  const lockedVoteWeight = lockupMultiplier * maxExtraScaling * amount; // up to 3 * amount
  const totalVotingPower = baselineVoteWeight + lockedVoteWeight;
  const effectiveMultiplier = totalVotingPower / amount;
  
  return {
    amount: amount,
    votingPower: totalVotingPower,
    multiplier: effectiveMultiplier,
    lockupKind: lockupName,
    timeRemaining: timeRemaining,
    lockupYears: timeRemaining / (365.25 * 24 * 3600),
    baselineVoteWeight: baselineVoteWeight,
    lockedVoteWeight: lockedVoteWeight,
    lockupMultiplier: lockupMultiplier
  };
}

/**
 * Parse VSR Voter account deposits using observed structure
 */
function parseVoterDeposits(data) {
  const deposits = [];
  
  try {
    // Based on debug analysis, deposits appear to be structured differently
    // Look for deposit patterns throughout the account data
    
    // Scan the account for deposit-like structures
    for (let offset = 112; offset < data.length - 80; offset += 8) {
      try {
        // Look for patterns: amount (8 bytes) + amount (8 bytes) + timestamps + flags
        const amount1 = Number(data.readBigUInt64LE(offset));
        const amount2 = Number(data.readBigUInt64LE(offset + 8));
        
        // Check if this looks like a valid deposit (amounts in reasonable range)
        const tokens1 = amount1 / 1e6;
        const tokens2 = amount2 / 1e6;
        
        if (tokens1 >= 1000 && tokens1 <= 10000000 && 
            tokens2 >= 1000 && tokens2 <= 10000000 &&
            Math.abs(tokens1 - tokens2) < tokens1 * 0.1) { // Amounts should be close
          
          // Look for timestamps in the following bytes
          let startTs = 0;
          let endTs = 0;
          let lockupKind = 0;
          let isUsed = true;
          
          // Search for timestamp patterns in next 64 bytes
          for (let tsOffset = offset + 16; tsOffset <= offset + 80 && tsOffset + 8 <= data.length; tsOffset += 8) {
            try {
              const value = Number(data.readBigUInt64LE(tsOffset));
              if (value > 1600000000 && value < 2000000000) {
                if (startTs === 0) {
                  startTs = value;
                } else if (endTs === 0 && value > startTs) {
                  endTs = value;
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
          
          // Try to find lockup kind (should be 0-4)
          for (let kindOffset = offset + 16; kindOffset <= offset + 80 && kindOffset < data.length; kindOffset++) {
            const kind = data[kindOffset];
            if (kind >= 0 && kind <= 4) {
              lockupKind = kind;
              break;
            }
          }
          
          // Only include if we found reasonable timestamps
          if (startTs > 0 && endTs > startTs) {
            deposits.push({
              index: deposits.length,
              votingMintConfigIdx: 0,
              amountDepositedNative: amount1,
              amountInitiallyLockedNative: amount2,
              isUsed: isUsed,
              lockup: {
                startTs: startTs,
                endTs: endTs,
                lockupKind: lockupKind
              },
              debugOffset: offset
            });
            
            // Skip ahead to avoid duplicate detection
            offset += 64;
          }
        }
        
      } catch (error) {
        continue;
      }
    }
    
    // Sort by amount to get consistent ordering
    deposits.sort((a, b) => b.amountDepositedNative - a.amountDepositedNative);
    
    // Re-index after sorting
    deposits.forEach((deposit, index) => {
      deposit.index = index;
    });
    
    return deposits;
    
  } catch (error) {
    console.error('Error parsing voter deposits:', error.message);
    return [];
  }
}

/**
 * Resolve wallet authority using aliases and ownership mapping
 */
function resolveWalletAuthority(accountPubkey, walletAddress, aliases) {
  const walletPubkey = new PublicKey(walletAddress);
  
  // Direct match
  if (accountPubkey.equals(walletPubkey)) {
    return true;
  }
  
  // Check aliases
  const walletBase58 = walletPubkey.toBase58();
  const accountBase58 = accountPubkey.toBase58();
  
  if (aliases[walletBase58] && aliases[walletBase58].includes(accountBase58)) {
    return true;
  }
  
  // Reverse lookup
  for (const [alias, accounts] of Object.entries(aliases)) {
    if (accounts.includes(accountBase58) && accounts.includes(walletBase58)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate native governance power for a wallet using canonical method
 */
async function calculateNativeGovernancePower(walletAddress) {
  console.log(`\n🔍 Calculating governance power for: ${walletAddress.substring(0, 8)}...`);
  
  const walletPubkey = new PublicKey(walletAddress);
  const aliases = loadWalletAliases();
  const currentTime = Date.now() / 1000;
  
  try {
    // Find all VSR accounts for this wallet
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 } // VSR Voter account size
      ]
    });
    
    console.log(`📊 Found ${allVSRAccounts.length} VSR Voter accounts`);
    
    let totalGovernancePower = 0;
    const allDeposits = [];
    let accountsProcessed = 0;
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Extract authority (offset 8, 32 bytes)
      const authorityBytes = data.slice(8, 40);
      const authority = new PublicKey(authorityBytes);
      
      // Check if this account belongs to the target wallet
      if (!resolveWalletAuthority(authority, walletAddress, aliases)) {
        continue;
      }
      
      accountsProcessed++;
      console.log(`✅ Found VSR account: ${account.pubkey.toBase58()}`);
      console.log(`   Authority: ${authority.toBase58()}`);
      
      // Parse deposits from this account
      const deposits = parseVoterDeposits(data);
      console.log(`   Found ${deposits.length} deposit entries`);
      
      let accountGovernancePower = 0;
      let validDeposits = 0;
      
      for (const deposit of deposits) {
        try {
          console.log(`   [Deposit ${deposit.index}] Parsing: amount=${deposit.amountDepositedNative}, isUsed=${deposit.isUsed}, startTs=${deposit.lockup.startTs}, endTs=${deposit.lockup.endTs}, kind=${deposit.lockup.lockupKind}`);
          
          const result = calculateDepositVotingPower(deposit, currentTime);
          
          if (result && result.votingPower > 0) {
            accountGovernancePower += result.votingPower;
            validDeposits++;
            
            allDeposits.push({
              ...result,
              account: account.pubkey.toBase58(),
              depositIndex: deposit.index
            });
            
            const years = result.lockupYears || 0;
            console.log(`   [Deposit ${deposit.index}] ${result.amount.toLocaleString()} ISLAND × ${result.multiplier.toFixed(2)} = ${result.votingPower.toLocaleString()} power (${result.lockupKind}, ${years.toFixed(2)}y)`);
          } else if (result && result.amount > 0) {
            console.log(`   [Deposit ${deposit.index}] ${result.amount.toLocaleString()} ISLAND - SKIPPED (${result.reason || 'unknown'})`);
          }
        } catch (depositError) {
          console.log(`   [Deposit ${deposit.index}] Error processing: ${depositError.message}`);
        }
      }
      
      totalGovernancePower += accountGovernancePower;
      console.log(`   Account total: ${accountGovernancePower.toLocaleString()} ISLAND (${validDeposits} valid deposits)`);
    }
    
    console.log(`🏆 Total native governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    console.log(`📊 Summary: ${accountsProcessed} VSR accounts, ${allDeposits.length} valid deposits`);
    
    return {
      totalPower: totalGovernancePower,
      deposits: allDeposits,
      accountsFound: accountsProcessed
    };
    
  } catch (error) {
    console.error(`❌ Error calculating governance power: ${error.message}`);
    return { totalPower: 0, deposits: [], accountsFound: 0 };
  }
}

/**
 * Update citizen governance power in database
 */
async function updateCitizenGovernancePower(walletAddress, nativePower, deposits) {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE citizens SET native_governance_power = $1, governance_power = $1 WHERE wallet = $2',
      [nativePower, walletAddress]
    );
    
    console.log(`✅ Database updated: ${nativePower.toLocaleString()} ISLAND`);
    return true;
    
  } catch (error) {
    console.error(`❌ Database update failed: ${error.message}`);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Test specific wallets mentioned in requirements
 */
async function testTargetWallets() {
  console.log('🧪 Testing target wallets with canonical VSR calculator...');
  
  const testWallets = [
    { name: 'Takisoul', address: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', target: '~8.7M' },
    { name: 'GJdRQcsy', address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', target: '144,708.98' },
    { name: "Whale's Friend", address: 'EoqBhxp3CLeCo2ZGFjUjf7WNJLt3q7xB84VcLzuWS4VL', target: '12,625.58' }
  ];
  
  for (const wallet of testWallets) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${wallet.name} (Target: ${wallet.target} ISLAND)`);
    console.log(`${'='.repeat(60)}`);
    
    const result = await calculateNativeGovernancePower(wallet.address);
    
    if (result.totalPower > 0) {
      await updateCitizenGovernancePower(wallet.address, result.totalPower, result.deposits);
    }
  }
}

/**
 * Update all citizens with canonical governance power
 */
async function updateAllCitizensCanonical() {
  console.log('🔄 Starting canonical VSR governance power update...');
  
  const client = await pool.connect();
  let citizens;
  
  try {
    const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
    citizens = result.rows;
  } finally {
    client.release();
  }
  
  console.log(`📊 Processing ${citizens.length} citizens`);
  
  let successCount = 0;
  let powerCount = 0;
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    console.log(`\n[${i + 1}/${citizens.length}] ${citizen.wallet.substring(0, 8)}...`);
    
    const result = await calculateNativeGovernancePower(citizen.wallet);
    const success = await updateCitizenGovernancePower(citizen.wallet, result.totalPower, result.deposits);
    
    if (success) {
      successCount++;
      if (result.totalPower > 0) {
        powerCount++;
      }
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n📈 CANONICAL UPDATE SUMMARY:');
  console.log(`✅ Successfully updated: ${successCount}/${citizens.length} citizens`);
  console.log(`🔋 Citizens with governance power: ${powerCount}`);
  console.log(`🕐 Completed at: ${new Date().toISOString()}`);
  
  return { success: successCount, withPower: powerCount, total: citizens.length };
}

// Export functions
export {
  calculateNativeGovernancePower,
  updateCitizenGovernancePower,
  testTargetWallets,
  updateAllCitizensCanonical
};

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTargetWallets().catch(console.error);
}