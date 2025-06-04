/**
 * Daily Governance Power Updater
 * Automated system for updating native governance power daily
 */

import cron from 'node-cron';
import { calculateAllCitizensNativeGovernance, updateCitizenNativeGovernancePower } from './native-governance-calculator.js';
import pg from 'pg';
import { config } from 'dotenv';
config();

// Daily update function
async function performDailyGovernanceUpdate() {
  console.log(`Starting daily governance update: ${new Date().toISOString()}`);
  
  try {
    // Calculate all citizens governance power
    const results = await calculateAllCitizensNativeGovernance(true);
    
    // Update database with results
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    
    try {
      for (const citizen of results.citizens) {
        await pool.query(`
          UPDATE citizens 
          SET 
            native_governance_power = $2,
            locked_governance_power = $3,
            unlocked_governance_power = $4,
            governance_last_updated = NOW()
          WHERE wallet = $1
        `, [
          citizen.wallet,
          citizen.totalPower,
          citizen.lockedPower,
          citizen.unlockedPower
        ]);
      }
      
      console.log(`✅ Updated ${results.citizens.length} citizens in database`);
      console.log(`✅ Total governance power: ${results.summary.totalNativeGovernancePower.toLocaleString()} ISLAND`);
      
    } finally {
      await pool.end();
    }
    
  } catch (error) {
    console.error('Daily governance update failed:', error.message);
  }
}

// Update single citizen when new pin is added
async function updateNewCitizenGovernance(walletAddress) {
  console.log(`Calculating governance power for new citizen: ${walletAddress}`);
  
  try {
    const result = await calculateWalletNativeGovernancePower(walletAddress);
    
    if (result.totalPower > 0) {
      await updateCitizenNativeGovernancePower(walletAddress, result);
      console.log(`✅ New citizen ${walletAddress}: ${result.totalPower.toLocaleString()} ISLAND`);
    } else {
      console.log(`ℹ️ New citizen ${walletAddress}: No governance power detected`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`Failed to update governance for ${walletAddress}:`, error.message);
    throw error;
  }
}

// Schedule daily updates (runs at 2 AM UTC)
function scheduleDailyUpdates() {
  cron.schedule('0 2 * * *', performDailyGovernanceUpdate, {
    scheduled: true,
    timezone: "UTC"
  });
  
  console.log('✅ Daily governance updates scheduled for 2:00 AM UTC');
}

export { 
  performDailyGovernanceUpdate,
  updateNewCitizenGovernance,
  scheduleDailyUpdates
};