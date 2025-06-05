/**
 * Complete Governance Power Audit
 * Test all citizens and identify the exact 15 with governance power
 */

import pkg from 'pg';
import fetch from 'node-fetch';
import { config } from 'dotenv';

config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function completeGovernanceAudit() {
  console.log('COMPLETE GOVERNANCE POWER AUDIT');
  console.log('===============================\n');
  
  try {
    // Get all citizens from database
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    console.log(`Testing all ${citizens.length} citizens...\n`);
    
    const results = [];
    let citizensWithPower = 0;
    let totalGovernancePower = 0;
    let testCount = 0;
    
    for (const citizen of citizens) {
      testCount++;
      const nickname = citizen.nickname || `Anonymous_${testCount}`;
      
      console.log(`${testCount}/${citizens.length}: Testing ${nickname} (${citizen.wallet.slice(0, 8)}...)`);
      
      try {
        const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        const power = data.nativeGovernancePower || 0;
        const deposits = data.deposits ? data.deposits.length : 0;
        
        if (power > 0) {
          citizensWithPower++;
          totalGovernancePower += power;
          console.log(`  ✅ ${power.toLocaleString()} ISLAND (${deposits} deposits)`);
          
          // Show deposit details for verification
          if (data.deposits && data.deposits.length > 0) {
            data.deposits.forEach((deposit, i) => {
              console.log(`     Deposit ${i+1}: ${deposit.amount?.toLocaleString()} × ${deposit.multiplier}x = ${deposit.power?.toLocaleString()}`);
            });
          }
        } else {
          console.log(`  ○ 0 ISLAND`);
        }
        
        results.push({
          nickname,
          wallet: citizen.wallet,
          governancePower: power,
          deposits: data.deposits || [],
          vsrAccounts: data.vsrAccountsFound || 0,
          source: data.source || 'unknown'
        });
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        results.push({
          nickname,
          wallet: citizen.wallet,
          governancePower: 0,
          error: error.message
        });
      }
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE GOVERNANCE AUDIT RESULTS');
    console.log('='.repeat(60));
    console.log(`Citizens tested: ${testCount}`);
    console.log(`Citizens with governance power: ${citizensWithPower}`);
    console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
    
    // Show all citizens with governance power
    const activeHolders = results
      .filter(r => r.governancePower > 0)
      .sort((a, b) => b.governancePower - a.governancePower);
    
    if (activeHolders.length > 0) {
      console.log(`\nAll ${activeHolders.length} Citizens with Governance Power:`);
      console.log('-'.repeat(70));
      
      activeHolders.forEach((holder, index) => {
        console.log(`${index + 1}. ${holder.nickname}: ${holder.governancePower.toLocaleString()} ISLAND (${holder.deposits.length} deposits)`);
      });
    }
    
    // Show any errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.log(`\nErrors encountered (${errors.length} citizens):`);
      console.log('-'.repeat(50));
      errors.forEach(error => {
        console.log(`${error.nickname}: ${error.error}`);
      });
    }
    
    // Save detailed results
    const fs = await import('fs');
    fs.default.writeFileSync('complete-governance-audit.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      totalCitizens: testCount,
      citizensWithPower,
      totalGovernancePower,
      activeHolders,
      allResults: results
    }, null, 2));
    
    console.log('\nDetailed results saved to complete-governance-audit.json');
    
    return {
      totalCitizens: testCount,
      citizensWithPower,
      totalGovernancePower,
      activeHolders,
      errors
    };
    
  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the complete audit
completeGovernanceAudit().catch(console.error);