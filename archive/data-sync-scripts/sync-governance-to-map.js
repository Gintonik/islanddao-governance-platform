/**
 * Sync corrected governance power data to citizen map
 */

import fs from 'fs';
import fetch from 'node-fetch';

async function syncGovernanceToMap() {
  console.log('🔄 Syncing corrected governance power to citizen map...');
  
  try {
    // Get current citizens data
    const citizensResponse = await fetch('http://localhost:5000/api/citizens');
    const citizens = await citizensResponse.json();
    
    console.log(`📍 Processing ${citizens.length} citizens...`);
    
    // Update each citizen with correct governance power
    for (const citizen of citizens) {
      try {
        const govResponse = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        const govData = await govResponse.json();
        
        // Update citizen data with corrected values
        citizen.native_governance_power = govData.nativeGovernancePower || 0;
        citizen.delegated_governance_power = govData.delegatedGovernancePower || 0;
        citizen.total_governance_power = govData.totalGovernancePower || 0;
        
        if (citizen.total_governance_power > 0) {
          console.log(`✅ ${citizen.nickname}: ${citizen.total_governance_power.toLocaleString()} ISLAND`);
        }
        
      } catch (error) {
        console.log(`❌ Error for ${citizen.nickname}: ${error.message}`);
        citizen.native_governance_power = 0;
        citizen.delegated_governance_power = 0;
        citizen.total_governance_power = 0;
      }
    }
    
    // Write updated data to governance file
    const governanceData = {
      lastUpdated: new Date().toISOString(),
      totalCitizens: citizens.length,
      citizensWithPower: citizens.filter(c => c.total_governance_power > 0).length,
      dataSource: 'restored_working_calculator',
      citizens: citizens
    };
    
    fs.writeFileSync('citizen-map/data/governance-power.json', JSON.stringify(governanceData, null, 2));
    
    // Also update the main citizens data file
    fs.writeFileSync('citizen-map/data/citizens.json', JSON.stringify(citizens, null, 2));
    
    console.log('\n🎉 SYNC COMPLETE:');
    console.log(`✅ Updated ${citizens.length} citizens`);
    console.log(`✅ ${governanceData.citizensWithPower} citizens with governance power`);
    console.log(`✅ Data synced to citizen map files`);
    
    // Verify key citizens have correct values
    const keyCitizens = [
      { name: 'Takisoul', wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8974792 },
      { name: 'DeanMachine', wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 10354147 },
      { name: 'GintoniK', wallet: 'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i', expected: 4239442 },
      { name: 'legend', wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 2000 }
    ];
    
    console.log('\n🔍 VERIFICATION:');
    for (const key of keyCitizens) {
      const citizen = citizens.find(c => c.wallet === key.wallet);
      if (citizen) {
        const isCorrect = citizen.total_governance_power === key.expected;
        console.log(`${isCorrect ? '✅' : '❌'} ${key.name}: ${citizen.total_governance_power.toLocaleString()} ISLAND ${isCorrect ? '(CORRECT)' : `(EXPECTED: ${key.expected.toLocaleString()})`}`);
      }
    }
    
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

syncGovernanceToMap();