/**
 * Test current VSR calculator to count citizens with governance power
 * Verify against the expected 14-15 citizens and Titanmaker stale deposit filtering
 */

const fs = require('fs');

async function testCurrentCalculator() {
  console.log('Testing current VSR calculator against all citizens...\n');
  
  // Load citizen data
  const citizenData = JSON.parse(fs.readFileSync('citizen-map/data/governance-power.json', 'utf8'));
  
  const results = [];
  let citizensWithPower = 0;
  
  for (const citizen of citizenData.citizens) {
    try {
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      const governancePower = data.nativeGovernancePower || 0;
      
      if (governancePower > 0) {
        citizensWithPower++;
        console.log(`✅ ${citizen.name}: ${governancePower.toLocaleString()} ISLAND`);
      } else {
        console.log(`❌ ${citizen.name}: 0 ISLAND`);
      }
      
      results.push({
        name: citizen.name,
        wallet: citizen.wallet,
        governancePower: governancePower
      });
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`⚠️ ${citizen.name}: Error - ${error.message}`);
      results.push({
        name: citizen.name,
        wallet: citizen.wallet,
        governancePower: 0,
        error: error.message
      });
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`Total citizens tested: ${citizenData.citizens.length}`);
  console.log(`Citizens with governance power: ${citizensWithPower}`);
  console.log(`Citizens without governance power: ${citizenData.citizens.length - citizensWithPower}`);
  
  // Check Titanmaker specifically
  const titanmaker = results.find(r => r.name === 'Titanmaker');
  if (titanmaker) {
    console.log(`\n🔍 Titanmaker check:`);
    console.log(`Expected: 0 ISLAND (stale deposit filtered)`);
    console.log(`Actual: ${titanmaker.governancePower.toLocaleString()} ISLAND`);
    console.log(`Status: ${titanmaker.governancePower === 0 ? '✅ CORRECT' : '❌ NEEDS STALE FILTERING'}`);
  }
  
  // Sort by governance power for leaderboard
  const withPower = results.filter(r => r.governancePower > 0).sort((a, b) => b.governancePower - a.governancePower);
  
  console.log(`\n🏆 Citizens with Governance Power (Top ${withPower.length}):`);
  withPower.forEach((citizen, index) => {
    console.log(`${index + 1}. ${citizen.name}: ${citizen.governancePower.toLocaleString()} ISLAND`);
  });
  
  return {
    totalCitizens: citizenData.citizens.length,
    citizensWithPower: citizensWithPower,
    results: results,
    titanmakerCorrect: titanmaker ? titanmaker.governancePower === 0 : false
  };
}

testCurrentCalculator().catch(console.error);