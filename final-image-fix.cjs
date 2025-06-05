/**
 * Final Image Fix - Handle all broken pin cases including missing PFP NFTs
 * Create permanent fallback images and fix all loading issues
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Generate personalized SVG for citizens without PFP NFTs
function generatePersonalizedSVG(nickname) {
  const initial = nickname ? nickname.charAt(0).toUpperCase() : 'C';
  const colors = [
    '#4facfe', '#00c9ff', '#fc466b', '#3f5efb', 
    '#667eea', '#764ba2', '#f093fb', '#f5576c'
  ];
  const color = colors[nickname ? nickname.length % colors.length : 0];
  
  return `data:image/svg+xml;base64,${Buffer.from(`
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="20" fill="${color}"/>
      <text x="20" y="26" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif" font-weight="bold">${initial}</text>
    </svg>
  `).toString('base64')}`;
}

async function finalImageFix() {
  console.log('FINAL COMPREHENSIVE IMAGE FIX');
  console.log('==============================');
  
  const client = await pool.connect();
  
  try {
    // Get all citizens
    const result = await client.query(`
      SELECT id, wallet, nickname, pfp_nft, image_url
      FROM citizens 
      ORDER BY nickname
    `);
    
    console.log(`Processing ${result.rows.length} citizens:`);
    
    let fixed = 0;
    let errors = 0;
    let fallbacks = 0;
    
    for (const citizen of result.rows) {
      console.log(`\n${citizen.nickname || 'Anonymous'} (${citizen.wallet.substring(0, 8)}...)`);
      
      // Check if image URL exists and is valid
      if (citizen.image_url && citizen.image_url.length > 10) {
        try {
          // Test if the image loads
          const response = await fetch(citizen.image_url, { method: 'HEAD' });
          if (response.ok) {
            console.log('  ✓ Image URL is working');
            continue;
          } else {
            console.log(`  ⚠️  Image URL returns ${response.status}, need to fix`);
          }
        } catch (error) {
          console.log('  ❌ Image URL is not accessible, need to fix');
        }
      }
      
      // Try to fetch NFT metadata if PFP NFT exists
      if (citizen.pfp_nft) {
        try {
          console.log(`  🔍 Fetching NFT metadata: ${citizen.pfp_nft}`);
          
          const metadataResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'get-asset',
              method: 'getAsset',
              params: { id: citizen.pfp_nft }
            })
          });
          
          const metadataResult = await metadataResponse.json();
          
          if (metadataResult.result && metadataResult.result.content) {
            let imageUrl = null;
            
            // Try multiple sources for image URL
            if (metadataResult.result.content.files && metadataResult.result.content.files.length > 0) {
              const imageFile = metadataResult.result.content.files.find(file => 
                file.mime && file.mime.startsWith('image/')
              );
              if (imageFile && imageFile.uri) {
                imageUrl = imageFile.uri.replace('gateway.irys.xyz', 'uploader.irys.xyz');
              }
            }
            
            if (!imageUrl && metadataResult.result.content.links && metadataResult.result.content.links.image) {
              imageUrl = metadataResult.result.content.links.image.replace('gateway.irys.xyz', 'uploader.irys.xyz');
            }
            
            if (imageUrl) {
              console.log(`  ✅ Found NFT image: ${imageUrl.substring(0, 50)}...`);
              
              await client.query(`
                UPDATE citizens 
                SET image_url = $1, updated_at = NOW()
                WHERE id = $2
              `, [imageUrl, citizen.id]);
              
              console.log('  💾 Database updated with NFT image');
              fixed++;
              continue;
            }
          }
        } catch (error) {
          console.log(`  ⚠️  Could not fetch NFT metadata: ${error.message}`);
        }
      }
      
      // Create personalized fallback SVG
      console.log('  🎨 Creating personalized fallback image');
      const fallbackSVG = generatePersonalizedSVG(citizen.nickname);
      
      await client.query(`
        UPDATE citizens 
        SET image_url = $1, updated_at = NOW()
        WHERE id = $2
      `, [fallbackSVG, citizen.id]);
      
      console.log('  💾 Database updated with personalized fallback');
      fallbacks++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n=== FINAL RESULTS ===');
    console.log(`✅ Fixed with NFT images: ${fixed}`);
    console.log(`🎨 Created fallback images: ${fallbacks}`);
    console.log(`❌ Errors: ${errors}`);
    
    // Final verification
    const verifyResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 END) as with_images
      FROM citizens
    `);
    
    const stats = verifyResult.rows[0];
    console.log(`\n📊 Final Status:`);
    console.log(`   Total citizens: ${stats.total}`);
    console.log(`   With images: ${stats.with_images}`);
    console.log(`   Success rate: ${((stats.with_images / stats.total) * 100).toFixed(1)}%`);
    
  } finally {
    client.release();
  }
}

finalImageFix().catch(console.error);