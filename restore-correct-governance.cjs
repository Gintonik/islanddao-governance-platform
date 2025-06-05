/**
 * Restore Correct Governance Power Values
 * Uses the proven working data from native-governance-power.json
 */

const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function restoreCorrectGovernancePower() {
  try {
    console.log('Restoring correct governance power values...');
    
    // Load the proven working governance data
    const governanceData = JSON.parse(fs.readFileSync('./data/native-governance-power.json', 'utf8'));
    
    console.log(`Found ${governanceData.citizens.length} citizens in working data`);
    
    for (const citizen of governanceData.citizens) {
      try {
        const result = await pool.query(
          `UPDATE citizens SET 
            native_governance_power = $1,
            governance_power = $1,
            total_governance_power = $1,
            locked_governance_power = $2,
            unlocked_governance_power = $3,
            updated_at = NOW()
          WHERE wallet = $4`,
          [
            citizen.totalPower,
            citizen.lockedPower,
            citizen.unlockedPower,
            citizen.wallet
          ]
        );
        
        if (result.rowCount > 0) {
          console.log(`Updated ${citizen.wallet}: ${citizen.totalPower.toLocaleString()} ISLAND`);
        } else {
          console.log(`Wallet ${citizen.wallet} not found in citizens table`);
        }
        
      } catch (error) {
        console.error(`Error updating ${citizen.wallet}:`, error);
      }
    }
    
    // Verify the restoration
    const verification = await pool.query(`
      SELECT wallet, nickname, native_governance_power 
      FROM citizens 
      WHERE native_governance_power > 0 
      ORDER BY native_governance_power DESC 
      LIMIT 10
    `);
    
    console.log('\nTop 10 citizens by governance power:');
    verification.rows.forEach(row => {
      console.log(`${row.nickname}: ${parseFloat(row.native_governance_power).toLocaleString()} ISLAND`);
    });
    
    console.log('\nGovernance power restoration completed successfully');
    
  } catch (error) {
    console.error('Error during governance power restoration:', error);
  } finally {
    await pool.end();
  }
}

restoreCorrectGovernancePower();