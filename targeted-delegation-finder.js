/**
 * Targeted Delegation Finder
 * Uses specific filters to find Token Owner Records with delegation relationships
 * More efficient approach that doesn't fetch all governance accounts at once
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

let vsrAccountsCache = null;

/**
 * Load all VSR accounts
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
 * Extract native governance power using proven max single value methodology
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
 * Find delegations using targeted search approach
 * Looks for specific delegation patterns without fetching all accounts
 */
async function findDelegatedPower(targetWalletAddress) {
  try {
    const targetPubkey = new PublicKey(targetWalletAddress);
    
    // Try different approaches to find delegation records
    console.log(`Searching for delegations to ${targetWalletAddress.substring(0, 8)}...`);
    
    // Approach 1: Search for Token Owner Records by data size
    const tokenOwnerRecordSizes = [133, 141, 149, 157]; // Common TOR sizes
    
    let totalDelegatedPower = 0;
    let delegatorsFound = 0;
    
    for (const size of tokenOwnerRecordSizes) {
      try {
        const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
          filters: [
            { dataSize: size },
            { memcmp: { offset: 1, bytes: REALM_PUBKEY.toBase58() } }
          ]
        });
        
        console.log(`Checking ${accounts.length} accounts of size ${size}...`);
        
        for (const account of accounts) {
          const data = account.account.data;
          
          // Look for target wallet in delegation positions
          const delegatePositions = [97, 105, 113, 121, 129];
          
          for (const pos of delegatePositions) {
            if (pos + 32 <= data.length) {
              try {
                const delegateBytes = data.slice(pos, pos + 32);
                const delegate = new PublicKey(delegateBytes).toBase58();
                
                if (delegate === targetWalletAddress) {
                  // Found a delegation! Extract the owner
                  const ownerBytes = data.slice(65, 97);
                  const owner = new PublicKey(ownerBytes).toBase58();
                  
                  if (owner !== targetWalletAddress) {
                    console.log(`Found delegator: ${owner.substring(0, 8)} → ${targetWalletAddress.substring(0, 8)}`);
                    
                    // Calculate this delegator's governance power
                    const delegatorPower = await getNativeGovernancePower(owner);
                    if (delegatorPower > 0) {
                      totalDelegatedPower += delegatorPower;
                      delegatorsFound++;
                      console.log(`  Delegator power: ${delegatorPower.toLocaleString()} ISLAND`);
                    }
                  }
                }
              } catch (e) {
                // Continue checking other positions
              }
            }
          }
        }
        
      } catch (error) {
        console.log(`Error checking size ${size}:`, error.message);
      }
    }
    
    console.log(`Found ${delegatorsFound} delegators with total power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    return totalDelegatedPower;
    
  } catch (error) {
    console.error('Error finding delegated power:', error);
    return 0;
  }
}

/**
 * Calculate complete governance breakdown for a citizen
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegatedPower] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      findDelegatedPower(walletAddress)
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
  findDelegatedPower,
  calculateGovernanceBreakdown,
  updateAllCitizensTargetedGovernance
};

// Test with legend when called directly
if (require.main === module) {
  async function testLegend() {
    const legendWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
    const result = await calculateGovernanceBreakdown(legendWallet);
    
    console.log('\\nExpected for legend:');
    console.log('Native: 3,361,730.15 ISLAND');
    console.log('Delegated: 1,598,919.1 ISLAND');
    console.log('Total: 4,960,649.25 ISLAND');
    
    console.log('\\nAccuracy check:');
    console.log('Native match:', Math.abs(result.nativePower - 3361730.15) < 1000 ? 'CLOSE' : 'DIFFERENT');
    console.log('Total match:', Math.abs(result.totalPower - 4960649.25) < 10000 ? 'CLOSE' : 'DIFFERENT');
  }
  
  testLegend().catch(console.error);
}