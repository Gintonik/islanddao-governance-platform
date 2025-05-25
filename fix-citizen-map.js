/**
 * Fix for Citizen Map NFT Display
 * 
 * This script will update existing citizen data to include proper NFT metadata
 * from the database, ensuring the map displays the correct images and names.
 */

const db = require('./db');
const fs = require('fs').promises;
const path = require('path');

async function fixCitizenMapData() {
  try {
    console.log('Starting Citizen Map data fix...');
    
    // Initialize database
    await db.initializeDatabase();
    console.log('Database initialized');
    
    // Get all citizens with their NFT data from the database
    const citizens = await db.getAllCitizens();
    console.log(`Found ${citizens.length} citizens to fix`);
    
    if (citizens.length === 0) {
      console.log('No citizens found in database. Nothing to fix.');
      return;
    }
    
    // For each citizen without a primary NFT, set the first NFT as primary
    for (const citizen of citizens) {
      if (!citizen.primaryNft && citizen.nfts && citizen.nfts.length > 0) {
        console.log(`Setting primary NFT for citizen ${citizen.id}`);
        
        const client = await db.pool.connect();
        try {
          await client.query(
            'UPDATE citizens SET primary_nft = $1 WHERE id = $2',
            [citizen.nfts[0], citizen.id]
          );
          
          // Update the citizen object too
          citizen.primaryNft = citizen.nfts[0];
          console.log(`Updated primary NFT to ${citizen.primaryNft}`);
        } catch (error) {
          console.error(`Error updating primary NFT for citizen ${citizen.id}:`, error);
        } finally {
          client.release();
        }
      }
    }
    
    // Now regenerate the citizens.json file with the updated data
    const updatedCitizens = await db.getAllCitizens();
    
    console.log('Updated citizens data with primary NFTs');
    console.log('Saving to citizens.json...');
    
    // Write the updated data to the file
    await fs.writeFile(
      path.join(__dirname, 'citizens.json'),
      JSON.stringify(updatedCitizens, null, 2)
    );
    
    console.log('Citizens data fix completed successfully');
    console.log('You should now see correct NFT images on the Citizen Map');
    
    return { success: true, citizensFixed: updatedCitizens.length };
  } catch (error) {
    console.error('Error fixing citizen map data:', error);
    return { success: false, error: error.message };
  }
}

// Run the fix
fixCitizenMapData().then(result => {
  console.log('Result:', result);
  process.exit(result.success ? 0 : 1);
});