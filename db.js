// Database connection and utilities
const { Pool } = require('pg');

// Create a pool for managing database connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Initialize the database with necessary tables
 */
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create NFTs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS nfts (
        mint_id TEXT PRIMARY KEY,
        name TEXT,
        image_url TEXT,
        json_uri TEXT,
        owner TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create citizens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS citizens (
        id SERIAL PRIMARY KEY,
        wallet TEXT NOT NULL,
        lat NUMERIC NOT NULL,
        lng NUMERIC NOT NULL,
        primary_nft TEXT REFERENCES nfts(mint_id),
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create citizen_nfts junction table for many-to-many relationship
    await client.query(`
      CREATE TABLE IF NOT EXISTS citizen_nfts (
        citizen_id INTEGER REFERENCES citizens(id) ON DELETE CASCADE,
        nft_id TEXT REFERENCES nfts(mint_id),
        PRIMARY KEY (citizen_id, nft_id)
      )
    `);
    
    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all NFTs from the database
 */
async function getAllNfts() {
  try {
    const result = await pool.query('SELECT * FROM nfts ORDER BY name');
    return result.rows;
  } catch (error) {
    console.error('Error getting NFTs:', error);
    throw error;
  }
}

/**
 * Get NFTs by owner wallet address
 */
async function getNftsByOwner(ownerAddress) {
  try {
    const result = await pool.query('SELECT * FROM nfts WHERE owner = $1', [ownerAddress]);
    return result.rows;
  } catch (error) {
    console.error('Error getting NFTs by owner:', error);
    throw error;
  }
}

/**
 * Save a citizen pin to the database
 */
async function saveCitizen(data) {
  const client = await pool.connect();
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
    return citizenId;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving citizen:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all citizens with their NFTs
 */
async function getAllCitizens() {
  try {
    // Get all citizens
    const citizens = await pool.query(`
      SELECT c.id, c.wallet, c.lat, c.lng, c.primary_nft, c.message, c.created_at
      FROM citizens c
      ORDER BY c.created_at DESC
    `);
    
    const result = [];
    
    // For each citizen, get their NFTs
    for (const citizen of citizens.rows) {
      // Get related NFTs
      const nftsResult = await pool.query(`
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
          id: nft.mint_id,
          owner: nft.owner
        };
      });
      
      result.push(formattedCitizen);
    }
    
    return result;
  } catch (error) {
    console.error('Error getting citizens:', error);
    throw error;
  }
}

/**
 * Clear all citizens from the database
 */
async function clearAllCitizens() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete from junction table first
    await client.query('DELETE FROM citizen_nfts');
    
    // Then delete from citizens table
    await client.query('DELETE FROM citizens');
    
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error clearing citizens:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get wallet to NFT ownership mapping
 */
async function getNftOwnershipMap() {
  try {
    const result = await pool.query('SELECT mint_id, owner FROM nfts WHERE owner IS NOT NULL');
    
    // Create wallet -> NFTs mapping
    const ownershipMap = {};
    
    for (const row of result.rows) {
      if (!ownershipMap[row.owner]) {
        ownershipMap[row.owner] = [];
      }
      ownershipMap[row.owner].push(row.mint_id);
    }
    
    return ownershipMap;
  } catch (error) {
    console.error('Error getting NFT ownership map:', error);
    throw error;
  }
}

module.exports = {
  pool,
  initializeDatabase,
  getAllNfts,
  getNftsByOwner,
  saveCitizen,
  getAllCitizens,
  clearAllCitizens,
  getNftOwnershipMap
};