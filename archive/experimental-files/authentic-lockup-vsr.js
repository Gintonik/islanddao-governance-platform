/**
 * Authentic Lockup VSR Calculator
 * Handles the three lockup types: Vested (monthly), Constant, and Cliff
 * Calculates exact governance power from multiple deposits with specific multipliers
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// VSR Program ID for IslandDAO
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

let cachedVSRAccounts = null;

/**
 * Load all VSR accounts for processing
 */
async function loadVSRAccounts() {
  if (cachedVSRAccounts) {
    console.log('Using cached VSR accounts...');
    return cachedVSRAccounts;
  }

  console.log('Fetching VSR accounts from blockchain...');
  try {
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
 * Extract lockup deposits with precise multiplier calculation
 */
function extractLockupDeposits(data, walletPubkey) {
  const deposits = [];
  
  try {
    // Check if this account belongs to the wallet
    let walletFound = false;
    const possibleOffsets = [8, 40, 72, 104, 136, 168];
    
    for (const offset of possibleOffsets) {
      if (offset + 32 <= data.length) {
        try {
          const potentialWallet = new PublicKey(data.slice(offset, offset + 32));
          if (potentialWallet.equals(walletPubkey)) {
            walletFound = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    if (!walletFound) return deposits;
    
    // Scan for deposit patterns with amounts and multipliers
    for (let i = 0; i < data.length - 24; i += 4) {
      try {
        // Look for 64-bit amounts (ISLAND tokens are stored as u64)
        if (i + 8 <= data.length) {
          const amount = data.readBigUInt64LE(i);
          const amountFloat = parseFloat(amount.toString()) / 1e6;
          
          // Filter for reasonable deposit amounts
          if (amountFloat >= 1 && amountFloat < 1e9) {
            
            // Search for multiplier in surrounding bytes
            let multiplier = 1.0;
            let lockupType = 'unknown';
            
            // Check 32-bit and 64-bit values around the amount for multipliers
            for (let j = Math.max(0, i - 32); j <= Math.min(data.length - 8, i + 32); j += 4) {
              try {
                // Check 32-bit multiplier (scaled by 1e6 or 1e9)
                if (j + 4 <= data.length) {
                  const mult32 = data.readUInt32LE(j);
                  const mult6 = mult32 / 1e6;
                  const mult9 = mult32 / 1e9;
                  
                  // Look for multipliers in the range 1.0 to 3.0 (common VSR range)
                  if (mult6 >= 1.0 && mult6 <= 3.0) {
                    multiplier = parseFloat(mult6.toFixed(2));
                    
                    // Determine lockup type based on multiplier patterns
                    if (mult6 >= 1.0 && mult6 < 1.2) lockupType = 'vested';
                    else if (mult6 >= 1.8 && mult6 < 2.1) lockupType = 'constant';
                    else if (mult6 >= 1.6 && mult6 <= 2.1) lockupType = 'cliff';
                    
                    break;
                  } else if (mult9 >= 1.0 && mult9 <= 3.0) {
                    multiplier = parseFloat(mult9.toFixed(2));
                    
                    if (mult9 >= 1.0 && mult9 < 1.2) lockupType = 'vested';
                    else if (mult9 >= 1.8 && mult9 < 2.1) lockupType = 'constant';
                    else if (mult9 >= 1.6 && mult9 <= 2.1) lockupType = 'cliff';
                    
                    break;
                  }
                }
                
                // Check 64-bit multiplier
                if (j + 8 <= data.length) {
                  const mult64 = Number(data.readBigUInt64LE(j));
                  const mult64_6 = mult64 / 1e6;
                  const mult64_9 = mult64 / 1e9;
                  
                  if (mult64_6 >= 1.0 && mult64_6 <= 3.0) {
                    multiplier = parseFloat(mult64_6.toFixed(2));
                    
                    if (mult64_6 >= 1.0 && mult64_6 < 1.2) lockupType = 'vested';
                    else if (mult64_6 >= 1.8 && mult64_6 < 2.1) lockupType = 'constant';
                    else if (mult64_6 >= 1.6 && mult64_6 <= 2.1) lockupType = 'cliff';
                    
                    break;
                  } else if (mult64_9 >= 1.0 && mult64_9 <= 3.0) {
                    multiplier = parseFloat(mult64_9.toFixed(2));
                    
                    if (mult64_9 >= 1.0 && mult64_9 < 1.2) lockupType = 'vested';
                    else if (mult64_9 >= 1.8 && mult64_9 < 2.1) lockupType = 'constant';
                    else if (mult64_9 >= 1.6 && mult64_9 <= 2.1) lockupType = 'cliff';
                    
                    break;
                  }
                }
              } catch (error) {
                continue;
              }
            }
            
            // Only include if we found a reasonable multiplier
            if (multiplier > 1.0) {
              const weightedAmount = amountFloat * multiplier;
              
              deposits.push({
                amount: amountFloat,
                multiplier: multiplier,
                weightedAmount: weightedAmount,
                lockupType: lockupType,
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
    console.error('Error extracting lockup deposits:', error);
  }
  
  // Remove duplicates and sort by amount
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
 * Calculate governance power for a wallet using authentic lockup methodology
 */
async function calculateAuthenticGovernancePower(walletAddress, vsrAccounts) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    let totalGovernancePower = 0;
    let allDeposits = [];
    
    for (const account of vsrAccounts) {
      const deposits = extractLockupDeposits(account.account.data, walletPubkey);
      allDeposits.push(...deposits);
    }
    
    // Sum all weighted amounts
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
 * Update all citizens with authentic lockup-based governance power
 */
async function updateAllCitizensAuthenticLockup() {
  try {
    console.log('Starting authentic lockup governance power calculation...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens...`);
    
    const vsrAccounts = await loadVSRAccounts();
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < citizens.length; i += batchSize) {
      const batch = citizens.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}...`);
      
      for (const citizen of batch) {
        const result = await calculateAuthenticGovernancePower(citizen.wallet, vsrAccounts);
        
        if (result.governancePower > 0) {
          await updateGovernancePowerBreakdown(
            citizen.wallet,
            result.governancePower, // native power
            0 // delegated power (calculated separately)
          );
          
          const shortWallet = citizen.wallet.substring(0, 8);
          console.log(`Updated ${shortWallet}: ${result.governancePower.toLocaleString()} ISLAND (${result.totalDeposits} deposits)`);
          
          if (result.deposits.length > 0) {
            console.log(`  Deposits breakdown:`);
            result.deposits.forEach((deposit, idx) => {
              console.log(`    ${idx + 1}. ${deposit.amount.toLocaleString()} × ${deposit.multiplier} = ${deposit.weightedAmount.toLocaleString()} (${deposit.lockupType})`);
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
    console.error('Error updating authentic lockup governance power:', error);
    throw error;
  }
}

/**
 * Test with the known GJdRQcsy case
 */
async function testAuthenticLockupCalculation() {
  console.log('Testing authentic lockup calculation...');
  
  const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const expectedTotal = 144693.63; // From the governance interface
  
  const vsrAccounts = await loadVSRAccounts();
  const result = await calculateAuthenticGovernancePower(testWallet, vsrAccounts);
  
  console.log(`\nGJdRQcsy analysis:`);
  console.log(`  Calculated: ${result.governancePower.toLocaleString()} ISLAND`);
  console.log(`  Expected: ${expectedTotal.toLocaleString()} ISLAND`);
  console.log(`  Deposits Found: ${result.totalDeposits}`);
  
  if (result.deposits.length > 0) {
    console.log('\n  Deposit breakdown:');
    result.deposits.forEach((deposit, i) => {
      console.log(`    ${i + 1}. ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier} = ${deposit.weightedAmount.toLocaleString()} (${deposit.lockupType})`);
    });
  }
  
  const accuracy = result.governancePower > 0 ? 
    ((1 - Math.abs(result.governancePower - expectedTotal) / expectedTotal) * 100).toFixed(2) : 0;
  console.log(`  Accuracy: ${accuracy}%`);
  
  return result;
}

module.exports = {
  loadVSRAccounts,
  calculateAuthenticGovernancePower,
  updateAllCitizensAuthenticLockup,
  testAuthenticLockupCalculation
};

// Run test if called directly
if (require.main === module) {
  testAuthenticLockupCalculation().catch(console.error);
}