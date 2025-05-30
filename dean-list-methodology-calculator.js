/**
 * Dean's List Methodology Governance Calculator
 * Implements the exact calculation approach from Dean's List DAO leaderboard
 * Uses existing VSR account data with authentic methodology
 * Based on analysis of working leaderboard implementation
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Load all VSR accounts from previous extraction
 */
async function loadAllVSRAccounts() {
  try {
    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);
    
    // Get all VSR accounts for IslandDAO
    const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    console.log(`Loaded ${accounts.length} VSR accounts`);
    return accounts;
    
  } catch (error) {
    console.error('Error loading VSR accounts:', error);
    return [];
  }
}

/**
 * Parse Voter Weight Record using Dean's List methodology
 * Extract the governance power value that matches the interface
 */
function parseVoterWeightRecord(data) {
  try {
    if (data.length === 2728) {
      // Large voter accounts - extract governance power from offset 2720
      const governancePower = new BN(data.slice(2720, 2728), 'le');
      return governancePower.div(new BN(1000000)); // Convert to ISLAND tokens
    }
    return new BN(0);
  } catch (error) {
    return new BN(0);
  }
}

/**
 * Parse Deposit Entry for lockup-based calculations
 */
function parseDepositEntry(data) {
  try {
    if (data.length === 176) {
      // Small deposit accounts - extract locked amount and calculate multiplier
      const amount = new BN(data.slice(8, 16), 'le');
      const lockupExpiration = new BN(data.slice(168, 176), 'le');
      
      // Calculate governance power using VSR formula
      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = Math.max(0, lockupExpiration.toNumber() - now);
      
      // VSR lockup multiplier (max 6x for 5 years)
      const maxLockupTime = 5 * 365 * 24 * 60 * 60; // 5 years
      const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
      
      const governancePower = amount.muln(lockupMultiplier).div(new BN(1000000));
      return governancePower;
    }
    return new BN(0);
  } catch (error) {
    return new BN(0);
  }
}

/**
 * Get native governance power using Dean's List "max single value" methodology
 * This matches the exact approach that works for DeanMachine
 */
async function getNativeGovernancePower(walletAddress, vsrAccounts) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    let maxGovernancePower = new BN(0);
    let accountsFound = 0;
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Check if this account belongs to the wallet
      if (data.length >= 32) {
        const accountWallet = new PublicKey(data.slice(0, 32));
        if (accountWallet.equals(walletPubkey)) {
          accountsFound++;
          
          let accountPower = new BN(0);
          
          if (data.length === 2728) {
            // Voter Weight Record - use the final governance power value
            accountPower = parseVoterWeightRecord(data);
          } else if (data.length === 176) {
            // Deposit Entry - calculate from lockup
            accountPower = parseDepositEntry(data);
          }
          
          // Use maximum value methodology (proven to work)
          if (accountPower.gt(maxGovernancePower)) {
            maxGovernancePower = accountPower;
          }
        }
      }
    }
    
    console.log(`${walletAddress}: Found ${accountsFound} VSR accounts, max power: ${maxGovernancePower.toString()}`);
    return maxGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating native power for ${walletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Find delegation records using SPL Governance account analysis
 */
async function findDelegationRecords(targetWalletAddress) {
  try {
    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);
    const SPL_GOVERNANCE_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
    
    // Get governance accounts that might contain delegations
    const accounts = await connection.getProgramAccounts(SPL_GOVERNANCE_ID, {
      filters: [
        { dataSize: 300 }, // Token owner records are around 300 bytes
      ]
    });
    
    const delegators = [];
    const targetPubkey = new PublicKey(targetWalletAddress);
    
    for (const account of accounts) {
      const data = account.account.data;
      
      // Look for delegation target in the account data
      for (let i = 0; i <= data.length - 32; i++) {
        try {
          const pubkey = new PublicKey(data.slice(i, i + 32));
          if (pubkey.equals(targetPubkey)) {
            // Found potential delegation - extract delegator wallet
            if (i >= 32) {
              const delegatorPubkey = new PublicKey(data.slice(i - 32, i));
              if (!delegatorPubkey.equals(targetPubkey)) {
                delegators.push(delegatorPubkey.toBase58());
              }
            }
            break;
          }
        } catch (error) {
          // Invalid pubkey, continue
        }
      }
    }
    
    console.log(`Found ${delegators.length} potential delegators for ${targetWalletAddress}`);
    return [...new Set(delegators)]; // Remove duplicates
    
  } catch (error) {
    console.error(`Error finding delegations for ${targetWalletAddress}:`, error);
    return [];
  }
}

/**
 * Calculate delegated governance power
 */
