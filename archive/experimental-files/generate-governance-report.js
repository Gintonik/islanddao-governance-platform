/**
 * Generate Comprehensive Governance Power Report
 * Shows all citizens with detailed deposit breakdowns and calculations
 */

import { calculateWalletGovernancePower } from './canonical-island-vsr-scanner.js';
import pkg from 'pg';
import { config } from 'dotenv';
config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// VSR Model Parameters (from authentic registrar)
const VSR_MODEL = {
  baselineMultiplier: 3.0,
  maxLockupMultiplier: 3.0,
  lockupSaturationSeconds: 31536000, // 1 year
  formula: "votingPower = amount × (3 + 3 × min(1, timeRemaining / 31536000))"
};

async function getAllCitizens() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT wallet FROM citizens ORDER BY wallet');
    return result.rows.map(row => row.wallet);
  } finally {
    client.release();
  }
}

function formatTimestamp(timestamp) {
  if (!timestamp || timestamp === 0) return 'N/A';
  return new Date(timestamp * 1000).toISOString().split('T')[0];
}

function formatDuration(seconds) {
  if (seconds <= 0) return 'Expired';
  const years = seconds / (365.25 * 24 * 3600);
  if (years >= 1) return `${years.toFixed(2)}y`;
  const months = seconds / (30.44 * 24 * 3600);
  if (months >= 1) return `${months.toFixed(1)}m`;
  const days = seconds / (24 * 3600);
  return `${days.toFixed(0)}d`;
}

function calculateExpectedMultiplier(timeRemaining) {
  const lockupMultiplier = Math.min(1.0, timeRemaining / VSR_MODEL.lockupSaturationSeconds);
  return VSR_MODEL.baselineMultiplier + VSR_MODEL.maxLockupMultiplier * lockupMultiplier;
}

