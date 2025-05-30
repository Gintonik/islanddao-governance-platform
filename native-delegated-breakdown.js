/**
 * Native vs Delegated Governance Power Breakdown
 * Uses proven VSR extraction + delegation detection for accurate card display
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// IslandDAO governance constants
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Import the proven VSR extraction function
 */
const { extractGovernancePowerEfficient } = require('./efficient-vsr-extractor.js');

/**
 * Find wallets that have delegated their governance power TO a target wallet
 */
async function findDelegators(targetWalletAddress) {
  try {
    const targetPubkey = new PublicKey(targetWalletAddress);
    
    // Find Token Owner Records where governance_delegate equals the target wallet
    const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        { dataSize: 150 }, // Token Owner Record size
        {
          memcmp: {
            offset: 82, // governance_delegate field
            bytes: targetPubkey.toBase58()
          }
        }
      ]
    });

    // Extract the governing token owners (delegators)
    const delegators = [];
    for (const account of accounts) {
      try {
        const data = account.account.data;
        const governingTokenOwner = new PublicKey(data.slice(50, 82));
        const delegatorWallet = governingTokenOwner.toBase58();
        
        // Don't include self-delegation
        if (delegatorWallet !== targetWalletAddress) {
          delegators.push(delegatorWallet);
        }
      } catch (error) {
        // Skip invalid records
      }
    }

    return delegators;
  } catch (error) {
    console.error(`Error finding delegators for ${targetWalletAddress}:`, error);
    return [];
  }
}

/**
 * Calculate native and delegated governance power breakdown
 */
async function calculateNativeDelegatedBreakdown(walletAddress, vsrAccounts) {
  try {
    // Get native power using proven VSR extraction
    const nativeResult = await extractGovernancePowerFromCache(walletAddress, vsrAccounts);
    const nativePower = nativeResult.votingPower || 0;
    
    // Find delegators and sum their governance power
    const delegators = await findDelegators(walletAddress);
    let delegatedPower = 0;
    
    if (delegators.length > 0) {
      console.log(`  Found ${delegators.length} delegators for ${walletAddress.substring(0, 8)}`);
      
      for (const delegatorWallet of delegators) {
        const delegatorResult = await extractGovernancePowerFromCache(delegatorWallet, vsrAccounts);
        delegatedPower += delegatorResult.votingPower || 0;
      }
    }
    
    return {
      walletAddress,
      nativePower: parseFloat(nativePower.toFixed(6)),
      delegatedPower: parseFloat(delegatedPower.toFixed(6)),
      totalPower: parseFloat((nativePower + delegatedPower).toFixed(6)),
      delegators: delegators.length
    };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return {
      walletAddress,
      nativePower: 0,
      delegatedPower: 0,
      totalPower: 0,
      error: error.message
    };
  }
}

/**
 * Update a citizen with native/delegated breakdown
 */
async function updateCitizenBreakdown(walletAddress, vsrAccounts) {
  const breakdown = await calculateNativeDelegatedBreakdown(walletAddress, vsrAccounts);
  
  // Update database with breakdown
  await updateGovernancePowerBreakdown(
    walletAddress,
    breakdown.nativePower,
    breakdown.delegatedPower
  );
  
  if (breakdown.totalPower > 0) {
    const nativeStr = breakdown.nativePower.toLocaleString();
    const delegatedStr = breakdown.delegatedPower.toLocaleString();
    const totalStr = breakdown.totalPower.toLocaleString();
    console.log(`Updated ${walletAddress.substring(0, 8)}: ${nativeStr} native + ${delegatedStr} delegated = ${totalStr} ISLAND`);
  } else {
    console.log(`No governance power for ${walletAddress.substring(0, 8)}`);
  }
  
  return breakdown;
}

/**
 * Update all citizens with native/delegated breakdown
 */
async function updateAllCitizensNativeDelegatedBreakdown() {
  try {
    console.log('Starting native/delegated governance breakdown for all citizens...');
    
    // Load citizens and VSR accounts
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens...`);
    
    // Load VSR accounts using the proven method
    const { getCachedVSRAccounts } = require('./efficient-vsr-extractor.js');
    const vsrAccounts = await getCachedVSRAccounts();
    
    const results = [];
    const batchSize = 3; // Smaller batches to handle delegation queries
    
    for (let i = 0; i < citizens.length; i += batchSize) {
      const batch = citizens.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}...`);
      
      const batchPromises = batch.map(citizen => 
        updateCitizenBreakdown(citizen.wallet, vsrAccounts)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Delay between batches for RPC stability
      if (i + batchSize < citizens.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Summary
    const successful = results.filter(r => r.totalPower > 0);
    const withDelegation = results.filter(r => r.delegatedPower > 0);
    
    console.log('\n=== BREAKDOWN SUMMARY ===');
    console.log(`Total citizens: ${results.length}`);
    console.log(`Citizens with governance power: ${successful.length}`);
    console.log(`Citizens with delegated power: ${withDelegation.length}`);
    
    if (withDelegation.length > 0) {
      console.log('\nCitizens with delegated power:');
      withDelegation.forEach(citizen => {
        const wallet = citizen.walletAddress.substring(0, 8);
        const native = citizen.nativePower.toLocaleString();
        const delegated = citizen.delegatedPower.toLocaleString();
        console.log(`  ${wallet}: ${native} native + ${delegated} delegated`);
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('Error updating native/delegated breakdown:', error);
    throw error;
  }
}

/**
 * Test specific citizens for native/delegated breakdown
 */
async function testBreakdown() {
  console.log('Testing native/delegated breakdown...');
  
  const testWallets = [
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', // Should have native power
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',   // KO3 - might have delegated
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // DeanMachine
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG'  // legend - known delegation case
  ];
  
  const { getCachedVSRAccounts } = require('./efficient-vsr-extractor.js');
  const vsrAccounts = await getCachedVSRAccounts();
  
  for (const wallet of testWallets) {
    console.log(`\nTesting ${wallet.substring(0, 8)}...`);
    const breakdown = await calculateNativeDelegatedBreakdown(wallet, vsrAccounts);
    console.log(`  Native: ${breakdown.nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${breakdown.delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${breakdown.totalPower.toLocaleString()} ISLAND`);
    console.log(`  Delegators: ${breakdown.delegators}`);
  }
}

module.exports = {
  calculateNativeDelegatedBreakdown,
  updateCitizenBreakdown,
  updateAllCitizensNativeDelegatedBreakdown,
  testBreakdown
};

// Run test if called directly
if (require.main === module) {
  testBreakdown().catch(console.error);
}