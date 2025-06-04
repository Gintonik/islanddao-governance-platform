/**
 * List Native Governance Power for All Citizens
 */

const { Pool } = require('pg');

async function listGovernancePower() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    const result = await pool.query(`
      SELECT nickname, wallet, native_governance_power 
      FROM citizens 
      ORDER BY native_governance_power DESC NULLS LAST, nickname
    `);
    
    console.log('=== NATIVE GOVERNANCE POWER - ALL CITIZENS ===');
    console.log('');
    
    let totalPower = 0;
    let citizensWithPower = 0;
    
    result.rows.forEach((citizen, index) => {
      const power = citizen.native_governance_power || 0;
      const formattedPower = power.toLocaleString('en-US', { maximumFractionDigits: 3 });
      const walletShort = citizen.wallet.substring(0, 8) + '...';
      
      if (power > 0) {
        citizensWithPower++;
        totalPower += power;
      }
      
      console.log(`${(index + 1).toString().padStart(2, ' ')}. ${citizen.nickname || 'Anonymous'}: ${formattedPower} ISLAND`);
      console.log(`    ${walletShort}`);
      console.log('');
    });
    
    console.log('=== SUMMARY ===');
    console.log(`Total citizens: ${result.rows.length}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total governance power: ${totalPower.toLocaleString('en-US', { maximumFractionDigits: 0 })} ISLAND`);
    
  } finally {
    await pool.end();
  }
}

listGovernancePower().catch(console.error);