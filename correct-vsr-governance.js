/**
 * Correct VSR Governance Power Calculator
 * Accounts for different VSR account types, lockup expiration, and time-based weighting
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// VSR account type discriminators found in analysis
const VSR_ACCOUNT_TYPES = {
  TYPE_1: '7076388912421561650',   // Shorter accounts (176 bytes)
  TYPE_2: '14560581792603266545'   // Longer accounts (2728 bytes) with lockup data
};

/**
 * Calculate correct VSR governance power considering lockup status and account types
 */
async function calculateCorrectVSRGovernance(walletAddress) {
  try {
    console.log(`Calculating correct VSR governance for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    const vsrProgram = new PublicKey(VSR_PROGRAM_ID);
    const allVSRAccounts = await connection.getProgramAccounts(vsrProgram);
    
    const currentTime = Math.floor(Date.now() / 1000); // Current Unix timestamp
    const vsrDeposits = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          
          // Identify account type
          const discriminator = data.readBigUInt64LE(0).toString();
          const accountType = Object.keys(VSR_ACCOUNT_TYPES).find(key => 
            VSR_ACCOUNT_TYPES[key] === discriminator
          ) || 'UNKNOWN';
          
          // Extract deposit amounts based on account type
          let depositAmounts = [];
          let lockupExpiry = null;
          
          if (accountType === 'TYPE_1') {
            // Shorter VSR accounts - governance power at +40
            const checkOffset = offset + 40;
            if (checkOffset + 8 <= data.length) {
              try {
                const rawAmount = data.readBigUInt64LE(checkOffset);
                const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                if (tokenAmount >= 100 && tokenAmount <= 200000) {
                  depositAmounts.push(tokenAmount);
                }
              } catch (error) {
                // Skip invalid data
              }
            }
          } 
          else if (accountType === 'TYPE_2') {
            // Longer VSR accounts with lockup data
            const checkOffsets = [offset + 96, offset + 104]; // +96 and +104 from wallet
            
            for (const checkOffset of checkOffsets) {
              if (checkOffset + 8 <= data.length) {
                try {
                  const rawAmount = data.readBigUInt64LE(checkOffset);
                  const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                  if (tokenAmount >= 100 && tokenAmount <= 200000) {
                    depositAmounts.push(tokenAmount);
                    break; // Take first valid amount to avoid duplicates
                  }
                } catch (error) {
                  continue;
                }
              }
            }
            
            // Extract lockup expiry time
            const lockupOffset = offset + 64;
            if (lockupOffset + 8 <= data.length) {
              try {
                const lockupTime = data.readBigUInt64LE(lockupOffset);
                if (lockupTime > 1600000000 && lockupTime < 2100000000) {
                  lockupExpiry = Number(lockupTime);
                }
              } catch (error) {
                // No lockup data
              }
            }
          }
          
          if (depositAmounts.length > 0) {
            vsrDeposits.push({
              account: account.pubkey.toString(),
              type: accountType,
              amounts: depositAmounts,
              lockupExpiry: lockupExpiry,
              isActive: lockupExpiry ? lockupExpiry > currentTime : true
            });
          }
          
          break;
        }
      }
    }
    
    console.log(`Found ${vsrDeposits.length} VSR deposits`);
    
    // Calculate governance power based on deposit rules
    let totalGovernancePower = 0;
    
    for (const deposit of vsrDeposits) {
      const depositAmount = Math.max(...deposit.amounts); // Take highest amount per account
      
      // Apply governance rules based on account type and lockup status
      let weightedPower = 0;
      
      if (deposit.type === 'TYPE_1') {
        // Type 1 accounts: Apply standard weight
        weightedPower = depositAmount;
      } 
      else if (deposit.type === 'TYPE_2') {
        if (deposit.lockupExpiry) {
          const timeRemaining = deposit.lockupExpiry - currentTime;
          
          if (timeRemaining > 0) {
            // Active lockup: Apply time-based multiplier
            const daysRemaining = timeRemaining / (24 * 60 * 60);
            const lockupMultiplier = Math.min(1 + (daysRemaining / 365), 2); // Max 2x multiplier
            weightedPower = depositAmount * lockupMultiplier;
          } else {
            // Expired lockup: Use base amount or apply penalty
            weightedPower = depositAmount * 0.1; // 10% of base power for expired lockups
          }
        } else {
          // No lockup data: Use base amount
          weightedPower = depositAmount;
        }
      }
      
      console.log(`  ${deposit.type}: ${depositAmount.toLocaleString()} ISLAND -> ${weightedPower.toLocaleString()} governance power`);
      totalGovernancePower += weightedPower;
    }
    
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating VSR governance:`, error.message);
    return 0;
  }
}

/**
 * Update all citizens with correct VSR governance calculation
 */
async function updateAllCitizensCorrectVSR() {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY required for blockchain access');
    }

    console.log('Starting correct VSR governance calculation for all citizens...');
    
    const client = await db.pool.connect();
    let citizens;
    
    try {
      const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
      citizens = result.rows;
    } finally {
      client.release();
    }

    console.log(`Processing ${citizens.length} citizens...`);
    
    let successCount = 0;
    let totalGovernancePower = 0;

    for (const citizen of citizens) {
      try {
        const governancePower = await calculateCorrectVSRGovernance(citizen.wallet);
        
        const updateClient = await db.pool.connect();
        try {
          await updateClient.query(
            'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
            [governancePower, citizen.wallet]
          );
        } finally {
          updateClient.release();
        }
        
        if (governancePower > 0) {
          console.log(`✅ ${citizen.wallet.substring(0, 8)}: ${governancePower.toLocaleString()} ISLAND`);
        }
        
        successCount++;
        totalGovernancePower += governancePower;
        
      } catch (error) {
        console.error(`Failed to process ${citizen.wallet}:`, error.message);
      }
    }

    console.log(`\nCorrect VSR governance calculation completed:`);
    console.log(`Citizens processed: ${citizens.length}`);
    console.log(`Successful updates: ${successCount}`);
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    return {
      success: true,
      updated: successCount,
      total: citizens.length,
      totalGovernancePower
    };
    
  } catch (error) {
    console.error('Error in VSR governance calculation:', error.message);
    throw error;
  }
}

module.exports = {
  calculateCorrectVSRGovernance,
  updateAllCitizensCorrectVSR
};

// Run if called directly
if (require.main === module) {
  updateAllCitizensCorrectVSR()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('VSR calculation failed:', error.message);
      process.exit(1);
    });
}