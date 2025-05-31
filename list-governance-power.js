const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT wallet, nickname, native_governance_power 
      FROM citizens 
      ORDER BY native_governance_power DESC
    `);
    
    console.log('Native Governance Power by Wallet Address:');
    console.log('');
    
    result.rows.forEach((row, index) => {
      const nickname = row.nickname || 'Anonymous';
      const power = Number(row.native_governance_power || 0);
      console.log(`${index + 1}. ${row.wallet} | ${nickname} | ${power.toLocaleString()} ISLAND`);
    });
    
  } finally {
    await pool.end();
  }
})().catch(console.error);