/**
 * Update governance power for the two new citizens in the database
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const newCitizens = [
  { wallet: "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy", expectedPower: 0 },
  { wallet: "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww", expectedPower: 1007398.406374 }
];

async function updateNewCitizensGovernance() {
  console.log("Updating governance power for new citizens...\n");
  
  for (const citizen of newCitizens) {
    try {
      // Get current governance power from VSR API
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const governanceData = await response.json();
      
      if (response.ok) {
        const nativePower = governanceData.nativeGovernancePower || 0;
        const delegatedPower = governanceData.delegatedGovernancePower || 0;
        const totalPower = governanceData.totalGovernancePower || 0;
        
        console.log(`Citizen: ${citizen.wallet.substring(0, 8)}...`);
        console.log(`  Current API Power: ${nativePower.toLocaleString()} ISLAND`);
        
        // Update database with governance power
        const updateResult = await pool.query(`
          UPDATE citizens 
          SET 
            native_governance_power = $1,
            delegated_governance_power = $2,
            total_governance_power = $3,
            updated_at = NOW()
          WHERE wallet = $4
          RETURNING nickname, native_governance_power
        `, [nativePower, delegatedPower, totalPower, citizen.wallet]);
        
        if (updateResult.rows.length > 0) {
          const updated = updateResult.rows[0];
          console.log(`  ✅ Updated ${updated.nickname}: ${updated.native_governance_power.toLocaleString()} ISLAND`);
        } else {
          console.log(`  ❌ Citizen not found in database`);
        }
        
      } else {
        console.log(`  ❌ API Error: ${JSON.stringify(governanceData)}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error processing ${citizen.wallet}: ${error.message}`);
    }
    
    console.log();
  }
  
  // Check if citizens are now in the governance data
  console.log("Verifying citizens are included in daily sync...");
  
  const allCitizens = await pool.query(`
    SELECT wallet, nickname, native_governance_power, total_governance_power 
    FROM citizens 
    WHERE wallet = ANY($1)
    ORDER BY total_governance_power DESC
  `, [newCitizens.map(c => c.wallet)]);
  
  console.log("\nNew citizens in database:");
  for (const citizen of allCitizens.rows) {
    console.log(`  ${citizen.nickname}: ${citizen.total_governance_power.toLocaleString()} ISLAND`);
  }
  
  await pool.end();
}

updateNewCitizensGovernance().catch(console.error);