async function generateDetailedReport() {
  console.log('VSR GOVERNANCE POWER CALCULATION MODEL');
  console.log('=====================================');
  console.log(`Baseline Multiplier: ${VSR_MODEL.baselineMultiplier}x`);
  console.log(`Max Lockup Multiplier: ${VSR_MODEL.maxLockupMultiplier}x`);
  console.log(`Lockup Saturation: ${VSR_MODEL.lockupSaturationSeconds / (365.25 * 24 * 3600)} years`);
  console.log(`Formula: ${VSR_MODEL.formula}`);
  console.log('');

  const citizens = await getAllCitizens();
  const results = [];
  
  console.log('Scanning all citizens for governance power...');
  console.log('');

  for (let i = 0; i < citizens.length; i++) {
    const wallet = citizens[i];
    console.log(`[${i + 1}/${citizens.length}] Scanning ${wallet.substring(0, 8)}...`);
    
    const result = await calculateWalletGovernancePower(wallet);
    results.push(result);
    
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Sort by governance power (highest first)
  results.sort((a, b) => b.nativeGovernancePower - a.nativeGovernancePower);

  console.log('\n\nDETAILED GOVERNANCE POWER REPORT');
  console.log('================================');
  
  // Summary table
  console.log('\nSUMMARY TABLE:');
  console.log('Rank | Wallet Address                             | Total Governance Power | Deposits | VSR Accounts');
  console.log('-----|-------------------------------------------|------------------------|----------|-------------');
  
  let rank = 1;
  for (const result of results) {
    if (result.nativeGovernancePower > 0) {
      console.log(`${rank.toString().padStart(4)} | ${result.wallet} | ${result.nativeGovernancePower.toLocaleString().padStart(21)} | ${result.deposits.length.toString().padStart(8)} | ${result.vsrAccountsFound.toString().padStart(11)}`);
      rank++;
    }
  }
  
  console.log('\nZERO POWER CITIZENS:');
  const zeroPowerCount = results.filter(r => r.nativeGovernancePower === 0).length;
  console.log(`${zeroPowerCount} citizens have no governance power`);

  // Detailed breakdown for citizens with power
  console.log('\n\nDETAILED DEPOSIT BREAKDOWNS:');
  console.log('============================');
  
  for (const result of results) {
    if (result.nativeGovernancePower > 0) {
      console.log(`\n${result.wallet} (${result.wallet.substring(0, 8)})`);
      console.log(`Total Governance Power: ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
      console.log(`VSR Accounts Found: ${result.vsrAccountsFound}`);
      console.log(`Active Deposits: ${result.deposits.length}`);
      
      if (result.deposits.length > 0) {
        console.log('\nDeposit Details:');
        console.log('Amount (ISLAND) | Lockup Type | Start Date | End Date   | Time Left | Expected Mult | Actual Mult | Voting Power');
        console.log('----------------|-------------|------------|------------|-----------|---------------|-------------|-------------');
        
        for (const deposit of result.deposits) {
          const expectedMult = calculateExpectedMultiplier(deposit.timeRemaining);
          const startDate = formatTimestamp(deposit.startTs);
          const endDate = formatTimestamp(deposit.endTs);
          const timeLeft = formatDuration(deposit.timeRemaining);
          
          console.log(
            `${deposit.amount.toLocaleString().padStart(15)} | ` +
            `${deposit.lockupType.padEnd(11)} | ` +
            `${startDate.padEnd(10)} | ` +
            `${endDate.padEnd(10)} | ` +
            `${timeLeft.padEnd(9)} | ` +
            `${expectedMult.toFixed(2).padStart(13)} | ` +
            `${deposit.multiplier.toFixed(2).padStart(11)} | ` +
            `${deposit.votingPower.toLocaleString().padStart(12)}`
          );
          
          // Check for anomalies
          const multiplierDiff = Math.abs(deposit.multiplier - expectedMult);
          if (multiplierDiff > 0.01) {
            console.log(`    ⚠️  ANOMALY: Expected ${expectedMult.toFixed(2)}x but got ${deposit.multiplier.toFixed(2)}x (diff: ${multiplierDiff.toFixed(3)})`);
          }
        }
      }
      
      console.log('-'.repeat(120));
    }
  }

  // Model validation and anomaly detection
  console.log('\n\nMODEL VALIDATION & ANOMALY DETECTION:');
  console.log('=====================================');
  
  let totalDeposits = 0;
  let anomalies = 0;
  let maxMultiplier = 0;
  let minMultiplier = Infinity;
  
  for (const result of results) {
    for (const deposit of result.deposits) {
      totalDeposits++;
      
      const expectedMult = calculateExpectedMultiplier(deposit.timeRemaining);
      const actualMult = deposit.multiplier;
      const diff = Math.abs(actualMult - expectedMult);
      
      if (diff > 0.01) {
        anomalies++;
        console.log(`Anomaly in ${result.wallet.substring(0, 8)}: ${deposit.amount.toLocaleString()} ISLAND`);
        console.log(`  Expected: ${expectedMult.toFixed(3)}x, Actual: ${actualMult.toFixed(3)}x, Diff: ${diff.toFixed(3)}`);
      }
      
      maxMultiplier = Math.max(maxMultiplier, actualMult);
      minMultiplier = Math.min(minMultiplier, actualMult);
    }
  }
  
  console.log(`\nTotal deposits analyzed: ${totalDeposits}`);
  console.log(`Multiplier range: ${minMultiplier.toFixed(2)}x to ${maxMultiplier.toFixed(2)}x`);
  console.log(`Expected range: 3.00x to 6.00x`);
  console.log(`Anomalies detected: ${anomalies}/${totalDeposits} (${(anomalies/totalDeposits*100).toFixed(1)}%)`);
  
  // Final statistics
  const citizensWithPower = results.filter(r => r.nativeGovernancePower > 0).length;
  const totalGovernancePower = results.reduce((sum, r) => sum + r.nativeGovernancePower, 0);
  
  console.log('\n\nFINAL STATISTICS:');
  console.log('=================');
  console.log(`Citizens with governance power: ${citizensWithPower}/20 (${(citizensWithPower/20*100).toFixed(1)}%)`);
  console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
  console.log(`Average power per citizen: ${(totalGovernancePower/citizensWithPower).toLocaleString()} ISLAND`);
  console.log(`Total deposits found: ${totalDeposits}`);
  
  return results;
}

// Run the report
generateDetailedReport()
  .then(() => {
    console.log('\nReport generation completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error generating report:', error.message);
    process.exit(1);
  });