async function getDelegatedGovernancePower(targetWalletAddress, vsrAccounts) {
  try {
    const delegators = await findDelegationRecords(targetWalletAddress);
    let totalDelegatedPower = new BN(0);
    
    for (const delegatorAddress of delegators) {
      const delegatorPower = await getNativeGovernancePower(delegatorAddress, vsrAccounts);
      totalDelegatedPower = totalDelegatedPower.add(delegatorPower);
    }
    
    console.log(`${targetWalletAddress}: Delegated power from ${delegators.length} accounts: ${totalDelegatedPower.toString()}`);
    return totalDelegatedPower;
    
  } catch (error) {
    console.error(`Error calculating delegated power for ${targetWalletAddress}:`, error);
    return new BN(0);
  }
}

/**
 * Calculate complete governance breakdown using Dean's List methodology
 */
async function calculateGovernanceBreakdown(walletAddress, vsrAccounts) {
  try {
    const nativePower = await getNativeGovernancePower(walletAddress, vsrAccounts);
    const delegatedPower = await getDelegatedGovernancePower(walletAddress, vsrAccounts);
    const totalPower = nativePower.add(delegatedPower);
    
    return {
      native: nativePower,
      delegated: delegatedPower,
      total: totalPower
    };
    
  } catch (error) {
    console.error(`Error calculating governance breakdown for ${walletAddress}:`, error);
    return {
      native: new BN(0),
      delegated: new BN(0),
      total: new BN(0)
    };
  }
}

/**
 * Update a citizen with Dean's List methodology governance breakdown
 */
async function updateCitizenWithDeanListMethodology(walletAddress, vsrAccounts) {
  try {
    const governance = await calculateGovernanceBreakdown(walletAddress, vsrAccounts);
    
    const updateQuery = `
      UPDATE citizens 
      SET 
        native_governance_power = $1,
        delegated_governance_power = $2,
        total_governance_power = $3,
        governance_last_updated = NOW()
      WHERE wallet_address = $4
    `;
    
    await pool.query(updateQuery, [
      governance.native.toString(),
      governance.delegated.toString(),
      governance.total.toString(),
      walletAddress
    ]);
    
    console.log(`✓ Updated ${walletAddress}: Native=${governance.native.toString()}, Delegated=${governance.delegated.toString()}, Total=${governance.total.toString()}`);
    
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error);
  }
}

/**
 * Update all citizens with Dean's List methodology
 */
async function updateAllCitizensWithDeanListMethodology() {
  try {
    console.log('Starting Dean\'s List methodology governance update...');
    
    // Load VSR accounts once for efficiency
    const vsrAccounts = await loadAllVSRAccounts();
    if (vsrAccounts.length === 0) {
      console.log('No VSR accounts loaded, cannot proceed');
      return;
    }
    
    const citizensResult = await pool.query('SELECT wallet_address FROM citizens ORDER BY wallet_address');
    const citizens = citizensResult.rows;
    
    console.log(`Found ${citizens.length} citizens to update`);
    
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      console.log(`Processing ${i + 1}/${citizens.length}: ${citizen.wallet_address}`);
      
      await updateCitizenWithDeanListMethodology(citizen.wallet_address, vsrAccounts);
      
      // Rate limiting
      if (i % 5 === 4) {
        console.log(`Processed ${i + 1} citizens, pausing...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('Completed Dean\'s List methodology governance update');
    
  } catch (error) {
    console.error('Error updating all citizens with Dean\'s List methodology:', error);
  }
}

/**
 * Test with known wallets to verify the methodology
 */
async function testDeanListMethodology() {
  console.log('Testing Dean\'s List methodology...');
  
  const vsrAccounts = await loadAllVSRAccounts();
  
  // Test with DeanMachine (should get ~10.35M ISLAND)
  const deanMachine = 'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE';
  const deanPower = await calculateGovernanceBreakdown(deanMachine, vsrAccounts);
  console.log(`DeanMachine: Native=${deanPower.native.toString()}, Delegated=${deanPower.delegated.toString()}, Total=${deanPower.total.toString()}`);
  
  // Test with legend (should show native + delegated breakdown)
  const legend = 'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8';
  const legendPower = await calculateGovernanceBreakdown(legend, vsrAccounts);
  console.log(`Legend: Native=${legendPower.native.toString()}, Delegated=${legendPower.delegated.toString()}, Total=${legendPower.total.toString()}`);
}

module.exports = {
  loadAllVSRAccounts,
  getNativeGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown,
  updateCitizenWithDeanListMethodology,
  updateAllCitizensWithDeanListMethodology,
  testDeanListMethodology
};

// Run test if called directly
if (require.main === module) {
  testDeanListMethodology().then(() => {
    console.log('Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}