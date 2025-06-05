/**
 * Fix Icoder using correct database schema with mint_id
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixIcoderCorrectSchema() {
  console.log('FIXING ICODER WITH CORRECT DATABASE SCHEMA');
  console.log('==========================================');
  
  const client = await pool.connect();
  
  try {
    const nftMintId = 'JCir8D6jymumd7GfKowU1f2d8fZmr8ayrUfEjviouEqK';
    const imageUrl = 'https://ipfs.io/ipfs/QmP1Zw8bAACcahZfKDCz1JDT1NNqthoSgBfMJFxJ6U7Qbt';
    const walletAddress = 'EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6';
    
    // Insert NFT into nfts table using correct schema
    await client.query(`
      INSERT INTO nfts (mint_id, name, image_url, owner, last_updated)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (mint_id) DO UPDATE SET
        name = EXCLUDED.name,
        image_url = EXCLUDED.image_url,
        owner = EXCLUDED.owner,
        last_updated = NOW()
    `, [
      nftMintId,
      'Icoder Profile NFT',
      imageUrl,
      walletAddress
    ]);
    
    console.log('✅ NFT inserted/updated in nfts table');
    
    // Update citizen record with the NFT
    const updateResult = await client.query(`
      UPDATE citizens 
      SET 
        pfp_nft = $1,
        image_url = $2,
        updated_at = NOW()
      WHERE wallet = $3
      RETURNING id, nickname, wallet, pfp_nft, image_url
    `, [nftMintId, imageUrl, walletAddress]);
    
    if (updateResult.rows.length > 0) {
      const citizen = updateResult.rows[0];
      console.log('✅ Successfully updated Icoder:');
      console.log(`   Nickname: ${citizen.nickname}`);
      console.log(`   PFP NFT: ${citizen.pfp_nft}`);
      console.log(`   Image URL: ${citizen.image_url.substring(0, 60)}...`);
      
      // Verify the fix worked
      console.log('\n🔍 Verifying citizen data:');
      const verifyResult = await client.query(`
        SELECT c.nickname, c.wallet, c.pfp_nft, c.image_url, n.name as nft_name
        FROM citizens c
        LEFT JOIN nfts n ON c.pfp_nft = n.mint_id
        WHERE c.wallet = $1
      `, [walletAddress]);
      
      if (verifyResult.rows.length > 0) {
        const data = verifyResult.rows[0];
        console.log(`   ✓ NFT properly linked: ${data.nft_name}`);
        console.log(`   ✓ Image URL stored: ${data.image_url ? 'Yes' : 'No'}`);
      }
    }
    
  } finally {
    client.release();
  }
}

fixIcoderCorrectSchema().catch(console.error);