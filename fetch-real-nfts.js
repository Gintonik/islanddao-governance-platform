// Direct NFT fetch from Helius DAS API
const fetch = require('node-fetch');
const fs = require('fs');

async function fetchNFTsFromHelius() {
  console.log('Fetching NFTs directly from Helius DAS API...');
  
  try {
    const response = await fetch('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', {
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
          groupValue: "5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8",
          page: 1,
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
    
    const nfts = data.result.items;
    console.log(`Successfully fetched ${nfts.length} NFTs from Helius DAS API`);
    
    // Process and save the NFT data
    const processedNfts = nfts.map(nft => {
      // Extract the relevant information
      return {
        id: nft.id,
        name: nft.content?.metadata?.name || 'Unknown',
        imageUrl: nft.content?.files?.[0]?.uri || nft.content?.links?.image || 'No Image',
        jsonUri: nft.content?.json_uri || '',
        owner: nft.ownership?.owner || ''
      };
    });
    
    // Save to file
    fs.writeFileSync('real-perks-collection.json', JSON.stringify(processedNfts, null, 2));
    console.log(`Saved ${processedNfts.length} NFTs to real-perks-collection.json`);
    
    // Create ownership map
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
    
    // Save ownership map
    fs.writeFileSync('real-nft-owners.json', JSON.stringify(ownershipMap, null, 2));
    console.log(`Saved ownership map with ${Object.keys(ownershipMap).length} wallet addresses`);
    
    // Check for specific wallet address in the data
    const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    const targetNfts = processedNfts.filter(nft => nft.owner === targetWallet);
    
    if (targetNfts.length > 0) {
      console.log(`\nFound ${targetNfts.length} NFTs owned by wallet ${targetWallet}:`);
      targetNfts.forEach(nft => {
        console.log(`- ${nft.name} (ID: ${nft.id})`);
        console.log(`  Image URL: ${nft.imageUrl}`);
      });
    } else {
      console.log(`\nNo NFTs found for wallet ${targetWallet}`);
    }
    
    return { success: true, count: nfts.length };
  } catch (error) {
    console.error('Error fetching NFTs from Helius:', error);
    return { success: false, error: error.message };
  }
}

// Execute the fetch
fetchNFTsFromHelius().then(result => {
  if (result.success) {
    console.log('NFT fetch completed successfully');
  } else {
    console.error('NFT fetch failed:', result.error);
  }
});