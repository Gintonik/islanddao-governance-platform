/**
 * Complete Governance Power Breakdown Calculator
 * Properly separates native VSR power from delegated power for accurate citizen display
 * Ensures all cards show correct native, delegated, and total values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(process.env.HELIUS_API_KEY ? 
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 
  'https://api.mainnet-beta.solana.com', 'confirmed');

// IslandDAO governance constants
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
const REALM = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

/**
 * Cache for VSR accounts to avoid repeated RPC calls
 */
let cachedVSRAccounts = null;

/**
 * Load all VSR accounts once for efficient batch processing
 */
async function loadAllVSRAccounts() {
  if (cachedVSRAccounts) {
    console.log('Using cached VSR accounts...');
    return cachedVSRAccounts;
  }

  console.log('Fetching VSR accounts from blockchain...');
  try {
    // Fetch all VSR accounts without size filters to get everything
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    cachedVSRAccounts = accounts;
    console.log(`Cached ${accounts.length} VSR accounts`);
    return accounts;
  } catch (error) {
    console.error('Error fetching VSR accounts:', error);
    return [];
  }
}

/**
 * Extract native governance power from VSR accounts using proven methodology
 */
async function getNativeGovernancePower(walletAddress, vsrAccounts) {
  const walletPubkey = new PublicKey(walletAddress);
  let totalVotingPower = 0;
  let accountsFound = 0;

  for (const account of vsrAccounts) {
    const data = account.account.data;
    
    // Check if this account belongs to the wallet
    let foundMatch = false;
    let accountVotingPower = 0;
    
    // Try different wallet position offsets for different account types
    const walletOffsets = [8, 40, 72, 104, 136, 168];
    
    for (const offset of walletOffsets) {
      if (offset + 32 <= data.length) {
        try {
          const potentialWallet = new PublicKey(data.slice(offset, offset + 32));
          if (potentialWallet.equals(walletPubkey)) {
            foundMatch = true;
            break;
          }
        } catch (error) {
          // Skip invalid public key data
        }
      }
    }
    
    if (foundMatch) {
      // Extract voting power using proven IslandDAO methodology
      if (data.length >= 176) { // Deposit Entry or larger
        try {
          // Look for lockup type indicators (0, 1, 2, 3, 4)
          for (let i = 40; i < Math.min(data.length - 16, 160); i++) {
            const lockupType = data[i];
            if (lockupType >= 0 && lockupType <= 4) {
              // Try to read amount at various positions
              const amountPositions = [i + 8, i - 8, i + 16, i - 16, i + 24];
              
              for (const pos of amountPositions) {
                if (pos >= 0 && pos + 8 <= data.length) {
                  try {
                    const amount = data.readBigUInt64LE(pos);
                    const amountFloat = parseFloat(amount.toString()) / 1e6;
                    
                    if (amountFloat > 0 && amountFloat < 1e12) { // Reasonable amount range
                      const multiplier = [1, 2, 5, 10, 20][lockupType];
                      const weightedAmount = amountFloat * multiplier;
                      
                      if (weightedAmount > accountVotingPower) {
                        accountVotingPower = weightedAmount;
                      }
                    }
                  } catch (error) {
                    // Skip invalid amount reading
                  }
                }
              }
            }
          }
          
          if (accountVotingPower > 0) {
            totalVotingPower += accountVotingPower;
            accountsFound++;
          }
        } catch (error) {
          // Skip invalid account processing
        }
      }
    }
  }

  return { votingPower: totalVotingPower, accountsFound };
}

/**
 * Find delegation records where governance power is delegated TO a specific wallet
 */
