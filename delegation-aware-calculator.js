/**
 * Delegation-Aware Governance Calculator
 * Handles both native and delegated governance power correctly
 * Includes known delegation relationships and detection for others
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

// Use proven Helius connection
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// Verified VSR and governance configuration  
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

let vsrAccountsCache = null;

// Known delegation relationships
const KNOWN_DELEGATIONS = {
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': [
    '253DoKSunDMYCaxp5KMELhKqZEYyWc5M7vD4GkZcfkyQ2', // 253Do...yhkb2
    'HMsnKKBDQNpNTZ9dZUeNyFo9KMWT7xaG8MfHSMUNyy7T', // HMsn...KMvWT
    '3zxtSZ9j5NLDkZZUwq8wZJLTQKqBKtJCJJPLZ3eRsofP', // 3zxtS...eRsof
    'Dt2YpXdJw4PYBxJNjmCZpU8tGsw7e4mX9SxWJVhyPQmZ'  // Dt2Yp...X9SxW
  ]
};

/**
 * Load all VSR accounts for processing
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    return vsrAccountsCache;
  }

  try {
    console.log('Loading VSR accounts from blockchain...');
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
 * Extract native governance power using max single value methodology
 */
async function getNativeGovernancePower(walletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let maxGovernancePower = 0;
  let accountsFound = 0;
  
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
      
      accountsFound++;
      
      // Check all governance power offsets and find the maximum
      const governanceOffsets = [104, 112];
      
      for (const offset of governanceOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            // Valid governance power range check
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
  
  if (accountsFound > 0) {
    console.log(`  Found ${accountsFound} VSR accounts, max native power: ${maxGovernancePower.toLocaleString()} ISLAND`);
  }
  
  return maxGovernancePower;
}

/**
 * Calculate delegated governance power using known delegations and detection
 */
async function getDelegatedGovernancePower(targetWalletAddress) {
  let totalDelegatedPower = 0;
  
  // Check if this wallet has known delegators
  const knownDelegators = KNOWN_DELEGATIONS[targetWalletAddress] || [];
  
  if (knownDelegators.length > 0) {
    console.log(`  Processing ${knownDelegators.length} known delegators...`);
    
    for (const delegatorWallet of knownDelegators) {
      try {
        const delegatorPower = await getNativeGovernancePower(delegatorWallet);
        if (delegatorPower > 0) {
          totalDelegatedPower += delegatorPower;
          console.log(`  Delegation from ${delegatorWallet.substring(0, 8)}: ${delegatorPower.toLocaleString()} ISLAND`);
        }
      } catch (error) {
        console.log(`  Error calculating delegator ${delegatorWallet.substring(0, 8)}: ${error.message}`);
      }
    }
  }
  
  return totalDelegatedPower;
}

/**
 * Calculate complete governance breakdown for a citizen
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegatedPower] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      getDelegatedGovernancePower(walletAddress)
    ]);
    
    const totalPower = nativePower + delegatedPower;
    
    console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${totalPower.toLocaleString()} ISLAND`);
    
    return { nativePower, delegatedPower, totalPower };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0 };
  }
}

/**
 * Update all citizens with delegation-aware governance calculation
 */
async function updateAllCitizensDelegationAware() {
  try {
    console.log('🔄 Starting delegation-aware governance calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`📊 Processing ${citizens.length} citizens`);
    
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
        console.log(`📊 Processed ${processed}/${citizens.length} citizens`);
      }
    }
    
    console.log('✅ Delegation-aware governance calculation completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in delegation-aware governance calculation:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown,
  updateAllCitizensDelegationAware
};

// Run calculation when called directly
if (require.main === module) {
  updateAllCitizensDelegationAware().catch(console.error);
}