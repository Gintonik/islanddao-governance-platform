// Database utilities for Citizen Map
const db = require('../db');

/**
 * Get NFT owners from the database
 * @returns {Promise<Object>} - Map of wallet addresses to owned NFT IDs
 */
async function getNftOwners() {
  try {
    // Query the database
    const client = await db.pool.connect();
    
    try {
      // Get all NFTs with owners
      const result = await client.query(`
        SELECT mint_id, owner FROM nfts 
        WHERE owner IS NOT NULL AND owner != ''
      `);
      
      // Create wallet -> NFTs mapping
      const ownershipMap = {};
      
      for (const row of result.rows) {
        if (!ownershipMap[row.owner]) {
          ownershipMap[row.owner] = [];
        }
        ownershipMap[row.owner].push(row.mint_id);
      }
      
      return ownershipMap;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting NFT ownership data from database:', error);
    throw error;
  }
}

/**
 * Get NFT metadata for a specific NFT by mint ID
 * @param {string} mintId - The NFT mint ID
 * @returns {Promise<Object>} - NFT metadata
 */
async function getNftMetadata(mintId) {
  try {
    // Query the database
    const client = await db.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM nfts WHERE mint_id = $1
      `, [mintId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const nft = result.rows[0];
      
      return {
        name: nft.name,
        image: nft.image_url,
        imageUrl: nft.image_url, // Adding imageUrl to match expected format
        id: nft.mint_id,
        owner: nft.owner
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting NFT metadata from database:', error);
    throw error;
  }
}

/**
 * Get all citizens from the database
 * @returns {Promise<Array>} - List of citizen objects
 */
async function getCitizens() {
  try {
    // Query the database
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
            imageUrl: nft.image_url, // Adding imageUrl to match expected format in the app
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
    console.error('Error getting citizens from database:', error);
    return []; // Return empty array in case of error
  }
}

/**
 * Save a new citizen to the database
 * @param {Object} data - Citizen data
 * @returns {Promise<Object>} - Success message
 */
async function saveCitizen(data) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert citizen
    const citizenResult = await client.query(
      `INSERT INTO citizens (wallet, lat, lng, primary_nft, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        data.wallet,
        data.location[0],
        data.location[1],
        data.primaryNft,
        data.message || null
      ]
    );
    
    const citizenId = citizenResult.rows[0].id;
    
    // Insert citizen NFTs
    for (const nftId of data.nfts) {
      await client.query(
        `INSERT INTO citizen_nfts (citizen_id, nft_id)
         VALUES ($1, $2)`,
        [citizenId, nftId]
      );
    }
    
    await client.query('COMMIT');
    return { success: true, message: 'Citizen added successfully', citizenId };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving citizen:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Clear all citizens from the database
 * @returns {Promise<Object>} - Success message
 */
async function clearCitizens() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete from junction table first
    await client.query('DELETE FROM citizen_nfts');
    
    // Then delete from citizens table
    await client.query('DELETE FROM citizens');
    
    await client.query('COMMIT');
    return { success: true, message: 'All citizens cleared' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing citizens:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getNftOwners,
  getNftMetadata,
  getCitizens,
  saveCitizen,
  clearCitizens
};