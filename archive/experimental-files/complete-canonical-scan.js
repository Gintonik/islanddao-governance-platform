/**
 * Complete Canonical VSR Scan for Key Citizens
 * Focus on testing target wallets and updating database efficiently
 */

import { calculateWalletGovernancePower } from './canonical-island-vsr-scanner.js';
import pkg from 'pg';
import { config } from 'dotenv';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testTargetWallets() {
  const targets = [
    { name: 'Takisoul', wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', expected: 8700000 },
    { name: 'GJdRQcsy', wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144000 },
    { name: "Whale's Friend", wallet: 'EoqBhxp3CLeCo2ZGFjUjf7WNJLt3q7xB84VcLzuWS4VL', expected: 12600 }
  ];
  
  console.log('Testing target wallets with canonical VSR calculator...');
  
  for (const target of targets) {
    console.log(`\nTesting ${target.name} (expected ~${target.expected.toLocaleString()} ISLAND):`);
    
    const result = await calculateWalletGovernancePower(target.wallet);
    
    if (result.nativeGovernancePower > 0) {
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE citizens SET native_governance_power = $1, governance_power = $1 WHERE wallet = $2',
          [result.nativeGovernancePower, result.wallet]
        );
        console.log(`Database updated: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
      } finally {
        client.release();
      }
    }
    
    // Check accuracy
    const accuracy = Math.abs(result.nativeGovernancePower - target.expected) / target.expected;
    console.log(`Accuracy: ${((1 - accuracy) * 100).toFixed(1)}%`);
  }
}

async function updateOtherCitizens() {
  console.log('\nUpdating other high-value citizens...');
  
  const knownCitizens = [
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk', // Already confirmed 473K
    '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA'  // Already confirmed 50K
  ];
  
  for (const wallet of knownCitizens) {
    const result = await calculateWalletGovernancePower(wallet);
    
    if (result.nativeGovernancePower > 0) {
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE citizens SET native_governance_power = $1, governance_power = $1 WHERE wallet = $2',
          [result.nativeGovernancePower, result.wallet]
        );
        console.log(`${wallet.substring(0, 8)}: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
      } finally {
        client.release();
      }
    }
  }
}

async function showFinalResults() {
  console.log('\nFinal governance power results:');
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT wallet, governance_power FROM citizens WHERE governance_power > 0 ORDER BY governance_power DESC'
    );
    
    console.log(`Citizens with governance power: ${result.rows.length}/20`);
    
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.wallet.substring(0, 8)}: ${parseFloat(row.governance_power).toLocaleString()} ISLAND`);
    });
    
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await testTargetWallets();
    await updateOtherCitizens();
    await showFinalResults();
    
    console.log('\nCanonical VSR scan completed successfully');
    console.log('Using authentic registrar configuration with no hardcoded values');
    
  } catch (error) {
    console.error('Scan failed:', error.message);
  }
}

main();