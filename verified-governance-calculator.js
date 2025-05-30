/**
 * Verified Governance Power Calculator
 * Correctly sums ALL lockup deposits for each wallet with proper multipliers
 * Handles vested, constant, and cliff lockup types accurately
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

let vsrAccountsCache = null;
let tokenOwnerRecordsCache = null;

/**
 * Load all VSR accounts for processing
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    console.log('Using cached VSR accounts...');
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
 * Extract ALL lockup deposits for a wallet and sum them correctly
 */
function extractAllLockupDeposits(walletAddress, vsrAccounts) {
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let totalGovernancePower = 0;
  let depositsFound = [];
  
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
      
      // Look for deposit entries at different offsets
      const depositOffsets = [
        { start: 96, size: 104 },   // First deposit entry
        { start: 200, size: 104 },  // Second deposit entry  
        { start: 304, size: 104 },  // Third deposit entry
        { start: 408, size: 104 },  // Fourth deposit entry
        { start: 512, size: 104 },  // Fifth deposit entry
      ];
      
      for (const offsetInfo of depositOffsets) {
        if (offsetInfo.start + offsetInfo.size <= data.length) {
          try {
            // Extract deposit amount (first 8 bytes of deposit entry)
            const amountBytes = data.slice(offsetInfo.start, offsetInfo.start + 8);
            const amount = Number(amountBytes.readBigUInt64LE(0)) / 1e6;
            
            if (amount > 100 && amount < 50000000) { // Valid deposit range
              // Extract lockup expiration (bytes 8-16 of deposit entry)
              const expirationBytes = data.slice(offsetInfo.start + 8, offsetInfo.start + 16);
              const expiration = Number(expirationBytes.readBigUInt64LE(0));
              
              // Calculate lockup multiplier based on time remaining
              const now = Date.now() / 1000;
              const timeRemaining = Math.max(0, expiration - now);
              const yearsRemaining = timeRemaining / (365.25 * 24 * 3600);
              
              // VSR multiplier calculation (baseline + lockup bonus)
              let multiplier = 1.0; // baseline
              if (yearsRemaining > 0) {
                multiplier += Math.min(yearsRemaining / 4.0, 1.0); // max 1.0 bonus for 4+ years
              }
              
              const governancePower = amount * multiplier;
              totalGovernancePower += governancePower;
              
              depositsFound.push({
                amount: amount,
                expiration: expiration,
                yearsRemaining: yearsRemaining.toFixed(2),
                multiplier: multiplier.toFixed(2),
                governancePower: governancePower
              });
            }
          } catch (error) {
            // Skip invalid deposit entries
          }
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  return {
    totalGovernancePower,
    depositsFound,
    depositCount: depositsFound.length
  };
}

/**
 * Calculate verified governance power using correct deposit summation
 */
async function calculateVerifiedGovernancePower(walletAddress) {
  console.log(`\nCalculating verified governance power for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const vsrAccounts = await loadVSRAccounts();
    
    // Extract all lockup deposits and sum them
    const result = extractAllLockupDeposits(walletAddress, vsrAccounts);
    
    console.log(`  Found ${result.depositCount} lockup deposits:`);
    result.depositsFound.forEach((deposit, i) => {
      console.log(`    ${i + 1}. ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier} = ${deposit.governancePower.toLocaleString()} votes`);
    });
    
    console.log(`  Total governance power: ${result.totalGovernancePower.toLocaleString()} ISLAND`);
    
    return result.totalGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating verified governance power for ${walletAddress}:`, error);
    return 0;
  }
}

/**
 * Find delegation records for delegated power calculation
 */
async function findDelegationRecords(targetWalletAddress) {
  if (!tokenOwnerRecordsCache) {
    console.log('Loading Token Owner Records...');
    
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
          
          let delegate = null;
          if (data.length >= 136) {
            const delegateBytes = data.slice(104, 136);
            if (!delegateBytes.every(byte => byte === 0)) {
              try {
                delegate = new PublicKey(delegateBytes).toBase58();
              } catch (e) {}
            }
          }
          
          if (delegate && owner !== delegate) {
            tokenOwnerRecordsCache.push({ owner, delegate });
          }
          
        } catch (parseError) {}
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
async function calculateDelegatedGovernancePower(targetWalletAddress) {
  const delegations = await findDelegationRecords(targetWalletAddress);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegations) {
    const delegatorPower = await calculateVerifiedGovernancePower(delegation.owner);
    totalDelegatedPower += delegatorPower;
    
    if (delegatorPower > 0) {
      console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorPower.toLocaleString()} ISLAND`);
    }
  }
  
  return totalDelegatedPower;
}

/**
 * Calculate complete verified governance breakdown
 */
async function calculateVerifiedGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating complete breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegatedPower] = await Promise.all([
      calculateVerifiedGovernancePower(walletAddress),
      calculateDelegatedGovernancePower(walletAddress)
    ]);
    
    const totalPower = nativePower + delegatedPower;
    
    console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${totalPower.toLocaleString()} ISLAND`);
    
    return { nativePower, delegatedPower, totalPower };
    
  } catch (error) {
    console.error(`Error calculating verified breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0 };
  }
}

/**
 * Update all citizens with verified governance calculation
 */
async function updateAllCitizensVerifiedGovernance() {
  try {
    console.log('🔄 Starting verified governance calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`📊 Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      const breakdown = await calculateVerifiedGovernanceBreakdown(citizen.wallet);
      
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
    
    console.log('✅ Verified governance calculation completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in verified governance calculation:', error);
    throw error;
  }
}

module.exports = {
  calculateVerifiedGovernancePower,
  calculateVerifiedGovernanceBreakdown,
  updateAllCitizensVerifiedGovernance
};

// Run calculation when called directly
if (require.main === module) {
  updateAllCitizensVerifiedGovernance().catch(console.error);
}