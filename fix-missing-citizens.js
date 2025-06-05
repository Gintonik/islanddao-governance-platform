/**
 * Fix missing citizens by adding them to governance data file
 * These 6 citizens placed pins but weren't added to daily sync
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const missingCitizens = [
  { wallet: "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww", nickname: "scientistjoe" },
  { wallet: "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1", nickname: "Titanmaker" },
  { wallet: "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy", nickname: "Kegomaz" },
  { wallet: "B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST", nickname: "Mila" },
  { wallet: "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6", nickname: "Icoder" },
  { wallet: "EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF", nickname: "Moviendome" }
];

async function fixMissingCitizens() {
  console.log('=== FIXING MISSING CITIZENS IN GOVERNANCE SYNC ===\n');
  
  const governanceFilePath = path.join(__dirname, 'citizen-map/data/governance-power.json');
  
  // Read current governance data
  const fileContent = fs.readFileSync(governanceFilePath, 'utf8');
  const governanceFile = JSON.parse(fileContent);
  
  console.log(`Current citizens in governance file: ${governanceFile.total_citizens}`);
  
  for (const citizen of missingCitizens) {
    console.log(`\nProcessing: ${citizen.nickname} (${citizen.wallet})`);
    
    // Check if already exists
    const existingIndex = governanceFile.citizens.findIndex(c => c.wallet === citizen.wallet);
    
    if (existingIndex >= 0) {
      console.log(`  Already exists in governance file`);
      continue;
    }
    
    try {
      // Get governance power
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const governanceData = await response.json();
      
      const citizenData = {
        wallet: citizen.wallet,
        nickname: citizen.nickname,
        native_governance_power: governanceData.nativeGovernancePower || 0,
        governance_power: governanceData.totalGovernancePower || 0,
        delegated_governance_power: governanceData.delegatedGovernancePower || 0,
        total_governance_power: governanceData.totalGovernancePower || 0,
        locked_governance_power: 0,
        unlocked_governance_power: governanceData.nativeGovernancePower || 0,
        nft_count: 0, // Will be updated by next sync
        last_updated: new Date().toISOString()
      };
      
      // Add to governance file
      governanceFile.citizens.push(citizenData);
      
      console.log(`  Added with ${(citizenData.total_governance_power).toLocaleString()} ISLAND governance power`);
      
    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
      
      // Add with zero power if API fails
      const citizenData = {
        wallet: citizen.wallet,
        nickname: citizen.nickname,
        native_governance_power: 0,
        governance_power: 0,
        delegated_governance_power: 0,
        total_governance_power: 0,
        locked_governance_power: 0,
        unlocked_governance_power: 0,
        nft_count: 0,
        last_updated: new Date().toISOString()
      };
      
      governanceFile.citizens.push(citizenData);
      console.log(`  Added with 0 governance power (will be updated by next sync)`);
    }
  }
  
  // Update metadata
  governanceFile.total_citizens = governanceFile.citizens.length;
  governanceFile.generated_at = new Date().toISOString();
  
  // Write back to file
  fs.writeFileSync(governanceFilePath, JSON.stringify(governanceFile, null, 2));
  
  console.log(`\n✅ Governance file updated: ${governanceFile.total_citizens} citizens total`);
  console.log('✅ All new citizens are now included in daily sync system');
}

fixMissingCitizens().catch(console.error);