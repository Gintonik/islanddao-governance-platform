/**
 * Identify PERKS collection ID and verify current citizens hold PERKS NFTs
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function identifyPerksCollection() {
  console.log('IDENTIFYING PERKS COLLECTION');
  console.log('============================');
  
  const client = await pool.connect();
  
  try {
    // Get sample of current citizens to identify PERKS collection
    const citizens = await client.query(`
      SELECT wallet, nickname, pfp_nft 
      FROM citizens 
      WHERE pfp_nft IS NOT NULL 
      LIMIT 5
    `);
    
    console.log(`Checking ${citizens.rows.length} citizens for PERKS collection membership:`);
    
    const perksCollections = new Set();
    
    for (const citizen of citizens.rows) {
      console.log(`\nChecking ${citizen.nickname}:`);
      
      // Get NFT details to identify collection
      const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-asset',
          method: 'getAsset',
          params: { id: citizen.pfp_nft }
        })
      });
      
      const result = await response.json();
      const nft = result.result;
      
      if (nft && nft.grouping && nft.grouping.length > 0) {
        const collectionId = nft.grouping[0].group_value;
        console.log(`  Collection: ${collectionId}`);
        
        // Check if this is a PERKS-related collection
        if (nft.content && nft.content.metadata) {
          const name = nft.content.metadata.name || '';
          const description = nft.content.metadata.description || '';
          
          if (name.toLowerCase().includes('perk') || description.toLowerCase().includes('perk')) {
            console.log(`  ✓ PERKS NFT found: ${name}`);
            perksCollections.add(collectionId);
          }
        }
        
        // Also check collection name directly
        const collectionResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-collection',
            method: 'getAsset',
            params: { id: collectionId }
          })
        });
        
        const collectionResult = await collectionResponse.json();
        if (collectionResult.result && collectionResult.result.content && collectionResult.result.content.metadata) {
          const collectionName = collectionResult.result.content.metadata.name || '';
          console.log(`  Collection name: ${collectionName}`);
          
          if (collectionName.toLowerCase().includes('perk')) {
            console.log(`  ✓ PERKS collection confirmed: ${collectionName}`);
            perksCollections.add(collectionId);
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n=== PERKS COLLECTIONS IDENTIFIED ===');
    if (perksCollections.size > 0) {
      Array.from(perksCollections).forEach((collectionId, index) => {
        console.log(`${index + 1}. ${collectionId}`);
      });
    } else {
      console.log('No PERKS collections found in sample');
    }
    
  } finally {
    client.release();
  }
}

identifyPerksCollection().catch(console.error);