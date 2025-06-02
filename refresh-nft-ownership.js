/**
 * Fresh NFT Ownership Updater
 * Fetches current NFT ownership from Solana blockchain using multiple collection methods
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Fetch all NFTs for a wallet using Helius DAS API
 */
async function fetchAllNFTsForWallet(walletAddress) {
  try {
    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000,
          displayOptions: {
            showCollectionMetadata: true,
            showGrandTotal: true,
            showNativeBalance: false
          }
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      console.log(`Found ${data.result.items.length} total NFTs for ${walletAddress}`);
      
      return data.result.items.map(nft => ({
        mint_id: nft.id,
        name: nft.content?.metadata?.name || 'Unknown NFT',
        image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image,
        json_uri: nft.content?.json_uri,
        owner: walletAddress,
        collection: nft.grouping?.[0]?.group_value || 'unknown'
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for ${walletAddress}:`, error.message);
    return [];
  }
}

/**
 * Update NFT ownership in database
 */
async function updateNFTOwnership(nftData) {
  const client = await pool.connect();
  
  try {
    await client.query(`
      INSERT INTO nfts (mint_id, name, image_url, json_uri, owner, last_updated)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (mint_id) 
      DO UPDATE SET 
        owner = EXCLUDED.owner,
        name = EXCLUDED.name,
        image_url = EXCLUDED.image_url,
        json_uri = EXCLUDED.json_uri,
        last_updated = CURRENT_TIMESTAMP
    `, [nftData.mint_id, nftData.name, nftData.image_url, nftData.json_uri, nftData.owner]);
  } finally {
    client.release();
  }
}

/**
 * Update citizen primary NFT based on current ownership
 */
async function updateCitizenPrimaryNFT(walletAddress) {
  const client = await pool.connect();
  
  try {
    // Get the first NFT owned by this wallet
    const nftResult = await client.query(`
      SELECT mint_id, image_url, name 
      FROM nfts 
      WHERE owner = $1 
      ORDER BY name 
      LIMIT 1
    `, [walletAddress]);
    
    if (nftResult.rows.length > 0) {
      const primaryNFT = nftResult.rows[0];
      
      await client.query(`
        UPDATE citizens 
        SET primary_nft = $1, pfp_nft = $1, image_url = $2
        WHERE wallet = $3
      `, [primaryNFT.mint_id, primaryNFT.image_url, walletAddress]);
      
      console.log(`Updated primary NFT for ${walletAddress}: ${primaryNFT.name}`);
      return true;
    } else {
      console.log(`No NFTs found for ${walletAddress}`);
      return false;
    }
  } finally {
    client.release();
  }
}

/**
 * Refresh ownership data for a specific wallet
 */
async function refreshWalletOwnership(walletAddress) {
  try {
    console.log(`Refreshing ownership data for ${walletAddress}...`);
    
    const nfts = await fetchAllNFTsForWallet(walletAddress);
    
    if (nfts.length > 0) {
      // Update NFT ownership records
      for (const nft of nfts) {
        await updateNFTOwnership(nft);
      }
      
      // Update citizen primary NFT
      await updateCitizenPrimaryNFT(walletAddress);
      
      console.log(`Successfully updated ${nfts.length} NFTs for ${walletAddress}`);
      return nfts.length;
    } else {
      console.log(`No NFTs found for ${walletAddress}`);
      return 0;
    }
    
  } catch (error) {
    console.error(`Error refreshing ownership for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Daily refresh for all citizens
 */
async function dailyOwnershipRefresh() {
  const client = await pool.connect();
  
  try {
    console.log('Starting daily NFT ownership refresh...');
    
    const result = await client.query('SELECT wallet, nickname FROM citizens');
    const citizens = result.rows;
    
    let totalUpdated = 0;
    
    for (const citizen of citizens) {
      const updated = await refreshWalletOwnership(citizen.wallet);
      totalUpdated += updated;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`Daily refresh completed: ${totalUpdated} total NFTs updated across ${citizens.length} citizens`);
    return totalUpdated;
    
  } finally {
    client.release();
  }
}

export { refreshWalletOwnership, dailyOwnershipRefresh };

// Run specific wallet if provided as argument
if (process.argv[2]) {
  refreshWalletOwnership(process.argv[2]).then(() => {
    console.log('Single wallet refresh completed');
    process.exit(0);
  });
}