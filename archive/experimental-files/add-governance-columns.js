/**
 * Migration: Add governance power columns to citizens table
 * Run with: node add-governance-columns.js
 */

const { Pool } = require('pg');

async function addGovernanceColumns() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Starting migration: Adding governance power columns...');

    // Check if columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'citizens' 
      AND column_name IN ('native_governance_power', 'delegated_governance_power', 'total_governance_power');
    `;
    
    const existingColumns = await pool.query(checkQuery);
    
    if (existingColumns.rows.length > 0) {
      console.log('Governance columns already exist. Skipping migration.');
      console.log('Existing columns:', existingColumns.rows.map(row => row.column_name));
      return;
    }

    // Add the new columns
    const alterQueries = [
      `ALTER TABLE citizens ADD COLUMN native_governance_power BIGINT DEFAULT 0;`,
      `ALTER TABLE citizens ADD COLUMN delegated_governance_power BIGINT DEFAULT 0;`,
      `ALTER TABLE citizens ADD COLUMN total_governance_power BIGINT DEFAULT 0;`
    ];

    for (const query of alterQueries) {
      await pool.query(query);
    }

    // Update total_governance_power as computed column
    const updateQuery = `
      UPDATE citizens 
      SET total_governance_power = native_governance_power + delegated_governance_power;
    `;
    await pool.query(updateQuery);

    console.log('Successfully added governance power columns:');
    console.log('   - native_governance_power (BIGINT, default 0)');
    console.log('   - delegated_governance_power (BIGINT, default 0)');
    console.log('   - total_governance_power (BIGINT, default 0)');

    // Verify the changes
    const verifyQuery = `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'citizens' 
      AND column_name LIKE '%governance_power%'
      ORDER BY column_name;
    `;
    
    const verification = await pool.query(verifyQuery);
    console.log('\nColumn verification:');
    verification.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  addGovernanceColumns()
    .then(() => {
      console.log('\nMigration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nMigration failed:', error);
      process.exit(1);
    });
}

module.exports = { addGovernanceColumns };