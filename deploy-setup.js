/**
 * Deployment Setup Script
 * 
 * This script ensures the deployed application has complete NFT collection data
 * by synchronizing the database with the latest NFT ownership information.
 */

const db = require('./db');
const syncScript = require('./sync-nft-collection');

async function setupDeployment() {
  try {
    console.log('🚀 Setting up deployment with complete NFT data...');
    
    // Initialize the database
    await db.initializeDatabase();
    console.log('✅ Database initialized');
    
    // Sync the complete NFT collection
    console.log('📡 Fetching complete NFT collection...');
    const syncResult = await syncScript.syncNFTCollection();
    
    if (syncResult.success) {
      console.log(`✅ Successfully synced ${syncResult.totalNfts} NFTs`);
      console.log(`✅ Database updated with ${syncResult.dbResults?.inserted || 0} new NFTs`);
      console.log('🎉 Deployment setup complete! All citizen profiles will show complete NFT collections.');
    } else {
      console.error('❌ Failed to sync NFT collection:', syncResult.error);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Deployment setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDeployment();
}

module.exports = { setupDeployment };