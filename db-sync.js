
const { Client } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '088dfd59-6d2e-4695-a42a-2e0c257c2d00'}`;
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

async function fetchNFTs(page = null) {
  const requestData = {
    jsonrpc: '2.0',
    id: 'helius-das',
    method: 'getAssetsByGroup',
    params: {
      groupKey: 'collection',
      groupValue: COLLECTION_ADDRESS,
      page: page,
      limit: 1000
    }
  };

  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestData),
  });

  const data = await response.json();
  return data.result;
}

async function syncDatabase() {
  try {
    await client.connect();
    
    let allNFTs = [];
    let page = null;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching page: ${page || 'initial'}`);
      const result = await fetchNFTs(page);
      
      if (!result || !result.items || result.items.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const nft of result.items) {
        await client.query(
          `INSERT INTO nfts (mint_id, name, image_url, json_uri, owner, last_updated)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (mint_id) 
           DO UPDATE SET 
             name = $2,
             image_url = $3,
             json_uri = $4,
             owner = $5,
             last_updated = CURRENT_TIMESTAMP`,
          [
            nft.id,
            nft.content?.metadata?.name || '',
            nft.content?.files?.[0]?.uri || nft.content?.links?.image || '',
            nft.content?.json_uri || '',
            nft.ownership?.owner || ''
          ]
        );
      }
      
      if (result.page && result.total > allNFTs.length) {
        page = result.page;
      } else {
        hasMore = false;
      }
    }

    // Update JSON files for compatibility
    const nfts = await client.query('SELECT * FROM nfts');
    const collectionData = nfts.rows.map(row => ({
      id: row.mint_id,
      name: row.name,
      imageUrl: row.image_url,
      jsonUri: row.json_uri,
      owner: row.owner
    }));
    
    fs.writeFileSync('perks-collection.json', JSON.stringify(collectionData, null, 2));
    
    const ownershipMap = {};
    nfts.rows.forEach(nft => {
      if (nft.owner) {
        if (!ownershipMap[nft.owner]) {
          ownershipMap[nft.owner] = [];
        }
        ownershipMap[nft.owner].push(nft.mint_id);
      }
    });
    
    fs.writeFileSync('nft-owners.json', JSON.stringify(ownershipMap, null, 2));
    
    console.log('Database sync completed');
  } catch (error) {
    console.error('Error syncing database:', error);
  } finally {
    await client.end();
  }
}

syncDatabase();
