/**
 * Final Governance Power Validation
 * Calculate and display all citizens with governance power using corrected calculator
 */

import fs from 'fs';

async function validateAllGovernancePower() {
  console.log("=== Final Governance Power Validation ===\n");
  
  // Load all citizens from database
  const citizenData = JSON.parse(fs.readFileSync('citizen-map/data/governance-power.json', 'utf8')).citizens;
  console.log(`Found ${citizenData.length} total citizens in database\n`);
  
  const resultsWithPower = [];
  const resultsWithoutPower = [];
  
  for (const citizen of citizenData) {
    console.log(`Processing: ${citizen.nickname} (${citizen.wallet.substring(0, 8)}...)`);
    
    try {
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      const nativePower = data.nativeGovernancePower || 0;
      const delegatedPower = data.delegatedGovernancePower || 0;
      const totalPower = nativePower + delegatedPower;
      
      if (totalPower > 0) {
        resultsWithPower.push({
          username: citizen.nickname,
          walletAddress: citizen.wallet,
          nativeGovernancePower: nativePower,
          delegatedGovernancePower: delegatedPower,
          totalGovernancePower: totalPower,
          deposits: data.deposits ? data.deposits.length : 0
        });
        
        console.log(`  ✅ Total: ${totalPower.toLocaleString()} ISLAND`);
        if (nativePower > 0) console.log(`     Native: ${nativePower.toLocaleString()} ISLAND`);
        if (delegatedPower > 0) console.log(`     Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
      } else {
        resultsWithoutPower.push({
          username: citizen.nickname,
          walletAddress: citizen.wallet
        });
        console.log(`  ❌ No governance power`);
      }
      
    } catch (error) {
      console.log(`  ⚠️  Error: ${error.message}`);
      resultsWithoutPower.push({
        username: citizen.username,
        walletAddress: citizen.walletAddress,
        error: error.message
      });
    }
    
    console.log();
  }
  
  // Sort results by total governance power (descending)
  resultsWithPower.sort((a, b) => b.totalGovernancePower - a.totalGovernancePower);
  
  console.log("=== FINAL RESULTS ===\n");
  console.log(`Citizens with governance power: ${resultsWithPower.length}`);
  console.log(`Citizens without governance power: ${resultsWithoutPower.length}`);
  console.log();
  
  console.log("=== GOVERNANCE POWER RANKINGS ===\n");
  
  let totalDAOPower = 0;
  
  for (const [index, citizen] of resultsWithPower.entries()) {
    const rank = index + 1;
    const native = citizen.nativeGovernancePower;
    const delegated = citizen.delegatedGovernancePower;
    const total = citizen.totalGovernancePower;
    
    totalDAOPower += total;
    
    console.log(`${rank.toString().padStart(2)}. ${citizen.username.padEnd(20)} ${total.toLocaleString().padStart(15)} ISLAND`);
    console.log(`    Wallet: ${citizen.walletAddress}`);
    
    if (native > 0 && delegated > 0) {
      console.log(`    Native: ${native.toLocaleString().padStart(15)} ISLAND`);
      console.log(`    Delegated: ${delegated.toLocaleString().padStart(13)} ISLAND`);
    } else if (native > 0) {
      console.log(`    Native only: ${native.toLocaleString().padStart(11)} ISLAND`);
    } else if (delegated > 0) {
      console.log(`    Delegated only: ${delegated.toLocaleString().padStart(9)} ISLAND`);
    }
    
    console.log(`    Deposits: ${citizen.deposits}`);
    console.log();
  }
  
  console.log("=== SUMMARY STATISTICS ===\n");
  console.log(`Total DAO Governance Power: ${totalDAOPower.toLocaleString()} ISLAND`);
  console.log(`Average per voting citizen: ${Math.round(totalDAOPower / resultsWithPower.length).toLocaleString()} ISLAND`);
  
  // Find citizens with highest individual categories
  const highestNative = resultsWithPower.reduce((max, citizen) => 
    citizen.nativeGovernancePower > max.nativeGovernancePower ? citizen : max);
  const highestDelegated = resultsWithPower.reduce((max, citizen) => 
    citizen.delegatedGovernancePower > max.delegatedGovernancePower ? citizen : max);
  
  console.log(`Highest native power: ${highestNative.username} (${highestNative.nativeGovernancePower.toLocaleString()} ISLAND)`);
  if (highestDelegated.delegatedGovernancePower > 0) {
    console.log(`Highest delegated power: ${highestDelegated.username} (${highestDelegated.delegatedGovernancePower.toLocaleString()} ISLAND)`);
  }
  
  console.log();
  
  if (resultsWithoutPower.length > 0) {
    console.log("=== CITIZENS WITHOUT GOVERNANCE POWER ===\n");
    for (const citizen of resultsWithoutPower) {
      console.log(`${citizen.username} (${citizen.walletAddress.substring(0, 8)}...)`);
    }
    console.log();
  }
  
  // Save results for analysis
  const finalResults = {
    timestamp: new Date().toISOString(),
    totalCitizens: citizenData.length,
    citizensWithPower: resultsWithPower.length,
    citizensWithoutPower: resultsWithoutPower.length,
    totalDAOGovernancePower: totalDAOPower,
    rankings: resultsWithPower,
    citizensWithoutPower: resultsWithoutPower
  };
  
  fs.writeFileSync('final-governance-validation-results.json', JSON.stringify(finalResults, null, 2));
  console.log("Results saved to: final-governance-validation-results.json");
  
  return resultsWithPower;
}

validateAllGovernancePower().catch(console.error);