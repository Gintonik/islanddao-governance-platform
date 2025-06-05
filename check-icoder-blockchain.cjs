/**
 * Check Icoder's actual NFT ownership from fresh blockchain data
 * Verify what NFTs they actually own and update database accordingly
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkIcoderBlockchain() {
  console.log('CHECKING ICODER BLOCKCHAIN DATA');
  console.log('===============================');
  
  const icoderWallet = 'EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6';
  console.log(`Wallet: ${icoderWallet}`);
  
  try {
    console.log('\n🔍 Fetching fresh NFT data from Helius...');
    
    // Get all NFTs owned by Icoder from blockchain
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: icoderWallet,
          page: 1,
          limit: 1000
        }
      })
    });
    
    const result = await response.json();
    
    if (result.result && result.result.items) {
      const nfts = result.result.items;
      console.log(`\n📊 Found ${nfts.length} NFTs owned by Icoder:`);
      
      // Filter for image NFTs that could be used as profile pictures
      const imageNFTs = nfts.filter(nft => {
        if (!nft.content) return false;
        
        // Check if it has image files
        if (nft.content.files && nft.content.files.length > 0) {
          return nft.content.files.some(file => file.mime && file.mime.startsWith('image/'));
        }
        
        // Check if it has image links
        if (nft.content.links && nft.content.links.image) {
          return true;
        }
        
        return false;
      });
      
      console.log(`\n🖼️  Image NFTs suitable for profile picture:`);
      
      imageNFTs.forEach((nft, index) => {
        console.log(`\n${index + 1}. NFT ID: ${nft.id}`);
        console.log(`   Name: ${nft.content.metadata.name || 'Unknown'}`);
        console.log(`   Collection: ${nft.grouping && nft.grouping.length > 0 ? nft.grouping[0].group_value : 'None'}`);
        
        // Get image URL
        let imageUrl = null;
        if (nft.content.files && nft.content.files.length > 0) {
          const imageFile = nft.content.files.find(file => file.mime && file.mime.startsWith('image/'));
          if (imageFile) {
            imageUrl = imageFile.uri;
          }
        }
        if (!imageUrl && nft.content.links && nft.content.links.image) {
          imageUrl = nft.content.links.image;
        }
        
        if (imageUrl) {
          console.log(`   Image: ${imageUrl.substring(0, 60)}...`);
        }
      });
      
      // Update database with current NFT ownership
      if (imageNFTs.length > 0) {
        const client = await pool.connect();
        try {
          // Use the first image NFT as profile picture
          const primaryNFT = imageNFTs[0];
          let imageUrl = null;
          
          if (primaryNFT.content.files && primaryNFT.content.files.length > 0) {
            const imageFile = primaryNFT.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
              imageUrl = imageFile.uri.replace('gateway.irys.xyz', 'uploader.irys.xyz');
            }
          }
          if (!imageUrl && primaryNFT.content.links && primaryNFT.content.links.image) {
            imageUrl = primaryNFT.content.links.image.replace('gateway.irys.xyz', 'uploader.irys.xyz');
          }
          
          console.log(`\n💾 Updating database:`);
          console.log(`   PFP NFT: ${primaryNFT.id}`);
          console.log(`   Image URL: ${imageUrl}`);
          console.log(`   NFT Count: ${nfts.length}`);
          
          await client.query(`
            UPDATE citizens 
            SET 
              pfp_nft = $1,
              image_url = $2,
              nft_count = $3,
              updated_at = NOW()
            WHERE wallet = $4
          `, [primaryNFT.id, imageUrl, nfts.length, icoderWallet]);
          
          console.log('✅ Database updated with fresh blockchain data');
          
        } finally {
          client.release();
        }
      } else {
        console.log('\n⚠️  No suitable image NFTs found for profile picture');
        console.log('   This should trigger pin removal according to your rules');
      }
      
    } else {
      console.log('❌ Failed to fetch NFT data from Helius');
      console.log('Error:', result.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('❌ Error checking blockchain data:', error.message);
  }
}

checkIcoderBlockchain().catch(console.error);