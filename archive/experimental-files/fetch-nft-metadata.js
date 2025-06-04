/**
 * NFT Metadata Fetcher
 * Fetches authentic PERKS collection data from Solana blockchain using Helius API
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Fetch NFT metadata for a wallet using Helius API
 */
async function fetchWalletNFTs(walletAddress) {
  try {
    const heliusUrl = process.env.HELIUS_API_KEY;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      // Filter for PERKS collection NFTs
      const perksNfts = data.result.items.filter(nft => {
        return nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === 'HYaQjyKJBqh4LbEhN85E3EYjbNsGYF1g3LYDQYUhXCLp'
        );
      });

      return perksNfts.map(nft => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || 'Unknown NFT',
        image: nft.content?.files?.[0]?.uri || nft.content?.json_uri,
        collection: 'PERKS',
        owner: walletAddress
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for ${walletAddress}:`, error);
    return [];
  }
}

/**
 * Update citizen NFT data in database
 */
async function updateCitizenNFTData(walletAddress, nfts) {
  const client = await pool.connect();
  
  try {
    if (nfts.length > 0) {
      const primaryNft = nfts[0]; // Use first NFT as primary
      
      await client.query(
        `UPDATE citizens 
         SET pfp_nft = $1, primary_nft = $1, image_url = $2
         WHERE wallet = $3`,
        [primaryNft.mint, primaryNft.image, walletAddress]
      );
      
      console.log(`Updated ${walletAddress} with ${nfts.length} PERKS NFTs`);
    }
  } finally {
    client.release();
  }
}

/**
 * Sync NFT metadata for all citizens
 */
async function syncAllCitizensNFTData() {
  const client = await pool.connect();
  
  try {
    console.log('🖼️ Starting NFT metadata sync for all citizens...');
    
    const result = await client.query('SELECT wallet FROM citizens');
    const citizens = result.rows;
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      try {
        const nfts = await fetchWalletNFTs(citizen.wallet);
        
        if (nfts.length > 0) {
          await updateCitizenNFTData(citizen.wallet, nfts);
          updated++;
        }
        
        processed++;
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing ${citizen.wallet}:`, error);
      }
    }
    
    console.log(`✅ NFT sync completed: ${updated}/${processed} citizens updated`);
    
    return { processed, updated };
    
  } finally {
    client.release();
  }
}

module.exports = {
  fetchWalletNFTs,
  updateCitizenNFTData,
  syncAllCitizensNFTData
};