// Update database with real NFT data from Helius API
const fs = require('fs');
const db = require('./db');

async function updateDatabaseWithRealData() {
  try {
    console.log('Initializing database...');
    await db.initializeDatabase();
    
    console.log('Reading real NFT data...');
    const realNfts = JSON.parse(fs.readFileSync('./real-perks-collection.json', 'utf8'));
    
    console.log(`Found ${realNfts.length} real NFTs to import.`);
    
    // Connect to the database
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log('Updating NFTs in database with real data...');
      let updated = 0;
      
      // Insert each NFT into the database
      for (const nft of realNfts) {
        await client.query(
          `INSERT INTO nfts (mint_id, name, image_url, json_uri, owner, last_updated)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (mint_id) 
           DO UPDATE SET 
             name = $2,
             image_url = $3,
             json_uri = $4,
             owner = $5,
             last_updated = CURRENT_TIMESTAMP`,
          [
            nft.id,
            nft.name,
            nft.imageUrl,
            nft.jsonUri || '',
            nft.owner || ''
          ]
        );
        
        updated++;
        if (updated % 100 === 0) {
          console.log(`Updated ${updated}/${realNfts.length} NFTs...`);
        }
      }
      
      await client.query('COMMIT');
      console.log(`Successfully updated ${updated} NFTs in database.`);
      
      // Check for the specific wallet address we're interested in
      const targetWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
      
      const result = await client.query(
        'SELECT mint_id, name, image_url FROM nfts WHERE owner = $1',
        [targetWallet]
      );
      
      if (result.rows.length > 0) {
        console.log(`\nVerifying data for wallet ${targetWallet}:`);
        result.rows.forEach(nft => {
          console.log(`- ${nft.name} (ID: ${nft.mint_id})`);
          console.log(`  Image URL: ${nft.image_url}`);
        });
      } else {
        console.log(`\nNo NFTs found in database for wallet ${targetWallet}`);
      }
      
      return { success: true, updated };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating database:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in updateDatabaseWithRealData:', error);
    return { success: false, error: error.message };
  }
}

// Run the update
updateDatabaseWithRealData().then(result => {
  if (result.success) {
    console.log('Database update completed successfully');
    process.exit(0);
  } else {
    console.error('Database update failed:', result.error);
    process.exit(1);
  }
});