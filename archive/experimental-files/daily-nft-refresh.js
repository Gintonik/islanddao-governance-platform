/**
 * Daily NFT Ownership Refresh Service
 * Automatically updates NFT ownership data from blockchain every day
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";
import cron from "node-cron";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Comprehensive NFT fetch using multiple methods
 */
async function fetchNFTsComprehensive(walletAddress) {
  try {
    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    
    // Method 1: Get all assets by owner
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
            showCollectionMetadata: true
          }
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.warn(`API Error for ${walletAddress}: ${data.error.message}`);
      return [];
    }
    
    if (data.result && data.result.items) {
      const nfts = data.result.items
        .filter(nft => nft.interface === 'V1_NFT' || nft.interface === 'ProgrammableNFT')
        .map(nft => ({
          mint_id: nft.id,
          name: nft.content?.metadata?.name || `NFT ${nft.id.slice(0, 8)}`,
          image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image,
          json_uri: nft.content?.json_uri,
          owner: walletAddress
        }));
      
      console.log(`Found ${nfts.length} NFTs for ${walletAddress.slice(0, 8)}...`);
      return nfts;
    }

    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for ${walletAddress}: ${error.message}`);
    return [];
  }
}

/**
 * Update NFT records in database
 */
async function updateNFTRecords(nfts) {
  const client = await pool.connect();
  
  try {
    for (const nft of nfts) {
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
      `, [nft.mint_id, nft.name, nft.image_url, nft.json_uri, nft.owner]);
    }
  } finally {
    client.release();
  }
}

/**
 * Update citizen profile with best available NFT
 */
async function updateCitizenProfile(walletAddress) {
  const client = await pool.connect();
  
  try {
    const nftResult = await client.query(`
      SELECT mint_id, image_url, name 
      FROM nfts 
      WHERE owner = $1 
      ORDER BY last_updated DESC, name 
      LIMIT 1
    `, [walletAddress]);
    
    if (nftResult.rows.length > 0) {
      const nft = nftResult.rows[0];
      
      await client.query(`
        UPDATE citizens 
        SET primary_nft = $1, pfp_nft = $1, image_url = $2
        WHERE wallet = $3
      `, [nft.mint_id, nft.image_url, walletAddress]);
      
      return nft.name;
    }
    
    return null;
  } finally {
    client.release();
  }
}

/**
 * Daily refresh process
 */
async function performDailyRefresh() {
  const client = await pool.connect();
  
  try {
    console.log(`Daily NFT refresh started: ${new Date().toISOString()}`);
    
    const result = await client.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    let totalNFTs = 0;
    let citizensUpdated = 0;
    
    for (const citizen of citizens) {
      try {
        const nfts = await fetchNFTsComprehensive(citizen.wallet);
        
        if (nfts.length > 0) {
          await updateNFTRecords(nfts);
          const primaryNFT = await updateCitizenProfile(citizen.wallet);
          
          if (primaryNFT) {
            console.log(`Updated ${citizen.nickname || citizen.wallet.slice(0, 8)}: ${primaryNFT}`);
            citizensUpdated++;
          }
          
          totalNFTs += nfts.length;
        }
        
        // Rate limiting to respect API limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing ${citizen.nickname}: ${error.message}`);
      }
    }
    
    console.log(`Daily refresh completed: ${citizensUpdated}/${citizens.length} citizens updated, ${totalNFTs} total NFTs`);
    
    // Log completion to database
    await client.query(`
      INSERT INTO nft_refresh_log (refresh_date, citizens_processed, nfts_updated) 
      VALUES (CURRENT_TIMESTAMP, $1, $2)
    `, [citizens.length, totalNFTs]);
    
  } finally {
    client.release();
  }
}

/**
 * Initialize refresh log table
 */
async function initializeRefreshLog() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nft_refresh_log (
        id SERIAL PRIMARY KEY,
        refresh_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        citizens_processed INTEGER,
        nfts_updated INTEGER
      )
    `);
  } finally {
    client.release();
  }
}

/**
 * Start daily refresh scheduler
 */
async function startDailyRefreshScheduler() {
  await initializeRefreshLog();
  
  // Schedule daily refresh at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    await performDailyRefresh();
  });
  
  console.log('Daily NFT refresh scheduler started (2 AM UTC daily)');
}

export { performDailyRefresh, startDailyRefreshScheduler };