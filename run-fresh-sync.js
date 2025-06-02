/**
 * Run Fresh NFT Sync
 * Performs immediate comprehensive refresh of all citizen NFT ownership data
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function comprehensiveNFTSync() {
  const client = await pool.connect();
  
  try {
    console.log('Starting comprehensive NFT ownership sync...');
    
    const result = await client.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    let totalNFTs = 0;
    let citizensUpdated = 0;
    
    for (const citizen of citizens) {
      try {
        console.log(`Processing ${citizen.nickname || citizen.wallet.slice(0, 8)}...`);
        
        const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
        
        const response = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-assets',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: citizen.wallet,
              page: 1,
              limit: 1000
            }
          })
        });

        const data = await response.json();
        
        if (data.result && data.result.items) {
          const nfts = data.result.items
            .filter(nft => nft.interface === 'V1_NFT' || nft.interface === 'ProgrammableNFT')
            .map(nft => ({
              mint_id: nft.id,
              name: nft.content?.metadata?.name || `NFT ${nft.id.slice(0, 8)}`,
              image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image,
              json_uri: nft.content?.json_uri,
              owner: citizen.wallet
            }));
          
          console.log(`Found ${nfts.length} NFTs for ${citizen.nickname || citizen.wallet.slice(0, 8)}`);
          
          // Update NFT records
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
          
          // Update citizen primary NFT
          if (nfts.length > 0) {
            const primaryNFT = nfts[0];
            await client.query(`
              UPDATE citizens 
              SET primary_nft = $1, pfp_nft = $1, image_url = $2
              WHERE wallet = $3
            `, [primaryNFT.mint_id, primaryNFT.image_url, citizen.wallet]);
            
            citizensUpdated++;
          }
          
          totalNFTs += nfts.length;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 400));
        
      } catch (error) {
        console.error(`Error processing ${citizen.nickname}: ${error.message}`);
      }
    }
    
    console.log(`Sync completed: ${citizensUpdated}/${citizens.length} citizens updated, ${totalNFTs} total NFTs`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

comprehensiveNFTSync();