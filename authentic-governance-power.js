/**
 * Authentic Governance Power Calculator
 * Extracts real governance voting power from VSR accounts using the correct methodology
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, 'confirmed');
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// VSR account type that contains actual governance voting power
const GOVERNANCE_ACCOUNT_TYPE = '14560581792603266545';
const GOVERNANCE_OFFSETS = [104, 112]; // Offsets where governance power is stored

/**
 * Extract authentic governance power for a wallet
 */
async function extractAuthenticGovernancePower(walletAddress) {
  try {
    console.log(`Extracting authentic governance power for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    const vsrProgram = new PublicKey(VSR_PROGRAM_ID);
    const allVSRAccounts = await connection.getProgramAccounts(vsrProgram);
    
    let authenticGovernancePower = 0;
    const governanceDeposits = [];
    
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Check if this is a governance account type
      const discriminator = data.readBigUInt64LE(0).toString();
      if (discriminator !== GOVERNANCE_ACCOUNT_TYPE) {
        continue; // Skip non-governance account types
      }
      
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          
          // Extract governance power from the correct offsets
          for (const governanceOffset of GOVERNANCE_OFFSETS) {
            if (governanceOffset + 8 <= data.length) {
              try {
                const rawAmount = data.readBigUInt64LE(governanceOffset);
                const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                
                // Only accept realistic governance amounts
                if (tokenAmount >= 1 && tokenAmount <= 50000000) {
                  governanceDeposits.push({
                    amount: tokenAmount,
                    account: account.pubkey.toString(),
                    offset: governanceOffset
                  });
                  break; // Take first valid amount to avoid duplicates
                }
              } catch (error) {
                continue;
              }
            }
          }
          break; // Found wallet in this account
        }
      }
    }
    
    // Sum unique governance deposits
    if (governanceDeposits.length > 0) {
      const uniqueDeposits = new Map();
      
      for (const deposit of governanceDeposits) {
        const key = `${deposit.account}-${deposit.offset}`;
        if (!uniqueDeposits.has(key) || uniqueDeposits.get(key) < deposit.amount) {
          uniqueDeposits.set(key, deposit.amount);
        }
      }
      
      authenticGovernancePower = Array.from(uniqueDeposits.values())
        .reduce((sum, amount) => sum + amount, 0);
    }
    
    console.log(`Authentic governance power: ${authenticGovernancePower.toLocaleString()} ISLAND`);
    return authenticGovernancePower;
    
  } catch (error) {
    console.error(`Error extracting authentic governance power:`, error.message);
    return 0;
  }
}

/**
 * Update all citizens with authentic governance power
 */
async function updateAllCitizensAuthenticGovernancePower() {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('HELIUS_API_KEY required for blockchain access');
    }

    console.log('Starting authentic governance power extraction for all citizens...');
    
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
        const governancePower = await extractAuthenticGovernancePower(citizen.wallet);
        
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

    console.log(`\nAuthentic governance power extraction completed:`);
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

module.exports = {
  extractAuthenticGovernancePower,
  updateAllCitizensAuthenticGovernancePower
};

// Run if called directly
if (require.main === module) {
  updateAllCitizensAuthenticGovernancePower()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Authentic governance extraction failed:', error.message);
      process.exit(1);
    });
}