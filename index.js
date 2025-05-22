// NFT Collection Fetcher for PERKS Solana Collection
// This script fetches all NFTs from the PERKS collection using Helius DAS API

const fetch = require('node-fetch');

// Configuration
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Function to fetch NFTs using the Helius DAS API
 * @param {string} page - Pagination token
 * @returns {Promise<Object>} - API response
 */
async function fetchNFTs(page = null) {
  try {
    const requestData = {
      jsonrpc: '2.0',
      id: 'helius-das',
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
 * Main function to fetch all NFTs and display metadata
 */
async function getAllNFTs() {
  let allNFTs = [];
  let page = null;
  let hasMore = true;
  
  console.log('Fetching NFTs from PERKS collection...\n');
  
  try {
    // Keep fetching until we've got all NFTs (pagination)
    while (hasMore) {
      const result = await fetchNFTs(page);
      
      if (!result || !result.items || result.items.length === 0) {
        hasMore = false;
        break;
      }
      
      allNFTs = [...allNFTs, ...result.items];
      
      // Check if there are more pages
      if (result.page && result.total > allNFTs.length) {
        page = result.page;
      } else {
        hasMore = false;
      }
    }
    
    // Display NFT metadata
    allNFTs.forEach(nft => {
      const name = nft.content?.metadata?.name || 'Unknown Name';
      const imageUrl = nft.content?.files?.[0]?.uri || nft.content?.links?.image || 'No image';
      const jsonUri = nft.content?.json_uri || 'No JSON URI';
      
      console.log(`${name} - ${imageUrl}`);
      // Uncomment below if you want to see the JSON URI too
      // console.log(`JSON URI: ${jsonUri}`);
    });
    
    console.log(`\nTotal NFTs found: ${allNFTs.length}`);
  } catch (error) {
    console.error('Failed to fetch all NFTs:', error);
  }
}

// Execute the main function
getAllNFTs();
