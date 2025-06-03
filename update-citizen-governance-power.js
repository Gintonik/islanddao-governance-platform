/**
 * Update Citizen Governance Power in Database
 * Syncs native governance power from locked scanner results to citizen records
 */

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Update citizens table with native governance power from locked results
 */
async function updateCitizenGovernancePower() {
  console.log('UPDATING CITIZEN GOVERNANCE POWER IN DATABASE');
  console.log('==============================================');
  
  try {
    // Load locked native governance results
    const nativeResults = JSON.parse(fs.readFileSync('./native-results-latest.json', 'utf8'));
    console.log(`Loaded native governance data for ${nativeResults.totalCitizens} citizens`);
    
    // Check if native_governance_power column exists
    try {
      await pool.query('ALTER TABLE citizens ADD COLUMN IF NOT EXISTS native_governance_power DECIMAL(20,6) DEFAULT 0');
      console.log('Ensured native_governance_power column exists');
    } catch (error) {
      console.log('Column already exists or error adding:', error.message);
    }
    
    let updatedCount = 0;
    let errorCount = 0;
    
    // Update each citizen with their native governance power
    for (const citizen of nativeResults.results) {
      try {
        const updateQuery = `
          UPDATE citizens 
          SET native_governance_power = $1,
              updated_at = NOW()
          WHERE wallet = $2
        `;
        
        const result = await pool.query(updateQuery, [citizen.nativePower, citizen.wallet]);
        
        if (result.rowCount > 0) {
          updatedCount++;
          if (citizen.nativePower > 0) {
            console.log(`Updated ${citizen.wallet.slice(0, 8)}...: ${citizen.nativePower.toFixed(2)} ISLAND`);
          }
        } else {
          console.log(`No record found for wallet: ${citizen.wallet.slice(0, 8)}...`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`Error updating ${citizen.wallet.slice(0, 8)}...:`, error.message);
      }
    }
    
    // Display summary statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_citizens,
        COUNT(CASE WHEN native_governance_power > 0 THEN 1 END) as citizens_with_power,
        SUM(native_governance_power) as total_native_power,
        MAX(native_governance_power) as max_native_power,
        AVG(native_governance_power) as avg_native_power
      FROM citizens
    `;
    
    const stats = await pool.query(statsQuery);
    const row = stats.rows[0];
    
    console.log('\n=== DATABASE UPDATE SUMMARY ===');
    console.log(`Records updated: ${updatedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total citizens in database: ${row.total_citizens}`);
    console.log(`Citizens with native governance power: ${row.citizens_with_power}`);
    console.log(`Total native governance power: ${parseFloat(row.total_native_power).toFixed(2)} ISLAND`);
    console.log(`Maximum native power: ${parseFloat(row.max_native_power).toFixed(2)} ISLAND`);
    console.log(`Average native power: ${parseFloat(row.avg_native_power).toFixed(2)} ISLAND`);
    
    // Show top citizens by native governance power
    const topCitizensQuery = `
      SELECT wallet, native_governance_power
      FROM citizens 
      WHERE native_governance_power > 0
      ORDER BY native_governance_power DESC
      LIMIT 10
    `;
    
    const topCitizens = await pool.query(topCitizensQuery);
    
    if (topCitizens.rows.length > 0) {
      console.log('\n=== TOP CITIZENS BY NATIVE GOVERNANCE POWER ===');
      topCitizens.rows.forEach((citizen, index) => {
        console.log(`${index + 1}. ${citizen.wallet.slice(0, 8)}...: ${parseFloat(citizen.native_governance_power).toFixed(2)} ISLAND`);
      });
    }
    
    console.log('\nCitizen governance power update completed successfully');
    
  } catch (error) {
    console.error('Error updating citizen governance power:', error.message);
  } finally {
    await pool.end();
  }
}

updateCitizenGovernancePower().catch(console.error);