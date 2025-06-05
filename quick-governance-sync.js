/**
 * Quick Governance Sync - Batch Process All Citizens
 * Uses the corrected canonical VSR calculator
 */

import pkg from 'pg';
const { Pool } = pkg;
import fetch from 'node-fetch';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function quickSync() {
  try {
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    console.log(`Syncing ${citizens.length} citizens with canonical governance data...`);
    
    for (const citizen of citizens) {
      try {
        const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        const data = await response.json();
        
        await pool.query(`
          UPDATE citizens 
          SET native_governance_power = $1, governance_power = $2, total_governance_power = $3
          WHERE wallet = $4
        `, [
          data.nativeGovernancePower || 0,
          data.delegatedGovernancePower || 0, 
          data.totalGovernancePower || 0,
          citizen.wallet
        ]);
        
        console.log(`${citizen.nickname}: ${(data.totalGovernancePower || 0).toLocaleString()} ISLAND`);
        
      } catch (e) {
        console.log(`${citizen.nickname}: Error - ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error('Sync error:', error);
  } finally {
    await pool.end();
  }
}

quickSync();