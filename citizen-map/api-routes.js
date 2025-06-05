/**
 * API Routes for Citizen Map
 * 
 * Centralizes all API endpoints for better organization and direct database access
 */

import db from '../db.js';

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
  } finally {
    // For new citizens, immediately calculate governance power after pin placement
    if (!isUpdate && citizenId) {
      try {
        console.log(`🔄 Calculating governance power for new citizen: ${data.wallet}`);
        
        // Calculate governance power from VSR blockchain
        const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${data.wallet}`);
        const governanceData = await response.json();
        
        if (response.ok && governanceData.totalGovernancePower !== undefined) {
          // Update citizen with governance power using new connection
          const updateClient = await db.pool.connect();
          try {
            await updateClient.query(`
              UPDATE citizens 
              SET 
                native_governance_power = $1,
                delegated_governance_power = $2,
                total_governance_power = $3,
                updated_at = NOW()
              WHERE id = $4
            `, [
              governanceData.nativeGovernancePower || 0,
              governanceData.delegatedGovernancePower || 0,
              governanceData.totalGovernancePower || 0,
              citizenId
            ]);
            
            console.log(`✅ Governance power calculated: ${(governanceData.totalGovernancePower || 0).toLocaleString()} ISLAND`);
          } finally {
            updateClient.release();
          }
        }
      } catch (govError) {
        console.error(`⚠️ Failed to calculate governance power for ${data.wallet}:`, govError.message);
      }
    }
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
      // Get all citizens including governance power breakdown
      const citizens = await client.query(`
        SELECT c.id, c.wallet, c.lat, c.lng, c.primary_nft, c.pfp_nft, c.message, c.created_at,
               c.nickname, c.bio, c.twitter_handle, c.telegram_handle, c.discord_handle, 
               c.native_governance_power, c.delegated_governance_power, c.total_governance_power
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
          native_governance_power: citizen.native_governance_power || 0,
          delegated_governance_power: citizen.delegated_governance_power || 0,
          total_governance_power: citizen.total_governance_power || 0,
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
 * Sync governance power for all citizens
 */
async function syncGovernancePower() {
  try {
    console.log('Starting governance power sync from VSR blockchain...');
    const result = await governanceCalculator.updateAllCitizensGovernancePower();
    return result;
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
    const stats = await governanceCalculator.getGovernanceStatistics();
    return { success: true, stats };
  } catch (error) {
    console.error('Error getting governance stats:', error);
    return { error: error.message };
  }
}

export default {
  getWalletNfts,
  saveCitizenPin,
  getAllCitizens,
  clearAllCitizens,
  syncGovernancePower,
  getGovernanceStats
};