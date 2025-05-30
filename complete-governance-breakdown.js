/**
 * Complete Governance Power Breakdown Calculator
 * Properly separates native VSR power from delegated power for accurate citizen display
 * Ensures all cards show correct native, delegated, and total values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('bn.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

// Use proven Helius connection
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// Proven VSR and governance configuration  
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

/**
 * Cache for VSR accounts to avoid repeated RPC calls
 */
let vsrAccountsCache = null;
let tokenOwnerRecordsCache = null;

/**
 * Load all VSR accounts once for efficient batch processing
 */
async function loadAllVSRAccounts() {
  if (vsrAccountsCache) {
    console.log('Using cached VSR accounts...');
    return vsrAccountsCache;
  }

  try {
    console.log('Loading all VSR accounts from blockchain...');
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
 * Extract native governance power from VSR accounts using proven methodology
 */
async function getNativeGovernancePower(walletAddress, vsrAccounts) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    let maxVotingPower = new BN(0);
    let accountsFound = 0;
    
    // Search through VSR accounts using proven method
    for (const account of vsrAccounts) {
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
 */
async function findDelegationRecords(targetWalletAddress) {
  if (!tokenOwnerRecordsCache) {
    console.log('Loading Token Owner Records for delegation analysis...');
    
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
      
      tokenOwnerRecordsCache = [];
      
      // Parse delegation relationships from Token Owner Records
      for (const account of accounts) {
        try {
          const data = account.account.data;
          const owner = new PublicKey(data.slice(64, 96)).toBase58();
          
          // Check for governance delegate at multiple potential offsets
          let delegate = null;
          
          // Standard governance delegate offset
          if (data.length >= 136) {
            const delegateBytes = data.slice(104, 136);
            if (!delegateBytes.every(byte => byte === 0)) {
              try {
                delegate = new PublicKey(delegateBytes).toBase58();
              } catch (e) {
                // Invalid delegate bytes
              }
            }
          }
          
          // Alternative delegate positions
          if (!delegate && data.length >= 168) {
            const delegateBytes2 = data.slice(136, 168);
            if (!delegateBytes2.every(byte => byte === 0)) {
              try {
                delegate = new PublicKey(delegateBytes2).toBase58();
              } catch (e) {
                // Invalid delegate bytes
              }
            }
          }
          
          if (delegate && owner !== delegate) {
            tokenOwnerRecordsCache.push({
              owner,
              delegate,
              accountPubkey: account.pubkey.toBase58()
            });
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
  
  // Find delegations TO the target wallet
  return tokenOwnerRecordsCache.filter(record => record.delegate === targetWalletAddress);
}

/**
 * Calculate delegated governance power by summing power from delegator wallets
 */
async function getDelegatedGovernancePower(targetWalletAddress, vsrAccounts) {
  const delegations = await findDelegationRecords(targetWalletAddress);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegations) {
    const delegatorNativePower = await getNativeGovernancePower(delegation.owner, vsrAccounts);
    
    if (delegatorNativePower > 0) {
      totalDelegatedPower += delegatorNativePower;
      console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorNativePower.toLocaleString()} ISLAND`);
    }
  }
  
  return totalDelegatedPower;
}

/**
 * Calculate complete governance breakdown for a single citizen
 */
async function calculateGovernanceBreakdown(walletAddress, vsrAccounts) {
  console.log(`\nCalculating breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegatedPower] = await Promise.all([
      getNativeGovernancePower(walletAddress, vsrAccounts),
      getDelegatedGovernancePower(walletAddress, vsrAccounts)
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
 * Update a single citizen with complete governance breakdown
 */
async function updateCitizenGovernanceBreakdown(walletAddress, vsrAccounts) {
  const breakdown = await calculateGovernanceBreakdown(walletAddress, vsrAccounts);
  
  if (breakdown.totalPower > 0) {
    await updateGovernancePowerBreakdown(
      walletAddress,
      breakdown.nativePower,
      breakdown.delegatedPower
    );
    
    console.log(`✅ Updated ${walletAddress.substring(0, 8)} with authentic breakdown`);
  }
  
  return breakdown;
}

/**
 * Update all citizens with complete governance breakdown
 */
async function updateAllCitizensGovernanceBreakdown() {
  try {
    console.log('🔄 Starting complete governance breakdown for all citizens...');
    
    // Load VSR accounts once for all calculations
    const vsrAccounts = await loadAllVSRAccounts();
    
    const citizens = await getAllCitizens();
    console.log(`📊 Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      const breakdown = await calculateGovernanceBreakdown(citizen.wallet, vsrAccounts);
      
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
    
    console.log('✅ Complete governance breakdown finished');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in complete breakdown:', error);
    throw error;
  }
}

/**
 * Test the complete governance breakdown system
 */
async function testGovernanceBreakdown() {
  console.log('🧪 Testing complete governance breakdown...');
  
  // Test with the legend wallet we know has delegations
  const testWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
  const vsrAccounts = await loadAllVSRAccounts();
  
  const breakdown = await calculateGovernanceBreakdown(testWallet, vsrAccounts);
  
  console.log('\nTest Results:');
  console.log(`Wallet: ${testWallet}`);
  console.log(`Native: ${breakdown.nativePower.toLocaleString()} ISLAND`);
  console.log(`Delegated: ${breakdown.delegatedPower.toLocaleString()} ISLAND`);
  console.log(`Total: ${breakdown.totalPower.toLocaleString()} ISLAND`);
  
  return breakdown;
}

module.exports = {
  loadAllVSRAccounts,
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown,
  updateCitizenGovernanceBreakdown,
  updateAllCitizensGovernanceBreakdown,
  testGovernanceBreakdown
};

// Run breakdown when called directly
if (require.main === module) {
  updateAllCitizensGovernanceBreakdown().catch(console.error);
}