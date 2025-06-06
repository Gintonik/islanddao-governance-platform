/**
 * Restore NFT Metadata After Rollback
 * Safely rebuild NFT metadata and image URLs for all citizens
 */

import { Pool } from 'pg';
import fetch from 'node-fetch';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get NFT metadata from Helius API
async function fetchNFTMetadata(walletAddress) {
  try {
    const response = await fetch(`http://localhost:5000/api/wallet-nfts?wallet=${walletAddress}`);
    const data = await response.json();
    
    if (data && data.nfts && Array.isArray(data.nfts)) {
      return data.nfts;
    }
    
    return [];
  } catch (error) {
    console.error(`Failed to fetch NFTs for ${walletAddress}:`, error.message);
    return [];
  }
}

// Restore metadata for a single citizen
async function restoreCitizenMetadata(client, citizen) {
  try {
    const walletShort = citizen.wallet.slice(0, 8);
    console.log(`Restoring ${citizen.nickname || walletShort}...`);
    
    // Get current NFTs from blockchain
    const nfts = await fetchNFTMetadata(citizen.wallet);
    
    if (nfts.length === 0) {
      console.log(`  No NFTs found for ${citizen.nickname || walletShort}`);
      return;
    }
    
    // Find the NFT that matches their selected PFP
    let pfpImageUrl = '';
    let primaryImageUrl = '';
    
    // Look for their selected PFP NFT
    if (citizen.pfp_nft) {
      const pfpNft = nfts.find(nft => nft.id === citizen.pfp_nft);
      if (pfpNft && pfpNft.image) {
        pfpImageUrl = pfpNft.image;
        primaryImageUrl = pfpNft.image;
      }
    }
    
    // Fallback to first NFT if PFP not found
    if (!pfpImageUrl && nfts.length > 0) {
      pfpImageUrl = nfts[0].image;
      primaryImageUrl = nfts[0].image;
    }
    
    // Create NFT metadata object
    const nftMetadata = nfts.map(nft => ({
      mint: nft.id,
      name: nft.name,
      image: nft.image
    }));
    
    // Update database with restored metadata
    await client.query(`
      UPDATE citizens SET 
        image_url = $1,
        nft_metadata = $2,
        updated_at = NOW()
      WHERE wallet = $3
    `, [
      primaryImageUrl,
      JSON.stringify(nftMetadata),
      citizen.wallet
    ]);
    
    console.log(`  ✅ Restored ${nfts.length} NFTs for ${citizen.nickname || walletShort}`);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
    
  } catch (error) {
    console.error(`  ❌ Error restoring ${citizen.nickname}: ${error.message}`);
  }
}

// Main restoration function
async function restoreAllNFTMetadata() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting NFT metadata restoration...');
    
    // Get all citizens missing metadata
    const result = await client.query(`
      SELECT wallet, nickname, pfp_nft, primary_nft, image_url, nft_metadata
      FROM citizens 
      WHERE image_url IS NULL OR image_url = '' OR nft_metadata IS NULL OR nft_metadata = ''
      ORDER BY nickname
    `);
    
    const citizens = result.rows;
    console.log(`📊 Found ${citizens.length} citizens needing metadata restoration`);
    
    if (citizens.length === 0) {
      console.log('✅ All citizens already have metadata');
      return;
    }
    
    await client.query('BEGIN');
    
    let restored = 0;
    let failed = 0;
    
    for (const citizen of citizens) {
      try {
        await restoreCitizenMetadata(client, citizen);
        restored++;
      } catch (error) {
        console.error(`Failed to restore ${citizen.nickname}: ${error.message}`);
        failed++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ NFT metadata restoration completed:`);
    console.log(`   🔄 Citizens processed: ${citizens.length}`);
    console.log(`   ✅ Successfully restored: ${restored}`);
    console.log(`   ❌ Failed: ${failed}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('💥 Restoration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting NFT metadata restoration...');
  restoreAllNFTMetadata().then(() => {
    console.log('Restoration completed successfully');
    process.exit(0);
  }).catch(error => {
    console.error('Restoration failed:', error);
    process.exit(1);
  });
}

export { restoreAllNFTMetadata };