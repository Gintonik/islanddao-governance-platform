/**
 * Find exactly which 15 citizens have governance power
 */

import pkg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function find15Citizens() {
  console.log('FINDING THE 15 CITIZENS WITH GOVERNANCE POWER');
  console.log('============================================\n');
  
  try {
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    const citizensWithPower = [];
    let testCount = 0;
    
    for (const citizen of citizens) {
      testCount++;
      const nickname = citizen.nickname || `Anonymous_${testCount}`;
      
      try {
        const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        const data = await response.json();
        
        if (response.ok && !data.error) {
          const power = data.nativeGovernancePower || 0;
          
          if (power > 0) {
            citizensWithPower.push({
              nickname,
              wallet: citizen.wallet,
              governancePower: power,
              deposits: data.deposits?.length || 0
            });
            
            console.log(`${citizensWithPower.length}. ${nickname}: ${power.toLocaleString()} ISLAND`);
          }
        }
      } catch (error) {
        // Skip errors for now
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\nFOUND ${citizensWithPower.length} CITIZENS WITH GOVERNANCE POWER:`);
    console.log('='.repeat(60));
    
    citizensWithPower
      .sort((a, b) => b.governancePower - a.governancePower)
      .forEach((citizen, index) => {
        console.log(`${index + 1}. ${citizen.nickname}: ${citizen.governancePower.toLocaleString()} ISLAND`);
      });
    
    const totalPower = citizensWithPower.reduce((sum, c) => sum + c.governancePower, 0);
    console.log(`\nTotal: ${totalPower.toLocaleString()} ISLAND across ${citizensWithPower.length} citizens`);
    
    return citizensWithPower;
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

find15Citizens().catch(console.error);