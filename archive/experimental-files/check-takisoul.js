/**
 * Check Takisoul's NFTs specifically
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkTakisoulNFTs() {
  const client = await pool.connect();
  
  try {
    // Get Takisoul's wallet
    const result = await client.query('SELECT wallet, nickname FROM citizens WHERE nickname = $1', ['Takisoul']);
    
    if (result.rows.length === 0) {
      console.log('Takisoul not found in database');
      return;
    }
    
    const wallet = result.rows[0].wallet;
    console.log(`Checking NFTs for Takisoul: ${wallet}`);
    
    // Check with collection filter
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'check-takisoul-collection',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8',
          page: 1,
          limit: 1000
        }
      })
    });

    const collectionData = await response.json();
    console.log('Collection check result:', collectionData.result ? `${collectionData.result.total} items in collection` : 'No collection data');
    
    if (collectionData.result && collectionData.result.items) {
      const takisoulNFTs = collectionData.result.items.filter(nft => 
        nft.ownership && nft.ownership.owner === wallet
      );
      
      console.log(`Takisoul's PERKS from collection query: ${takisoulNFTs.length}`);
      takisoulNFTs.forEach(nft => {
        console.log(`  - ${nft.content?.metadata?.name || 'Unnamed'} (${nft.id})`);
      });
    }
    
    // Also check by owner
    const ownerResponse = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'check-takisoul-owner',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 100
        }
      })
    });

    const data = await ownerResponse.json();
    
    if (data.result && data.result.items) {
      console.log(`Total assets found: ${data.result.items.length}`);
      
      // Check for PERKS specifically
      const perksNFTs = data.result.items.filter(nft => {
        const hasPERKSCollection = nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8'
        );
        
        const hasPERKSName = nft.content?.metadata?.name?.includes('PERK');
        
        return hasPERKSCollection || hasPERKSName;
      });
      
      console.log(`PERKS NFTs found: ${perksNFTs.length}`);
      
      if (perksNFTs.length > 0) {
        console.log('PERKS NFTs:');
        perksNFTs.forEach(nft => {
          console.log(`  - ${nft.content?.metadata?.name || 'Unnamed'} (${nft.id})`);
        });
      }
      
      // Show all NFT names for debugging
      console.log('\nAll NFTs:');
      data.result.items.slice(0, 10).forEach(nft => {
        console.log(`  - ${nft.content?.metadata?.name || 'Unnamed'}`);
      });
      
    } else {
      console.log('No assets returned from API');
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkTakisoulNFTs();