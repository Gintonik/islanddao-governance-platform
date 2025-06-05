/**
 * Get real-time native governance power for all citizens in the map
 */

import { readFileSync } from 'fs';

async function getAllCitizensGovernance() {
  // Get all citizens from the governance data file
  const governanceData = JSON.parse(readFileSync('citizen-map/data/governance-power.json', 'utf8'));
  const citizens = governanceData.citizens;
  
  console.log('=== ALL CITIZENS NATIVE GOVERNANCE POWER ===');
  console.log('Fresh blockchain data (no cached values)\n');
  
  for (const citizen of citizens) {
    try {
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      const nativePower = data.nativeGovernancePower || 0;
      
      console.log(`${citizen.nickname}: ${nativePower.toLocaleString()} ISLAND`);
      
    } catch (error) {
      console.log(`${citizen.nickname}: ERROR - ${error.message}`);
    }
  }
}

getAllCitizensGovernance().catch(console.error);