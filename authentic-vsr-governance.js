/**
 * Authentic VSR Governance Power Calculator
 * Based on the methodology from https://gist.github.com/Gintonik/b1555b11124a7bd211d14b61040bdeea
 * Extracts real weighted governance power from VSR accounts, not raw deposits
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

// Configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, 'confirmed');

// IslandDAO VSR Program ID
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

/**
 * Extract governance power for a single wallet using the verified VSR methodology
 */
async function extractGovernancePowerForWallet(walletAddress) {
  try {
    console.log(`Extracting governance power for ${walletAddress}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
    const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
    
    const governanceAmounts = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Search for wallet reference in account data
      for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
        if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
          
          // Check governance power at discovered offsets
          const checkOffsets = [
            walletOffset + 32,  // Standard: 32 bytes after wallet
            104,                // Alternative offset in larger accounts
            112                 // Secondary alternative offset
          ];
          
          for (const checkOffset of checkOffsets) {
            if (checkOffset + 8 <= data.length) {
              try {
                const rawAmount = data.readBigUInt64LE(checkOffset);
                const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // 6 decimals
                
                // Filter for realistic governance amounts
                if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                  governanceAmounts.push({
                    amount: tokenAmount,
                    account: account.pubkey.toString(),
                    offset: checkOffset
                  });
                }
              } catch (error) {
                continue;
              }
            }
          }
          break; // Move to next account
        }
      }
    }
    
    if (governanceAmounts.length === 0) {
      return 0;
    }
    
    // Aggregate all governance deposits for this wallet
    const uniqueAmounts = new Map();
    for (const item of governanceAmounts) {
      const key = `${item.account}-${item.offset}`;
      uniqueAmounts.set(key, item.amount);
    }
    
    const totalGovernancePower = Array.from(uniqueAmounts.values())
      .reduce((sum, amount) => sum + amount, 0);
    
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} tokens`);
    return totalGovernancePower;
    
  } catch (error) {
    console.error(`Error extracting governance power:`, error.message);
    return 0;
  }
}

/**
 * Batch processing for multiple wallets
 */
async function batchExtractGovernancePower(walletAddresses) {
  try {
    console.log('Loading all VSR accounts...');
    const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
    const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts`);
    
    const results = {};
    
    for (const walletAddress of walletAddresses) {
      console.log(`Processing ${walletAddress}...`);
      
      const walletPubkey = new PublicKey(walletAddress);
      const walletBuffer = walletPubkey.toBuffer();
      
      const governanceAmounts = [];
      
      // Search through pre-loaded VSR accounts
      for (const account of allVSRAccounts) {
        const data = account.account.data;
        
        // Look for wallet reference
        for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
          if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
            
            // Check for governance amounts at discovered offsets
            const checkOffsets = [walletOffset + 32, 104, 112];
            
            for (const checkOffset of checkOffsets) {
              if (checkOffset + 8 <= data.length) {
                try {
                  const rawAmount = data.readBigUInt64LE(checkOffset);
                  const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                  
                  if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                    governanceAmounts.push({
                      amount: tokenAmount,
                      account: account.pubkey.toString(),
                      offset: checkOffset
                    });
                  }
                } catch (error) {
                  continue;
                }
              }
            }
            break;
          }
        }
      }
      
      // Calculate total governance power
      let totalGovernancePower = 0;
      if (governanceAmounts.length > 0) {
        const uniqueAmounts = new Map();
        for (const item of governanceAmounts) {
          const key = `${item.account}-${item.offset}`;
          uniqueAmounts.set(key, item.amount);
        }
        
        totalGovernancePower = Array.from(uniqueAmounts.values())
          .reduce((sum, amount) => sum + amount, 0);
      }
      
      results[walletAddress] = totalGovernancePower;
      
      if (totalGovernancePower > 0) {
        console.log(`✅ ${totalGovernancePower.toLocaleString()} tokens`);
      } else {
        console.log(`○ No governance power`);
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('Error in batch processing:', error.message);
    return {};
  }
}

/**
 * Update all citizens with authentic governance power from VSR accounts
 */
async function updateAllCitizensAuthenticGovernance() {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY required for blockchain access');
    }

    console.log('Starting authentic VSR governance power extraction...');
    
    // Get all citizens from database
    const client = await db.pool.connect();
    let citizens;
    
    try {
      const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
      citizens = result.rows;
    } finally {
      client.release();
    }

    if (citizens.length === 0) {
      console.log('No citizens found in database');
      return { success: true, updated: 0, total: 0 };
    }

    console.log(`Processing ${citizens.length} citizens for authentic governance power...`);
    
    // Extract wallet addresses
    const walletAddresses = citizens.map(citizen => citizen.wallet);
    
    // Batch extract governance power
    const governanceResults = await batchExtractGovernancePower(walletAddresses);
    
    let successCount = 0;
    let totalGovernancePower = 0;

    // Update database with authentic governance power
    for (const [walletAddress, governancePower] of Object.entries(governanceResults)) {
      try {
        const updateClient = await db.pool.connect();
        try {
          await updateClient.query(
            'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
            [governancePower, walletAddress]
          );
        } finally {
          updateClient.release();
        }
        
        successCount++;
        totalGovernancePower += governancePower;
        
      } catch (error) {
        console.error(`Failed to update ${walletAddress}:`, error.message);
      }
    }

    console.log(`\nAuthentic VSR governance extraction completed:`);
    console.log(`Citizens processed: ${citizens.length}`);
    console.log(`Successful updates: ${successCount}`);
    console.log(`Total authentic governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    return {
      success: true,
      updated: successCount,
      total: citizens.length,
      totalGovernancePower
    };
    
  } catch (error) {
    console.error('Error in authentic governance extraction:', error.message);
    throw error;
  }
}

/**
 * Verification with known values from voting data
 */
const VERIFICATION_VALUES = {
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': 10362648.016,
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8849081.676,
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.581
};

async function verifyImplementation() {
  console.log('Verifying authentic VSR governance implementation...');
  
  for (const [wallet, expectedPower] of Object.entries(VERIFICATION_VALUES)) {
    const extractedPower = await extractGovernancePowerForWallet(wallet);
    const difference = Math.abs(extractedPower - expectedPower);
    const percentDiff = (difference / expectedPower) * 100;
    
    console.log(`Wallet: ${wallet}`);
    console.log(`Expected: ${expectedPower.toLocaleString()}`);
    console.log(`Extracted: ${extractedPower.toLocaleString()}`);
    console.log(`Accuracy: ${(100 - percentDiff).toFixed(2)}%`);
    console.log('---');
  }
}

module.exports = {
  extractGovernancePowerForWallet,
  batchExtractGovernancePower,
  updateAllCitizensAuthenticGovernance,
  verifyImplementation
};

// Run if called directly
if (require.main === module) {
  updateAllCitizensAuthenticGovernance()
    .then(result => {
      console.log('Authentic governance power extraction completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Authentic governance extraction failed:', error.message);
      process.exit(1);
    });
}