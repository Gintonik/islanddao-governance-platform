/**
 * Map Management System
 * Removes citizens with no NFTs and provides recovery functionality
 * Runs daily at 12:00 UTC
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";
import cron from "node-cron";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PERKS_COLLECTION = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Check if wallet has any PERKS NFTs
 */
async function hasValidNFTs(walletAddress) {
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `check-${walletAddress}`,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 100
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      const perksNFTs = data.result.items.filter(nft => {
        if (nft.grouping) {
          return nft.grouping.some(group => 
            group.group_key === 'collection' && 
            group.group_value === PERKS_COLLECTION
          );
        }
        return nft.content?.metadata?.name?.includes('PERK');
      });

      return perksNFTs.length > 0;
    }

    return false;
  } catch (error) {
    console.error(`Error checking NFTs for ${walletAddress}: ${error.message}`);
    return true; // Assume they have NFTs if we can't verify
  }
}

/**
 * Archive citizen data before removal
 */
async function archiveCitizen(citizenData) {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS citizens_archive (
        id SERIAL PRIMARY KEY,
        original_id INTEGER,
        wallet TEXT,
        lat NUMERIC,
        lng NUMERIC,
        primary_nft TEXT,
        pfp_nft TEXT,
        message TEXT,
        nickname VARCHAR(32),
        bio VARCHAR(280),
        twitter_handle VARCHAR(255),
        telegram_handle VARCHAR(255),
        discord_handle VARCHAR(255),
        image_url TEXT,
        governance_power DECIMAL(20, 6),
        native_power DECIMAL(20, 6),
        delegated_power DECIMAL(20, 6),
        archived_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        removal_reason TEXT
      )
    `);

    await client.query(`
      INSERT INTO citizens_archive (
        original_id, wallet, lat, lng, primary_nft, pfp_nft, message, 
        nickname, bio, twitter_handle, telegram_handle, discord_handle, 
        image_url, governance_power, native_power, delegated_power, removal_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    `, [
      citizenData.id, citizenData.wallet, citizenData.lat, citizenData.lng,
      citizenData.primary_nft, citizenData.pfp_nft, citizenData.message,
      citizenData.nickname, citizenData.bio, citizenData.twitter_handle,
      citizenData.telegram_handle, citizenData.discord_handle, citizenData.image_url,
      citizenData.governance_power, citizenData.native_power, citizenData.delegated_power,
      'no_nfts_found'
    ]);

  } finally {
    client.release();
  }
}

/**
 * Remove citizens with no NFTs from active map
 */
async function removeInvalidCitizens() {
  const client = await pool.connect();
  
  try {
    console.log(`Starting citizen validation: ${new Date().toISOString()}`);
    
    const citizens = await client.query('SELECT * FROM citizens');
    
    let removedCount = 0;
    let validatedCount = 0;
    
    for (const citizen of citizens.rows) {
      try {
        const hasNFTs = await hasValidNFTs(citizen.wallet);
        
        if (!hasNFTs) {
          console.log(`Removing ${citizen.nickname || citizen.wallet.slice(0, 8)}: No PERKS NFTs found`);
          
          // Archive before removal
          await archiveCitizen(citizen);
          
          // Remove from active map
          await client.query('DELETE FROM citizen_nfts WHERE citizen_id = $1', [citizen.id]);
          await client.query('DELETE FROM citizens WHERE id = $1', [citizen.id]);
          
          removedCount++;
        } else {
          validatedCount++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing ${citizen.nickname}: ${error.message}`);
        validatedCount++; // Keep citizen if verification fails
      }
    }
    
    console.log(`Validation completed: ${validatedCount} kept, ${removedCount} removed`);
    
  } finally {
    client.release();
  }
}

/**
 * Restore citizen from archive if they now have NFTs
 */
async function restoreCitizenIfValid(walletAddress) {
  const client = await pool.connect();
  
  try {
    const hasNFTs = await hasValidNFTs(walletAddress);
    
    if (!hasNFTs) {
      return { success: false, message: 'Wallet still has no PERKS NFTs' };
    }
    
    // Check if citizen exists in archive
    const archived = await client.query(`
      SELECT * FROM citizens_archive 
      WHERE wallet = $1 
      ORDER BY archived_date DESC 
      LIMIT 1
    `, [walletAddress]);
    
    if (archived.rows.length === 0) {
      return { success: false, message: 'No archived data found for this wallet' };
    }
    
    const citizenData = archived.rows[0];
    
    // Restore to active citizens table
    await client.query(`
      INSERT INTO citizens (
        wallet, lat, lng, primary_nft, pfp_nft, message, 
        nickname, bio, twitter_handle, telegram_handle, discord_handle, 
        image_url, governance_power, native_power, delegated_power
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      citizenData.wallet, citizenData.lat, citizenData.lng,
      citizenData.primary_nft, citizenData.pfp_nft, citizenData.message,
      citizenData.nickname, citizenData.bio, citizenData.twitter_handle,
      citizenData.telegram_handle, citizenData.discord_handle, citizenData.image_url,
      citizenData.governance_power, citizenData.native_power, citizenData.delegated_power
    ]);
    
    console.log(`Restored ${citizenData.nickname || walletAddress.slice(0, 8)} to active map`);
    
    return { success: true, message: 'Citizen restored successfully' };
    
  } catch (error) {
    console.error(`Error restoring citizen: ${error.message}`);
    return { success: false, message: 'Error during restoration' };
  } finally {
    client.release();
  }
}

/**
 * Check for citizens to restore automatically
 */
async function checkForRestorations() {
  const client = await pool.connect();
  
  try {
    const archived = await client.query(`
      SELECT DISTINCT wallet, nickname 
      FROM citizens_archive 
      WHERE archived_date > NOW() - INTERVAL '7 days'
    `);
    
    let restoredCount = 0;
    
    for (const citizen of archived.rows) {
      const result = await restoreCitizenIfValid(citizen.wallet);
      if (result.success) {
        restoredCount++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (restoredCount > 0) {
      console.log(`Auto-restored ${restoredCount} citizens who regained NFTs`);
    }
    
  } finally {
    client.release();
  }
}

/**
 * Daily map management task
 */
async function performDailyMapMaintenance() {
  try {
    console.log('Starting daily map maintenance...');
    
    // First check for restorations
    await checkForRestorations();
    
    // Then remove invalid citizens
    await removeInvalidCitizens();
    
    console.log('Daily map maintenance completed');
    
  } catch (error) {
    console.error('Map maintenance error:', error);
  }
}

/**
 * Start scheduled map management
 */
function startMapManagementScheduler() {
  // Schedule daily at 12:00 UTC
  cron.schedule('0 12 * * *', performDailyMapMaintenance, {
    timezone: "UTC"
  });
  
  console.log('Map management scheduler started (12:00 UTC daily)');
}

export { 
  removeInvalidCitizens, 
  restoreCitizenIfValid, 
  performDailyMapMaintenance,
  startMapManagementScheduler 
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  performDailyMapMaintenance().then(() => {
    console.log('Manual map maintenance completed');
    process.exit(0);
  });
}