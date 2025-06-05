/**
 * Manual Governance Sync for All Citizens
 * Updates database with fresh blockchain governance calculations
 */

import pkg from 'pg';
const { Pool } = pkg;
import fetch from 'node-fetch';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function syncAllGovernance() {
  console.log('🏛️ Starting fresh governance sync for all citizens...\n');
  
  try {
    // Get all citizens from database
    const citizensResult = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = citizensResult.rows;
    
    console.log(`Found ${citizens.length} citizens to update\n`);
    
    let updated = 0;
    let errors = 0;
    
    for (const citizen of citizens) {
      try {
        console.log(`Processing: ${citizen.nickname} (${citizen.wallet.substring(0, 8)}...)`);
        
        // Get fresh governance data from VSR API
        const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        const governanceData = await response.json();
        
        if (governanceData.totalGovernancePower !== undefined) {
          // Update database with fresh blockchain data
          await pool.query(`
            UPDATE citizens 
            SET 
              native_governance_power = $1,
              governance_power = $2,
              total_governance_power = $3,
              updated_at = NOW()
            WHERE wallet = $4
          `, [
            governanceData.nativeGovernancePower || 0,
            governanceData.delegatedGovernancePower || 0,
            governanceData.totalGovernancePower || 0,
            citizen.wallet
          ]);
          
          const totalPower = governanceData.totalGovernancePower || 0;
          console.log(`✅ Updated: ${totalPower.toLocaleString()} ISLAND total power`);
          updated++;
        } else {
          console.log(`❌ Failed to get governance data`);
          errors++;
        }
        
        // Small delay to avoid overwhelming RPC
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`❌ Error processing ${citizen.nickname}: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n🏛️ Governance sync complete:`);
    console.log(`  ✅ Successfully updated: ${updated} citizens`);
    console.log(`  ❌ Errors: ${errors} citizens`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
  } finally {
    await pool.end();
  }
}

syncAllGovernance();