/**
 * JSON Governance Sync - Database Update from Stable JSON
 * 
 * This script ONLY reads from pre-calculated JSON files and syncs to database.
 * It never recalculates - just ensures database matches the JSON output.
 * This prevents calculation drift and ensures consistency.
 */

import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

// Load governance data from JSON (never recalculate)
function loadGovernanceJSON() {
  try {
    const jsonPath = 'data/native-governance-power.json';
    if (!fs.existsSync(jsonPath)) {
      throw new Error('JSON file not found. Run calculator first.');
    }
    
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    console.log('GOVERNANCE JSON SYNC');
    console.log('===================');
    console.log(`Loaded JSON: ${data.summary.totalCitizens} citizens`);
    console.log(`Total power: ${data.summary.totalNativeGovernancePower.toLocaleString()} ISLAND`);
    console.log(`Calculated: ${data.summary.calculatedAt}`);
    
    return data;
    
  } catch (error) {
    console.error('Failed to load JSON:', error.message);
    process.exit(1);
  }
}

// Sync database with JSON values (no recalculation)
async function syncDatabaseFromJSON() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const jsonData = loadGovernanceJSON();
    
    console.log('\nSyncing database with JSON values...');
    
    // Reset all governance power to 0 first
    await pool.query('UPDATE citizens SET native_governance_power = 0, locked_governance_power = 0, unlocked_governance_power = 0');
    
    // Update only citizens found in JSON
    for (const citizen of jsonData.citizens) {
      const result = await pool.query(
        `UPDATE citizens 
         SET 
           native_governance_power = $1,
           locked_governance_power = $2,
           unlocked_governance_power = $3,
           governance_last_updated = NOW()
         WHERE wallet = $4
         RETURNING wallet`,
        [citizen.totalPower, citizen.lockedPower, citizen.unlockedPower, citizen.wallet]
      );
      
      if (result.rows.length > 0) {
        console.log(`✓ ${citizen.wallet.slice(0,8)}: ${Math.round(citizen.totalPower).toLocaleString()} ISLAND`);
      } else {
        console.log(`⚠ ${citizen.wallet.slice(0,8)}: Not found in database`);
      }
    }
    
    // Verify sync accuracy
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as citizens_with_power,
        SUM(native_governance_power) as total_power
      FROM citizens 
      WHERE native_governance_power > 0
    `);
    
    const dbTotal = parseFloat(verifyResult.rows[0].total_power);
    const jsonTotal = jsonData.summary.totalNativeGovernancePower;
    const accuracy = ((dbTotal / jsonTotal) * 100).toFixed(2);
    
    console.log('\nSync Verification:');
    console.log(`Database total: ${dbTotal.toLocaleString()} ISLAND`);
    console.log(`JSON total: ${jsonTotal.toLocaleString()} ISLAND`);
    console.log(`Accuracy: ${accuracy}%`);
    
    if (accuracy === "100.00") {
      console.log('✅ Perfect sync - database matches JSON exactly');
    } else {
      console.log('❌ Sync error - database does not match JSON');
    }
    
    return { success: accuracy === "100.00", accuracy };
    
  } catch (error) {
    console.error('Sync failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

// Validate specific citizen values
async function validateCitizenValues() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const jsonData = loadGovernanceJSON();
    
    console.log('\nValidating key citizen values...');
    
    // Check specific citizens that previously had issues
    const keyCitizens = [
      'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', // GJdRQcsy
      '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA', // Moxie
      '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'  // Top citizen
    ];
    
    for (const wallet of keyCitizens) {
      const dbResult = await pool.query(
        'SELECT native_governance_power FROM citizens WHERE wallet = $1',
        [wallet]
      );
      
      const jsonCitizen = jsonData.citizens.find(c => c.wallet === wallet);
      
      if (dbResult.rows.length > 0 && jsonCitizen) {
        const dbPower = parseFloat(dbResult.rows[0].native_governance_power);
        const jsonPower = jsonCitizen.totalPower;
        const match = Math.abs(dbPower - jsonPower) < 0.01;
        
        console.log(`${wallet.slice(0,8)}: DB=${Math.round(dbPower).toLocaleString()} | JSON=${Math.round(jsonPower).toLocaleString()} ${match ? '✓' : '✗'}`);
      }
    }
    
  } finally {
    await pool.end();
  }
}

// Main execution
async function main() {
  const syncResult = await syncDatabaseFromJSON();
  
  if (syncResult.success) {
    await validateCitizenValues();
    console.log('\n🟢 Database successfully synced with JSON - governance values are stable');
  } else {
    console.log('\n🔴 Sync failed - manual intervention required');
    process.exit(1);
  }
}

export { syncDatabaseFromJSON, validateCitizenValues };

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}