/**
 * PERKS Collection Verification
 * Specifically verify PERKS collection NFT ownership for citizen profile pictures
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// PERKS collection identifier (corrected)
const PERKS_COLLECTION = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Get PERKS collection NFTs for a wallet
 */
async function getPERKSNFTs(walletAddress) {
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `perks-${walletAddress}`,
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
      // Filter specifically for PERKS collection
      const perksNFTs = data.result.items.filter(nft => {
        if (nft.grouping) {
          return nft.grouping.some(group => 
            group.group_key === 'collection' && 
            group.group_value === PERKS_COLLECTION
          );
        }
        // Also check if name contains "PERK"
        return nft.content?.metadata?.name?.includes('PERK');
      });

      return perksNFTs.map(nft => ({
        mint_id: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image,
        json_uri: nft.content?.json_uri,
        owner: walletAddress
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching PERKS for ${walletAddress}: ${error.message}`);
    return [];
  }
}

/**
 * Verify PERKS collection ownership for all citizens
 */
async function verifyPERKSOwnership() {
  const client = await pool.connect();
  
  try {
    console.log('Verifying PERKS collection ownership for all citizens...\n');
    
    const result = await client.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    let totalPERKSFound = 0;
    let citizensWithPERKS = 0;
    
    for (const citizen of citizens) {
      try {
        console.log(`Checking ${citizen.nickname || citizen.wallet.slice(0, 8)}...`);
        
        const perksNFTs = await getPERKSNFTs(citizen.wallet);
        
        if (perksNFTs.length > 0) {
          console.log(`  PERKS found: ${perksNFTs.length}`);
          
          // Show PERKS names
          const perkNames = perksNFTs.slice(0, 3).map(nft => nft.name);
          console.log(`  PERKS: ${perkNames.join(', ')}`);
          
          totalPERKSFound += perksNFTs.length;
          citizensWithPERKS++;
        } else {
          console.log(`  No PERKS NFTs found`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error checking ${citizen.nickname}: ${error.message}`);
      }
    }
    
    // Compare with current database PERKS
    const dbPERKS = await client.query(`
      SELECT COUNT(*) as count 
      FROM nfts 
      WHERE name LIKE 'PERK %'
    `);
    
    console.log('\n--- PERKS Collection Verification ---');
    console.log(`Citizens checked: ${citizens.length}`);
    console.log(`Citizens with PERKS: ${citizensWithPERKS}`);
    console.log(`Total PERKS found on-chain: ${totalPERKSFound}`);
    console.log(`PERKS in database: ${dbPERKS.rows[0].count}`);
    console.log(`Collection status: ${totalPERKSFound > 0 ? 'VERIFIED' : 'NEEDS UPDATE'}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

verifyPERKSOwnership();