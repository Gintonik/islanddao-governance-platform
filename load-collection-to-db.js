// Import the collection data from the JSON files into the database
const fs = require('fs');
const db = require('./db');

async function loadCollectionToDatabase() {
  try {
    console.log('Initializing database...');
    await db.initializeDatabase();
    
    console.log('Loading collection data from JSON files...');
    
    // Load the collection data
    const collectionData = JSON.parse(fs.readFileSync('./perks-collection.json', 'utf8'));
    
    console.log(`Found ${collectionData.length} NFTs in collection data.`);
    
    // Connect to the database
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log('Importing NFTs to database...');
      let imported = 0;
      
      // Insert each NFT into the database
      for (const nft of collectionData) {
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
        
        imported++;
        if (imported % 100 === 0) {
          console.log(`Imported ${imported}/${collectionData.length} NFTs...`);
        }
      }
      
      await client.query('COMMIT');
      console.log(`Successfully imported ${imported} NFTs to database.`);
      
      // Verify the import
      const result = await client.query('SELECT COUNT(*) FROM nfts');
      console.log(`Database now contains ${result.rows[0].count} NFTs.`);
      
      return {
        success: true,
        imported,
        total: result.rows[0].count
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error importing collection data:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in loadCollectionToDatabase:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the script if it's called directly
if (require.main === module) {
  loadCollectionToDatabase().then(result => {
    if (result.success) {
      console.log('Collection data successfully loaded to database.');
      process.exit(0);
    } else {
      console.error('Failed to load collection data:', result.error);
      process.exit(1);
    }
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = loadCollectionToDatabase;