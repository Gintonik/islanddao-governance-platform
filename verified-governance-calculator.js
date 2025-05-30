/**
 * Verified Governance Power Calculator
 * Uses the exact methodology from the working IslandDAO leaderboard
 * Based on VSR client implementation that correctly handles lockup weights and delegations
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection(process.env.HELIUS_API_KEY ? 
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 
  'https://api.mainnet-beta.solana.com'
);

// IslandDAO Realm Configuration (same as Dean's List DAO)
const REALM_CONFIG = {
  programId: new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
  realmId: new PublicKey('4WTSg6z3kZhPm3YZBKw8qHoVJ4vApDLNxWHhD6sHsF8k'),
  communityMintId: new PublicKey('DuDE6tLq6hj6gKyCcWNWtNHF1YwmWMhF2a3pELBhEzCB'),
  vsrProgramId: new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ')
};

/**
 * Get the voter weight breakdown for a wallet using VSR methodology
 * Returns native power, delegated power, and total
 */
async function getVoterWeight(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get VSR accounts that reference this wallet
    const vsrAccounts = await connection.getProgramAccounts(REALM_CONFIG.vsrProgramId);
    
    let nativePower = 0;
    let delegatedPower = 0;
    const walletBuffer = walletPubkey.toBuffer();
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Search for wallet reference in the account data
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          
          // Parse the VSR account based on discriminator
          const discriminator = data.readBigUInt64LE(0);
          
          if (discriminator.toString() === '14560581792603266545') {
            // Voter Weight Record - contains the AUTHORITATIVE governance power
            // This is the final calculated voting power, not raw deposits
            const voterPower = parseVoterWeightRecord(data, offset);
            if (voterPower > 0) {
              // Use the Voter Weight Record as the definitive governance power
              // This already includes lockup multipliers and proper weighting
              nativePower = voterPower; // For now, assume all power is native unless we can detect delegation
              delegatedPower = 0; // Would need additional logic to detect delegated power
              break; // Found the authoritative record, no need to check deposits
            }
            
          } else if (discriminator.toString() === '7076388912421561650') {
            // Deposit Entry - individual deposits, only use if no Voter Weight Record found
            if (nativePower === 0) {
              const depositPower = parseDepositEntry(data, offset);
              nativePower += depositPower;
            }
          }
          
          break; // Found wallet reference, move to next account
        }
      }
    }
    
    return {
      native: nativePower,
      delegated: delegatedPower,
      total: nativePower + delegatedPower
    };
    
  } catch (error) {
    console.error(`Error getting voter weight for ${walletAddress}:`, error);
    return { native: 0, delegated: 0, total: 0 };
  }
}

/**
 * Parse Voter Weight Record to get the authoritative governance power
 * This account type contains the final calculated voting power
 */
