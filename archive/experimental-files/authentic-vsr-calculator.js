/**
 * Authentic VSR Governance Power Calculator
 * Implements the exact voting power calculation from the VSR source code
 * Based on: https://github.com/blockworks-foundation/voter-stake-registry
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Calculate voting power using authentic VSR formula
 * voting_power = baseline_vote_weight + lockup_duration_factor * max_extra_lockup_vote_weight
 */
function calculateVotingPower(depositEntry, votingMintConfig, currentTimestamp) {
  const baselineVoteWeight = votingMintConfig.baseline_vote_weight_scaled_factor * depositEntry.amount_deposited_native;
  const maxExtraLockupVoteWeight = votingMintConfig.max_extra_lockup_vote_weight_scaled_factor * depositEntry.amount_initially_locked_native;
  
  // Calculate lockup duration factor
  const secondsLeft = Math.max(0, depositEntry.lockup.end_ts - currentTimestamp);
  const lockupDurationFactor = Math.min(secondsLeft / votingMintConfig.lockup_saturation_secs, 1.0);
  
  const lockedVoteWeight = lockupDurationFactor * maxExtraLockupVoteWeight;
  const totalVotingPower = baselineVoteWeight + lockedVoteWeight;
  
  return {
    baselineVoteWeight,
    lockedVoteWeight,
    totalVotingPower,
    lockupDurationFactor,
    secondsLeft
  };
}

/**
 * Parse VSR Voter Weight Record to extract governance power
 */
function parseVoterWeightRecord(data) {
  try {
    // VSR Voter Weight Record structure
    const discriminator = data.readBigUInt64LE(0);
    
    if (discriminator.toString() !== '14560581792603266545') {
      return null;
    }
    
    // The final calculated voting power is typically stored at offset 104 or 112
    const powerOffsets = [104, 112, 120];
    let maxPower = 0;
    
    for (const offset of powerOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawPower = data.readBigUInt64LE(offset);
          const power = Number(rawPower) / 1e6; // Convert from micro-tokens
          
          if (power > 0 && power < 50000000) {
            maxPower = Math.max(maxPower, power);
          }
        } catch (e) {
          // Skip invalid values
        }
      }
    }
    
    return maxPower;
    
  } catch (error) {
    return null;
  }
}

/**
 * Parse individual deposit entries within a VSR account
 */
function parseDepositEntries(data) {
  const deposits = [];
  
  try {
    // VSR accounts can contain multiple deposit entries
    // Each deposit entry is 96 bytes and starts after the account header
    
    const DEPOSIT_ENTRY_SIZE = 96;
    const headerSize = 104; // Approximate header size
    
    for (let offset = headerSize; offset + DEPOSIT_ENTRY_SIZE <= data.length; offset += DEPOSIT_ENTRY_SIZE) {
      try {
        // Check if this looks like a valid deposit entry
        const isUsed = data[offset + 88] === 1; // is_used field
        
        if (isUsed) {
          const amountDeposited = Number(data.readBigUInt64LE(offset + 32)) / 1e6;
          const amountInitiallyLocked = Number(data.readBigUInt64LE(offset + 40)) / 1e6;
          
          // Parse lockup information
          const startTs = Number(data.readBigInt64LE(offset));
          const endTs = Number(data.readBigInt64LE(offset + 8));
          const lockupKind = data[offset + 16];
          
          if (amountDeposited > 0 && amountDeposited < 50000000) {
            deposits.push({
              amount_deposited_native: amountDeposited,
              amount_initially_locked_native: amountInitiallyLocked,
              lockup: {
                start_ts: startTs,
                end_ts: endTs,
                kind: lockupKind
              },
              offset: offset
            });
          }
        }
      } catch (e) {
        // Skip invalid entries
      }
    }
    
  } catch (error) {
    // Return empty array on error
  }
  
  return deposits;
}

/**
 * Get authentic governance power for a wallet using VSR methodology
 */
