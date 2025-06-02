/**
 * Map Cleanup Script
 * Removes citizens with no PERKS NFTs from the map
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
    return true;
  }
}

async function createArchiveTable() {
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
    
    console.log('Archive table ready');
  } finally {
    client.release();
  }
}

async function cleanupMap() {
  const client = await pool.connect();
  
  try {
    console.log('Starting map cleanup...\n');
    
    const citizens = await client.query('SELECT * FROM citizens ORDER BY nickname');
    
    let removedCount = 0;
    let keptCount = 0;
    
    for (const citizen of citizens.rows) {
      try {
        const hasNFTs = await hasValidNFTs(citizen.wallet);
        
        if (!hasNFTs) {
          console.log(`Removing ${citizen.nickname || citizen.wallet.slice(0, 8)}: No PERKS NFTs found`);
          
          // Archive citizen data
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
            'no_perks_nfts'
          ]);
          
          // Remove from active map
          await client.query('DELETE FROM citizen_nfts WHERE citizen_id = $1', [citizen.id]);
          await client.query('DELETE FROM citizens WHERE id = $1', [citizen.id]);
          
          removedCount++;
        } else {
          console.log(`Keeping ${citizen.nickname || citizen.wallet.slice(0, 8)}: Has PERKS NFTs`);
          keptCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing ${citizen.nickname}: ${error.message}`);
        keptCount++;
      }
    }
    
    console.log(`\nMap cleanup completed:`);
    console.log(`Citizens kept: ${keptCount}`);
    console.log(`Citizens removed: ${removedCount}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  await createArchiveTable();
  await cleanupMap();
}

main();