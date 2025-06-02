/**
 * Test Map Cleanup - Check which citizens should be removed
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
    // Use collection query to get all PERKS NFTs, then filter by owner
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `check-collection-${walletAddress}`,
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

      return ownedNFTs.length > 0;
    }

    return false;
  } catch (error) {
    console.error(`Error checking NFTs for ${walletAddress}: ${error.message}`);
    return true; // Keep citizen if verification fails
  }
}

async function testMapCleanup() {
  const client = await pool.connect();
  
  try {
    console.log('Testing map cleanup - checking which citizens should be removed\n');
    
    const citizens = await client.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    
    let toRemove = [];
    let toKeep = [];
    
    for (const citizen of citizens.rows) {
      try {
        const hasNFTs = await hasValidNFTs(citizen.wallet);
        
        if (hasNFTs) {
          toKeep.push(citizen.nickname || citizen.wallet.slice(0, 8));
          console.log(`✓ Keep: ${citizen.nickname || citizen.wallet.slice(0, 8)}`);
        } else {
          toRemove.push(citizen.nickname || citizen.wallet.slice(0, 8));
          console.log(`✗ Remove: ${citizen.nickname || citizen.wallet.slice(0, 8)} (No PERKS NFTs)`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error checking ${citizen.nickname}: ${error.message}`);
        toKeep.push(citizen.nickname || citizen.wallet.slice(0, 8));
      }
    }
    
    console.log(`\n--- Cleanup Summary ---`);
    console.log(`Citizens to keep: ${toKeep.length}`);
    console.log(`Citizens to remove: ${toRemove.length}`);
    
    if (toRemove.length > 0) {
      console.log(`\nWould remove: ${toRemove.join(', ')}`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

testMapCleanup();