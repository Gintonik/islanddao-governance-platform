/**
 * Dean's List Leaderboard Methodology
 * Optimized delegation detection based on the working Dean's List DAO implementation
 * Focuses on finding the exact 4 delegators for legend with efficient processing
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

let vsrAccountsCache = null;
let walletPowerCache = new Map();

/**
 * Load all VSR accounts for processing
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    return vsrAccountsCache;
  }

  try {
    console.log('Loading VSR accounts...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    vsrAccountsCache = allVSRAccounts;
    console.log(`Cached ${allVSRAccounts.length} VSR accounts`);
    
    return allVSRAccounts;
    
  } catch (error) {
    console.error('Error loading VSR accounts:', error);
    throw error;
  }
}

/**
 * Extract native governance power using proven methodology with caching
 */
async function getNativeGovernancePower(walletAddress) {
  // Check cache first
  if (walletPowerCache.has(walletAddress)) {
    return walletPowerCache.get(walletAddress);
  }

  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let maxGovernancePower = 0;
  
  for (const account of vsrAccounts) {
    try {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      let walletFound = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          walletFound = true;
          break;
        }
      }
      
      if (!walletFound) continue;
      
      // Check governance power offsets and find the maximum
      const governanceOffsets = [104, 112];
      
      for (const offset of governanceOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            if (value > 1000 && value < 50000000) {
              maxGovernancePower = Math.max(maxGovernancePower, value);
            }
          } catch (error) {
            // Skip invalid data
          }
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  // Cache the result
  walletPowerCache.set(walletAddress, maxGovernancePower);
  return maxGovernancePower;
}

/**
 * Find all wallets that appear in VSR accounts with the target wallet
 * This indicates potential delegation relationships
 */
async function findPotentialDelegators(targetWalletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const targetPubkey = new PublicKey(targetWalletAddress);
  const targetBuffer = targetPubkey.toBuffer();
  
  const potentialDelegators = new Set();
  
  // Find VSR accounts containing the target wallet
  for (const account of vsrAccounts) {
    const data = account.account.data;
    
    // Check if target wallet is in this account
    let targetFound = false;
    for (let offset = 0; offset <= data.length - 32; offset += 8) {
      if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
        targetFound = true;
        break;
      }
    }
    
    if (!targetFound) continue;
    
    // Extract all other wallets from this account
    for (let offset = 0; offset <= data.length - 32; offset += 32) {
      try {
        const pubkeyBytes = data.subarray(offset, offset + 32);
        
        if (pubkeyBytes.every(byte => byte === 0) || pubkeyBytes.equals(targetBuffer)) {
          continue;
        }
        
        const pubkey = new PublicKey(pubkeyBytes);
        const walletAddress = pubkey.toBase58();
        
        // Filter valid wallet addresses
        if (!walletAddress.startsWith('11111111') && 
            !walletAddress.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') &&
            !walletAddress.startsWith('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ') &&
            !walletAddress.startsWith('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw') &&
            walletAddress !== targetWalletAddress) {
          potentialDelegators.add(walletAddress);
        }
      } catch (e) {
        // Skip invalid pubkeys
      }
    }
  }
  
  return Array.from(potentialDelegators);
}

/**
 * Find the specific delegators for a target wallet based on governance power patterns
 */
