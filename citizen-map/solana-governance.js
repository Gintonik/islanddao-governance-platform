/**
 * Solana Governance Integration
 * 
 * Connects to Solana blockchain via Helius RPC to fetch authentic governance power data
 * Implements VSR (Voter Stake Registry) calculations for accurate governance metrics
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// IslandDAO Governance Configuration
const GOVERNANCE_CONFIG = {
  // IslandDAO Realm
  REALM_ID: 'ByebyeMrkvMBqvZvkHXdR8hMjLpdCWUUa7gvP3WrYfpJ',
  
  // IslandDAO Community Token Mint
  COMMUNITY_TOKEN_MINT: 'isLGYoM3axHr1JrxcHc4WfBRSoQ8w5vDcgwksG8EHqP',
  
  // VSR Plugin for staking calculations
  VSR_PROGRAM_ID: 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ',
  
  // Governance Program ID (Realms)
  GOVERNANCE_PROGRAM_ID: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'
};

// Initialize Helius RPC connection
function createConnection() {
  const heliusRpcUrl = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
  return new Connection(heliusRpcUrl, 'confirmed');
}

/**
 * Extract governance power from VSR using proven method
 * Based on the working implementation from the gist
 */
async function extractGovernancePower(connection, wallet) {
  try {
    const publicKey = new PublicKey(wallet);
    
    // Search for VSR accounts containing this wallet
    const vsrAccounts = await connection.getProgramAccounts(
      new PublicKey(GOVERNANCE_CONFIG.VSR_PROGRAM_ID),
      {
        filters: [
          {
            memcmp: {
              offset: 8, // Skip discriminator
              bytes: wallet,
            },
          },
        ],
      }
    );

    let totalGovernancePower = 0;

    // Process each VSR account
    for (const account of vsrAccounts) {
      try {
        const data = account.account.data;
        
        // Extract governance power from account data (32 bytes after wallet reference)
        // This is the proven method from your gist
        const startOffset = data.indexOf(Buffer.from(publicKey.toBytes())) + 32;
        
        if (startOffset > 32 && startOffset + 8 <= data.length) {
          const powerBuffer = data.slice(startOffset, startOffset + 8);
          const governancePower = powerBuffer.readBigUInt64LE(0);
          totalGovernancePower += Number(governancePower) / 1e6; // Convert to proper decimals
        }
      } catch (parseError) {
        console.log(`Could not parse VSR account for ${wallet}: ${parseError.message}`);
      }
    }

    return totalGovernancePower;
  } catch (error) {
    console.log(`Error extracting governance power for ${wallet}: ${error.message}`);
    return 0;
  }
}

/**
 * Get comprehensive governance power for a wallet
 */
async function getWalletGovernancePower(walletAddress) {
  try {
    console.log(`🔍 Fetching governance power for wallet: ${walletAddress}`);
    
    const connection = createConnection();
    
    // Use the proven VSR extraction method
    const governancePower = await extractGovernancePower(connection, walletAddress);
    
    console.log(`📊 Governance power for ${walletAddress}: ${governancePower.toFixed(6)}`);
    
    return {
      walletAddress,
      governancePower,
      success: true
    };
    
  } catch (error) {
    console.error(`❌ Error calculating governance power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      governancePower: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * Batch update governance power for multiple wallets
 */
async function batchUpdateGovernancePower(walletAddresses) {
  console.log(`🚀 Starting batch governance power update for ${walletAddresses.length} wallets`);
  
  const results = [];
  
  // Process wallets with rate limiting to avoid RPC limits
  for (let i = 0; i < walletAddresses.length; i++) {
    const wallet = walletAddresses[i];
    
    try {
      const result = await getWalletGovernancePower(wallet);
      results.push(result);
      
      // Rate limiting: wait between requests
      if (i < walletAddresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`Failed to process wallet ${wallet}:`, error.message);
      results.push({
        walletAddress: wallet,
        governancePower: 0,
        success: false,
        error: error.message
      });
    }
  }
  
  console.log(`✅ Completed batch update. Processed ${results.length} wallets`);
  return results;
}

/**
 * Get realm statistics
 */
async function getRealmStats() {
  try {
    const connection = createConnection();
    
    // Get realm account data
    const realmPubkey = new PublicKey(GOVERNANCE_CONFIG.REALM_ID);
    const realmAccount = await connection.getAccountInfo(realmPubkey);
    
    if (!realmAccount) {
      throw new Error('Realm account not found');
    }
    
    // Get community token supply
    const communityTokenMint = new PublicKey(GOVERNANCE_CONFIG.COMMUNITY_TOKEN_MINT);
    const mintInfo = await connection.getParsedAccountInfo(communityTokenMint);
    
    const totalSupply = mintInfo.value?.data?.parsed?.info?.supply || 0;
    const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 9;
    
    return {
      realmId: GOVERNANCE_CONFIG.REALM_ID,
      communityTokenMint: GOVERNANCE_CONFIG.COMMUNITY_TOKEN_MINT,
      totalSupply: totalSupply / Math.pow(10, decimals),
      decimals,
      success: true
    };
    
  } catch (error) {
    console.error('Error fetching realm stats:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getWalletGovernancePower,
  batchUpdateGovernancePower,
  getRealmStats,
  GOVERNANCE_CONFIG
};