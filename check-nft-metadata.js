// Test script to check NFT metadata access
const db = require('./db');

async function checkNftMetadata() {
  try {
    console.log('Checking NFT metadata in database...');
    
    // Initialize database
    await db.initializeDatabase();
    
    // Get all NFTs from database
    const nfts = await db.getAllNfts();
    console.log(`Found ${nfts.length} NFTs in database`);
    
    // Sample a few NFTs to display
    const sampleSize = Math.min(5, nfts.length);
    console.log(`\nSample of ${sampleSize} NFTs:`);
    
    for (let i = 0; i < sampleSize; i++) {
      const nft = nfts[i];
      console.log(`\nNFT ${i+1}:`);
      console.log(`  ID: ${nft.mint_id}`);
      console.log(`  Name: ${nft.name}`);
      console.log(`  Image URL: ${nft.image_url}`);
      console.log(`  Owner: ${nft.owner}`);
    }
    
    // Check NFT ownership mapping
    const ownershipMap = await db.getNftOwnershipMap();
    const walletCount = Object.keys(ownershipMap).length;
    console.log(`\nFound ${walletCount} wallet addresses with owned NFTs`);
    
    // Sample a wallet to check its NFTs
    const sampleWallet = Object.keys(ownershipMap)[0];
    if (sampleWallet) {
      const walletNfts = ownershipMap[sampleWallet];
      console.log(`\nWallet ${sampleWallet} owns ${walletNfts.length} NFTs:`);
      
      // Get metadata for one of the wallet's NFTs
      if (walletNfts.length > 0) {
        const nftId = walletNfts[0];
        
        // Get the NFT details from the database
        const nftDetails = nfts.find(n => n.mint_id === nftId);
        
        if (nftDetails) {
          console.log(`\nNFT Details for ${nftId}:`);
          console.log(`  Name: ${nftDetails.name}`);
          console.log(`  Image URL: ${nftDetails.image_url}`);
        } else {
          console.log(`\nCould not find details for NFT ${nftId}`);
        }
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error checking NFT metadata:', error);
    return { success: false, error: error.message };
  }
}

// Run the test
checkNftMetadata().then(result => {
  if (result.success) {
    console.log('\nNFT metadata check completed successfully');
  } else {
    console.error('\nNFT metadata check failed:', result.error);
    process.exit(1);
  }
});