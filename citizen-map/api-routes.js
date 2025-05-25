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
        
        // Update citizen location and primary NFT
        await client.query(
          `UPDATE citizens 
           SET lat = $1, lng = $2, primary_nft = $3, message = $4, updated_at = NOW() 
           WHERE id = $5`,
          [
            data.location[0],
            data.location[1],
            data.primaryNft || data.nfts[0], // Use the first NFT as primary if not specified
            data.message || null,
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
          `INSERT INTO citizens (wallet, lat, lng, primary_nft, message)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            data.wallet,
            data.location[0],
            data.location[1],
            data.primaryNft || data.nfts[0], // Use the first NFT as primary if not specified
            data.message || null
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
 * Get all citizens with their NFT data
 * 
 * @returns {Promise<Array>} - List of all citizens
 */
async function getAllCitizens() {
  try {
    // Connect to database
    const client = await db.pool.connect();
    
    try {
      // Get all citizens
      const citizens = await client.query(`
        SELECT c.id, c.wallet, c.lat, c.lng, c.primary_nft, c.message, c.created_at
        FROM citizens c
        ORDER BY c.created_at DESC
      `);
      
      const result = [];
      
      // For each citizen, get their NFTs
      for (const citizen of citizens.rows) {
        // Get related NFTs
        const nftsResult = await client.query(`
          SELECT n.*
          FROM nfts n
          JOIN citizen_nfts cn ON n.mint_id = cn.nft_id
          WHERE cn.citizen_id = $1
        `, [citizen.id]);
        
        // Format for app consumption
        const formattedCitizen = {
          id: citizen.id,
          wallet: citizen.wallet,
          location: [citizen.lat, citizen.lng],
          primaryNft: citizen.primary_nft,
          message: citizen.message,
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

module.exports = {
  getWalletNfts,
  saveCitizenPin,
  getAllCitizens
};