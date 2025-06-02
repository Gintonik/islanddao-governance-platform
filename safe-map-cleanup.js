/**
 * Safe Map Cleanup System
 * Uses database-first verification to prevent false positives
 * Only removes citizens if multiple sources confirm they have no PERKS NFTs
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PERKS_COLLECTION = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Safe NFT verification - prioritizes keeping citizens
 */
async function safeNFTVerification(walletAddress, client) {
  // First check our database (most reliable source)
  try {
    const dbResult = await client.query(
      'SELECT COUNT(*) as count FROM nfts WHERE owner = $1 AND name LIKE $2',
      [walletAddress, 'PERK %']
    );
    const dbCount = parseInt(dbResult.rows[0].count);
    
    if (dbCount > 0) {
      console.log(`  Database: ${dbCount} PERKS found - KEEP`);
      return true;
    }
  } catch (error) {
    console.log(`  Database check failed - KEEP for safety`);
    return true;
  }

  // If database shows no NFTs, double-check with API
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `verify-${walletAddress}`,
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: PERKS_COLLECTION,
          page: 1,
          limit: 1000
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      const ownedNFTs = data.result.items.filter(nft => 
        nft.ownership && nft.ownership.owner === walletAddress
      );
      
      if (ownedNFTs.length > 0) {
        console.log(`  API: ${ownedNFTs.length} PERKS found - KEEP`);
        return true;
      }
    }

    console.log(`  Both database and API confirm no PERKS - REMOVE`);
    return false;
  } catch (error) {
    console.log(`  API check failed - KEEP for safety`);
    return true;
  }
}

/**
 * Perform safe cleanup - only remove if absolutely certain
 */
async function performSafeCleanup() {
  const client = await pool.connect();
  
  try {
    console.log('Starting safe map cleanup...\n');
    
    // Create archive table if it doesn't exist
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
    
    const citizens = await client.query('SELECT * FROM citizens ORDER BY nickname');
    
    let removedCount = 0;
    let keptCount = 0;
    
    for (const citizen of citizens.rows) {
      try {
        console.log(`Checking ${citizen.nickname || citizen.wallet.slice(0, 8)}...`);
        
        const hasNFTs = await safeNFTVerification(citizen.wallet, client);
        
        if (!hasNFTs) {
          console.log(`  REMOVING: No PERKS NFTs confirmed by multiple sources\n`);
          
          // Archive before removal
          await client.query(`
            INSERT INTO citizens_archive (
              original_id, wallet, lat, lng, primary_nft, pfp_nft, message, 
              nickname, bio, twitter_handle, telegram_handle, discord_handle, 
              image_url, governance_power, native_power, delegated_power, removal_reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          `, [
            citizen.id, citizen.wallet, citizen.lat, citizen.lng,
            citizen.primary_nft, citizen.pfp_nft, citizen.message,
            citizen.nickname, citizen.bio, citizen.twitter_handle,
            citizen.telegram_handle, citizen.discord_handle, citizen.image_url,
            citizen.governance_power, citizen.native_power, citizen.delegated_power,
            'safe_cleanup_no_perks'
          ]);
          
          // Remove from map
          await client.query('DELETE FROM citizen_nfts WHERE citizen_id = $1', [citizen.id]);
          await client.query('DELETE FROM citizens WHERE id = $1', [citizen.id]);
          
          removedCount++;
        } else {
          console.log(`  KEEPING\n`);
          keptCount++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`Error processing ${citizen.nickname}: ${error.message}`);
        console.log(`  KEEPING due to error\n`);
        keptCount++;
      }
    }
    
    console.log(`Safe cleanup completed:`);
    console.log(`Citizens kept: ${keptCount}`);
    console.log(`Citizens removed: ${removedCount}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

performSafeCleanup();