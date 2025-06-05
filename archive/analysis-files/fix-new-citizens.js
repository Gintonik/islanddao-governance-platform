/**
 * Fix governance power and NFT metadata for new citizens
 */

const newCitizens = [
  "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy",
  "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww"
];

async function fixNewCitizens() {
  console.log("=== Fixing New Citizens Issues ===\n");
  
  for (const wallet of newCitizens) {
    console.log(`Processing citizen: ${wallet.substring(0, 8)}...`);
    
    try {
      // Calculate governance power
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${wallet}`);
      const governanceData = await response.json();
      
      console.log(`  Governance Power: ${(governanceData.nativeGovernancePower || 0).toLocaleString()} ISLAND`);
      
      // Get NFT data
      const nftResponse = await fetch(`http://localhost:5000/api/wallet-nfts?wallet=${wallet}`);
      const nftData = await nftResponse.json();
      
      console.log(`  NFTs Found: ${nftData.length}`);
      
      if (nftData.length > 0) {
        console.log(`  Sample NFT: ${nftData[0].name}`);
        console.log(`  Image URL: ${nftData[0].content?.links?.image || 'Missing'}`);
      }
      
    } catch (error) {
      console.error(`  Error processing ${wallet}: ${error.message}`);
    }
    
    console.log();
  }
  
  console.log("=== Analysis Complete ===");
  console.log("\nIssues Identified:");
  console.log("1. New citizens not automatically added to governance sync");
  console.log("2. NFT metadata not properly fetched during pin placement");
  console.log("3. Daily sync should include all database citizens");
}

fixNewCitizens().catch(console.error);