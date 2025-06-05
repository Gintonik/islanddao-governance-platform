/**
 * Get comprehensive governance power table for all citizens
 * Using live blockchain data from the governance calculator
 */

import fetch from 'node-fetch';

async function getAllGovernanceTable() {
  console.log('=== COMPREHENSIVE GOVERNANCE POWER TABLE ===\n');
  
  try {
    // Get all citizens from the map API
    const citizensResponse = await fetch('http://localhost:5000/api/citizens');
    const citizens = await citizensResponse.json();
    
    console.log(`Processing ${citizens.length} citizens...\n`);
    
    const results = [];
    
    // Calculate governance power for each citizen
    for (const citizen of citizens) {
      try {
        const govResponse = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        const govData = await govResponse.json();
        
        results.push({
          nickname: citizen.nickname || 'Unknown',
          wallet: citizen.wallet,
          nativeGovernancePower: govData.nativeGovernancePower || 0,
          delegatedGovernancePower: govData.delegatedGovernancePower || 0,
          totalGovernancePower: govData.totalGovernancePower || 0,
          nftCount: citizen.nfts ? citizen.nfts.length : 0
        });
        
        // Progress indicator
        process.stdout.write('.');
        
      } catch (error) {
        console.log(`\nError calculating for ${citizen.nickname}: ${error.message}`);
        results.push({
          nickname: citizen.nickname || 'Unknown',
          wallet: citizen.wallet,
          nativeGovernancePower: 0,
          delegatedGovernancePower: 0,
          totalGovernancePower: 0,
          nftCount: 0
        });
      }
    }
    
    // Sort by total governance power descending
    results.sort((a, b) => b.totalGovernancePower - a.totalGovernancePower);
    
    console.log('\n\n=== FINAL GOVERNANCE POWER TABLE ===\n');
    
    // Print table header
    console.log('| Rank | Citizen Name        | Total ISLAND Power | Native Power    | Delegated Power | NFTs | Wallet Address (First 8) |');
    console.log('|------|---------------------|-------------------|-----------------|-----------------|------|---------------------------|');
    
    // Print each citizen
    results.forEach((citizen, index) => {
      const rank = (index + 1).toString().padStart(2, ' ');
      const name = citizen.nickname.padEnd(19, ' ').substring(0, 19);
      const totalPower = citizen.totalGovernancePower.toLocaleString().padStart(17, ' ');
      const nativePower = citizen.nativeGovernancePower.toLocaleString().padStart(15, ' ');
      const delegatedPower = citizen.delegatedGovernancePower.toLocaleString().padStart(15, ' ');
      const nfts = citizen.nftCount.toString().padStart(4, ' ');
      const wallet = citizen.wallet.substring(0, 8);
      
      console.log(`| ${rank}   | ${name} | ${totalPower} | ${nativePower} | ${delegatedPower} | ${nfts} | ${wallet}              |`);
    });
    
    // Summary statistics
    const totalCitizens = results.length;
    const citizensWithPower = results.filter(c => c.totalGovernancePower > 0).length;
    const totalGovernancePower = results.reduce((sum, c) => sum + c.totalGovernancePower, 0);
    const totalNativePower = results.reduce((sum, c) => sum + c.nativeGovernancePower, 0);
    const totalDelegatedPower = results.reduce((sum, c) => sum + c.delegatedGovernancePower, 0);
    
    console.log('\n=== SUMMARY STATISTICS ===');
    console.log(`Total Citizens: ${totalCitizens}`);
    console.log(`Citizens with Governance Power: ${citizensWithPower}`);
    console.log(`Total Native Governance Power: ${totalNativePower.toLocaleString()} ISLAND`);
    console.log(`Total Delegated Governance Power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
    console.log(`Total Governance Power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    return results;
    
  } catch (error) {
    console.error('Error generating governance table:', error);
  }
}

getAllGovernanceTable().catch(console.error);