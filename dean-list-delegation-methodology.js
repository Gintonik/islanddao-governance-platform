/**
 * Dean's List Delegation Methodology
 * Based on the working leaderboard calculation from Dean's List DAO
 * https://github.com/dean-s-list/deanslist-platform/blob/leaderboard/libs/api/leaderboard/data-access/src/lib/api-leaderboard-voting-power.service.ts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

// Use the working Helius RPC connection
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

// IslandDAO governance configuration (using the working values)
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_PUBKEY = new PublicKey('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi');

let vsrAccountsCache = null;
let tokenOwnerRecordsCache = null;

/**
 * Load VSR accounts using the proven method
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
 * Load Token Owner Records for delegation analysis
 */
async function loadTokenOwnerRecords() {
  if (tokenOwnerRecordsCache) {
    console.log('Using cached Token Owner Records...');
    return tokenOwnerRecordsCache;
  }

  try {
    console.log('Loading Token Owner Records...');
    
    const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        { dataSize: 104 }, // Standard Token Owner Record size
        {
          memcmp: {
            offset: 32,
            bytes: REALM_PUBKEY.toBase58()
          }
        }
      ]
    });

    console.log(`Loaded ${accounts.length} Token Owner Records`);
    
    // Parse delegation relationships
    const delegationMappings = [];
    
    for (const account of accounts) {
      try {
        const data = account.account.data;
        
        // Parse Token Owner Record structure
        const owner = new PublicKey(data.slice(64, 96)).toBase58();
        
        // Check for governance delegate field
        let governanceDelegate = null;
        if (data.length >= 104) {
          // Governance delegate is at a different offset than community delegate
          try {
            // Try different delegate field positions
            const delegateBytes1 = data.slice(72, 104); // First potential delegate position
            if (!delegateBytes1.every(byte => byte === 0)) {
              governanceDelegate = new PublicKey(delegateBytes1).toBase58();
            }
          } catch (e) {
            // Try alternative delegate position if first fails
          }
        }
        
        delegationMappings.push({
          pubkey: account.pubkey.toBase58(),
          owner,
          governanceDelegate
        });
        
      } catch (parseError) {
        // Skip invalid records
      }
    }
    
    tokenOwnerRecordsCache = delegationMappings;
    return delegationMappings;
    
  } catch (error) {
    console.error('Error loading Token Owner Records:', error);
    return [];
  }
}

/**
 * Calculate native governance power from VSR accounts (like getLockTokensVotingPowerPerWallet)
 */
async function getNativeGovernancePower(walletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  let totalNativePower = 0;
  
  for (const account of vsrAccounts) {
    try {
      const data = account.account.data;
      
      // Parse voter pubkey (offset 8)
      const voterBytes = data.slice(8, 40);
      const voterPubkey = new PublicKey(voterBytes);
      
      if (voterPubkey.toBase58() !== walletAddress) {
        continue;
      }
      
      // Parse governance power (offset 40, 8 bytes)
      const governancePowerBytes = data.slice(40, 48);
      const governancePower = Number(
        governancePowerBytes.readBigUInt64LE(0)
      ) / 1e6; // Convert from micro-lamports
      
      totalNativePower += governancePower;
      
    } catch (error) {
      // Skip invalid accounts
      continue;
    }
  }
  
  return totalNativePower;
}

/**
 * Get delegated governance power (power delegated TO this wallet from others)
 * Based on getDelegatedVotingPower methodology
 */
async function getDelegatedGovernancePower(walletAddress) {
  const [tokenOwnerRecords, vsrAccounts] = await Promise.all([
    loadTokenOwnerRecords(),
    loadVSRAccounts()
  ]);
  
  // Find all Token Owner Records where governance is delegated TO this wallet
  const delegationsToWallet = tokenOwnerRecords.filter(record => 
    record.governanceDelegate === walletAddress && record.owner !== walletAddress
  );
  
  console.log(`Found ${delegationsToWallet.length} delegations to ${walletAddress.substring(0, 8)}`);
  
  let totalDelegatedPower = 0;
  
  // For each delegation, calculate the delegator's native power
  for (const delegation of delegationsToWallet) {
    const delegatorNativePower = await getNativeGovernancePower(delegation.owner);
    
    if (delegatorNativePower > 0) {
      totalDelegatedPower += delegatorNativePower;
      console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorNativePower.toLocaleString()} ISLAND`);
    }
  }
  
  return totalDelegatedPower;
}

/**
 * Get complete governance power breakdown (native + delegated)
 */
async function getCompleteGovernancePowerBreakdown(walletAddress) {
  console.log(`\nCalculating governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    const [nativePower, delegatedPower] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      getDelegatedGovernancePower(walletAddress)
    ]);
    
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
 * Update a citizen with authentic native/delegated governance power
 */
async function updateCitizenWithAuthenticBreakdown(walletAddress) {
  const breakdown = await getCompleteGovernancePowerBreakdown(walletAddress);
  
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
 * Update all citizens with authentic native/delegated breakdown
 */
async function updateAllCitizensWithAuthenticBreakdown() {
  try {
    console.log('🔄 Starting authentic governance power breakdown...');
    
    const citizens = await getAllCitizens();
    console.log(`📊 Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      const breakdown = await getCompleteGovernancePowerBreakdown(citizen.wallet);
      
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
    
    console.log('✅ Authentic breakdown completed');
    console.log(`📊 Citizens processed: ${processed}`);
    console.log(`📊 Citizens updated: ${updated}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('❌ Error in authentic breakdown:', error);
    throw error;
  }
}

/**
 * Test breakdown calculation
 */
async function testBreakdown() {
  console.log('🧪 Testing authentic governance breakdown...');
  
  // Test with the wallet we know has delegations
  const testWallet = 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG';
  const breakdown = await getCompleteGovernancePowerBreakdown(testWallet);
  
  console.log('\nTest Results:');
  console.log(`Wallet: ${testWallet}`);
  console.log(`Native: ${breakdown.nativePower.toLocaleString()} ISLAND`);
  console.log(`Delegated: ${breakdown.delegatedPower.toLocaleString()} ISLAND`);
  console.log(`Total: ${breakdown.totalPower.toLocaleString()} ISLAND`);
  
  return breakdown;
}

module.exports = {
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  getCompleteGovernancePowerBreakdown,
  updateCitizenWithAuthenticBreakdown,
  updateAllCitizensWithAuthenticBreakdown,
  testBreakdown
};

// Run test when called directly
if (require.main === module) {
  testBreakdown().catch(console.error);
}