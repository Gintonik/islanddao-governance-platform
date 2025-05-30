/**
 * Precise VSR Governance Power Extractor
 * Handles multiple locked deposits with different vote multipliers per citizen
 * Based on the actual governance interface showing weighted deposit calculations
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// VSR Program ID for IslandDAO
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

// Cache for VSR accounts
let cachedVSRAccounts = null;

/**
 * Load all VSR accounts for batch processing
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
 * Extract precise governance power for a wallet considering multiple deposits
 */
async function extractPreciseGovernancePower(walletAddress, vsrAccounts) {
  const walletPubkey = new PublicKey(walletAddress);
  let totalGovernancePower = 0;
  let depositsFound = [];

  for (const account of vsrAccounts) {
    const data = account.account.data;
    
    // Check if this account belongs to the wallet
    let walletFound = false;
    
    // Try different wallet position offsets
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
    
    if (walletFound) {
      // Extract deposits with multipliers
      const deposits = extractDepositsWithMultipliers(data);
      
      for (const deposit of deposits) {
        if (deposit.amount > 0 && deposit.multiplier > 0) {
          const weightedAmount = deposit.amount * deposit.multiplier;
          totalGovernancePower += weightedAmount;
          depositsFound.push({
            amount: deposit.amount,
            multiplier: deposit.multiplier,
            weighted: weightedAmount,
            lockupType: deposit.lockupType
          });
        }
      }
    }
  }

  return {
    walletAddress,
    governancePower: parseFloat(totalGovernancePower.toFixed(6)),
    deposits: depositsFound,
    totalDeposits: depositsFound.length
  };
}

/**
 * Extract individual deposits with their vote multipliers from VSR account data
 */
