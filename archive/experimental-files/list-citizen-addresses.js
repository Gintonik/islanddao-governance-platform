/**
 * List all citizen wallet addresses from the map database
 */

import { Pool } from 'pg';

async function listCitizenAddresses() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const result = await pool.query('SELECT wallet FROM citizens ORDER BY wallet');
    
    // Print just the addresses, one per line
    result.rows.forEach(row => {
      console.log(row.wallet);
    });
    
    console.error(`\n(${result.rows.length} citizen addresses total)`);
    
  } catch (error) {
    console.error('Error fetching citizen addresses:', error.message);
  } finally {
    await pool.end();
  }
}

listCitizenAddresses();