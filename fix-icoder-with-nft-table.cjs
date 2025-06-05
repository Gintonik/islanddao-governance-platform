/**
 * Fix Icoder by properly inserting NFT data into nfts table first
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixIcoderWithNftTable() {
  console.log('FIXING ICODER WITH PROPER NFT TABLE INSERTION');
  console.log('==============================================');
  
  const client = await pool.connect();
  
  try {
    const nftId = 'JCir8D6jymumd7GfKowU1f2d8fZmr8ayrUfEjviouEqK';
    const imageUrl = 'https://ipfs.io/ipfs/QmP1Zw8bAACcahZfKDCz1JDT1NNqthoSgBfMJFxJ6U7Qbt';
    const walletAddress = 'EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6';
    
    // Check if NFT already exists in nfts table
    const existingNft = await client.query('SELECT id FROM nfts WHERE id = $1', [nftId]);
    
    if (existingNft.rows.length === 0) {
      console.log('Inserting NFT into nfts table...');
      
      // Fetch NFT metadata for complete insertion
      const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-asset',
          method: 'getAsset',
          params: { id: nftId }
        })
      });
      
      const result = await response.json();
      const nft = result.result;
      
      // Insert NFT with proper metadata
      await client.query(`
        INSERT INTO nfts (id, name, image, collection_id, metadata, owner_wallet)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          image = EXCLUDED.image,
          metadata = EXCLUDED.metadata,
          owner_wallet = EXCLUDED.owner_wallet,
          updated_at = NOW()
      `, [
        nftId,
        nft.content?.metadata?.name || 'Unknown NFT',
        imageUrl,
        nft.grouping && nft.grouping.length > 0 ? nft.grouping[0].group_value : null,
        JSON.stringify(nft.content || {}),
        walletAddress
      ]);
      
      console.log('✅ NFT inserted into nfts table');
    } else {
      console.log('✓ NFT already exists in nfts table');
    }
    
    // Now update citizen record
    const updateResult = await client.query(`
      UPDATE citizens 
      SET 
        pfp_nft = $1,
        image_url = $2,
        updated_at = NOW()
      WHERE wallet = $3
      RETURNING id, nickname, wallet, pfp_nft, image_url
    `, [nftId, imageUrl, walletAddress]);
    
    if (updateResult.rows.length > 0) {
      const citizen = updateResult.rows[0];
      console.log('✅ Successfully updated Icoder:');
      console.log(`   Nickname: ${citizen.nickname}`);
      console.log(`   PFP NFT: ${citizen.pfp_nft}`);
      console.log(`   Image URL: ${citizen.image_url.substring(0, 60)}...`);
    }
    
  } finally {
    client.release();
  }
}

fixIcoderWithNftTable().catch(console.error);