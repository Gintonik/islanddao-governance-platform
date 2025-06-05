/**
 * Investigate why only 7 citizens show governance power instead of expected 15
 * Check if conservative multiplier tuning eliminated valid governance power
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function investigateMissingGovernance() {
  console.log("=== Investigating Missing Governance Power ===\n");
  
  // Get all citizens from database
  const result = await pool.query(`
    SELECT wallet, nickname, native_governance_power, total_governance_power 
    FROM citizens 
    ORDER BY total_governance_power DESC
  `);
  
  console.log(`Found ${result.rows.length} total citizens in database\n`);
  
  let citizensWithPower = 0;
  let citizensWithoutPower = 0;
  const testCitizens = [];
  
  console.log("Current governance power status:");
  
  for (const citizen of result.rows) {
    const power = citizen.total_governance_power || 0;
    if (power > 0) {
      citizensWithPower++;
      console.log(`✅ ${citizen.nickname}: ${power.toLocaleString()} ISLAND`);
    } else {
      citizensWithoutPower++;
      testCitizens.push(citizen);
      console.log(`❌ ${citizen.nickname}: 0 ISLAND`);
    }
  }
  
  console.log(`\nSummary: ${citizensWithPower} with power, ${citizensWithoutPower} without power`);
  console.log(`Expected: 15 with power, but only found ${citizensWithPower}\n`);
  
  // Test some citizens without power to see if they actually have governance power
  console.log("Testing citizens without governance power to check for false negatives...\n");
  
  const testSample = testCitizens.slice(0, 5); // Test first 5 citizens without power
  
  for (const citizen of testSample) {
    try {
      console.log(`Testing: ${citizen.nickname} (${citizen.wallet.substring(0, 8)}...)`);
      
      // Get fresh governance calculation from API
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const governanceData = await response.json();
      
      if (response.ok) {
        const apiPower = governanceData.nativeGovernancePower || 0;
        const dbPower = citizen.total_governance_power || 0;
        
        console.log(`  Database: ${dbPower.toLocaleString()} ISLAND`);
        console.log(`  API calc: ${apiPower.toLocaleString()} ISLAND`);
        
        if (apiPower > 0 && dbPower === 0) {
          console.log(`  🚨 DISCREPANCY: API shows ${apiPower.toLocaleString()} but DB shows 0`);
        } else if (apiPower === 0) {
          console.log(`  ✅ Correctly shows 0 governance power`);
        }
        
        // Check for deposits
        if (governanceData.deposits && governanceData.deposits.length > 0) {
          console.log(`  Deposits found: ${governanceData.deposits.length}`);
          for (const deposit of governanceData.deposits.slice(0, 2)) {
            console.log(`    ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier}x = ${deposit.power.toLocaleString()}`);
          }
        }
        
      } else {
        console.log(`  ❌ API Error: ${JSON.stringify(governanceData)}`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log();
  }
  
  // Check if the conservative multiplier (0.92x) is too aggressive
  console.log("Analyzing multiplier impact...");
  console.log("Current multiplier tuning: 0.92x (down from 0.985x)");
  console.log("This may be eliminating valid governance power\n");
  
  await pool.end();
  
  console.log("RECOMMENDATIONS:");
  console.log("1. The 0.92x multiplier may be too conservative");
  console.log("2. Need to balance between fixing Takisoul inflation and preserving valid power");
  console.log("3. Consider using 0.95x or 0.97x instead of 0.92x");
  console.log("4. Test with different multiplier values to find optimal balance");
}

investigateMissingGovernance().catch(console.error);