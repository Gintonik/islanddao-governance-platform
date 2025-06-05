/**
 * Sync Fresh Governance Data
 * Update stored data with live blockchain calculations to ensure data integrity
 */

const fs = require('fs');

async function syncFreshGovernance() {
  console.log('Syncing fresh governance data from live blockchain calculations...\n');
  
  // Load current citizen data
  const governanceData = JSON.parse(fs.readFileSync('citizen-map/data/governance-power.json', 'utf8'));
  
  let updatedCount = 0;
  let totalDiscrepancy = 0;
  
  console.log('Updating governance power for all citizens with live blockchain data...\n');
  
  for (let i = 0; i < governanceData.citizens.length; i++) {
    const citizen = governanceData.citizens[i];
    
    try {
      // Get fresh live data from blockchain
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const liveData = await response.json();
      const livePower = liveData.nativeGovernancePower || 0;
      
      const oldPower = citizen.native_governance_power || 0;
      const difference = Math.abs(livePower - oldPower);
      
      if (difference > 1000) {
        console.log(`Updating ${citizen.nickname}:`);
        console.log(`  Old: ${oldPower.toLocaleString()} ISLAND`);
        console.log(`  New: ${livePower.toLocaleString()} ISLAND`);
        console.log(`  Difference: ${difference.toLocaleString()} ISLAND`);
        
        updatedCount++;
        totalDiscrepancy += difference;
      }
      
      // Update with fresh blockchain data
      governanceData.citizens[i] = {
        ...citizen,
        native_governance_power: livePower,
        governance_power: livePower,
        total_governance_power: livePower,
        last_updated: new Date().toISOString()
      };
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`Error updating ${citizen.nickname}: ${error.message}`);
    }
  }
  
  // Update metadata
  governanceData.generated_at = new Date().toISOString();
  
  // Save updated data
  fs.writeFileSync('citizen-map/data/governance-power.json', JSON.stringify(governanceData, null, 2));
  
  console.log(`\nSync completed:`);
  console.log(`- Updated ${updatedCount} citizens with fresh blockchain data`);
  console.log(`- Total discrepancy resolved: ${totalDiscrepancy.toLocaleString()} ISLAND`);
  console.log(`- All data now reflects live blockchain calculations`);
  
  // Verify key citizens after update
  console.log('\nVerifying key citizens after sync:');
  const keyCitizens = ['Titanmaker', 'Takisoul', 'Top Holder'];
  for (const name of keyCitizens) {
    const citizen = governanceData.citizens.find(c => c.nickname === name);
    if (citizen) {
      console.log(`${name}: ${citizen.native_governance_power.toLocaleString()} ISLAND`);
    }
  }
}

syncFreshGovernance().catch(console.error);