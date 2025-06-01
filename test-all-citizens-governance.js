/**
 * Test Authentic VSR Governance Power for All Citizens
 * Calculates governance power for all citizens without updating the database
 */

const { calculateNativeGovernancePower } = require('./simplified-vsr-voting-power.js');
const { Pool } = require('pg');

async function testAllCitizensGovernance() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🧪 Testing authentic VSR governance power for all citizens...\n');
    
    // Get all citizens with their nicknames
    const citizensResult = await pool.query(`
      SELECT wallet, COALESCE(nickname, 'No nickname') as nickname 
      FROM citizens 
      ORDER BY nickname
    `);
    
    const citizens = citizensResult.rows;
    console.log(`Found ${citizens.length} citizens to test\n`);
    
    const results = [];
    
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i];
      
      try {
        console.log(`[${i + 1}/${citizens.length}] Testing ${citizen.nickname} (${citizen.wallet})...`);
        
        const governancePower = await calculateNativeGovernancePower(citizen.wallet);
        
        results.push({
          nickname: citizen.nickname,
          wallet: citizen.wallet,
          governancePower: governancePower
        });
        
        if (governancePower > 0) {
          console.log(`✅ ${citizen.nickname}: ${governancePower.toLocaleString()} ISLAND\n`);
        } else {
          console.log(`⭕ ${citizen.nickname}: No governance power found\n`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error testing ${citizen.nickname}:`, error.message);
        results.push({
          nickname: citizen.nickname,
          wallet: citizen.wallet,
          governancePower: 0,
          error: error.message
        });
      }
    }
    
    // Summary table
    console.log('\n📊 GOVERNANCE POWER SUMMARY');
    console.log('=====================================');
    
    // Sort by governance power (highest first)
    results.sort((a, b) => b.governancePower - a.governancePower);
    
    let totalPower = 0;
    let citizensWithPower = 0;
    
    for (const result of results) {
      if (result.governancePower > 0) {
        console.log(`${result.nickname.padEnd(20)} | ${result.governancePower.toLocaleString().padStart(15)} ISLAND`);
        totalPower += result.governancePower;
        citizensWithPower++;
      }
    }
    
    console.log('=====================================');
    console.log(`Total Citizens: ${results.length}`);
    console.log(`Citizens with Power: ${citizensWithPower}`);
    console.log(`Total Governance Power: ${totalPower.toLocaleString()} ISLAND`);
    console.log(`Average Power: ${citizensWithPower > 0 ? (totalPower / citizensWithPower).toLocaleString() : 0} ISLAND`);
    
    // Citizens with zero power
    const zeroPowerCitizens = results.filter(r => r.governancePower === 0);
    if (zeroPowerCitizens.length > 0) {
      console.log(`\n⭕ Citizens with Zero Governance Power: ${zeroPowerCitizens.length}`);
      zeroPowerCitizens.forEach(citizen => {
        console.log(`   ${citizen.nickname}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Fatal error in governance test:', error);
  } finally {
    await pool.end();
  }
}

// Run the test
testAllCitizensGovernance();