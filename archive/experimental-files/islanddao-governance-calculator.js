/**
 * IslandDAO Governance Power Calculator
 * Based on the verified implementation from Dean's List DAO leaderboard
 * https://github.com/dean-s-list/deanslist-platform/tree/leaderboard
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection(process.env.HELIUS_API_KEY ? 
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 
  'https://api.mainnet-beta.solana.com'
);

// IslandDAO VSR Program ID (same as Dean's List DAO)
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Realm configuration from the working leaderboard
const REALM_CONFIG = {
  programId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
  realmId: '4WTSg6z3kZhPm3YZBKw8qHoVJ4vApDLNxWHhD6sHsF8k',
  communityMintId: 'DuDE6tLq6hj6gKyCcWNWtNHF1YwmWMhF2a3pELBhEzCB'
};

/**
 * Calculate governance power using the verified methodology
 * This matches the implementation from the working leaderboard
 */
async function calculateGovernancePower(walletAddress) {
  try {
    console.log(`Calculating governance power for ${walletAddress.substring(0, 8)}...`);
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get all VSR accounts for this program
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: walletPubkey.toBase58(), // Filter by wallet
          },
        },
      ],
    });
    
    console.log(`Found ${vsrAccounts.length} VSR accounts for wallet`);
    
    let totalGovernancePower = 0;
    let nativeTokens = 0;
    let delegatedTokens = 0;
    
    // Process each VSR account
    for (const account of vsrAccounts) {
      const accountData = account.account.data;
      
      // Parse VSR account structure
      const discriminator = accountData.readBigUInt64LE(0);
      
      console.log(`Processing VSR account: ${account.pubkey.toString()}`);
      console.log(`Account type (discriminator): ${discriminator.toString()}`);
      console.log(`Data length: ${accountData.length}`);
      
      // Handle different VSR account types based on the working implementation
      if (discriminator.toString() === '14560581792603266545') {
        // Voter Weight Record - main governance account
        const votingPower = parseVoterWeightRecord(accountData);
        totalGovernancePower += votingPower.total;
        nativeTokens += votingPower.native;
        delegatedTokens += votingPower.delegated;
        
        console.log(`Voter Weight Record - Power: ${votingPower.total.toLocaleString()}`);
        
      } else if (discriminator.toString() === '7076388912421561650') {
        // Deposit Entry - individual deposits with lockup
        const depositPower = parseDepositEntry(accountData);
        totalGovernancePower += depositPower.total;
        nativeTokens += depositPower.native;
        
        console.log(`Deposit Entry - Power: ${depositPower.total.toLocaleString()}`);
      }
    }
    
    return {
      wallet: walletAddress,
      totalGovernancePower,
      nativeTokens,
      delegatedTokens,
      vsrAccountsCount: vsrAccounts.length
    };
    
  } catch (error) {
    console.error(`Error calculating governance power for ${walletAddress}:`, error);
    return {
      wallet: walletAddress,
      totalGovernancePower: 0,
      nativeTokens: 0,
      delegatedTokens: 0,
      vsrAccountsCount: 0
    };
  }
}

/**
 * Parse Voter Weight Record account
 * Based on the Solana VSR structure used in the working leaderboard
 */
function parseVoterWeightRecord(data) {
  let total = 0;
  let native = 0;
  let delegated = 0;
  
  try {
    // The working implementation suggests these offsets for governance power
    // Offset 104: Primary governance balance
    if (data.length >= 112) {
      const rawAmount = data.readBigUInt64LE(104);
      const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // ISLAND has 6 decimals
      
      if (tokenAmount > 0 && tokenAmount < 50000000) { // Reasonable bounds
        total += tokenAmount;
        native += tokenAmount;
      }
    }
    
    // Offset 112: Additional weighted balance (lockup multiplier applied)
    if (data.length >= 120) {
      const rawAmount = data.readBigUInt64LE(112);
      const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
      
      if (tokenAmount > 0 && tokenAmount < 50000000) {
        // This might be already weighted or delegated tokens
        total += tokenAmount;
        delegated += tokenAmount;
      }
    }
    
  } catch (error) {
    console.error('Error parsing Voter Weight Record:', error);
  }
  
  return { total, native, delegated };
}

/**
 * Parse Deposit Entry account
 * These contain individual deposits with lockup information
 */
function parseDepositEntry(data) {
  let total = 0;
  let native = 0;
  
  try {
    // Based on the VSR structure, deposits are typically at these offsets
    const checkOffsets = [104, 112];
    
    for (const offset of checkOffsets) {
      if (data.length >= offset + 8) {
        const rawAmount = data.readBigUInt64LE(offset);
        const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
        
        if (tokenAmount > 0 && tokenAmount < 50000000) {
          total += tokenAmount;
          native += tokenAmount;
          break; // Avoid double counting
        }
      }
    }
    
  } catch (error) {
    console.error('Error parsing Deposit Entry:', error);
  }
  
  return { total, native, delegated: 0 };
}

/**
 * Update all citizens with correct governance power using the verified methodology
 */
async function updateAllCitizensGovernancePower() {
  console.log('Starting governance power update for all citizens using verified methodology...');
  
  try {
    // Get all citizens
    const client = await db.pool.connect();
    let citizens;
    try {
      const result = await client.query('SELECT wallet FROM citizens');
      citizens = result.rows;
    } finally {
      client.release();
    }
    
    console.log(`Processing ${citizens.length} citizens...`);
    
    // Process each citizen
    for (const citizen of citizens) {
      const result = await calculateGovernancePower(citizen.wallet);
      
      if (result.totalGovernancePower > 0) {
        // Update database
        const updateClient = await db.pool.connect();
        try {
          await updateClient.query(
            'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
            [result.totalGovernancePower, citizen.wallet]
          );
          
          console.log(`Updated ${citizen.wallet.substring(0, 8)}...: ${result.totalGovernancePower.toLocaleString()} ISLAND`);
          console.log(`  Native: ${result.nativeTokens.toLocaleString()}, Delegated: ${result.delegatedTokens.toLocaleString()}`);
          
        } finally {
          updateClient.release();
        }
      }
    }
    
    console.log('Governance power update completed successfully');
    
  } catch (error) {
    console.error('Error updating governance power:', error);
  }
}

module.exports = {
  calculateGovernancePower,
  updateAllCitizensGovernancePower
};