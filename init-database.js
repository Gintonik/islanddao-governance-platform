// Initialize the database and sync NFT data
const db = require('./db');
const syncNfts = require('./sync-nfts');

async function initializeAndSyncDatabase() {
  try {
    console.log('Starting database initialization and NFT sync...');
    
    // Initialize database tables
    console.log('Creating database tables...');
    await db.initializeDatabase();
    
    // Sync NFTs from Helius API to database
    console.log('Syncing NFTs from Helius API to database...');
    const totalImported = await syncNfts.syncNFTsToDatabase();
    
    console.log(`Database initialization complete. Imported ${totalImported} NFTs.`);
    console.log('You can now run the main server to use the integrated NFT Grid and Citizen Map.');
    
    return { success: true, nftsImported: totalImported };
  } catch (error) {
    console.error('Error initializing database:', error);
    return { success: false, error: error.message };
  }
}

// Run directly if this script is executed
if (require.main === module) {
  initializeAndSyncDatabase().then(result => {
    if (result.success) {
      console.log('Database initialization and sync completed successfully.');
      process.exit(0);
    } else {
      console.error('Database initialization and sync failed:', result.error);
      process.exit(1);
    }
  });
}

module.exports = initializeAndSyncDatabase;