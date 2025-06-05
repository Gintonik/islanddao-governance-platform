/**
 * Update Icoder's database record with authentic blockchain NFT data
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function updateIcoderDatabase() {
  console.log('UPDATING ICODER DATABASE WITH BLOCKCHAIN DATA');
  console.log('=============================================');
  
  const client = await pool.connect();
  
  try {
    // Update Icoder with the authentic NFT data from blockchain
    const result = await client.query(`
      UPDATE citizens 
      SET 
        pfp_nft = $1,
        image_url = $2,
        updated_at = NOW()
      WHERE wallet = $3
      RETURNING id, nickname, wallet, pfp_nft, image_url
    `, [
      'JCir8D6jymumd7GfKowU1f2d8fZmr8ayrUfEjviouEqK',
      'https://ipfs.io/ipfs/QmP1Zw8bAACcahZfKDCz1JDT1NNqthoSgBfMJFxJ6U7Qbt',
      'EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6'
    ]);
    
    if (result.rows.length > 0) {
      const citizen = result.rows[0];
      console.log('✅ Successfully updated Icoder:');
      console.log(`   ID: ${citizen.id}`);
      console.log(`   Nickname: ${citizen.nickname}`);
      console.log(`   Wallet: ${citizen.wallet}`);
      console.log(`   PFP NFT: ${citizen.pfp_nft}`);
      console.log(`   Image URL: ${citizen.image_url.substring(0, 60)}...`);
    } else {
      console.log('❌ No citizen found with that wallet address');
    }
    
  } finally {
    client.release();
  }
}

updateIcoderDatabase().catch(console.error);