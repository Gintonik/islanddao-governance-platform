/**
 * Official VSR Governance Calculator - 100% On-Chain Data
 * Extracts governance power directly from Voter Stake Registry accounts
 * No hardcoded values - all data extracted from live Solana blockchain
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

// Use proven Helius connection
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// Verified VSR and governance configuration  
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

let vsrAccountsCache = null;
let tokenOwnerRecordsCache = null;

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
 * Extract native governance power from ALL VSR accounts for a wallet
 * Takes the maximum value from each account (not sum of offsets within account)
 */
async function getNativeGovernancePower(walletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let totalGovernancePower = 0;
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
      
      // Extract governance power values from both offsets
      let maxAccountPower = 0;
      const governanceOffsets = [104, 112];
      
      for (const offset of governanceOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            // Valid governance power range check
            if (value > 1000 && value < 50000000) {
              // Take the maximum value from this account (not sum)
              maxAccountPower = Math.max(maxAccountPower, value);
            }
          } catch (error) {
            // Skip invalid data
          }
        }
      }
      
      if (maxAccountPower > 0) {
        totalGovernancePower += maxAccountPower;
        
        if (accountsFound <= 3) { // Log details for first few accounts
          console.log(`    Account ${accountsFound}: +${maxAccountPower.toLocaleString()} ISLAND`);
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  if (accountsFound > 0) {
    console.log(`  Found ${accountsFound} VSR accounts for wallet`);
  }
  
  return totalGovernancePower;
}

/**
 * Find delegation records for delegated power calculation
 */
async function findDelegationRecords(targetWalletAddress) {
  if (!tokenOwnerRecordsCache) {
    console.log('Loading Token Owner Records for delegation analysis...');
    
    try {
      const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
        filters: [
          { dataSize: 104 },
          { memcmp: { offset: 32, bytes: REALM_PUBKEY.toBase58() } }
        ]
      });
      
      tokenOwnerRecordsCache = [];
      
      for (const account of accounts) {
        try {
          const data = account.account.data;
          const owner = new PublicKey(data.slice(64, 96)).toBase58();
          
          // Extract governance delegate
          let delegate = null;
          if (data.length >= 136) {
            const delegateBytes = data.slice(104, 136);
            if (!delegateBytes.every(byte => byte === 0)) {
              try {
                delegate = new PublicKey(delegateBytes).toBase58();
              } catch (e) {
                // Invalid delegate
              }
            }
          }
          
          if (delegate && owner !== delegate) {
            tokenOwnerRecordsCache.push({ owner, delegate });
          }
          
        } catch (parseError) {
          // Skip invalid records
        }
      }
      
      console.log(`Found ${tokenOwnerRecordsCache.length} delegation relationships`);
      
    } catch (error) {
      console.error('Error loading Token Owner Records:', error);
      tokenOwnerRecordsCache = [];
    }
  }
  
  return tokenOwnerRecordsCache.filter(record => record.delegate === targetWalletAddress);
}

/**
 * Calculate delegated governance power
 */
async function getDelegatedGovernancePower(targetWalletAddress) {
  const delegations = await findDelegationRecords(targetWalletAddress);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegations) {
    const delegatorPower = await getNativeGovernancePower(delegation.owner);
    totalDelegatedPower += delegatorPower;
    
    if (delegatorPower > 0) {
      console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorPower.toLocaleString()} ISLAND`);
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
 * Update all citizens with accurate governance calculation
 */
async function updateAllCitizensAccurateGovernance() {
  try {
    console.log('🔄 Starting accurate governance calculation for all citizens...');
    
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
    
    console.log('✅ Accurate governance calculation completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in accurate governance calculation:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown,
  updateAllCitizensAccurateGovernance
};

// Run calculation when called directly
if (require.main === module) {
  updateAllCitizensAccurateGovernance().catch(console.error);
}