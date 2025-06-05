/**
 * Populate NFT Data for All Citizens
 * Updates the database with real NFT data for all existing citizens
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Function to fetch single NFT metadata using Helius API
async function fetchNFTMetadata(nftAddress) {
  try {
    const heliusUrl = process.env.HELIUS_API_KEY;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: {
          id: nftAddress
        }
      })
    });

    const data = await response.json();
    
    if (data.result) {
      return {
        mint: nftAddress,
        name: data.result.content?.metadata?.name || 'Unknown NFT',
        image: data.result.content?.links?.image || '',
        collection: data.result.grouping?.[0]?.group_value || 'Unknown'
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching metadata for ${nftAddress}:`, error);
    return null;
  }
}

// Function to fetch wallet NFTs using Helius Digital Asset API
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
        id: 'get-assets-by-owner',
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
      // Filter for PERKS collection NFTs only
      const perksNfts = data.result.items.filter(nft => 
        nft.grouping && 
        nft.grouping.some(group => 
          group.group_key === "collection" && 
          group.group_value === "J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w"
        )
      );
      
      // Transform to our format
      return perksNfts.map(nft => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || 'Unknown NFT',
        image: nft.content?.links?.image || '',
        collection: 'PERKS'
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for wallet ${walletAddress}:`, error);
    return [];
  }
}

async function populateAllCitizensNFTData() {
  try {
    console.log('Starting NFT data population for all citizens...');
    
    // Get all citizens from database
    const result = await pool.query('SELECT wallet, nickname FROM citizens WHERE wallet IS NOT NULL');
    const citizens = result.rows;
    
    console.log(`Found ${citizens.length} citizens to update`);
    
    for (const citizen of citizens) {
      try {
        console.log(`Fetching NFTs for ${citizen.nickname} (${citizen.wallet})`);
        
        const nfts = await fetchWalletNFTs(citizen.wallet);
        const nftIds = nfts.map(nft => nft.mint);
        
        console.log(`Found ${nfts.length} PERKS NFTs for ${citizen.nickname}`);
        
        // Update database with NFT data
        await pool.query(
          'UPDATE citizens SET nft_ids = $1, nft_metadata = $2, updated_at = NOW() WHERE wallet = $3',
          [JSON.stringify(nftIds), JSON.stringify(nfts), citizen.wallet]
        );
        
        console.log(`Updated ${citizen.nickname} with ${nfts.length} NFTs`);
        
        // Small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error updating NFTs for ${citizen.nickname}:`, error);
      }
    }
    
    console.log('NFT data population completed successfully');
    
    // Verify the data was stored
    const verifyResult = await pool.query('SELECT wallet, nickname, nft_metadata FROM citizens WHERE nft_metadata IS NOT NULL');
    console.log(`Verification: ${verifyResult.rows.length} citizens now have NFT data stored`);
    
  } catch (error) {
    console.error('Error during NFT data population:', error);
  } finally {
    await pool.end();
  }
}

// Run the population
populateAllCitizensNFTData();