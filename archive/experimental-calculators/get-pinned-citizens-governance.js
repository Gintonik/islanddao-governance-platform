/**
 * Get real-time native governance power for all pinned citizens
 * No cached values, fresh blockchain data only
 */

import { readFileSync } from 'fs';

// Pinned citizens from the map
const pinnedCitizens = [
  { name: "Takisoul", wallet: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA" },
  { name: "Legend", wallet: "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG" },
  { name: "Dean", wallet: "DnzyBKnXBrYArF4pfJLYDH4VaQKQYEHttFvM9C4HaQM4" },
  { name: "Moxie", wallet: "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA" },
  { name: "Nurtan", wallet: "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U" },
  { name: "GintoniK", wallet: "CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i" },
  { name: "Shrimp", wallet: "98YdmqmGJCu4KqL7CtFGz8r8sJQXVNmDKrYWDNNLYnr8" },
  { name: "Kermit", wallet: "Ap59FFWE6HLb4LSKNw5NJF8q31FnD4nPKzfG9KaLh5Qo" }
];

async function getPinnedCitizensGovernance() {
  console.log('=== PINNED CITIZENS NATIVE GOVERNANCE POWER ===');
  console.log('Fetching fresh blockchain data (no cached values)\n');
  
  const results = [];
  
  for (const citizen of pinnedCitizens) {
    try {
      console.log(`Fetching: ${citizen.name} (${citizen.wallet})`);
      
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      const result = {
        name: citizen.name,
        wallet: citizen.wallet,
        nativeGovernancePower: data.nativeGovernancePower || 0,
        totalGovernancePower: data.totalGovernancePower || 0,
        deposits: data.deposits ? data.deposits.length : 0,
        source: data.source || 'unknown'
      };
      
      results.push(result);
      
      console.log(`  Native Power: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`  Total Power: ${result.totalGovernancePower.toLocaleString()} ISLAND`);
      console.log(`  Deposits: ${result.deposits}`);
      console.log(`  Source: ${result.source}\n`);
      
    } catch (error) {
      console.log(`  ERROR: ${error.message}\n`);
      results.push({
        name: citizen.name,
        wallet: citizen.wallet,
        nativeGovernancePower: 0,
        totalGovernancePower: 0,
        deposits: 0,
        source: 'error',
        error: error.message
      });
    }
  }
  
  // Summary table
  console.log('=== SUMMARY TABLE ===');
  console.log('Name'.padEnd(12) + 'Native Power'.padEnd(15) + 'Deposits'.padEnd(10) + 'Source');
  console.log('-'.repeat(55));
  
  results.forEach(citizen => {
    const power = citizen.nativeGovernancePower.toLocaleString().padEnd(14);
    const deposits = citizen.deposits.toString().padEnd(9);
    const source = citizen.source.padEnd(10);
    console.log(`${citizen.name.padEnd(12)}${power}${deposits}${source}`);
  });
  
  // Total governance power
  const totalPower = results.reduce((sum, citizen) => sum + citizen.nativeGovernancePower, 0);
  console.log('-'.repeat(55));
  console.log(`Total:       ${totalPower.toLocaleString()} ISLAND`);
  
  return results;
}

getPinnedCitizensGovernance().catch(console.error);