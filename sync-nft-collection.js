/**
 * NFT Collection Synchronization Script
 * 
 * This script fetches all NFTs from the PERKS Solana collection,
 * updates the database, and generates necessary JSON files for the frontend.
 * Designed to be run daily to keep ownership information current.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const db = require('./db');

// Configuration constants
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';
const NFT_OWNERS_FILE = './nft-owners.json';
const NFT_COLLECTION_FILE = './perks-collection.json';

/**
 * Fetch NFTs from the Helius DAS API
 * 
 * @param {number|null} page - Pagination token 
 * @returns {Promise<Object>} - API response with NFT data
 */
async function fetchNFTsFromHelius(page = null) {
  try {
    console.log(`Fetching NFTs from Helius DAS API (page: ${page || 'initial'})...`);
    
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getAssetsByGroup",
        params: {
          groupKey: "collection",
          groupValue: COLLECTION_ADDRESS,
          page: page,
          limit: 1000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API response error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`API error: ${JSON.stringify(data.error)}`);
    }
    
    if (!data.result || !data.result.items || !Array.isArray(data.result.items)) {
      throw new Error(`Invalid API response format: ${JSON.stringify(data)}`);
    }
    
    return data.result;
  } catch (error) {
    console.error('Error fetching NFTs from Helius:', error);
    throw error;
  }
}

/**
 * Process NFT data and update the database
 * 
 * @param {Array} nfts - Raw NFT data from Helius API
 * @returns {Promise<Object>} - Results of the database update
 */
async function updateDatabase(nfts) {
  console.log(`Processing ${nfts.length} NFTs for database update...`);
  
  try {
    // Initialize database
    await db.initializeDatabase();
    
    // Process and format NFT data
    const processedNfts = nfts.map(nft => ({
      mint_id: nft.id,
      name: nft.content?.metadata?.name || 'Unknown',
      image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image || 'No Image',
      json_uri: nft.content?.json_uri || '',
      owner: nft.ownership?.owner || '',
      last_updated: new Date()
    }));
    
    // Connect to database
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      let updated = 0;
      
      // Update each NFT in the database
      for (const nft of processedNfts) {
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
            nft.mint_id,
            nft.name,
            nft.image_url,
            nft.json_uri,
            nft.owner
          ]
        );
        updated++;
        
        // Log progress
        if (updated % 100 === 0) {
          console.log(`Updated ${updated}/${processedNfts.length} NFTs in database...`);
        }
      }
      
      await client.query('COMMIT');
      console.log(`Successfully updated ${updated} NFTs in database`);
      
      return { success: true, updated };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating database:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in database update:', error);
    throw error;
  }
}

/**
 * Generate the nft-owners.json file mapping wallets to owned NFTs
 * 
 * @param {Array} nfts - Raw NFT data from Helius API
 * @returns {Promise<Object>} - Results of generating the ownership map
 */
async function generateOwnershipMap(nfts) {
  try {
    console.log('Generating wallet to NFT ownership mapping...');
    
    // Create mapping of wallet addresses to owned NFT IDs
    const ownershipMap = {};
    
    nfts.forEach(nft => {
      const owner = nft.ownership?.owner;
      const id = nft.id;
      
      if (owner && id) {
        if (!ownershipMap[owner]) {
          ownershipMap[owner] = [];
        }
        ownershipMap[owner].push(id);
      }
    });
    
    // Save to file
    fs.writeFileSync(NFT_OWNERS_FILE, JSON.stringify(ownershipMap, null, 2));
    
    const walletCount = Object.keys(ownershipMap).length;
    console.log(`Saved ownership map with ${walletCount} wallet addresses to ${NFT_OWNERS_FILE}`);
    
    return { success: true, wallets: walletCount };
  } catch (error) {
    console.error('Error generating ownership map:', error);
    throw error;
  }
}

/**
 * Generate the perks-collection.json file with complete NFT collection data
 * 
 * @param {Array} nfts - Raw NFT data from Helius API
 * @returns {Promise<Object>} - Results of generating the collection file
 */
async function generateCollectionFile(nfts) {
  try {
    console.log('Generating collection JSON file...');
    
    // Process NFTs into the desired format
    const processedNfts = nfts.map(nft => ({
      id: nft.id,
      name: nft.content?.metadata?.name || 'Unknown',
      imageUrl: nft.content?.files?.[0]?.uri || nft.content?.links?.image || 'No Image',
      jsonUri: nft.content?.json_uri || '',
      owner: nft.ownership?.owner || ''
    }));
    
    // Save to file
    fs.writeFileSync(NFT_COLLECTION_FILE, JSON.stringify(processedNfts, null, 2));
    
    console.log(`Saved ${processedNfts.length} NFTs to ${NFT_COLLECTION_FILE}`);
    
    return { success: true, count: processedNfts.length };
  } catch (error) {
    console.error('Error generating collection file:', error);
    throw error;
  }
}

/**
 * Main function to sync the entire NFT collection
 * 
 * @returns {Promise<Object>} - Results of the sync operation
 */
async function syncNFTCollection() {
  console.log('Starting NFT collection synchronization...');
  const startTime = new Date();
  
  try {
    // Fetch all NFTs from the collection with pagination support
    let allNFTs = [];
    let page = null;
    let hasMore = true;
    
    while (hasMore) {
      const result = await fetchNFTsFromHelius(page);
      
      if (result.items && result.items.length > 0) {
        allNFTs = [...allNFTs, ...result.items];
        console.log(`Fetched ${result.items.length} NFTs (${allNFTs.length} total so far)`);
        
        // Check for next page
        if (result.page) {
          page = result.page;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    
    console.log(`Successfully fetched all ${allNFTs.length} NFTs from the collection`);
    
    // Update database with the fetched NFTs
    await updateDatabase(allNFTs);
    
    // Generate the nft-owners.json file
    await generateOwnershipMap(allNFTs);
    
    // Generate the perks-collection.json file
    await generateCollectionFile(allNFTs);
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // in seconds
    
    console.log(`\nNFT collection sync completed in ${duration.toFixed(2)} seconds`);
    console.log(`Total NFTs: ${allNFTs.length}`);
    console.log(`Database updated: ✓`);
    console.log(`nft-owners.json generated: ✓`);
    console.log(`perks-collection.json generated: ✓`);
    
    return { 
      success: true, 
      totalNfts: allNFTs.length,
      duration: duration.toFixed(2)
    };
  } catch (error) {
    console.error('Error syncing NFT collection:', error);
    return { success: false, error: error.message };
  }
}

// Export functions for use in other scripts
module.exports = {
  syncNFTCollection,
  fetchNFTsFromHelius,
  updateDatabase,
  generateOwnershipMap,
  generateCollectionFile
};

// Run the sync if this file is executed directly
if (require.main === module) {
  syncNFTCollection()
    .then(result => {
      if (result.success) {
        console.log('NFT collection sync completed successfully');
        process.exit(0);
      } else {
        console.error('NFT collection sync failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error during NFT collection sync:', error);
      process.exit(1);
    });
}