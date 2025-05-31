/**
 * Update Total Governance Power for IslandDAO Citizens
 * Calculates total power by summing native and delegated governance power
 * Run with: node update-total-power.js
 */

const { Pool } = require('pg');

/**
 * Fetch all citizens with their current governance power values
 */
async function fetchCitizensGovernancePower(pool) {
  try {
    const query = `
      SELECT 
        wallet, 
        nickname,
        native_governance_power,
        delegated_governance_power,
        total_governance_power
      FROM citizens 
      ORDER BY id
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching citizens governance power:', error.message);
    throw error;
  }
}

/**
 * Update total governance power for a citizen
 */
async function updateTotalGovernancePower(pool, wallet, totalPower) {
  try {
    const query = `
      UPDATE citizens 
      SET total_governance_power = $1 
      WHERE wallet = $2
    `;
    
    await pool.query(query, [totalPower, wallet]);
    
  } catch (error) {
    console.error(`Error updating total power for ${wallet}: ${error.message}`);
    throw error;
  }
}

/**
 * Calculate and update total governance power for all citizens
 */
async function calculateTotalPowerForAll(pool) {
  try {
    console.log('Fetching citizens with governance power data...');
    const citizens = await fetchCitizensGovernancePower(pool);
    console.log(`Found ${citizens.length} citizens to process`);
    
    let processed = 0;
    let updated = 0;
    let totalNativePower = 0;
    let totalDelegatedPower = 0;
    let grandTotalPower = 0;
    
    console.log('\nCalculating total governance power...');
    
    for (const citizen of citizens) {
      const displayName = citizen.nickname || citizen.wallet.substring(0, 8);
      
      // Convert to numbers (handle null values) and round to whole numbers for BIGINT
      const nativePower = parseFloat(citizen.native_governance_power) || 0;
      const delegatedPower = parseFloat(citizen.delegated_governance_power) || 0;
      const calculatedTotal = Math.round(nativePower + delegatedPower);
      
      console.log(`\n[${processed + 1}/${citizens.length}] ${displayName}:`);
      console.log(`  Native power: ${nativePower.toLocaleString()} ISLAND`);
      console.log(`  Delegated power: ${delegatedPower.toLocaleString()} ISLAND`);
      console.log(`  Total power: ${calculatedTotal.toLocaleString()} ISLAND`);
      
      // Update database with calculated total
      await updateTotalGovernancePower(pool, citizen.wallet, calculatedTotal);
      
      // Update statistics
      totalNativePower += nativePower;
      totalDelegatedPower += delegatedPower;
      grandTotalPower += calculatedTotal;
      
      if (calculatedTotal > 0) {
        updated++;
      }
      
      processed++;
      
      console.log(`  ✓ Updated total governance power`);
    }
    
    return {
      processed,
      updated,
      totalNativePower,
      totalDelegatedPower,
      grandTotalPower
    };
    
  } catch (error) {
    console.error('Error calculating total power:', error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Starting total governance power calculation for IslandDAO citizens...');
    console.log('Formula: total_governance_power = native_governance_power + delegated_governance_power');
    
    // Calculate and update total power for all citizens
    const stats = await calculateTotalPowerForAll(pool);
    
    // Final summary
    console.log('\n=== TOTAL POWER CALCULATION SUMMARY ===');
    console.log(`Citizens processed: ${stats.processed}`);
    console.log(`Citizens with governance power: ${stats.updated}`);
    console.log(`Total native power: ${stats.totalNativePower.toLocaleString()} ISLAND`);
    console.log(`Total delegated power: ${stats.totalDelegatedPower.toLocaleString()} ISLAND`);
    console.log(`Grand total governance power: ${stats.grandTotalPower.toLocaleString()} ISLAND`);
    
    if (stats.updated > 0) {
      console.log(`Average power per citizen: ${(stats.grandTotalPower / stats.updated).toLocaleString()} ISLAND`);
    }
    
    // Verify calculation with database query
    console.log('\nVerifying calculations...');
    const verificationQuery = `
      SELECT 
        COUNT(*) as total_citizens,
        COUNT(CASE WHEN total_governance_power > 0 THEN 1 END) as citizens_with_power,
        SUM(native_governance_power) as sum_native,
        SUM(delegated_governance_power) as sum_delegated,
        SUM(total_governance_power) as sum_total
      FROM citizens
    `;
    
    const verification = await pool.query(verificationQuery);
    const dbStats = verification.rows[0];
    
    console.log('\nDatabase verification:');
    console.log(`  Citizens in database: ${dbStats.total_citizens}`);
    console.log(`  Citizens with governance power: ${dbStats.citizens_with_power}`);
    console.log(`  Sum of native power: ${parseFloat(dbStats.sum_native || 0).toLocaleString()} ISLAND`);
    console.log(`  Sum of delegated power: ${parseFloat(dbStats.sum_delegated || 0).toLocaleString()} ISLAND`);
    console.log(`  Sum of total power: ${parseFloat(dbStats.sum_total || 0).toLocaleString()} ISLAND`);
    
    console.log('\n✅ Total governance power calculation completed successfully');
    
  } catch (error) {
    console.error('\nTotal power calculation failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute when run directly
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { run, calculateTotalPowerForAll };