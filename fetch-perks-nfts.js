// PERKS NFT Collection Fetcher
// This script fetches all NFTs from the PERKS collection using Helius DAS API

const fetch = require('node-fetch');

// Configuration
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Fetch NFTs using the Helius DAS API
 * @param {string|null} page - Pagination token
 * @returns {Promise<Object>} - API response
 */
async function fetchNFTs(page = null) {
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
}

/**
 * Fetch all NFTs from the collection
 */
async function fetchAllNFTs() {
  let allNFTs = [];
  let page = null;
  let hasMore = true;
  
  console.log('Fetching NFTs from PERKS collection...');
  
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
  
  return allNFTs;
}

/**
 * Display NFT information
 * @param {Array} nfts - List of NFTs
 */
function displayNFTs(nfts) {
  console.log('\nPERKS NFT Collection:');
  console.log('=====================\n');
  
  nfts.forEach(nft => {
    const name = nft.content?.metadata?.name || 'Unknown Name';
    const imageUrl = nft.content?.files?.[0]?.uri || 
                    nft.content?.links?.image || 
                    'No Image Available';
    const jsonUri = nft.content?.json_uri || 'No JSON URI Available';
    
    console.log(`${name} - ${imageUrl}`);
  });
  
  console.log(`\nTotal NFTs found: ${nfts.length}`);
}

// Run the script
(async () => {
  try {
    const allNFTs = await fetchAllNFTs();
    displayNFTs(allNFTs);
  } catch (error) {
    console.error('Error fetching PERKS collection:', error);
  }
})();