/**
 * Add new citizens to governance tracking system
 * Process the 6 new citizens found on the map
 */

const newCitizens = [
  { nickname: "scientistjoe", wallet: "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww" },
  { nickname: "Titanmaker", wallet: "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1" },
  { nickname: "Kegomaz", wallet: "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy" },
  { nickname: "Mila", wallet: "B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST" },
  { nickname: "Icoder", wallet: "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6" },
  { nickname: "Moviendome", wallet: "EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF" }
];

async function processNewCitizens() {
  console.log('=== PROCESSING 6 NEW CITIZENS ===\n');
  
  const results = [];
  
  for (const citizen of newCitizens) {
    console.log(`Processing: ${citizen.nickname} (${citizen.wallet})`);
    
    try {
      // Get governance power
      const govResponse = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const govData = await govResponse.json();
      
      // Get NFT count
      const nftResponse = await fetch(`http://localhost:5000/api/nft-count/${citizen.wallet}`);
      const nftData = await nftResponse.json();
      
      const result = {
        wallet: citizen.wallet,
        nickname: citizen.nickname,
        native_governance_power: govData.nativeGovernancePower || 0,
        governance_power: govData.totalGovernancePower || 0,
        delegated_governance_power: govData.delegatedGovernancePower || 0,
        total_governance_power: govData.totalGovernancePower || 0,
        locked_governance_power: 0,
        unlocked_governance_power: govData.nativeGovernancePower || 0,
        nft_count: nftData.count || 0,
        last_updated: new Date().toISOString()
      };
      
      results.push(result);
      
      console.log(`  Native Power: ${result.native_governance_power.toLocaleString()} ISLAND`);
      console.log(`  NFT Count: ${result.nft_count}`);
      console.log(`  Added to tracking: ${new Date().toISOString()}\n`);
      
    } catch (error) {
      console.log(`  ERROR: ${error.message}\n`);
    }
  }
  
  // Summary
  console.log('=== NEW CITIZENS SUMMARY ===');
  results.forEach(citizen => {
    console.log(`${citizen.nickname}: ${citizen.native_governance_power.toLocaleString()} ISLAND (${citizen.nft_count} NFTs)`);
  });
  
  const totalNewPower = results.reduce((sum, c) => sum + c.native_governance_power, 0);
  console.log(`\nTotal new governance power: ${totalNewPower.toLocaleString()} ISLAND`);
  
  return results;
}

processNewCitizens().catch(console.error);