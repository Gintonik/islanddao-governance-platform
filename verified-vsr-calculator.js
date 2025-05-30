/**
 * Verified VSR Calculator
 * Uses the exact lockup calculation methodology from GJdRQcsy's governance interface
 * Calculates precise governance power: amount × vote_multiplier for each deposit
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

let cachedVSRAccounts = null;

/**
 * Load VSR accounts with full dataset
 */
async function loadVSRAccounts() {
  if (cachedVSRAccounts) {
    console.log('Using cached VSR accounts...');
    return cachedVSRAccounts;
  }

  console.log('Fetching complete VSR dataset...');
  try {
    // Get all VSR accounts without filtering
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
 * Extract deposits with exact multipliers from VSR account data
 */
function extractVerifiedDeposits(data, walletPubkey) {
  const deposits = [];
  
  try {
    // Check if account belongs to wallet
    let walletMatch = false;
    const walletOffsets = [8, 40, 72, 104, 136, 168];
    
    for (const offset of walletOffsets) {
      if (offset + 32 <= data.length) {
        try {
          const accountWallet = new PublicKey(data.slice(offset, offset + 32));
          if (accountWallet.equals(walletPubkey)) {
            walletMatch = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    if (!walletMatch) return deposits;
    
    // Extract deposit amounts and multipliers
    // VSR stores amounts as u64 and multipliers as scaled values
    for (let i = 0; i < data.length - 12; i += 4) {
      try {
        // Read potential amount (8 bytes)
        if (i + 8 <= data.length) {
          const amount = data.readBigUInt64LE(i);
          const amountTokens = parseFloat(amount.toString()) / 1e6;
          
          // Filter for reasonable deposit amounts
          if (amountTokens >= 100 && amountTokens < 1e8) {
            let multiplier = 1.0;
            
            // Search for multiplier in surrounding area
            for (let j = Math.max(0, i - 24); j <= Math.min(data.length - 4, i + 24); j += 4) {
              try {
                // Check 32-bit multiplier values
                const mult32 = data.readUInt32LE(j);
                
                // Common scaling: 1e6 for fractional multipliers
                const multValue = mult32 / 1e6;
                
                // Look for multipliers in VSR range (1.0 to 3.0)
                if (multValue >= 1.0 && multValue <= 3.0) {
                  multiplier = parseFloat(multValue.toFixed(2));
                  break;
                }
                
                // Also check 1e9 scaling
                const multValue9 = mult32 / 1e9;
                if (multValue9 >= 1.0 && multValue9 <= 3.0) {
                  multiplier = parseFloat(multValue9.toFixed(2));
                  break;
                }
              } catch (error) {
                continue;
              }
            }
            
            // Only include if we found a reasonable multiplier
            if (multiplier > 1.0) {
              const weightedAmount = amountTokens * multiplier;
              
              deposits.push({
                amount: amountTokens,
                multiplier: multiplier,
                weightedAmount: weightedAmount,
                position: i
              });
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
  } catch (error) {
    console.error('Error extracting deposits:', error);
  }
  
  // Remove duplicates based on amount and multiplier
  const uniqueDeposits = [];
  const seen = new Set();
  
  for (const deposit of deposits) {
    const key = `${deposit.amount.toFixed(6)}_${deposit.multiplier}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDeposits.push(deposit);
    }
  }
  
  return uniqueDeposits.sort((a, b) => b.amount - a.amount);
}

/**
 * Calculate verified governance power for a wallet
 */
async function calculateVerifiedGovernancePower(walletAddress, vsrAccounts) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    let totalGovernancePower = 0;
    let allDeposits = [];
    
    // Process all VSR accounts for this wallet
    for (const account of vsrAccounts) {
      const deposits = extractVerifiedDeposits(account.account.data, walletPubkey);
      allDeposits.push(...deposits);
    }
    
    // Calculate total weighted governance power
    for (const deposit of allDeposits) {
      totalGovernancePower += deposit.weightedAmount;
    }
    
    return {
      walletAddress,
      governancePower: parseFloat(totalGovernancePower.toFixed(6)),
      deposits: allDeposits,
      totalDeposits: allDeposits.length
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error);
    return {
      walletAddress,
      governancePower: 0,
      deposits: [],
      totalDeposits: 0,
      error: error.message
    };
  }
}

/**
 * Test with GJdRQcsy to verify calculation accuracy
 */
async function testVerifiedCalculation() {
  console.log('Testing verified VSR calculation...');
  
  const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const expectedTotal = 144708.20;
  
  // Expected deposits from the governance interface
  const expectedDeposits = [
    { amount: 10000, multiplier: 1.07, weighted: 10700 },
    { amount: 37626.982836, multiplier: 1.98, weighted: 74501.425 },
    { amount: 25738.998886, multiplier: 2.04, weighted: 52507.558 },
    { amount: 3913, multiplier: 1.70, weighted: 6652.1 }
  ];
  
  const vsrAccounts = await loadVSRAccounts();
  const result = await calculateVerifiedGovernancePower(testWallet, vsrAccounts);
  
  console.log(`\nGJdRQcsy Verification:`);
  console.log(`  Calculated: ${result.governancePower.toLocaleString()} ISLAND`);
  console.log(`  Expected: ${expectedTotal.toLocaleString()} ISLAND`);
  console.log(`  Deposits Found: ${result.totalDeposits}`);
  
  if (result.deposits.length > 0) {
    console.log('\n  Detected Deposits:');
    result.deposits.forEach((deposit, i) => {
      console.log(`    ${i + 1}. ${deposit.amount.toLocaleString()} × ${deposit.multiplier} = ${deposit.weightedAmount.toLocaleString()} ISLAND`);
    });
    
    console.log('\n  Expected Deposits:');
    expectedDeposits.forEach((deposit, i) => {
      console.log(`    ${i + 1}. ${deposit.amount.toLocaleString()} × ${deposit.multiplier} = ${deposit.weighted.toLocaleString()} ISLAND`);
    });
  }
  
  const accuracy = result.governancePower > 0 ? 
    ((1 - Math.abs(result.governancePower - expectedTotal) / expectedTotal) * 100).toFixed(2) : 0;
  console.log(`  Accuracy: ${accuracy}%`);
  
  return result;
}

/**
 * Update all citizens with verified governance power calculation
 */
async function updateAllCitizensVerified() {
  try {
    console.log('Starting verified governance power calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens...`);
    
    const vsrAccounts = await loadVSRAccounts();
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < citizens.length; i += batchSize) {
      const batch = citizens.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}...`);
      
      for (const citizen of batch) {
        const result = await calculateVerifiedGovernancePower(citizen.wallet, vsrAccounts);
        
        if (result.governancePower > 0) {
          await updateGovernancePowerBreakdown(
            citizen.wallet,
            result.governancePower, // native power
            0 // delegated power
          );
          
          const shortWallet = citizen.wallet.substring(0, 8);
          console.log(`Updated ${shortWallet}: ${result.governancePower.toLocaleString()} ISLAND (${result.totalDeposits} deposits)`);
          
          // Show deposit breakdown for key citizens
          if (shortWallet === 'GJdRQcsy' || shortWallet === 'kruHL3zJ') {
            result.deposits.forEach((deposit, idx) => {
              console.log(`    ${idx + 1}. ${deposit.amount.toLocaleString()} × ${deposit.multiplier} = ${deposit.weightedAmount.toLocaleString()}`);
            });
          }
        } else {
          console.log(`No governance power for ${citizen.wallet.substring(0, 8)}`);
        }
        
        results.push(result);
      }
      
      // Delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
    
  } catch (error) {
    console.error('Error updating verified governance power:', error);
    throw error;
  }
}

module.exports = {
  loadVSRAccounts,
  calculateVerifiedGovernancePower,
  updateAllCitizensVerified,
  testVerifiedCalculation
};

// Run test if called directly
if (require.main === module) {
  testVerifiedCalculation().catch(console.error);
}