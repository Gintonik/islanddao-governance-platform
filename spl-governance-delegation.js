/**
 * SPL Governance Delegation Detection
 * Based on Dean's List implementation for proper delegation detection
 * Uses the correct filters to find Token Owner Records with delegation
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// Verified configuration
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

let vsrAccountsCache = null;

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
  
  return maxGovernancePower;
}

/**
 * Find delegation records using Dean's List methodology
 * Based on getGovAccounts implementation with proper filters
 */
async function findDelegationRecords(targetWalletAddress) {
  try {
    const walletPk = new PublicKey(targetWalletAddress);
    
    // Create filters based on Dean's List implementation
    // Filter 1: realm filter (offset 1, 32 bytes)
    const realmFilter = {
      memcmp: {
        offset: 1,
        bytes: REALM_PUBKEY.toBase58()
      }
    };
    
    // Filter 2: has delegate filter (offset 1 + 32 + 32 + 32 + 8 + 4 + 4 + 1 + 1 + 6 = 104 + 17 = 121, boolean true)
    const hasDelegateFilter = {
      memcmp: {
        offset: 121,
        bytes: 'true' // This represents boolean true
      }
    };
    
    // Filter 3: delegated to user filter (offset 122, 32 bytes)
    const delegatedToUserFilter = {
      memcmp: {
        offset: 122,
        bytes: walletPk.toBase58()
      }
    };
    
    console.log(`Searching for delegations to ${targetWalletAddress.substring(0, 8)}...`);
    
    const govAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        realmFilter,
        hasDelegateFilter,
        delegatedToUserFilter
      ]
    });
    
    console.log(`Found ${govAccounts.length} delegation accounts`);
    
    const delegators = [];
    
    for (const account of govAccounts) {
      try {
        const data = account.account.data;
        
        // Extract governing token owner (delegator) from offset 64
        const ownerBytes = data.slice(64, 96);
        const owner = new PublicKey(ownerBytes).toBase58();
        
        // Extract governing token mint to verify it's the community mint
        const mintBytes = data.slice(32, 64);
        const mint = new PublicKey(mintBytes).toBase58();
        
        // IslandDAO community mint should match
        // For now, add all found delegators
        delegators.push({
          owner: owner,
          delegate: targetWalletAddress,
          account: account.pubkey.toBase58(),
          mint: mint
        });
        
        console.log(`Found delegator: ${owner.substring(0, 8)} → ${targetWalletAddress.substring(0, 8)}`);
        
      } catch (error) {
        console.log('Error parsing delegation account:', error.message);
      }
    }
    
    return delegators;
    
  } catch (error) {
    console.error('Error finding delegation records:', error);
    return [];
  }
}

/**
 * Calculate delegated governance power using Dean's List methodology
 */
async function getDelegatedGovernancePower(targetWalletAddress) {
  const delegations = await findDelegationRecords(targetWalletAddress);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegations) {
    try {
      const delegatorPower = await getNativeGovernancePower(delegation.owner);
      totalDelegatedPower += delegatorPower;
      
      if (delegatorPower > 0) {
        console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorPower.toLocaleString()} ISLAND`);
      }
    } catch (error) {
      console.log(`  Error calculating power for delegator ${delegation.owner.substring(0, 8)}: ${error.message}`);
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
 * Update all citizens with proper delegation-aware governance calculation
 */
async function updateAllCitizensWithDelegation() {
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
  updateAllCitizensWithDelegation
};

// Run calculation when called directly
if (require.main === module) {
  updateAllCitizensWithDelegation().catch(console.error);
}