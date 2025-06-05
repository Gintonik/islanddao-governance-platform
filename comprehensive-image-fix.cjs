/**
 * Comprehensive Image Fix - Fetch all missing NFT images and update database
 * Ensures permanent profile picture storage for all citizens
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function comprehensiveImageFix() {
  console.log('COMPREHENSIVE IMAGE FIX');
  console.log('========================');
  
  const client = await pool.connect();
  
  try {
    // Get all citizens with their NFT data
    const result = await client.query(`
      SELECT id, wallet, nickname, pfp_nft, image_url
      FROM citizens 
      ORDER BY nickname
    `);
    
    console.log(`Processing ${result.rows.length} citizens for image fixes:`);
    
    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const citizen of result.rows) {
      console.log(`\n${citizen.nickname || 'Anonymous'} (${citizen.wallet.substring(0, 8)}...)`);
      
      // Skip if already has valid image URL
      if (citizen.image_url && citizen.image_url.length > 10) {
        console.log('  ✓ Already has image URL, skipping');
        skipped++;
        continue;
      }
      
      if (!citizen.pfp_nft) {
        console.log('  ⚠️  No PFP NFT specified');
        skipped++;
        continue;
      }
      
      try {
        console.log(`  🔍 Fetching NFT metadata: ${citizen.pfp_nft}`);
        
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
        
        if (metadataResult.result && metadataResult.result.content) {
          let imageUrl = null;
          
          // Try files array first
          if (metadataResult.result.content.files && metadataResult.result.content.files.length > 0) {
            const imageFile = metadataResult.result.content.files.find(file => 
              file.mime && file.mime.startsWith('image/')
            );
            if (imageFile && imageFile.uri) {
              imageUrl = imageFile.uri;
            }
          }
          
          // Try links object
          if (!imageUrl && metadataResult.result.content.links) {
            if (metadataResult.result.content.links.image) {
              imageUrl = metadataResult.result.content.links.image;
            }
          }
          
          // Try JSON metadata
          if (!imageUrl && metadataResult.result.content.json_uri) {
            try {
              const jsonResponse = await fetch(metadataResult.result.content.json_uri);
              const jsonData = await jsonResponse.json();
              if (jsonData.image) {
                imageUrl = jsonData.image;
              }
            } catch (jsonError) {
              console.log('    ⚠️  Could not fetch JSON metadata');
            }
          }
          
          if (imageUrl) {
            console.log(`  ✅ Found image: ${imageUrl.substring(0, 50)}...`);
            
            // Update database with permanent image URL
            await client.query(`
              UPDATE citizens 
              SET image_url = $1, updated_at = NOW()
              WHERE id = $2
            `, [imageUrl, citizen.id]);
            
            console.log('  💾 Database updated');
            fixed++;
          } else {
            console.log('  ❌ No image found in NFT metadata');
            errors++;
          }
        } else {
          console.log('  ❌ Failed to fetch NFT metadata');
          errors++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n=== FINAL RESULTS ===');
    console.log(`✅ Fixed: ${fixed} citizens`);
    console.log(`⏭️  Skipped: ${skipped} citizens`);
    console.log(`❌ Errors: ${errors} citizens`);
    
    // Verify final state
    const verifyResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(image_url) as with_images,
        COUNT(*) - COUNT(image_url) as missing_images
      FROM citizens
    `);
    
    const stats = verifyResult.rows[0];
    console.log(`\n📊 Database Status:`);
    console.log(`   Total citizens: ${stats.total}`);
    console.log(`   With images: ${stats.with_images}`);
    console.log(`   Missing images: ${stats.missing_images}`);
    
  } finally {
    client.release();
  }
}

comprehensiveImageFix().catch(console.error);