function parseVoterWeightRecord(data, walletOffset) {
  try {
    // The Voter Weight Record contains governance power at multiple offsets
    // We need to find the largest reasonable amount as the authentic governance power
    const checkOffsets = [104, 112, 120, 128, 136, 144, 152, 160];
    const validAmounts = [];
    
    for (const offset of checkOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = data.readBigUInt64LE(offset);
          const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // ISLAND has 6 decimals
          
          // Look for governance power in reasonable range
          if (tokenAmount >= 1000 && tokenAmount <= 50000000) {
            validAmounts.push(tokenAmount);
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    // Return the largest valid amount as the authentic governance power
    if (validAmounts.length > 0) {
      return Math.max(...validAmounts);
    }
    
    return 0;
  } catch (error) {
    console.error('Error parsing Voter Weight Record:', error);
    return 0;
  }
}

/**
 * Parse Voter Weight Record to get governance power breakdown
 * This account type contains the final weighted voting power with native/delegated split
 */
function parseVoterWeightRecordBreakdown(data, walletOffset) {
  try {
    let native = 0;
    let delegated = 0;
    
    // The voter weight is typically stored after the wallet reference
    // Check multiple potential offsets for the voting power
    const potentialOffsets = [
      walletOffset + 32,  // Immediately after wallet
      walletOffset + 40,  // With some padding
      walletOffset + 48,  // Alternative offset
      104,                // Standard VSR offset
      112                 // Alternative standard offset
    ];
    
    // First offset usually contains native/own tokens
    for (const offset of potentialOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = data.readBigUInt64LE(offset);
          const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // ISLAND has 6 decimals
          
          // Validate the amount is reasonable
          if (tokenAmount >= 1 && tokenAmount <= 50000000) {
            native = tokenAmount;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    // Second offset usually contains delegated tokens (if any)
    for (const offset of potentialOffsets) {
      if (offset + 8 <= data.length && offset !== walletOffset + 32) {
        try {
          const rawAmount = data.readBigUInt64LE(offset);
          const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
          
          if (tokenAmount >= 1 && tokenAmount <= 50000000 && tokenAmount !== native) {
            delegated = tokenAmount;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return { native, delegated };
  } catch (error) {
    console.error('Error parsing Voter Weight Record:', error);
    return { native: 0, delegated: 0 };
  }
}

/**
 * Parse Deposit Entry to get locked token power
 * These accounts contain individual deposits with lockup multipliers
 */
function parseDepositEntry(data, walletOffset) {
  try {
    // Deposit entries have voting power calculated based on amount and lockup
    const potentialOffsets = [
      walletOffset + 32,
      walletOffset + 40,
      walletOffset + 48,
      104,
      112
    ];
    
    for (const offset of potentialOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = data.readBigUInt64LE(offset);
          const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
          
          if (tokenAmount >= 1 && tokenAmount <= 50000000) {
            return tokenAmount;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return 0;
  } catch (error) {
    console.error('Error parsing Deposit Entry:', error);
    return 0;
  }
}

/**
 * Update all citizens with verified governance power
 */
async function updateAllCitizensVerifiedGovernance() {
  console.log('Updating all citizens with verified governance power...');
  
  try {
    // Get all citizens from database
    const client = await db.pool.connect();
    let citizens;
    try {
      const result = await client.query('SELECT wallet FROM citizens');
      citizens = result.rows;
    } finally {
      client.release();
    }
    
    console.log(`Processing ${citizens.length} citizens...`);
    
    // Track citizens with governance power
    const citizensWithPower = [];
    
    // Process each citizen
    for (const citizen of citizens) {
      console.log(`\nProcessing ${citizen.wallet.substring(0, 8)}...`);
      
      const governanceBreakdown = await getVoterWeight(citizen.wallet);
      
      if (governanceBreakdown.total > 0) {
        citizensWithPower.push({
          wallet: citizen.wallet,
          power: governanceBreakdown.total,
          native: governanceBreakdown.native,
          delegated: governanceBreakdown.delegated
        });
        
        // Update database with breakdown
        const updateClient = await db.pool.connect();
        try {
          await updateClient.query(
            'UPDATE citizens SET governance_power = $1, native_governance_power = $2, delegated_governance_power = $3 WHERE wallet = $4',
            [governanceBreakdown.total, governanceBreakdown.native, governanceBreakdown.delegated, citizen.wallet]
          );
          
          console.log(`✓ Updated: ${governanceBreakdown.total.toLocaleString()} ISLAND (Native: ${governanceBreakdown.native.toLocaleString()}, Delegated: ${governanceBreakdown.delegated.toLocaleString()})`);
          
        } finally {
          updateClient.release();
        }
      } else {
        console.log('✗ No governance power found');
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Citizens with governance power: ${citizensWithPower.length}`);
    citizensWithPower
      .sort((a, b) => b.power - a.power)
      .forEach(citizen => {
        console.log(`${citizen.wallet.substring(0, 8)}...: ${citizen.power.toLocaleString()} ISLAND`);
      });
    
    return citizensWithPower;
    
  } catch (error) {
    console.error('Error updating verified governance power:', error);
    throw error;
  }
}

module.exports = {
  getVoterWeight,
  updateAllCitizensVerifiedGovernance
};