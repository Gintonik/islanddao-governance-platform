/**
 * Dean's List Voting Power Calculator
 * Optimized approach to find delegation relationships efficiently
 * Based on the working methodology from Dean's List DAO leaderboard
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

let vsrAccountsCache = null;

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
 * Extract native governance power using proven methodology
 */
async function getNativeGovernancePower(walletAddress) {
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
  
  return maxGovernancePower;
}

/**
 * Find delegators efficiently by looking for co-occurrence patterns in VSR accounts
 */
async function findDelegatorsOptimized(targetWalletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const targetPubkey = new PublicKey(targetWalletAddress);
  const targetBuffer = targetPubkey.toBuffer();
  
  console.log(`Finding delegators for ${targetWalletAddress.substring(0, 8)}...`);
  
  const potentialDelegators = new Set();
  
  // First pass: find all VSR accounts that contain the target wallet
  const targetAccounts = [];
  for (const account of vsrAccounts) {
    const data = account.account.data;
    
    // Check if target wallet is in this account
    for (let offset = 0; offset <= data.length - 32; offset += 8) {
      if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
        targetAccounts.push(account);
        break;
      }
    }
  }
  
  console.log(`Found ${targetAccounts.length} VSR accounts containing target wallet`);
  
  // Second pass: extract all other wallets from those accounts
  for (const account of targetAccounts) {
    const data = account.account.data;
    
    for (let offset = 0; offset <= data.length - 32; offset += 32) {
      try {
        const pubkeyBytes = data.subarray(offset, offset + 32);
        
        if (pubkeyBytes.every(byte => byte === 0) || pubkeyBytes.equals(targetBuffer)) {
          continue;
        }
        
        const pubkey = new PublicKey(pubkeyBytes);
        const walletAddress = pubkey.toBase58();
        
        // Filter out system accounts and add potential delegators
        if (!walletAddress.startsWith('11111111') && 
            !walletAddress.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') &&
            !walletAddress.startsWith('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ') &&
            walletAddress !== targetWalletAddress) {
          potentialDelegators.add(walletAddress);
        }
      } catch (e) {
        // Skip invalid pubkeys
      }
    }
  }
  
  console.log(`Found ${potentialDelegators.size} potential delegators to check`);
  
  // Third pass: check governance power for each potential delegator
  const delegators = [];
  let totalDelegatedPower = 0;
  
  for (const delegatorAddress of potentialDelegators) {
    const power = await getNativeGovernancePower(delegatorAddress);
    
    if (power > 0) {
      delegators.push({
        delegator: delegatorAddress,
        power: power
      });
      totalDelegatedPower += power;
      
      console.log(`Delegator: ${delegatorAddress.substring(0, 8)} → ${power.toLocaleString()} ISLAND`);
    }
  }
  
  // Sort by power descending
  delegators.sort((a, b) => b.power - a.power);
  
  console.log(`Total: ${delegators.length} delegators with ${totalDelegatedPower.toLocaleString()} ISLAND`);
  
  return { delegators, totalDelegatedPower };
}

/**
 * Calculate complete governance breakdown
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegationData] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      findDelegatorsOptimized(walletAddress)
    ]);
    
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
 * Update all citizens with optimized delegation calculation
 */
async function updateAllCitizensOptimizedDelegation() {
  try {
    console.log('Starting optimized delegation calculation for all citizens...');
    
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
    
    console.log('Optimized delegation calculation completed');
    console.log(`Citizens processed: ${processed}`);
    console.log(`Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('Error in optimized delegation calculation:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  findDelegatorsOptimized,
  calculateGovernanceBreakdown,
  updateAllCitizensOptimizedDelegation
};

// Test with legend when called directly
if (require.main === module) {
  async function testLegend() {
    const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
    const result = await calculateGovernanceBreakdown(legendWallet);
    
    console.log('\nExpected for legend:');
    console.log('Native: 3,361,730.15 ISLAND');
    console.log('Delegated: 1,598,919.1 ISLAND (from 4 delegators)');
    console.log('Total: 4,960,649.25 ISLAND');
    
    console.log('\nAccuracy check:');
    console.log('Native match:', Math.abs(result.nativePower - 3361730.15) < 1000 ? 'CLOSE' : 'DIFFERENT');
    console.log('Delegated match:', Math.abs(result.delegatedPower - 1598919.1) < 50000 ? 'REASONABLE' : 'DIFFERENT');
    console.log('Total match:', Math.abs(result.totalPower - 4960649.25) < 50000 ? 'REASONABLE' : 'DIFFERENT');
    
    if (result.delegators.length > 0) {
      console.log('\\nFound delegators:');
      result.delegators.forEach((d, i) => {
        console.log(`${i + 1}. ${d.delegator.substring(0, 8)}: ${d.power.toLocaleString()} ISLAND`);
      });
    }
  }
  
  testLegend().catch(console.error);
}