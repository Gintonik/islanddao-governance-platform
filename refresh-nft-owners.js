// PERKS Collection NFT Ownership Refresh Script
// This script fetches all NFTs from the PERKS collection and maps them to their owners
// The data is saved to nft-owners.json for use in the Citizen Map application

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '088dfd59-6d2e-4695-a42a-2e0c257c2d00'}`;
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';
const OUTPUT_FILE = path.join(__dirname, 'nft-owners.json');

/**
 * Function to fetch NFTs using the Helius DAS API
 * @param {string} page - Pagination token
 * @returns {Promise<Object>} - API response
 */
async function fetchNFTs(page = null) {
  try {
    const requestData = {
      jsonrpc: '2.0',
      id: '1',
      method: 'getAssetsByGroup',
      params: {
        groupKey: 'collection',
        groupValue: COLLECTION_ADDRESS,
        page: page,
        limit: 1000 // Maximum limit per request
      }
    };

    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    return data.result;
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    throw error;
  }
}

/**
 * Main function to fetch all NFTs and create wallet -> NFTs mapping
 */
async function generateOwnershipMap() {
  let allNFTs = [];
  let page = null;
  let hasMore = true;
  
  console.log('Fetching NFTs from PERKS collection...');
  
  try {
    // Keep fetching until we've got all NFTs (pagination)
    while (hasMore) {
      console.log(`Fetching page: ${page || 'initial'}`);
      const result = await fetchNFTs(page);
      
      if (!result || !result.items || result.items.length === 0) {
        hasMore = false;
        break;
      }
      
      allNFTs = [...allNFTs, ...result.items];
      console.log(`Fetched ${result.items.length} NFTs (${allNFTs.length} total so far)`);
      
      // Check if there are more pages
      if (result.page && result.total > allNFTs.length) {
        page = result.page;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`Total NFTs found: ${allNFTs.length}`);
    
    // Create wallet -> NFTs mapping
    const ownershipMap = {};
    
    allNFTs.forEach(nft => {
      const owner = nft.ownership?.owner;
      const mintId = nft.id;
      
      if (owner && mintId) {
        if (!ownershipMap[owner]) {
          ownershipMap[owner] = [];
        }
        ownershipMap[owner].push(mintId);
      }
    });
    
    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ownershipMap, null, 2));
    console.log(`Successfully saved ownership data to ${OUTPUT_FILE}`);
    console.log(`Total unique wallets: ${Object.keys(ownershipMap).length}`);
    
    return ownershipMap;
  } catch (error) {
    console.error('Failed to generate ownership map:', error);
    throw error;
  }
}

// Create a placeholder citizens.json file if it doesn't exist
function initializeCitizensFile() {
  const citizensFilePath = path.join(__dirname, 'citizens.json');
  if (!fs.existsSync(citizensFilePath)) {
    fs.writeFileSync(citizensFilePath, JSON.stringify([], null, 2));
    console.log('Created empty citizens.json file');
  } else {
    console.log('citizens.json file already exists');
  }
}

// Execute the main function
(async () => {
  try {
    console.log('Starting NFT ownership refresh - ' + new Date().toISOString());
    await generateOwnershipMap();
    initializeCitizensFile();
    console.log('Completed NFT ownership refresh - ' + new Date().toISOString());
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();