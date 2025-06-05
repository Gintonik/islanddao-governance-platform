/**
 * Fix NFT metadata storage for new citizens with broken profile pictures
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const newCitizens = [
  "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy", // Kegomaz
  "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww"  // scientistjoe
];

async function fixNftMetadata() {
  console.log("Fixing NFT metadata for new citizens with broken profile pictures...\n");
  
  for (const wallet of newCitizens) {
    try {
      console.log(`Processing: ${wallet.substring(0, 8)}...`);
      
      // Check current database state
      const dbResult = await pool.query(`
        SELECT nickname, pfp_nft, nft_metadata 
        FROM citizens 
        WHERE wallet = $1
      `, [wallet]);
      
      if (dbResult.rows.length === 0) {
        console.log(`  ❌ Citizen not found in database`);
        continue;
      }
      
      const citizen = dbResult.rows[0];
      console.log(`  Citizen: ${citizen.nickname}`);
      console.log(`  Current PFP NFT: ${citizen.pfp_nft || 'NULL'}`);
      console.log(`  Current metadata: ${citizen.nft_metadata ? 'Present' : 'NULL'}`);
      
      // Fetch fresh NFT data from API
      const response = await fetch(`http://localhost:5000/api/wallet-nfts?wallet=${wallet}`);
      const nftData = await response.json();
      
      if (response.ok && nftData.nfts && nftData.nfts.length > 0) {
        console.log(`  Found ${nftData.nfts.length} NFTs from API`);
        
        const firstNft = nftData.nfts[0];
        console.log(`  Primary NFT: ${firstNft.name}`);
        console.log(`  Image URL: ${firstNft.image}`);
        
        // Update database with proper NFT metadata
        await pool.query(`
          UPDATE citizens 
          SET 
            nft_metadata = $1,
            pfp_nft = $2,
            primary_nft = $3,
            updated_at = NOW()
          WHERE wallet = $4
        `, [
          JSON.stringify(nftData.nfts),
          firstNft.mint,
          firstNft.mint,
          wallet
        ]);
        
        console.log(`  ✅ Updated NFT metadata and PFP for ${citizen.nickname}`);
        
      } else {
        console.log(`  ❌ No NFTs found or API error: ${JSON.stringify(nftData)}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error processing ${wallet}: ${error.message}`);
    }
    
    console.log();
  }
  
  // Verify the fixes
  console.log("Verifying NFT metadata fixes...");
  
  for (const wallet of newCitizens) {
    const result = await pool.query(`
      SELECT nickname, pfp_nft, nft_metadata 
      FROM citizens 
      WHERE wallet = $1
    `, [wallet]);
    
    if (result.rows.length > 0) {
      const citizen = result.rows[0];
      const hasMetadata = citizen.nft_metadata && citizen.nft_metadata !== 'null';
      const hasPfp = citizen.pfp_nft && citizen.pfp_nft !== 'null';
      
      console.log(`  ${citizen.nickname}: Metadata ${hasMetadata ? '✅' : '❌'}, PFP ${hasPfp ? '✅' : '❌'}`);
    }
  }
  
  await pool.end();
  console.log("\nNFT metadata fix complete. Refresh the citizen map to see updated profile pictures.");
}

fixNftMetadata().catch(console.error);