async function findSpecificDelegators(targetWalletAddress, expectedDelegatedPower = null) {
  console.log(`Finding specific delegators for ${targetWalletAddress.substring(0, 8)}...`);
  
  const potentialDelegators = await findPotentialDelegators(targetWalletAddress);
  console.log(`Checking ${potentialDelegators.length} potential delegators...`);
  
  const delegators = [];
  
  // Process in batches to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < potentialDelegators.length; i += batchSize) {
    const batch = potentialDelegators.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (delegatorAddress) => {
        const power = await getNativeGovernancePower(delegatorAddress);
        return { delegatorAddress, power };
      })
    );
    
    for (const { delegatorAddress, power } of batchResults) {
      if (power > 0) {
        delegators.push({
          delegator: delegatorAddress,
          power: power
        });
        
        console.log(`Delegator: ${delegatorAddress.substring(0, 8)} → ${power.toLocaleString()} ISLAND`);
      }
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Sort by power descending
  delegators.sort((a, b) => b.power - a.power);
  
  const totalDelegatedPower = delegators.reduce((sum, d) => sum + d.power, 0);
  
  console.log(`Found ${delegators.length} delegators with total power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
  
  // If we have an expected value, check if we're close
  if (expectedDelegatedPower) {
    const accuracy = Math.abs(totalDelegatedPower - expectedDelegatedPower) / expectedDelegatedPower;
    console.log(`Accuracy: ${(100 - accuracy * 100).toFixed(1)}% (expected: ${expectedDelegatedPower.toLocaleString()})`);
  }
  
  return { delegators, totalDelegatedPower };
}

/**
 * Calculate governance breakdown with targeted delegation detection
 */
async function calculateGovernanceBreakdown(walletAddress, expectedDelegatedPower = null) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const nativePower = await getNativeGovernancePower(walletAddress);
    const delegationData = await findSpecificDelegators(walletAddress, expectedDelegatedPower);
    
    const delegatedPower = delegationData.totalDelegatedPower;
    const totalPower = nativePower + delegatedPower;
    
    console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${totalPower.toLocaleString()} ISLAND`);
    
    return { 
      nativePower, 
      delegatedPower, 
      totalPower,
      delegators: delegationData.delegators
    };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0, delegators: [] };
  }
}

/**
 * Update all citizens with targeted governance calculation
 */
async function updateAllCitizensTargetedGovernance() {
  try {
    console.log('Starting targeted governance calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      const breakdown = await calculateGovernanceBreakdown(citizen.wallet);
      
      if (breakdown.totalPower > 0) {
        await updateGovernancePowerBreakdown(
          citizen.wallet,
          breakdown.nativePower,
          breakdown.delegatedPower
        );
        updated++;
      }
      
      processed++;
      
      if (processed % 5 === 0) {
        console.log(`Processed ${processed}/${citizens.length} citizens`);
      }
    }
    
    console.log('Targeted governance calculation completed');
    console.log(`Citizens processed: ${processed}`);
    console.log(`Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('Error in targeted governance calculation:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  findSpecificDelegators,
  calculateGovernanceBreakdown,
  updateAllCitizensTargetedGovernance
};

// Test with legend and expected values
if (require.main === module) {
  async function testLegendWithExpectedValues() {
    const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
    const expectedDelegated = 1598919.1;
    
    const result = await calculateGovernanceBreakdown(legendWallet, expectedDelegated);
    
    console.log('\nExpected for legend:');
    console.log('Native: 3,361,730.15 ISLAND');
    console.log('Delegated: 1,598,919.1 ISLAND (from 4 delegators)');
    console.log('Total: 4,960,649.25 ISLAND');
    
    console.log('\nAccuracy check:');
    const nativeMatch = Math.abs(result.nativePower - 3361730.15) < 1000;
    const delegatedMatch = Math.abs(result.delegatedPower - 1598919.1) < 50000;
    const totalMatch = Math.abs(result.totalPower - 4960649.25) < 50000;
    
    console.log('Native match:', nativeMatch ? 'CLOSE' : 'DIFFERENT');
    console.log('Delegated match:', delegatedMatch ? 'REASONABLE' : 'DIFFERENT');
    console.log('Total match:', totalMatch ? 'REASONABLE' : 'DIFFERENT');
    
    if (result.delegators.length > 0) {
      console.log('\nTop delegators:');
      result.delegators.slice(0, 10).forEach((d, i) => {
        console.log(`${i + 1}. ${d.delegator.substring(0, 8)}: ${d.power.toLocaleString()} ISLAND`);
      });
    }
  }
  
  testLegendWithExpectedValues().catch(console.error);
}