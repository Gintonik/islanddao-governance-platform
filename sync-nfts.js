// Sync NFTs from Helius API to the database
const fetch = require('node-fetch');
const db = require('./db');

// Helius API configuration
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Fetch NFTs using the Helius DAS API
 * @param {string|null} page - Pagination token
 * @returns {Promise<Object>} - API response
 */
async function fetchNFTs(page = null) {
  try {
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'helius-das',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: COLLECTION_ADDRESS,
          page: page,
          limit: 1000  // Increased limit to get more NFTs per request
        }
      })
    });

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    return null;
  }
}

/**
 * Sync NFTs to the database
 */
async function syncNFTsToDatabase() {
  console.log('Starting NFT sync...');
  
  try {
    // Initialize the database first
    await db.initializeDatabase();
    
    // Start the sync
    let page = null;
    let hasMore = true;
    let totalImported = 0;
    let totalExpected = 0;
    
    console.log('Fetching NFTs from Helius API...');
    
    // Fetch pages until we've got ALL NFTs (should be around 462)
    while (hasMore) {
      console.log(`Fetching page: ${page || 'initial'}`);
      const result = await fetchNFTs(page);
      
      if (!result || !result.items || result.items.length === 0) {
        console.log('No more NFTs to fetch');
        hasMore = false;
        break;
      }
      
      // Get the total count from the first page
      if (page === null && result.total) {
        totalExpected = result.total;
        console.log(`Total NFTs in collection: ${totalExpected}`);
      }
      
      console.log(`Processing ${result.items.length} NFTs...`);
      
      // Process in batches
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
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
          totalImported++;
        }
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing NFT batch:', error);
      } finally {
        client.release();
      }
      
      // Check if there are more pages
      // Continue fetching if there's another page - ignore the total count as it may be incorrect
      if (result.page) {
        page = result.page;
        console.log(`Progress: ${totalImported} NFTs imported so far`);
      } else {
        // If no more pages, we're done
        console.log('No more pages to fetch');
        hasMore = false;
      }
    }
    
    console.log(`NFT sync complete. Imported ${totalImported} NFTs.`);
    
    // Create the NFT ownership mapping file
    await generateOwnershipMap();
    
    return totalImported;
  } catch (error) {
    console.error('Error syncing NFTs to database:', error);
    throw error;
  }
}

/**
 * Generate NFT ownership mapping and save to file
 */
async function generateOwnershipMap() {
  try {
    console.log('Generating NFT ownership map...');
    
    // Get ownership mapping from database
    const ownershipMap = await db.getNftOwnershipMap();
    
    // Write to file
    const fs = require('fs');
    fs.writeFileSync('./nft-owners.json', JSON.stringify(ownershipMap, null, 2));
    
    // Generate a perks-collection.json file for backwards compatibility
    const nfts = await db.getAllNfts();
    const formattedNfts = nfts.map(nft => ({
      id: nft.mint_id,
      name: nft.name,
      imageUrl: nft.image_url,
      owner: nft.owner
    }));
    
    fs.writeFileSync('./perks-collection.json', JSON.stringify(formattedNfts, null, 2));
    
    console.log(`Saved ownership map with ${Object.keys(ownershipMap).length} wallet addresses`);
    console.log(`Saved collection data with ${formattedNfts.length} NFTs`);
    
    return {
      wallets: Object.keys(ownershipMap).length,
      nfts: formattedNfts.length
    };
  } catch (error) {
    console.error('Error generating ownership map:', error);
    throw error;
  }
}

// Export functions for use in other files
module.exports = {
  syncNFTsToDatabase,
  generateOwnershipMap
};

// Run the sync if this file is executed directly
if (require.main === module) {
  syncNFTsToDatabase().then(() => {
    console.log('Sync completed successfully');
    process.exit(0);
  }).catch(error => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
}