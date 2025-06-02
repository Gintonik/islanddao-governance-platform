/**
 * PERKS NFT Sync Script
 * Fetches current PERKS collection ownership from Solana blockchain
 * Updates database with fresh NFT data for all citizens
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// PERKS collection address
const PERKS_COLLECTION = 'HYaQjyKJBqh4LbEhN85E3EYjbNsGYF1g3LYDQYUhXCLp';

/**
 * Fetch PERKS NFTs for a wallet using Helius API
 */
async function fetchWalletPERKSNFTs(walletAddress) {
  try {
    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    
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
          group.group_value === PERKS_COLLECTION
        );
      });

      console.log(`Found ${perksNfts.length} PERKS NFTs for ${walletAddress}`);

      return perksNfts.map(nft => ({
        mint_id: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image,
        json_uri: nft.content?.json_uri,
        owner: walletAddress
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching PERKS NFTs for ${walletAddress}:`, error.message);
    return [];
  }
}

/**
 * Update NFT data in database
 */
async function updateNFTDatabase(nftData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insert or update NFT
    await client.query(`
      INSERT INTO nfts (mint_id, name, image_url, json_uri, owner, last_updated)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (mint_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        image_url = EXCLUDED.image_url,
        json_uri = EXCLUDED.json_uri,
        owner = EXCLUDED.owner,
        last_updated = CURRENT_TIMESTAMP
    `, [nftData.mint_id, nftData.name, nftData.image_url, nftData.json_uri, nftData.owner]);
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Sync PERKS NFTs for all citizens
 */
async function syncAllCitizensNFTs() {
  const client = await pool.connect();
  
  try {
    console.log('🖼️ Starting PERKS NFT sync for all citizens...');
    
    // Get all citizen wallets
    const result = await client.query('SELECT wallet, nickname FROM citizens');
    const citizens = result.rows;
    
    console.log(`Found ${citizens.length} citizens to process`);
    
    let processed = 0;
    let totalNFTsFound = 0;
    
    for (const citizen of citizens) {
      try {
        console.log(`Processing ${citizen.nickname || citizen.wallet}...`);
        
        const nfts = await fetchWalletPERKSNFTs(citizen.wallet);
        
        // Update database with fresh NFT data
        for (const nft of nfts) {
          await updateNFTDatabase(nft);
        }
        
        totalNFTsFound += nfts.length;
        processed++;
        
        console.log(`✅ ${citizen.nickname || citizen.wallet}: ${nfts.length} PERKS NFTs`);
        
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`❌ Error processing ${citizen.wallet}:`, error.message);
      }
    }
    
    console.log(`\n🎉 PERKS NFT sync completed!`);
    console.log(`📊 Processed: ${processed}/${citizens.length} citizens`);
    console.log(`🖼️ Total PERKS NFTs found: ${totalNFTsFound}`);
    
    return { processed, totalNFTsFound };
    
  } finally {
    client.release();
  }
}

/**
 * Update citizen primary NFT assignments
 */
async function updateCitizenPrimaryNFTs() {
  const client = await pool.connect();
  
  try {
    console.log('🎯 Updating citizen primary NFT assignments...');
    
    const citizens = await client.query('SELECT wallet FROM citizens');
    
    for (const citizen of citizens.rows) {
      // Get first PERKS NFT for this wallet as primary
      const nftResult = await client.query(`
        SELECT mint_id, image_url 
        FROM nfts 
        WHERE owner = $1 
        ORDER BY name 
        LIMIT 1
      `, [citizen.wallet]);
      
      if (nftResult.rows.length > 0) {
        const primaryNFT = nftResult.rows[0];
        
        await client.query(`
          UPDATE citizens 
          SET primary_nft = $1, pfp_nft = $1, image_url = $2
          WHERE wallet = $3
        `, [primaryNFT.mint_id, primaryNFT.image_url, citizen.wallet]);
        
        console.log(`Updated primary NFT for ${citizen.wallet}`);
      }
    }
    
    console.log('✅ Primary NFT assignments updated');
    
  } finally {
    client.release();
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🚀 Starting PERKS NFT collection sync...\n');
    
    // Step 1: Sync all PERKS NFTs from blockchain
    await syncAllCitizensNFTs();
    
    // Step 2: Update citizen primary NFT assignments
    await updateCitizenPrimaryNFTs();
    
    console.log('\n🎊 PERKS NFT sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during NFT sync:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { syncAllCitizensNFTs, updateCitizenPrimaryNFTs };