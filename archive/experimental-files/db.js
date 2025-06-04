// Database connection and utilities
import pkg from 'pg';
const { Pool } = pkg;

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
    
    // Create citizens table with enhanced profile fields
    await client.query(`
      CREATE TABLE IF NOT EXISTS citizens (
        id SERIAL PRIMARY KEY,
        wallet TEXT NOT NULL,
        lat NUMERIC NOT NULL,
        lng NUMERIC NOT NULL,
        primary_nft TEXT REFERENCES nfts(mint_id),
        pfp_nft TEXT REFERENCES nfts(mint_id),
        message TEXT,
        nickname VARCHAR(32),
        bio VARCHAR(280),
        twitter_handle VARCHAR(255),
        telegram_handle VARCHAR(255),
        discord_handle VARCHAR(255),
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to existing table if they don't exist
    await client.query(`
      ALTER TABLE citizens 
      ADD COLUMN IF NOT EXISTS nickname VARCHAR(32),
      ADD COLUMN IF NOT EXISTS bio VARCHAR(280),
      ADD COLUMN IF NOT EXISTS twitter_handle VARCHAR(255),
      ADD COLUMN IF NOT EXISTS telegram_handle VARCHAR(255),
      ADD COLUMN IF NOT EXISTS discord_handle VARCHAR(255),
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS governance_power DECIMAL(20, 6) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS native_power DECIMAL(20, 6) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delegated_power DECIMAL(20, 6) DEFAULT 0
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
    
    // Check if wallet already has a pin
    const existingResult = await client.query(
      'SELECT id FROM citizens WHERE wallet = $1',
      [data.wallet]
    );
    
    let citizenId;
    
    if (existingResult.rows.length > 0) {
      // Update existing citizen
      citizenId = existingResult.rows[0].id;
      await client.query(
        `UPDATE citizens SET lat = $1, lng = $2, primary_nft = $3, message = $4, pfp_nft = $5, image_url = $6, 
         twitter_handle = $7, telegram_handle = $8, discord_handle = $9, nickname = $10, bio = $11
         WHERE wallet = $12`,
        [
          data.location[0],
          data.location[1],
          data.primaryNft,
          data.message || null,
          data.pfp || null,
          data.pfpImageUrl || null,
          data.socials?.twitter || null,
          data.socials?.telegram || null,
          data.socials?.discord || null,
          data.nickname || null,
          data.bio || null,
          data.wallet
        ]
      );
      
      // Clear existing NFTs
      await client.query('DELETE FROM citizen_nfts WHERE citizen_id = $1', [citizenId]);
    } else {
      // Insert new citizen
      const citizenResult = await client.query(
        `INSERT INTO citizens (wallet, lat, lng, primary_nft, message, pfp_nft, image_url, twitter_handle, telegram_handle, discord_handle, nickname, bio)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          data.wallet,
          data.location[0],
          data.location[1],
          data.primaryNft,
          data.message || null,
          data.pfp || null,
          data.pfpImageUrl || null,
          data.socials?.twitter || null,
          data.socials?.telegram || null,
          data.socials?.discord || null,
          data.nickname || null,
          data.bio || null
        ]
      );
      citizenId = citizenResult.rows[0].id;
    }
    
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
      SELECT c.id, c.wallet, c.lat, c.lng, c.primary_nft, c.message, c.created_at,
             c.nickname, c.bio, c.twitter_handle, c.telegram_handle, c.discord_handle, c.governance_power
      FROM citizens c
      ORDER BY c.created_at DESC
    `);
    
    console.log('Raw citizen data from database:', citizens.rows.map(c => ({
      wallet: c.wallet,
      nickname: c.nickname,
      bio: c.bio
    })));
    
    const result = [];
    
    // For each citizen, get their NFTs
    for (const citizen of citizens.rows) {
      // Get ALL NFTs owned by this wallet address (complete PERKS collection)
      const nftsResult = await pool.query(`
        SELECT n.*
        FROM nfts n
        WHERE n.owner = $1
        ORDER BY n.name
      `, [citizen.wallet]);
      
      // Format for app consumption
      const formattedCitizen = {
        id: citizen.id,
        wallet: citizen.wallet,
        location: [parseFloat(citizen.lat), parseFloat(citizen.lng)],
        primaryNft: citizen.primary_nft,
        message: citizen.message,
        nickname: citizen.nickname,
        bio: citizen.bio,
        nfts: nftsResult.rows.map(n => n.mint_id),
        timestamp: citizen.created_at,
        twitter_handle: citizen.twitter_handle,
        telegram_handle: citizen.telegram_handle,
        discord_handle: citizen.discord_handle,
        governance_power: citizen.governance_power || 0,
        nftMetadata: {}
      };
      
      console.log('Formatted citizen with socials:', {
        wallet: formattedCitizen.wallet,
        nickname: formattedCitizen.nickname,
        bio: formattedCitizen.bio,
        location: formattedCitizen.location,
        twitter: formattedCitizen.twitter_handle,
        telegram: formattedCitizen.telegram_handle,
        discord: formattedCitizen.discord_handle
      });
      
      // Ensure social media data is preserved in the output
      if (!formattedCitizen.twitter_handle && citizen.twitter_handle) {
        formattedCitizen.twitter_handle = citizen.twitter_handle;
      }
      if (!formattedCitizen.telegram_handle && citizen.telegram_handle) {
        formattedCitizen.telegram_handle = citizen.telegram_handle;
      }
      if (!formattedCitizen.discord_handle && citizen.discord_handle) {
        formattedCitizen.discord_handle = citizen.discord_handle;
      }
      
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

/**
 * Remove a specific citizen by wallet address
 */
async function removeCitizenByWallet(walletAddress) {
  const client = await pool.connect();
  try {
    // First get the citizen ID
    const citizenResult = await client.query('SELECT id FROM citizens WHERE wallet = $1', [walletAddress]);
    
    if (citizenResult.rows.length === 0) {
      console.log(`No citizen found with wallet: ${walletAddress}`);
      return { success: false, message: 'Citizen not found' };
    }
    
    const citizenId = citizenResult.rows[0].id;
    
    // Delete from junction table first
    await client.query('DELETE FROM citizen_nfts WHERE citizen_id = $1', [citizenId]);
    
    // Delete the citizen
    await client.query('DELETE FROM citizens WHERE id = $1', [citizenId]);
    
    console.log(`Removed citizen with wallet: ${walletAddress}`);
    return { success: true, message: 'Citizen removed successfully' };
  } catch (error) {
    console.error('Error removing citizen:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update governance power for a specific citizen
 */
async function updateGovernancePower(walletAddress, governancePower) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE citizens SET governance_power = $1 WHERE wallet = $2 RETURNING *',
      [governancePower, walletAddress]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update native and delegated governance power for a specific citizen
 */
async function updateGovernancePowerBreakdown(walletAddress, nativePower, delegatedPower) {
  const client = await pool.connect();
  try {
    const totalPower = parseFloat(nativePower) + parseFloat(delegatedPower);
    const result = await client.query(
      'UPDATE citizens SET native_power = $1, delegated_power = $2, governance_power = $3 WHERE wallet = $4 RETURNING *',
      [nativePower, delegatedPower, totalPower, walletAddress]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export default {
  pool,
  initializeDatabase,
  getAllNfts,
  getNftsByOwner,
  saveCitizen,
  getAllCitizens,
  clearAllCitizens,
  removeCitizenByWallet,
  getNftOwnershipMap,
  updateGovernancePower,
  updateGovernancePowerBreakdown
};