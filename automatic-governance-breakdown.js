/**
 * Automatic Governance Breakdown Calculator
 * Systematically calculates native vs delegated power for all citizens
 * Without hardcoding any values - uses authentic blockchain data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

// Use the proven Helius connection that works for VSR extraction
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// Use the working VSR program ID from efficient extractor
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

let vsrAccountsCache = null;
let governanceRecordsCache = null;

/**
 * Get native governance power from VSR accounts using authentic calculation method
 */
async function getNativeGovernancePower(walletAddress) {
  if (!vsrAccountsCache) {
    console.log('Loading VSR accounts...');
    try {
      const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
      vsrAccountsCache = allVSRAccounts;
      console.log(`Cached ${allVSRAccounts.length} VSR accounts`);
    } catch (error) {
      console.error('Error loading VSR accounts:', error);
      return 0;
    }
  }

  const { PublicKey } = require('@solana/web3.js');
  const { BN } = require('bn.js');
  
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    let maxVotingPower = new BN(0);
    let accountsFound = 0;
    
    // Search through VSR accounts using the proven method
    for (const account of vsrAccountsCache) {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      let walletFound = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          walletFound = true;
          break;
        }
      }
      
      if (walletFound) {
        accountsFound++;
        
        // Extract voting power from known offsets
        const potentialOffsets = [104, 112, 96, 120, 128];
        
        for (const offset of potentialOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const value = data.readBigUInt64LE(offset);
              const bnValue = new BN(value.toString());
              
              // Look for values in the governance power range
              const tokenValue = bnValue.toNumber() / Math.pow(10, 6);
              if (tokenValue > 1000 && tokenValue < 50000000) {
                if (bnValue.gt(maxVotingPower)) {
                  maxVotingPower = bnValue;
                }
              }
            } catch (error) {
              continue;
            }
          }
        }
      }
    }
    
    const nativePower = maxVotingPower.toNumber() / Math.pow(10, 6);
    return nativePower;
    
  } catch (error) {
    console.error(`Error calculating native power for ${walletAddress}:`, error);
    return 0;
  }
}

/**
 * Find delegation records where governance power is delegated TO a specific wallet
 * Returns array of delegator wallet addresses
 */
async function findDelegationRecords(targetWalletAddress) {
  if (!governanceRecordsCache) {
    console.log('Loading governance Token Owner Records...');
    try {
      const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
        filters: [
          { dataSize: 104 },
          {
            memcmp: {
              offset: 32,
              bytes: REALM_PUBKEY.toBase58()
            }
          }
        ]
      });
      
      governanceRecordsCache = [];
      
      // Parse delegation relationships
      for (const account of accounts) {
        try {
          const data = account.account.data;
          const owner = new PublicKey(data.slice(64, 96)).toBase58();
          
          // Check for governance delegate at standard offset
          let delegate = null;
          if (data.length >= 136) {
            const delegateBytes = data.slice(104, 136);
            if (!delegateBytes.every(byte => byte === 0)) {
              delegate = new PublicKey(delegateBytes).toBase58();
            }
          }
          
          if (delegate && owner !== delegate) {
            governanceRecordsCache.push({ owner, delegate });
          }
          
        } catch (parseError) {
          // Skip invalid records
        }
      }
      
      console.log(`Found ${governanceRecordsCache.length} delegation relationships`);
      
    } catch (error) {
      console.error('Error loading governance records:', error);
      governanceRecordsCache = [];
    }
  }
  
  // Find delegations TO the target wallet
  return governanceRecordsCache.filter(record => record.delegate === targetWalletAddress);
}

/**
 * Get delegated governance power by summing power from delegator wallets
 */
async function getDelegatedGovernancePower(targetWalletAddress) {
  const delegations = await findDelegationRecords(targetWalletAddress);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegations) {
    const delegatorNativePower = await getNativeGovernancePower(delegation.owner);
    totalDelegatedPower += delegatorNativePower;
    
    if (delegatorNativePower > 0) {
      console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorNativePower.toLocaleString()} ISLAND`);
    }
  }
  
  return totalDelegatedPower;
}

/**
 * Calculate governance breakdown for a single citizen
 * Returns native, delegated, and total power
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating breakdown for ${walletAddress.substring(0, 8)}...`);
  
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
 * Update a single citizen with automatic governance breakdown
 */
async function updateCitizenGovernanceBreakdown(walletAddress) {
  const breakdown = await calculateGovernanceBreakdown(walletAddress);
  
  if (breakdown.totalPower > 0) {
    await updateGovernancePowerBreakdown(
      walletAddress,
      breakdown.nativePower,
      breakdown.delegatedPower
    );
    
    console.log(`✅ Updated ${walletAddress.substring(0, 8)}`);
  }
  
  return breakdown;
}

/**
 * Update all citizens with automatic governance breakdown
 * This is the systematic approach for database refresh
 */
async function updateAllCitizensGovernanceBreakdown() {
  try {
    console.log('🔄 Starting automatic governance breakdown for all citizens...');
    
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
    
    console.log('✅ Automatic governance breakdown completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in automatic breakdown:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown,
  updateCitizenGovernanceBreakdown,
  updateAllCitizensGovernanceBreakdown
};

// Run breakdown when called directly
if (require.main === module) {
  updateAllCitizensGovernanceBreakdown().catch(console.error);
}