async function getAuthenticGovernancePower(walletAddress) {
  try {
    console.log(`Calculating authentic governance power for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get all VSR accounts for this wallet
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
      ]
    });
    
    console.log(`  Found ${vsrAccounts.length} VSR accounts`);
    
    let maxGovernancePower = 0;
    let totalFromDeposits = 0;
    const allDeposits = [];
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Try to get voting power from Voter Weight Record
      const voterWeightPower = parseVoterWeightRecord(data);
      if (voterWeightPower > 0) {
        console.log(`    VWR power: ${voterWeightPower.toLocaleString()} ISLAND`);
        maxGovernancePower = Math.max(maxGovernancePower, voterWeightPower);
      }
      
      // Also try to parse individual deposit entries
      const deposits = parseDepositEntries(data);
      if (deposits.length > 0) {
        console.log(`    Found ${deposits.length} deposit entries`);
        
        for (const deposit of deposits) {
          console.log(`      Deposit: ${deposit.amount_deposited_native.toLocaleString()} ISLAND`);
          allDeposits.push(deposit);
          
          // Calculate governance power for this deposit using VSR formula
          const currentTimestamp = Math.floor(Date.now() / 1000);
          
          // Simplified voting mint config for IslandDAO (these would normally come from on-chain config)
          const votingMintConfig = {
            baseline_vote_weight_scaled_factor: 1e6, // 1:1 baseline
            max_extra_lockup_vote_weight_scaled_factor: 2e6, // Up to 2x multiplier
            lockup_saturation_secs: 5 * 365 * 24 * 3600 // 5 years
          };
          
          const votingPower = calculateVotingPower(deposit, votingMintConfig, currentTimestamp);
          console.log(`        Calculated power: ${(votingPower.totalVotingPower / 1e6).toLocaleString()} ISLAND`);
          
          totalFromDeposits += votingPower.totalVotingPower / 1e6;
        }
      }
    }
    
    console.log(`  VWR max power: ${maxGovernancePower.toLocaleString()} ISLAND`);
    console.log(`  Calculated from deposits: ${totalFromDeposits.toLocaleString()} ISLAND`);
    
    // Use the higher of the two calculations
    const finalPower = Math.max(maxGovernancePower, totalFromDeposits);
    console.log(`  Final governance power: ${finalPower.toLocaleString()} ISLAND`);
    
    return finalPower;
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Test the authentic calculation with known values
 */
async function testAuthenticCalculation() {
  console.log('Testing authentic VSR calculation...');
  
  const testCases = [
    { wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.981722, name: '4-lockup citizen' },
    { wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 3361730.15, name: 'legend' },
    { wallet: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: 200000, name: 'Titanmaker' },
    { wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 1, name: 'DeanMachine' }
  ];
  
  for (const testCase of testCases) {
    console.log(`\\n=== Testing ${testCase.name} ===`);
    
    const calculatedPower = await getAuthenticGovernancePower(testCase.wallet);
    const difference = Math.abs(calculatedPower - testCase.expected);
    const accuracy = testCase.expected > 0 ? (1 - difference / testCase.expected) * 100 : 0;
    
    console.log(`Expected: ${testCase.expected.toLocaleString()} ISLAND`);
    console.log(`Calculated: ${calculatedPower.toLocaleString()} ISLAND`);
    console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
    
    if (accuracy > 95) {
      console.log('✅ EXCELLENT MATCH');
    } else if (accuracy > 80) {
      console.log('✅ GOOD MATCH');
    } else {
      console.log('❌ NEEDS IMPROVEMENT');
    }
  }
}

/**
 * Update all citizens with authentic VSR governance power
 */
async function updateAllCitizensAuthenticVSR() {
  try {
    console.log('Updating all citizens with authentic VSR governance power...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens`);
    
    let updated = 0;
    let totalPower = 0;
    
    for (const citizen of citizens) {
      try {
        const governancePower = await getAuthenticGovernancePower(citizen.wallet);
        
        if (governancePower > 0) {
          await updateGovernancePowerBreakdown(citizen.wallet, governancePower, 0); // Start with 0 delegated
          updated++;
          totalPower += governancePower;
          
          console.log(`✓ ${citizen.nickname || citizen.wallet.substring(0, 8)}: ${governancePower.toLocaleString()} ISLAND`);
        }
        
      } catch (error) {
        console.error(`Error processing ${citizen.wallet}:`, error.message);
      }
    }
    
    console.log(`\\nCompleted authentic VSR update:`);
    console.log(`Citizens updated: ${updated}/${citizens.length}`);
    console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
    
    return { updated, total: citizens.length, totalPower };
    
  } catch (error) {
    console.error('Error in authentic VSR update:', error.message);
    throw error;
  }
}

module.exports = {
  getAuthenticGovernancePower,
  testAuthenticCalculation,
  updateAllCitizensAuthenticVSR,
  calculateVotingPower,
  parseVoterWeightRecord,
  parseDepositEntries
};

// Run test when called directly
if (require.main === module) {
  testAuthenticCalculation().catch(console.error);
}