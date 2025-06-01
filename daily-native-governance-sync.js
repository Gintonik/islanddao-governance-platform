/**
 * Daily Native Governance Power Sync
 * Updates all citizens with authentic VSR native governance power from blockchain
 * Uses proven on-chain scanning + struct offset methodology
 */

const { calculateNativeGovernancePower, updateCitizenNativeGovernancePower } = require('./simplified-vsr-voting-power.js');
const { Pool } = require('pg');

/**
 * Update all citizens with authentic native governance power
 */
async function syncAllNativeGovernancePower() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🚀 Starting daily native governance power sync...');
    const startTime = Date.now();
    
    // Get all citizens
    const citizensResult = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    const citizens = citizensResult.rows;
    
    console.log(`📊 Processing ${citizens.length} citizens for native governance power...`);
    
    let processed = 0;
    let totalNativePower = 0;
    let citizensWithPower = 0;
    
    // Process each citizen
    for (const citizen of citizens) {
      try {
        const nativePower = await calculateNativeGovernancePower(citizen.wallet);
        
        // Update database
        await pool.query(
          'UPDATE citizens SET native_governance_power = $1, updated_at = NOW() WHERE wallet = $2',
          [nativePower, citizen.wallet]
        );
        
        if (nativePower > 0) {
          citizensWithPower++;
          totalNativePower += nativePower;
          console.log(`✅ ${citizen.wallet}: ${nativePower.toFixed(2)} ISLAND native power`);
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`📈 Processed ${processed}/${citizens.length} citizens...`);
        }
        
        // Rate limiting to avoid RPC limits
        await new Promise(resolve => setTimeout(resolve, 150));
        
      } catch (error) {
        console.error(`❌ Error processing ${citizen.wallet}:`, error.message);
      }
    }
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`\n🎯 Daily Native Governance Power Sync Complete!`);
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📈 Citizens processed: ${processed}`);
    console.log(`👥 Citizens with native power: ${citizensWithPower}`);
    console.log(`💰 Total native governance power: ${totalNativePower.toFixed(2)} ISLAND`);
    console.log(`📊 Average native power: ${citizensWithPower > 0 ? (totalNativePower / citizensWithPower).toFixed(2) : 0} ISLAND`);
    
    // Log summary to database for tracking
    await pool.query(`
      INSERT INTO sync_logs (sync_type, citizens_processed, citizens_with_power, total_power, duration_seconds)
      VALUES ('native_governance', $1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [processed, citizensWithPower, totalNativePower, duration]);
    
  } catch (error) {
    console.error('💥 Fatal error in native governance sync:', error);
  } finally {
    await pool.end();
  }
}

/**
 * Create sync logs table if it doesn't exist
 */
async function ensureSyncLogsTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) NOT NULL,
        citizens_processed INTEGER,
        citizens_with_power INTEGER,
        total_power NUMERIC(20,6),
        duration_seconds INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (error) {
    console.error('Error creating sync_logs table:', error);
  } finally {
    await pool.end();
  }
}

// Initialize sync logs table
ensureSyncLogsTable();

// Export function for use in other modules
module.exports = {
  syncAllNativeGovernancePower
};

// Run if called directly
if (require.main === module) {
  syncAllNativeGovernancePower();
}