/**
 * Database Migration for Native Governance Power
 * Adds governance power columns to citizens table
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

async function addGovernancePowerColumns() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('Adding governance power columns to citizens table...');
    
    await pool.query(`
      ALTER TABLE citizens 
      ADD COLUMN IF NOT EXISTS native_governance_power DECIMAL(20, 6) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_governance_power DECIMAL(20, 6) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unlocked_governance_power DECIMAL(20, 6) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS governance_last_updated TIMESTAMP
    `);
    
    console.log('✅ Governance power columns added successfully');
    
    // Create index for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_citizens_governance_power 
      ON citizens(native_governance_power DESC)
    `);
    
    console.log('✅ Performance index created');
    
  } catch (error) {
    console.error('Error adding governance columns:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addGovernancePowerColumns().catch(console.error);
}

export { addGovernancePowerColumns };