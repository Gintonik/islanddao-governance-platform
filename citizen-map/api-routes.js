/**
 * API Routes for Citizen Map
 * 
 * Centralizes all API endpoints for better organization and direct database access
 */

const db = require('../db');

/**
 * Get NFTs owned by a specific wallet address
 * 
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<Array>} - Array of NFT objects with complete metadata
 */
async function getWalletNfts(walletAddress) {
  try {
    console.log(`Fetching NFTs for wallet: ${walletAddress}`);
    
    if (!walletAddress) {
      console.error('No wallet address provided');
      return { error: 'Wallet address is required' };
    }
    
    // Connect to database
    const client = await db.pool.connect();
    
    try {
      // Get all NFTs owned by this wallet
      const result = await client.query(
        'SELECT * FROM nfts WHERE owner = $1 ORDER BY name',
        [walletAddress]
      );
      
      console.log(`Found ${result.rows.length} NFTs for wallet ${walletAddress}`);
      
      // Format NFTs for frontend consumption
      const nfts = result.rows.map(nft => ({
        id: nft.mint_id,
        name: nft.name,
        image: nft.image_url,
        imageUrl: nft.image_url,
        owner: nft.owner,
        jsonUri: nft.json_uri
      }));
      
      return { success: true, nfts };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching wallet NFTs:', error);
    return { error: error.message };
  }
}

/**
 * Save a new citizen pin with their NFTs
 * 
 * @param {Object} data - Citizen pin data
 * @returns {Promise<Object>} - Result of the operation
 */
async function saveCitizenPin(data) {
  try {
    if (!data.wallet || !data.location || !data.nfts || data.nfts.length === 0) {
      return { error: 'Missing required fields' };
    }
    
    // Connect to database
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if the wallet already has a pin
      const existingCitizenResult = await client.query(
        'SELECT id FROM citizens WHERE wallet = $1',
        [data.wallet]
      );
      
      let citizenId;
      let isUpdate = false;
      
      if (existingCitizenResult.rows.length > 0) {
        // Update existing pin
        isUpdate = true;
        citizenId = existingCitizenResult.rows[0].id;
        
        // Update citizen location, primary NFT and profile image
        await client.query(
          `UPDATE citizens 
           SET lat = $1, lng = $2, primary_nft = $3, pfp_nft = $4, message = $5, 
               twitter_handle = $6, telegram_handle = $7, discord_handle = $8,
               nickname = $9, bio = $10
           WHERE id = $11`,
          [
            data.location[0],
            data.location[1],
            data.primaryNft || data.nfts[0], // Use the first NFT as primary if not specified
            data.pfp || data.primaryNft || data.nfts[0], // Use selected PFP or fall back to primary NFT
            data.message || null,
            data.socials?.twitter || data.twitter || null,
            data.socials?.telegram || data.telegram || null,
            data.socials?.discord || data.discord || null,
            data.nickname || null,
            data.bio || null,
            citizenId
          ]
        );
        
        // Remove existing NFT associations
        await client.query(
          'DELETE FROM citizen_nfts WHERE citizen_id = $1',
          [citizenId]
        );
        
        console.log(`🔄 Updated pin for wallet: ${data.wallet}`);
      } else {
        // Insert new citizen
        const citizenResult = await client.query(
          `INSERT INTO citizens (wallet, lat, lng, primary_nft, pfp_nft, message, twitter_handle, telegram_handle, discord_handle, nickname, bio)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            data.wallet,
            data.location[0],
            data.location[1],
            data.primaryNft || data.nfts[0], // Use the first NFT as primary if not specified
            data.pfp || data.primaryNft || data.nfts[0], // Use selected PFP or fall back to primary NFT
            data.message || null,
            data.socials?.twitter || data.twitter || null,
            data.socials?.telegram || data.telegram || null,
            data.socials?.discord || data.discord || null,
            data.nickname || null,
            data.bio || null
          ]
        );
        
        citizenId = citizenResult.rows[0].id;
        console.log(`📍 Added new pin for wallet: ${data.wallet}`);
      }
      
      // Insert citizen NFTs (whether new or updated)
      for (const nftId of data.nfts) {
        await client.query(
          `INSERT INTO citizen_nfts (citizen_id, nft_id)
           VALUES ($1, $2)`,
          [citizenId, nftId]
        );
      }
      
      await client.query('COMMIT');
      
      return { 
        success: true, 
        message: isUpdate ? 'Citizen pin updated successfully' : 'Citizen pin added successfully',
        citizenId,
        isUpdate 
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving citizen pin:', error);
      return { error: error.message };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in saveCitizenPin:', error);
    return { error: error.message };
  }
}

/**
 * Clear all citizen pins from the database
 * 
 * @returns {Promise<Object>} - Result of the operation
 */
async function clearAllCitizens() {
  try {
    // Connect to database
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete all citizen NFT associations first (foreign key constraint)
      await client.query('DELETE FROM citizen_nfts');
      
      // Delete all citizens
      await client.query('DELETE FROM citizens');
      
      await client.query('COMMIT');
      
      console.log('🧹 Cleared all citizen pins from the database');
      
      return { 
        success: true, 
        message: 'All citizen pins have been cleared' 
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error clearing citizen pins:', error);
      return { error: error.message };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in clearAllCitizens:', error);
    return { error: error.message };
  }
}

/**
 * Get all citizens with their NFT data
 * 
 * @returns {Promise<Array>} - List of all citizens
 */
async function getAllCitizens() {
  try {
    // Connect to database
    const client = await db.pool.connect();
    
    try {
      // Get all citizens including governance power
      const citizens = await client.query(`
        SELECT c.id, c.wallet, c.lat, c.lng, c.primary_nft, c.pfp_nft, c.message, c.created_at,
               c.nickname, c.bio, c.twitter_handle, c.telegram_handle, c.discord_handle, c.governance_power
        FROM citizens c
        ORDER BY c.created_at DESC
      `);
      
      const result = [];
      
      // For each citizen, get their NFTs
      for (const citizen of citizens.rows) {
        // Get ALL NFTs owned by this wallet address
        const nftsResult = await client.query(`
          SELECT n.*
          FROM nfts n
          WHERE n.owner = $1
          ORDER BY n.name
        `, [citizen.wallet]);
        
        // Format for app consumption
        const formattedCitizen = {
          id: citizen.id,
          wallet: citizen.wallet,
          location: [citizen.lat, citizen.lng],
          primaryNft: citizen.primary_nft,
          pfp: citizen.pfp_nft, // Include the profile image NFT
          pfp_nft: citizen.pfp_nft,
          primary_nft: citizen.primary_nft,
          message: citizen.message,
          nickname: citizen.nickname,
          bio: citizen.bio,
          twitter_handle: citizen.twitter_handle,
          telegram_handle: citizen.telegram_handle,
          discord_handle: citizen.discord_handle,
          governance_power: citizen.governance_power || 0,
          nfts: nftsResult.rows.map(n => n.mint_id),
          timestamp: citizen.created_at,
          nftMetadata: {}
        };
        
        // Add NFT metadata
        nftsResult.rows.forEach(nft => {
          formattedCitizen.nftMetadata[nft.mint_id] = {
            name: nft.name,
            image: nft.image_url,
            imageUrl: nft.image_url,
            id: nft.mint_id,
            owner: nft.owner
          };
        });
        
        result.push(formattedCitizen);
      }
      
      return result;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting all citizens:', error);
    return [];
  }
}

/**
 * Get governance power from Solana blockchain using VSR (Voter State Recorder)
 * Properly calculates weighted voting power including lockup multipliers
 */
async function getGovernancePowerFromSolana(walletAddress) {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY not configured');
    }

    const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
    
    // IslandDAO VSR program ID and realm
    const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
    const REALM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
    
    // Get all VSR accounts for this wallet (voter and deposit records)
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccounts',
        params: [
          VSR_PROGRAM_ID,
          {
            encoding: 'base64',
            filters: [
              {
                memcmp: {
                  offset: 8, // Skip discriminator, look for voter authority
                  bytes: walletAddress,
                },
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    
    if (data.error || !data.result || data.result.length === 0) {
      console.log(`No VSR account found for ${walletAddress}`);
      return 0;
    }

    let totalGovernancePower = 0;

    // Process all VSR accounts for this wallet
    for (const account of data.result) {
      try {
        const accountData = account.account.data;
        const buffer = Buffer.from(accountData[0], 'base64');
        
        // VSR account discriminator check (first 8 bytes)
        const discriminator = buffer.readBigUInt64LE(0);
        
        // Check if this is a Voter account (discriminator: 14540219962693990059)
        if (discriminator.toString() === '14540219962693990059') {
          // Voter account structure:
          // 0-8: discriminator
          // 8-40: voter_authority (32 bytes)
          // 40-72: registrar (32 bytes) 
          // 72-104: deposits (vector pointer)
          // 104-112: voter_weight (u64)
          // 112-120: voter_weight_record_bump (u8) + padding
          
          const voterWeight = buffer.readBigUInt64LE(104);
          totalGovernancePower += Number(voterWeight);
          
          console.log(`Found voter account with weight: ${Number(voterWeight)} for ${walletAddress}`);
        }
        
        // Check if this is a DepositEntry account for more detailed calculations
        else if (discriminator.toString() === '13656403871097949570') {
          // DepositEntry structure includes:
          // - lockup information
          // - amount deposited
          // - rate/multiplier
          
          // Read deposit amount (u64 at offset 40)
          const depositAmount = buffer.readBigUInt64LE(40);
          
          // Read rate (u64 at offset 48) - this includes lockup multipliers  
          const rate = buffer.readBigUInt64LE(48);
          
          // Read lockup information
          const lockupKind = buffer.readUInt8(56); // 0=none, 1=cliff, 2=constant
          const lockupStartTs = buffer.readBigUInt64LE(64);
          const lockupEndTs = buffer.readBigUInt64LE(72);
          
          // Calculate weighted power: deposit_amount * rate / 1e9 (rate precision)
          const weightedPower = (Number(depositAmount) * Number(rate)) / 1e9;
          totalGovernancePower += weightedPower;
          
          console.log(`Deposit: ${Number(depositAmount)}, Rate: ${Number(rate)}, Lockup: ${lockupKind}, Power: ${weightedPower}`);
        }
        
      } catch (parseError) {
        console.error(`Error parsing VSR account for ${walletAddress}:`, parseError.message);
      }
    }
    
    // Convert from lamports to tokens (divide by 1e6 for ISLND token decimals)
    const governancePowerInTokens = totalGovernancePower / 1000000;
    
    console.log(`Total governance power for ${walletAddress}: ${governancePowerInTokens}`);
    return governancePowerInTokens;
    
  } catch (error) {
    console.error(`Error fetching governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Sync governance power for all citizens
 */
async function syncGovernancePower() {
  try {
    console.log('🔄 Starting governance power sync...');
    
    const client = await db.pool.connect();
    
    try {
      // Get all citizens
      const citizensResult = await client.query('SELECT wallet, nickname FROM citizens');
      const citizens = citizensResult.rows;
      
      console.log(`Syncing governance power for ${citizens.length} citizens...`);
      
      let updatedCount = 0;
      
      for (const citizen of citizens) {
        try {
          const governancePower = await getGovernancePowerFromSolana(citizen.wallet);
          
          await client.query(
            'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
            [governancePower, citizen.wallet]
          );
          
          console.log(`Updated ${citizen.nickname || citizen.wallet}: ${governancePower} governance power`);
          updatedCount++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Error updating governance power for ${citizen.wallet}:`, error.message);
        }
      }
      
      console.log(`✅ Governance power sync complete. Updated ${updatedCount}/${citizens.length} citizens.`);
      
      return { 
        success: true, 
        message: `Updated governance power for ${updatedCount}/${citizens.length} citizens`,
        updatedCount,
        totalCitizens: citizens.length
      };
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error syncing governance power:', error);
    return { error: error.message };
  }
}

/**
 * Get governance statistics for the realm
 */
async function getGovernanceStats() {
  try {
    return { success: true, stats: { message: 'Governance stats endpoint ready for integration' } };
  } catch (error) {
    console.error('Error getting governance stats:', error);
    return { error: error.message };
  }
}

module.exports = {
  getWalletNfts,
  saveCitizenPin,
  getAllCitizens,
  clearAllCitizens,
  syncGovernancePower,
  getGovernanceStats
};