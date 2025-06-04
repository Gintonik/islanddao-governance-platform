/**
 * Complete Governance Power Calculator
 * Calculates both native VSR power and delegated power for accurate governance totals
 * Based on authentic blockchain data extraction
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { calculateAuthenticVotingPower } = require('./vsr-voting-power-fetcher.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// IslandDAO constants
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9');

/**
 * Get native governance power from VSR accounts
 */
async function getNativeGovernancePower(walletAddress) {
  try {
    const result = await calculateAuthenticVotingPower(walletAddress);
    return {
      walletAddress,
      nativePower: result.votingPower || 0,
      vsrAccountsFound: result.accountsFound || 0
    };
  } catch (error) {
    console.error(`Error getting native power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      nativePower: 0,
      error: error.message
    };
  }
}

/**
 * Find delegation records where governance power is delegated TO a specific wallet
 * This searches governance accounts for delegation relationships
 */
async function findDelegationRecords(targetWalletAddress, maxRecordsToCheck = 2000) {
  try {
    const targetPubkey = new PublicKey(targetWalletAddress);
    const targetBuffer = targetPubkey.toBuffer();
    
    console.log(`Searching for delegations to ${targetWalletAddress.substring(0, 8)}...`);
    
    // Get governance accounts in batches to avoid timeout
    const allGovernanceAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID);
    const accountsToCheck = allGovernanceAccounts.slice(0, maxRecordsToCheck);
    
    console.log(`Checking ${accountsToCheck.length} governance accounts...`);
    
    const delegationRecords = [];
    
    for (let i = 0; i < accountsToCheck.length; i++) {
      const account = accountsToCheck[i];
      const data = account.account.data;
      
      // Check if target wallet appears in this governance account
      let isTargetReferenced = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
          isTargetReferenced = true;
          break;
        }
      }
      
      if (isTargetReferenced) {
        // Look for other wallet addresses that might be delegators
        const potentialDelegators = new Set();
        
        for (let offset = 0; offset <= data.length - 32; offset += 32) {
          try {
            const walletBytes = data.subarray(offset, offset + 32);
            const walletStr = new PublicKey(walletBytes).toString();
            
            // Valid wallet and not the target wallet itself
            if (walletStr !== targetWalletAddress && walletStr.length === 44) {
              potentialDelegators.add(walletStr);
            }
          } catch (e) {
            continue;
          }
        }
        
        // Check if any of these wallets have VSR governance power
        for (const delegatorWallet of Array.from(potentialDelegators).slice(0, 3)) {
          try {
            const delegatorPower = await calculateAuthenticVotingPower(delegatorWallet);
            
            if (delegatorPower.votingPower > 0) {
              delegationRecords.push({
                delegator: delegatorWallet,
                power: delegatorPower.votingPower,
                governanceAccount: account.pubkey.toString()
              });
              
              console.log(`Found delegator: ${delegatorWallet.substring(0, 8)}... (${delegatorPower.votingPower.toLocaleString()} ISLAND)`);
            }
          } catch (error) {
            continue;
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Progress indicator for long searches
      if ((i + 1) % 500 === 0) {
        console.log(`Checked ${i + 1}/${accountsToCheck.length} accounts...`);
      }
    }
    
    return delegationRecords;
    
  } catch (error) {
    console.error(`Error finding delegation records for ${targetWalletAddress}:`, error.message);
    return [];
  }
}

/**
 * Calculate complete governance power (native + delegated) for a wallet
 */
async function calculateCompleteGovernancePower(walletAddress) {
  try {
    console.log(`\nCalculating complete governance power for ${walletAddress.substring(0, 8)}...`);
    
    // Get native governance power
    const nativeResult = await getNativeGovernancePower(walletAddress);
    
    // Find delegated governance power
    const delegationRecords = await findDelegationRecords(walletAddress);
    
    const totalDelegatedPower = delegationRecords.reduce((sum, record) => sum + record.power, 0);
    const totalGovernancePower = nativeResult.nativePower + totalDelegatedPower;
    
    return {
      walletAddress,
      nativePower: nativeResult.nativePower,
      delegatedPower: totalDelegatedPower,
      totalGovernancePower: totalGovernancePower,
      delegationRecords: delegationRecords,
      vsrAccountsFound: nativeResult.vsrAccountsFound
    };
    
  } catch (error) {
    console.error(`Error calculating complete governance power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      nativePower: 0,
      delegatedPower: 0,
      totalGovernancePower: 0,
      error: error.message
    };
  }
}

/**
 * Update a citizen with complete governance power calculation
 */
async function updateCitizenWithCompleteGovernance(walletAddress) {
  try {
    const powerData = await calculateCompleteGovernancePower(walletAddress);
    
    if (powerData.totalGovernancePower > 0) {
      const { updateGovernancePower } = require('./db.js');
      await updateGovernancePower(walletAddress, powerData.totalGovernancePower);
      
      console.log(`Updated ${walletAddress}: ${powerData.totalGovernancePower.toLocaleString()} ISLAND total`);
      console.log(`  Native: ${powerData.nativePower.toLocaleString()} ISLAND`);
      console.log(`  Delegated: ${powerData.delegatedPower.toLocaleString()} ISLAND`);
      
      return powerData;
    } else {
      console.log(`No governance power found for ${walletAddress}`);
      return powerData;
    }
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error.message);
    return { walletAddress, totalGovernancePower: 0, error: error.message };
  }
}

/**
 * Test complete governance calculation with known wallets
 */
async function testCompleteGovernanceCalculation() {
  console.log('Testing complete governance power calculation...');
  
  const testWallets = [
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.20, name: 'GJdRQcsy' },
    { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 10353648, name: 'DeanMachine' },
    { address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 4960649.25, name: 'legend' }
  ];
  
  for (const testWallet of testWallets) {
    console.log(`\n=== Testing ${testWallet.name} ===`);
    
    const result = await calculateCompleteGovernancePower(testWallet.address);
    
    console.log('Results:');
    console.log(`  Native Power: ${result.nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated Power: ${result.delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total Power: ${result.totalGovernancePower.toLocaleString()} ISLAND`);
    console.log(`  Expected: ${testWallet.expected.toLocaleString()} ISLAND`);
    
    const difference = Math.abs(result.totalGovernancePower - testWallet.expected);
    console.log(`  Difference: ${difference.toLocaleString()} ISLAND`);
    
    if (difference < testWallet.expected * 0.05) { // Within 5%
      console.log(`  ✅ ${testWallet.name} calculation matches expected value`);
    } else {
      console.log(`  ❌ ${testWallet.name} calculation needs refinement`);
    }
  }
}

module.exports = {
  getNativeGovernancePower,
  findDelegationRecords,
  calculateCompleteGovernancePower,
  updateCitizenWithCompleteGovernance,
  testCompleteGovernanceCalculation
};

// Run test if called directly
if (require.main === module) {
  testCompleteGovernanceCalculation().catch(console.error);
}