/**
 * Check Specific PERKS NFTs
 * Verify if specific PERKS NFTs from our database still exist on blockchain
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Check if a specific NFT mint still exists on blockchain
 */
async function checkNFTExists(mintId) {
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `check-${mintId}`,
        method: 'getAsset',
        params: {
          id: mintId
        }
      })
    });

    const data = await response.json();
    
    if (data.result) {
      return {
        exists: true,
        name: data.result.content?.metadata?.name,
        owner: data.result.ownership?.owner,
        collection: data.result.grouping?.[0]?.group_value
      };
    }
    
    return { exists: false };
  } catch (error) {
    console.error(`Error checking ${mintId}: ${error.message}`);
    return { exists: false };
  }
}

/**
 * Check sample PERKS NFTs from database
 */
async function checkSamplePERKS() {
  const client = await pool.connect();
  
  try {
    console.log('Checking sample PERKS NFTs from database...\n');
    
    // Get a few sample PERKS NFTs from different citizens
    const result = await client.query(`
      SELECT n.mint_id, n.name, n.owner, c.nickname 
      FROM nfts n 
      LEFT JOIN citizens c ON n.owner = c.wallet 
      WHERE n.name LIKE 'PERK %' 
      ORDER BY n.name 
      LIMIT 10
    `);
    
    console.log(`Found ${result.rows.length} PERKS in database\n`);
    
    for (const nft of result.rows) {
      console.log(`Checking ${nft.name} (${nft.nickname || 'Unknown'})...`);
      
      const status = await checkNFTExists(nft.mint_id);
      
      if (status.exists) {
        console.log(`  ✓ EXISTS on blockchain`);
        console.log(`  Current owner: ${status.owner}`);
        console.log(`  Original owner: ${nft.owner}`);
        console.log(`  Collection: ${status.collection || 'Unknown'}`);
        
        if (status.owner !== nft.owner) {
          console.log(`  ⚠ OWNERSHIP CHANGED`);
        }
      } else {
        console.log(`  ✗ NOT FOUND on blockchain`);
      }
      
      console.log('');
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkSamplePERKS();