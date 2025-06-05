/**
 * Verify Icoder owns PERKS NFTs from the correct collection
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PERKS_COLLECTION = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

async function verifyIcoderPerks() {
  console.log('VERIFYING ICODER PERKS OWNERSHIP');
  console.log('================================');
  
  const icoderWallet = 'EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6';
  
  try {
    // Check for PERKS NFTs specifically
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'perks-check',
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
      // Filter for PERKS collection NFTs
      const perksNFTs = result.result.items.filter(nft => {
        if (nft.grouping) {
          return nft.grouping.some(group => 
            group.group_key === 'collection' && 
            group.group_value === PERKS_COLLECTION
          );
        }
        return nft.content?.metadata?.name?.includes('PERK');
      });
      
      console.log(`\nPERKS NFTs found: ${perksNFTs.length}`);
      
      if (perksNFTs.length > 0) {
        console.log('\nPERKS NFTs owned by Icoder:');
        perksNFTs.slice(0, 5).forEach((nft, index) => {
          console.log(`${index + 1}. ${nft.content?.metadata?.name || 'PERK NFT'} (${nft.id})`);
        });
        
        // Update database with proper PERKS NFT
        const client = await pool.connect();
        try {
          const primaryPerk = perksNFTs[0];
          let imageUrl = null;
          
          if (primaryPerk.content.files && primaryPerk.content.files.length > 0) {
            const imageFile = primaryPerk.content.files.find(file => file.mime && file.mime.startsWith('image/'));
            if (imageFile) {
              imageUrl = imageFile.uri.replace('gateway.irys.xyz', 'uploader.irys.xyz');
            }
          }
          if (!imageUrl && primaryPerk.content.links && primaryPerk.content.links.image) {
            imageUrl = primaryPerk.content.links.image.replace('gateway.irys.xyz', 'uploader.irys.xyz');
          }
          
          // Insert PERKS NFT into nfts table
          await client.query(`
            INSERT INTO nfts (mint_id, name, image_url, owner, last_updated)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (mint_id) DO UPDATE SET
              name = EXCLUDED.name,
              image_url = EXCLUDED.image_url,
              owner = EXCLUDED.owner,
              last_updated = NOW()
          `, [
            primaryPerk.id,
            primaryPerk.content?.metadata?.name || 'PERK NFT',
            imageUrl,
            icoderWallet
          ]);
          
          // Update citizen with PERKS NFT
          await client.query(`
            UPDATE citizens 
            SET 
              pfp_nft = $1,
              image_url = $2,
              updated_at = NOW()
            WHERE wallet = $3
          `, [primaryPerk.id, imageUrl, icoderWallet]);
          
          console.log(`\n✅ Updated Icoder with PERKS NFT: ${primaryPerk.content?.metadata?.name}`);
          
        } finally {
          client.release();
        }
      } else {
        console.log('\n❌ Icoder does not own any PERKS NFTs');
        console.log('According to PERKS collection rules, this citizen should be removed from the map');
      }
    }
    
  } catch (error) {
    console.error('Error verifying PERKS ownership:', error.message);
  }
}

verifyIcoderPerks().catch(console.error);