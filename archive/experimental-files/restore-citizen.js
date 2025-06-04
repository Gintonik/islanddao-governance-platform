/**
 * Citizen Recovery Tool (Development Use Only)
 * Restore citizens who were removed but may have regained NFTs
 */

import { config } from "dotenv";
import pkg from "pg";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function restoreCitizen() {
  const client = await pool.connect();
  
  try {
    console.log('Looking for Moxie in archive...');
    
    // Find Moxie in archive
    const archived = await client.query(
      'SELECT * FROM citizens_archive WHERE nickname = $1 ORDER BY archived_date DESC LIMIT 1',
      ['Moxie']
    );
    
    if (archived.rows.length === 0) {
      console.log('Moxie not found in archive');
      return;
    }
    
    const citizen = archived.rows[0];
    console.log(`Found Moxie in archive: ${citizen.wallet}`);
    
    // Check if already exists in active citizens
    const existing = await client.query(
      'SELECT id FROM citizens WHERE wallet = $1',
      [citizen.wallet]
    );
    
    if (existing.rows.length > 0) {
      console.log('Moxie already exists in active citizens');
      return;
    }
    
    // Restore to active citizens table
    const result = await client.query(`
      INSERT INTO citizens (
        wallet, lat, lng, primary_nft, pfp_nft, message, 
        nickname, bio, twitter_handle, telegram_handle, discord_handle, 
        image_url, governance_power, native_power, delegated_power
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      citizen.wallet, citizen.lat, citizen.lng,
      citizen.primary_nft, citizen.pfp_nft, citizen.message,
      citizen.nickname, citizen.bio, citizen.twitter_handle,
      citizen.telegram_handle, citizen.discord_handle, citizen.image_url,
      citizen.governance_power, citizen.native_power, citizen.delegated_power
    ]);
    
    const newCitizenId = result.rows[0].id;
    console.log(`Restored Moxie with new ID: ${newCitizenId}`);
    
    // Restore NFT records if they exist
    const nftResult = await client.query(`
      SELECT DISTINCT mint_id, name, image_url 
      FROM nfts 
      WHERE owner = $1 AND name LIKE 'PERK %'
    `, [citizen.wallet]);
    
    if (nftResult.rows.length > 0) {
      for (const nft of nftResult.rows) {
        await client.query(`
          INSERT INTO citizen_nfts (citizen_id, mint_id, name, image_url)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (citizen_id, mint_id) DO NOTHING
        `, [newCitizenId, nft.mint_id, nft.name, nft.image_url]);
      }
      console.log(`Restored ${nftResult.rows.length} NFT records for Moxie`);
    }
    
    console.log('Moxie successfully restored to the map!');
    
  } finally {
    client.release();
    await pool.end();
  }
}

restoreCitizen();