function extractDepositsWithMultipliers(data) {
  const deposits = [];
  
  try {
    // Look for deposit patterns in the account data
    // VSR accounts can contain multiple deposit entries
    
    for (let i = 0; i < data.length - 24; i += 8) {
      try {
        // Try to read amount as 64-bit little endian
        const amount = data.readBigUInt64LE(i);
        const amountFloat = parseFloat(amount.toString()) / 1e6;
        
        // Check if this looks like a valid deposit amount (reasonable range)
        if (amountFloat > 0.1 && amountFloat < 1e9) {
          
          // Look for multiplier information nearby
          // Multipliers are typically stored as scaled integers
          let multiplier = 1.0;
          let lockupType = 0;
          
          // Check surrounding bytes for multiplier data
          for (let j = Math.max(0, i - 16); j <= Math.min(data.length - 8, i + 16); j += 4) {
            try {
              // Read potential multiplier as 32-bit or 64-bit values
              const potentialMultiplier32 = data.readUInt32LE(j);
              const potentialMultiplier64 = data.readBigUInt64LE(j);
              
              // Check for common multiplier patterns (scaled by 1e6 or 1e9)
              const mult32_6 = potentialMultiplier32 / 1e6;
              const mult32_9 = potentialMultiplier32 / 1e9;
              const mult64_6 = Number(potentialMultiplier64) / 1e6;
              const mult64_9 = Number(potentialMultiplier64) / 1e9;
              
              // Look for multipliers in expected range (1.0 to 20.0)
              if (mult32_6 >= 1.0 && mult32_6 <= 20.0) {
                multiplier = parseFloat(mult32_6.toFixed(2));
                break;
              } else if (mult32_9 >= 1.0 && mult32_9 <= 20.0) {
                multiplier = parseFloat(mult32_9.toFixed(2));
                break;
              } else if (mult64_6 >= 1.0 && mult64_6 <= 20.0) {
                multiplier = parseFloat(mult64_6.toFixed(2));
                break;
              } else if (mult64_9 >= 1.0 && mult64_9 <= 20.0) {
                multiplier = parseFloat(mult64_9.toFixed(2));
                break;
              }
            } catch (error) {
              continue;
            }
          }
          
          // Look for lockup type indicators (0-4)
          for (let k = Math.max(0, i - 8); k <= Math.min(data.length - 1, i + 8); k++) {
            const byte = data[k];
            if (byte >= 0 && byte <= 4) {
              lockupType = byte;
              // Map lockup type to expected multiplier if we haven't found one
              if (multiplier === 1.0) {
                const expectedMultipliers = [1, 2, 5, 10, 20];
                multiplier = expectedMultipliers[byte] || 1;
              }
              break;
            }
          }
          
          // Only include deposits that look reasonable
          if (multiplier > 1.0 || amountFloat > 1000) {
            deposits.push({
              amount: amountFloat,
              multiplier: multiplier,
              lockupType: lockupType,
              position: i
            });
          }
        }
      } catch (error) {
        continue;
      }
    }
  } catch (error) {
    console.error('Error extracting deposits:', error);
  }
  
  // Remove duplicate deposits (same amount and multiplier)
  const uniqueDeposits = [];
  const seen = new Set();
  
  for (const deposit of deposits) {
    const key = `${deposit.amount.toFixed(6)}_${deposit.multiplier}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueDeposits.push(deposit);
    }
  }
  
  return uniqueDeposits;
}

/**
 * Test precise extraction with known values
 */
async function testPreciseExtraction() {
  console.log('Testing precise VSR extraction with multiple deposits...');
  
  const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const expectedTotal = 144708.20;
  
  const vsrAccounts = await loadVSRAccounts();
  const result = await extractPreciseGovernancePower(testWallet, vsrAccounts);
  
  console.log(`\nGJdRQcsy analysis:`);
  console.log(`  Total Governance Power: ${result.governancePower.toLocaleString()} ISLAND`);
  console.log(`  Expected: ${expectedTotal.toLocaleString()} ISLAND`);
  console.log(`  Deposits Found: ${result.totalDeposits}`);
  
  if (result.deposits.length > 0) {
    console.log('\n  Individual Deposits:');
    result.deposits.forEach((deposit, i) => {
      console.log(`    ${i + 1}. ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier} = ${deposit.weighted.toLocaleString()} ISLAND`);
    });
  }
  
  const accuracy = ((1 - Math.abs(result.governancePower - expectedTotal) / expectedTotal) * 100).toFixed(2);
  console.log(`  Accuracy: ${accuracy}%`);
  
  return result;
}

/**
 * Update all citizens with precise governance power calculation
 */
async function updateAllCitizensPreciseGovernance() {
  try {
    console.log('Starting precise governance power calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens...`);
    
    const vsrAccounts = await loadVSRAccounts();
    const results = [];
    const batchSize = 5;
    
    for (let i = 0; i < citizens.length; i += batchSize) {
      const batch = citizens.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(citizens.length / batchSize)}...`);
      
      for (const citizen of batch) {
        const result = await extractPreciseGovernancePower(citizen.wallet, vsrAccounts);
        
        if (result.governancePower > 0) {
          // For now, treat all power as native (we'll add delegation detection later)
          await updateGovernancePowerBreakdown(
            citizen.wallet,
            result.governancePower, // native power
            0 // delegated power (to be calculated separately)
          );
          
          console.log(`Updated ${citizen.wallet.substring(0, 8)}: ${result.governancePower.toLocaleString()} ISLAND (${result.totalDeposits} deposits)`);
        } else {
          console.log(`No governance power for ${citizen.wallet.substring(0, 8)}`);
        }
        
        results.push(result);
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
    
  } catch (error) {
    console.error('Error updating precise governance power:', error);
    throw error;
  }
}

module.exports = {
  loadVSRAccounts,
  extractPreciseGovernancePower,
  testPreciseExtraction,
  updateAllCitizensPreciseGovernance
};

// Run test if called directly
if (require.main === module) {
  testPreciseExtraction().catch(console.error);
}