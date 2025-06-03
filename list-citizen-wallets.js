/**
 * List Citizen Wallets
 * Retrieves all citizen wallet addresses from the database
 */

import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function listCitizenWallets() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('CITIZEN WALLET ADDRESSES');
    console.log('========================');
    
    const result = await pool.query(`
      SELECT wallet, nickname, lat, lng, native_governance_power, delegated_governance_power 
      FROM citizens 
      ORDER BY native_governance_power DESC NULLS LAST
    `);
    
    console.log(`Found ${result.rows.length} citizens on the map:\n`);
    
    result.rows.forEach((citizen, index) => {
      const nativePower = Number(citizen.native_governance_power) || 0;
      const delegatedPower = Number(citizen.delegated_governance_power) || 0;
      const totalPower = nativePower + delegatedPower;
      
      console.log(`${index + 1}. ${citizen.wallet}`);
      
      if (citizen.nickname) {
        console.log(`   Name: ${citizen.nickname}`);
      }
      
      console.log(`   Position: (${Number(citizen.lat).toFixed(6)}, ${Number(citizen.lng).toFixed(6)})`);
      
      if (nativePower > 0 || delegatedPower > 0) {
        console.log(`   Native Power: ${nativePower.toFixed(2)} ISLAND`);
        console.log(`   Delegated Power: ${delegatedPower.toFixed(2)} ISLAND`);
        console.log(`   Total Power: ${totalPower.toFixed(2)} ISLAND`);
      } else {
        console.log(`   Governance Power: Not calculated`);
      }
      
      console.log();
    });
    
    // Summary statistics
    const walletsWithPower = result.rows.filter(row => 
      (Number(row.native_governance_power) || 0) > 0 || (Number(row.delegated_governance_power) || 0) > 0
    );
    
    const totalNative = result.rows.reduce((sum, row) => sum + (Number(row.native_governance_power) || 0), 0);
    const totalDelegated = result.rows.reduce((sum, row) => sum + (Number(row.delegated_governance_power) || 0), 0);
    
    console.log('SUMMARY:');
    console.log('========');
    console.log(`Total Citizens: ${result.rows.length}`);
    console.log(`Citizens with Governance Power: ${walletsWithPower.length}`);
    console.log(`Total Native Power: ${totalNative.toFixed(2)} ISLAND`);
    console.log(`Total Delegated Power: ${totalDelegated.toFixed(2)} ISLAND`);
    console.log(`Total Governance Power: ${(totalNative + totalDelegated).toFixed(2)} ISLAND`);
    
  } catch (error) {
    console.error('Database query failed:', error.message);
  } finally {
    await pool.end();
  }
}

listCitizenWallets();