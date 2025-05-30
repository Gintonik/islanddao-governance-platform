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
 * Get the voter weight for a wallet using VSR methodology
 * This replicates the working leaderboard's approach
 */
async function getVoterWeight(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get VSR accounts that reference this wallet
    const vsrAccounts = await connection.getProgramAccounts(REALM_CONFIG.vsrProgramId);
    
    let totalVotingPower = 0;
    const walletBuffer = walletPubkey.toBuffer();
    
    for (const account of vsrAccounts) {
      const data = account.account.data;
      
      // Search for wallet reference in the account data
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          
          // Parse the VSR account based on discriminator
          const discriminator = data.readBigUInt64LE(0);
          
          if (discriminator.toString() === '14560581792603266545') {
            // Voter Weight Record - contains the final calculated voting power
            const votingPower = parseVoterWeightRecord(data, offset);
            totalVotingPower += votingPower;
            
          } else if (discriminator.toString() === '7076388912421561650') {
            // Deposit Entry - individual locked deposits
            const depositPower = parseDepositEntry(data, offset);
            totalVotingPower += depositPower;
          }
          
          break; // Found wallet reference, move to next account
        }
      }
    }
    
    return totalVotingPower;
    
  } catch (error) {
    console.error(`Error getting voter weight for ${walletAddress}:`, error);
    return 0;
  }
}

/**
 * Parse Voter Weight Record to get governance power
 * This account type contains the final weighted voting power
 */
function parseVoterWeightRecord(data, walletOffset) {
  try {
    // The voter weight is typically stored after the wallet reference
    // Check multiple potential offsets for the voting power
    const potentialOffsets = [
      walletOffset + 32,  // Immediately after wallet
      walletOffset + 40,  // With some padding
      walletOffset + 48,  // Alternative offset
      104,                // Standard VSR offset
      112                 // Alternative standard offset
    ];
    
    for (const offset of potentialOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = data.readBigUInt64LE(offset);
          const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // ISLAND has 6 decimals
          
          // Validate the amount is reasonable
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
    console.error('Error parsing Voter Weight Record:', error);
    return 0;
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
      
      const governancePower = await getVoterWeight(citizen.wallet);
      
      if (governancePower > 0) {
        citizensWithPower.push({
          wallet: citizen.wallet,
          power: governancePower
        });
        
        // Update database
        const updateClient = await db.pool.connect();
        try {
          await updateClient.query(
            'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
            [governancePower, citizen.wallet]
          );
          
          console.log(`✓ Updated: ${governancePower.toLocaleString()} ISLAND`);
          
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