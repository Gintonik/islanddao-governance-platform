/**
 * Comprehensive VSR Governance Calculator
 * Analyzes ALL VSR accounts for each citizen to get the complete governance power
 * Properly handles different account types and aggregates correctly
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
 * Comprehensive analysis of all VSR accounts for a wallet
 * Returns detailed information about each account and governance power
 */
async function analyzeAllVSRAccounts(walletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  const accountDetails = [];
  let totalGovernancePower = 0;
  
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
      
      const accountInfo = {
        pubkey: account.pubkey.toBase58(),
        size: data.length,
        governancePowers: [],
        maxPower: 0
      };
      
      // Check all potential governance power offsets
      const governanceOffsets = [104, 112];
      
      for (const offset of governanceOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            if (value > 1000 && value < 50000000) {
              accountInfo.governancePowers.push({
                offset: offset,
                value: value
              });
              accountInfo.maxPower = Math.max(accountInfo.maxPower, value);
            }
          } catch (error) {
            // Skip invalid data
          }
        }
      }
      
      if (accountInfo.governancePowers.length > 0) {
        accountDetails.push(accountInfo);
        
        // For now, use the maximum value from each account
        // This avoids double-counting within the same account
        totalGovernancePower += accountInfo.maxPower;
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  return {
    accountDetails,
    totalGovernancePower,
    accountCount: accountDetails.length
  };
}

/**
 * Extract native governance power using comprehensive analysis
 */
async function getNativeGovernancePower(walletAddress) {
  const analysis = await analyzeAllVSRAccounts(walletAddress);
  
  if (analysis.accountCount > 0) {
    console.log(`  Found ${analysis.accountCount} VSR accounts:`);
    
    analysis.accountDetails.forEach((account, index) => {
      if (index < 3) { // Show details for first 3 accounts
        console.log(`    Account ${index + 1}: ${account.maxPower.toLocaleString()} ISLAND (${account.size} bytes)`);
        account.governancePowers.forEach(power => {
          console.log(`      Offset ${power.offset}: ${power.value.toLocaleString()} ISLAND`);
        });
      }
    });
    
    if (analysis.accountCount > 3) {
      console.log(`    ... and ${analysis.accountCount - 3} more accounts`);
    }
    
    console.log(`  Total governance power: ${analysis.totalGovernancePower.toLocaleString()} ISLAND`);
  }
  
  return analysis.totalGovernancePower;
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
  console.log(`\nCalculating comprehensive governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
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
 * Update all citizens with comprehensive governance calculation
 */
async function updateAllCitizensComprehensiveGovernance() {
  try {
    console.log('🔄 Starting comprehensive governance calculation for all citizens...');
    
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
    
    console.log('✅ Comprehensive governance calculation completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in comprehensive governance calculation:', error);
    throw error;
  }
}

module.exports = {
  analyzeAllVSRAccounts,
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown,
  updateAllCitizensComprehensiveGovernance
};

// Run calculation when called directly
if (require.main === module) {
  updateAllCitizensComprehensiveGovernance().catch(console.error);
}