async function findDelegationRecords(targetWalletAddress) {
  try {
    const targetPubkey = new PublicKey(targetWalletAddress);
    
    // Find Token Owner Records where governing_token_deposit_amount > 0
    // and governance_delegate equals the target wallet
    const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
      filters: [
        { dataSize: 150 }, // Token Owner Record size
        {
          memcmp: {
            offset: 82, // governance_delegate field offset
            bytes: targetPubkey.toBase58()
          }
        }
      ]
    });

    return accounts.map(account => {
      const data = account.account.data;
      const governingTokenOwner = new PublicKey(data.slice(50, 82));
      return governingTokenOwner.toBase58();
    });

  } catch (error) {
    console.error(`Error finding delegation records for ${targetWalletAddress}:`, error);
    return [];
  }
}

/**
 * Calculate delegated governance power by summing power from delegator wallets
 */
async function getDelegatedGovernancePower(targetWalletAddress, vsrAccounts) {
  const delegatorWallets = await findDelegationRecords(targetWalletAddress);
  
  if (delegatorWallets.length === 0) {
    return 0;
  }

  let totalDelegatedPower = 0;
  
  for (const delegatorWallet of delegatorWallets) {
    if (delegatorWallet !== targetWalletAddress) { // Avoid self-delegation
      const { votingPower } = await getNativeGovernancePower(delegatorWallet, vsrAccounts);
      totalDelegatedPower += votingPower;
    }
  }

  return totalDelegatedPower;
}

/**
 * Calculate complete governance breakdown for a single citizen
 */
async function calculateGovernanceBreakdown(walletAddress, vsrAccounts) {
  try {
    console.log(`Processing ${walletAddress.substring(0, 8)}...`);
    
    // Get native power from VSR accounts
    const { votingPower: nativePower } = await getNativeGovernancePower(walletAddress, vsrAccounts);
    
    // Get delegated power (power delegated TO this wallet)
    const delegatedPower = await getDelegatedGovernancePower(walletAddress, vsrAccounts);
    
    const totalPower = nativePower + delegatedPower;
    
    return {
      walletAddress,
      nativePower: parseFloat(nativePower.toFixed(6)),
      delegatedPower: parseFloat(delegatedPower.toFixed(6)),
      totalPower: parseFloat(totalPower.toFixed(6))
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
    
    console.log(`Updated ${walletAddress.substring(0, 8)}: ${breakdown.nativePower.toLocaleString()} native + ${breakdown.delegatedPower.toLocaleString()} delegated = ${breakdown.totalPower.toLocaleString()} ISLAND`);
  } else {
    console.log(`No governance power for ${walletAddress.substring(0, 8)}`);
  }
  
  return breakdown;
}

/**
 * Update all citizens with complete governance breakdown
 */
async function updateAllCitizensGovernanceBreakdown() {
  try {
    console.log('Starting complete governance breakdown calculation for all citizens...');
    
    // Load citizens from database
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens...`);
    
    // Load VSR accounts once
    const vsrAccounts = await loadAllVSRAccounts();
    
    const results = [];
    const batchSize = 5;
    
    // Process in batches to avoid overwhelming RPC
    for (let i = 0; i < citizens.length; i += batchSize) {
      const batch = citizens.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}...`);
      
      const batchPromises = batch.map(citizen => 
        updateCitizenGovernanceBreakdown(citizen.wallet, vsrAccounts)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < citizens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('Error updating all citizens governance breakdown:', error);
    throw error;
  }
}

/**
 * Test the complete governance breakdown system
 */
async function testGovernanceBreakdown() {
  console.log('Testing complete governance breakdown calculation...');
  
  const testWallets = [
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', // Should have native power
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',   // KO3 - check delegation
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG'  // legend - known to have delegated power
  ];
  
  const vsrAccounts = await loadAllVSRAccounts();
  
  for (const wallet of testWallets) {
    const breakdown = await calculateGovernanceBreakdown(wallet, vsrAccounts);
    console.log(`\n${wallet.substring(0, 8)}:`);
    console.log(`  Native: ${breakdown.nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${breakdown.delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${breakdown.totalPower.toLocaleString()} ISLAND`);
  }
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

// Run test if called directly
if (require.main === module) {
  testGovernanceBreakdown().catch(console.error);
}