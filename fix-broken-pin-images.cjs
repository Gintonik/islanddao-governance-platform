/**
 * Fix broken pin images by fetching NFT metadata and updating database
 * Ensures all citizens have persistent image URLs stored
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixBrokenPinImages() {
  console.log('FIXING BROKEN PIN IMAGES');
  console.log('========================');
  
  const client = await pool.connect();
  
  try {
    // Get all citizens missing image URLs
    const result = await client.query(`
      SELECT id, wallet, nickname, pfp_nft, image_url
      FROM citizens 
      WHERE image_url IS NULL OR image_url = ''
      ORDER BY nickname
    `);
    
    console.log(`Found ${result.rows.length} citizens with missing image URLs:`);
    
    for (const citizen of result.rows) {
      console.log(`\nProcessing ${citizen.nickname || 'Anonymous'} (${citizen.wallet})`);
      
      if (!citizen.pfp_nft) {
        console.log('  ❌ No PFP NFT specified, skipping');
        continue;
      }
      
      try {
        // Fetch NFT metadata from Helius
        console.log(`  🔍 Fetching metadata for NFT: ${citizen.pfp_nft}`);
        
        const metadataResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-asset',
            method: 'getAsset',
            params: {
              id: citizen.pfp_nft
            }
          })
        });
        
        const metadataResult = await metadataResponse.json();
        
        if (metadataResult.result && metadataResult.result.content && metadataResult.result.content.files) {
          const imageFile = metadataResult.result.content.files.find(file => 
            file.mime && file.mime.startsWith('image/')
          );
          
          if (imageFile && imageFile.uri) {
            const imageUrl = imageFile.uri;
            console.log(`  ✅ Found image: ${imageUrl.substring(0, 60)}...`);
            
            // Update database with permanent image URL
            await client.query(`
              UPDATE citizens 
              SET image_url = $1, updated_at = NOW()
              WHERE id = $2
            `, [imageUrl, citizen.id]);
            
            console.log('  💾 Database updated with permanent image URL');
          } else {
            console.log('  ⚠️  No valid image found in NFT metadata');
          }
        } else {
          console.log('  ❌ Failed to fetch NFT metadata');
        }
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  ❌ Error processing ${citizen.nickname}: ${error.message}`);
      }
    }
    
    // Verify the fixes
    console.log('\n=== VERIFICATION ===');
    const verifyResult = await client.query(`
      SELECT nickname, wallet, 
             CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 'HAS_IMAGE' ELSE 'MISSING_IMAGE' END as status
      FROM citizens 
      ORDER BY nickname
    `);
    
    const withImages = verifyResult.rows.filter(row => row.status === 'HAS_IMAGE').length;
    const missingImages = verifyResult.rows.filter(row => row.status === 'MISSING_IMAGE').length;
    
    console.log(`\nResults:`);
    console.log(`  ✅ Citizens with images: ${withImages}`);
    console.log(`  ❌ Citizens still missing images: ${missingImages}`);
    
    if (missingImages > 0) {
      console.log('\nCitizens still missing images:');
      verifyResult.rows
        .filter(row => row.status === 'MISSING_IMAGE')
        .forEach(row => {
          console.log(`  - ${row.nickname || 'Anonymous'} (${row.wallet.substring(0, 8)}...)`);
        });
    }
    
  } finally {
    client.release();
  }
}

fixBrokenPinImages().catch(console.error);