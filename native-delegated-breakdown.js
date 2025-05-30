/**
 * Native vs Delegated Governance Power Breakdown Calculator
 * Properly separates native VSR power from delegated power for accurate citizen display
 * Based on authentic blockchain governance delegation data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

// Initialize connection with Helius RPC
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// IslandDAO governance configuration
const REALM = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

// Cache for governance accounts to improve performance
let governanceAccountsCache = null;
let vsrAccountsCache = null;

/**
 * Load all governance Token Owner Records for delegation analysis
 */
async function loadGovernanceAccounts() {
  if (governanceAccountsCache) {
    console.log('Using cached governance accounts...');
    return governanceAccountsCache;
  }

  try {
    console.log('Loading governance Token Owner Records...');
    
    const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        { dataSize: 104 }, // Token Owner Record size
        {
          memcmp: {
            offset: 32,
            bytes: REALM.toBase58()
          }
        }
      ]
    });

    console.log(`Loaded ${accounts.length} governance accounts`);
    
    // Parse accounts to extract owner -> delegate mappings
    const delegationMappings = [];
    
    for (const account of accounts) {
      try {
        const data = account.account.data;
        
        // Parse Token Owner Record structure
        const owner = new PublicKey(data.slice(64, 96)).toBase58();
        const governingTokenDepositAmount = data.readBigUInt64LE(96);
        
        // Check if there's a delegate (offset 72-104 in some versions)
        let delegate = null;
        if (data.length >= 136) {
          try {
            const delegateBytes = data.slice(104, 136);
            if (!delegateBytes.every(byte => byte === 0)) {
              delegate = new PublicKey(delegateBytes).toBase58();
            }
          } catch (e) {
            // No valid delegate
          }
        }
        
        delegationMappings.push({
          pubkey: account.pubkey.toBase58(),
          owner,
          delegate,
          depositAmount: Number(governingTokenDepositAmount) / 1e6 // Convert from lamports
        });
        
      } catch (parseError) {
        console.log('Error parsing governance account:', parseError.message);
      }
    }
    
    governanceAccountsCache = delegationMappings;
    return delegationMappings;
    
  } catch (error) {
    console.error('Error loading governance accounts:', error);
    return [];
  }
}

/**
 * Load VSR accounts for native power calculation
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    console.log('Using cached VSR accounts...');
    return vsrAccountsCache;
  }

  try {
    console.log('Loading VSR accounts...');
    
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 3264 } // Voter Weight Record size
      ]
    });

    console.log(`Loaded ${accounts.length} VSR accounts`);
    vsrAccountsCache = accounts;
    return accounts;
    
  } catch (error) {
    console.error('Error loading VSR accounts:', error);
    return [];
  }
}

/**
 * Calculate native governance power from VSR accounts
 */
function calculateNativePower(walletAddress, vsrAccounts) {
  let totalNativePower = 0;
  
  for (const account of vsrAccounts) {
    try {
      const data = account.account.data;
      
      // Check if this VSR account belongs to the wallet
      const voterPubkey = new PublicKey(data.slice(8, 40)).toBase58();
      if (voterPubkey !== walletAddress) continue;
      
      // Parse governance power from VSR data
      const governancePower = data.readBigUInt64LE(40);
      totalNativePower += Number(governancePower) / 1e6;
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  return totalNativePower;
}

/**
 * Find delegations TO a specific wallet (power delegated from others)
 */
function findDelegationsTo(targetWallet, governanceAccounts) {
  const delegationsTo = governanceAccounts.filter(account => 
    account.delegate === targetWallet && account.owner !== targetWallet
  );
  
  console.log(`Found ${delegationsTo.length} delegations to ${targetWallet.substring(0, 8)}`);
  
  return delegationsTo;
}

/**
 * Calculate delegated governance power for a wallet
 */
async function calculateDelegatedPower(walletAddress, governanceAccounts, vsrAccounts) {
  const delegationsTo = findDelegationsTo(walletAddress, governanceAccounts);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegationsTo) {
    // Calculate the delegator's native power
    const delegatorNativePower = calculateNativePower(delegation.owner, vsrAccounts);
    totalDelegatedPower += delegatorNativePower;
    
    console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorNativePower.toLocaleString()} ISLAND`);
  }
  
  return totalDelegatedPower;
}

/**
 * Calculate complete governance breakdown for a citizen
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    // Load required data
    const [governanceAccounts, vsrAccounts] = await Promise.all([
      loadGovernanceAccounts(),
      loadVSRAccounts()
    ]);
    
    // Calculate native power (from own VSR accounts)
    const nativePower = calculateNativePower(walletAddress, vsrAccounts);
    
    // Calculate delegated power (from others delegating to this wallet)
    const delegatedPower = await calculateDelegatedPower(walletAddress, governanceAccounts, vsrAccounts);
    
    const totalPower = nativePower + delegatedPower;
    
    console.log(`  Native Power: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated Power: ${delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total Power: ${totalPower.toLocaleString()} ISLAND`);
    
    return {
      nativePower,
      delegatedPower,
      totalPower
    };
    
  } catch (error) {
    console.error(`Error calculating governance breakdown for ${walletAddress}:`, error);
    return {
      nativePower: 0,
      delegatedPower: 0,
      totalPower: 0
    };
  }
}

/**
 * Update all citizens with proper native/delegated governance breakdown
 */
async function updateAllCitizensNativeDelegatedBreakdown() {
  try {
    console.log('🔄 Starting native/delegated governance power breakdown...');
    
    const citizens = await getAllCitizens();
    console.log(`📊 Processing ${citizens.length} citizens for governance breakdown`);
    
    let processed = 0;
    let withGovernancePower = 0;
    
    for (const citizen of citizens) {
      const breakdown = await calculateGovernanceBreakdown(citizen.wallet);
      
      if (breakdown.totalPower > 0) {
        await updateGovernancePowerBreakdown(
          citizen.wallet,
          breakdown.nativePower,
          breakdown.delegatedPower
        );
        withGovernancePower++;
      }
      
      processed++;
      
      if (processed % 5 === 0) {
        console.log(`📊 Processed ${processed}/${citizens.length} citizens`);
      }
    }
    
    console.log('✅ Native/delegated breakdown completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens with governance power: ${withGovernancePower}`);
    
    return {
      processed,
      withGovernancePower
    };
    
  } catch (error) {
    console.error('❌ Error in native/delegated breakdown:', error);
    throw error;
  }
}

/**
 * Test governance breakdown for specific wallet
 */
async function testGovernanceBreakdown(walletAddress = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG') {
  console.log('🧪 Testing governance breakdown calculation...');
  const breakdown = await calculateGovernanceBreakdown(walletAddress);
  console.log('Test completed:', breakdown);
  return breakdown;
}

module.exports = {
  calculateGovernanceBreakdown,
  updateAllCitizensNativeDelegatedBreakdown,
  testGovernanceBreakdown
};

// Run test when called directly
if (require.main === module) {
  testGovernanceBreakdown().catch(console.error);
}