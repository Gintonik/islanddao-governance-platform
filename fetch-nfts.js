// PERKS NFT Collection Fetcher using Helius DAS API
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';
const OUTPUT_FILE = path.join(__dirname, 'perks-collection.json');

/**
 * Fetch NFTs using the Helius DAS API with pagination
 * @param {string|null} page - Pagination token
 * @returns {Promise<Object>} - API response
 */
async function fetchNFTs(page = null) {
  // Create request body according to Helius DAS API
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

  // Send request to Helius DAS API
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
}

/**
 * Fetch all NFTs from the collection with pagination support
 * @returns {Promise<Array>} - All NFTs in the collection
 */
async function fetchAllNFTs() {
  let allNFTs = [];
  let page = null;
  let hasMore = true;
  
  console.log('Fetching NFTs from PERKS collection...');
  
  // Handle pagination - keep fetching until all NFTs are retrieved
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
  
  return allNFTs;
}

/**
 * Process NFT data and save to file
 * @param {Array} nfts - List of NFTs
 */
function processNFTs(nfts) {
  console.log('\nPERKS NFT Collection:');
  console.log('=====================\n');
  
  // Create a processed version of the NFT data
  const processedNFTs = nfts.map(nft => {
    const name = nft.content?.metadata?.name || 'Unknown Name';
    const imageUrl = nft.content?.files?.[0]?.uri || 
                    nft.content?.links?.image || 
                    'No Image Available';
    const jsonUri = nft.content?.json_uri || '';
    const id = nft.id;
    const owner = nft.ownership?.owner || '';
    
    console.log(`${name} - ${imageUrl}`);
    
    return {
      id,
      name,
      imageUrl,
      jsonUri,
      owner
    };
  });
  
  // Save processed data to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedNFTs, null, 2));
  
  console.log(`\nTotal NFTs found: ${nfts.length}`);
  console.log(`NFT data saved to ${OUTPUT_FILE}`);
  
  // Also create ownership map (similar to nft-owners.json)
  createOwnershipMap(nfts);
}

/**
 * Create a map of wallet addresses to owned NFT IDs
 * @param {Array} nfts - List of NFTs
 */
function createOwnershipMap(nfts) {
  const ownershipMap = {};
  
  nfts.forEach(nft => {
    const owner = nft.ownership?.owner;
    const mintId = nft.id;
    
    if (owner && mintId) {
      if (!ownershipMap[owner]) {
        ownershipMap[owner] = [];
      }
      ownershipMap[owner].push(mintId);
    }
  });
  
  // Save ownership map to file
  const outputFile = path.join(__dirname, 'nft-owners.json');
  fs.writeFileSync(outputFile, JSON.stringify(ownershipMap, null, 2));
  
  console.log(`Ownership map saved to ${outputFile}`);
  console.log(`Total unique wallets: ${Object.keys(ownershipMap).length}`);
}

// Run the script
(async () => {
  try {
    const startTime = new Date();
    console.log(`NFT collection fetch started at ${startTime.toISOString()}`);
    
    const allNFTs = await fetchAllNFTs();
    processNFTs(allNFTs);
    
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // in seconds
    console.log(`NFT collection fetch completed in ${duration.toFixed(2)} seconds`);
  } catch (error) {
    console.error('Error fetching PERKS collection:', error);
  }
})();