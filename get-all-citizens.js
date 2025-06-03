/**
 * Get All Citizens from Database
 * Extract citizen wallet addresses for comprehensive governance scanning
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Get all citizen wallet addresses from database
 */
async function getAllCitizenWallets() {
  try {
    const query = 'SELECT wallet FROM citizens ORDER BY wallet';
    const result = await pool.query(query);
    
    const wallets = result.rows.map(row => row.wallet);
    console.log(`Found ${wallets.length} citizen wallets in database`);
    
    // Write to file for use by the scanner
    const fs = await import('fs');
    fs.writeFileSync('./citizen-wallets.json', JSON.stringify(wallets, null, 2));
    
    console.log('Citizen wallets saved to citizen-wallets.json');
    
    // Display first few for verification
    console.log('\nFirst 10 citizen wallets:');
    for (let i = 0; i < Math.min(10, wallets.length); i++) {
      console.log(`  ${i + 1}. ${wallets[i]}`);
    }
    
    return wallets;
    
  } catch (error) {
    console.error('Error getting citizen wallets:', error.message);
    return [];
  } finally {
    await pool.end();
  }
}

getAllCitizenWallets().catch(console.error);