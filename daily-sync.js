/**
 * Daily Governance Power Sync System
 * Runs at 00:00 UTC daily to verify citizens against blockchain data
 * Updates governance power and removes citizens with 0 PERKS NFTs
 */

import cron from 'node-cron';
import pg from 'pg';
import fs from 'fs';
import fetch from 'node-fetch';
import { config } from 'dotenv';

config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Archive current JSON file before updates
async function archiveCurrentData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `data/native-governance-power-backup-${timestamp}.json`;
  
  try {
    if (fs.existsSync('data/native-governance-power.json')) {
      const currentData = fs.readFileSync('data/native-governance-power.json', 'utf8');
      fs.writeFileSync(backupPath, currentData);
      console.log(`📦 Archived current data to ${backupPath}`);
    }
  } catch (error) {
    console.error('Archive error:', error.message);
  }
}

// Check NFT ownership for a wallet
async function checkNFTOwnership(walletAddress) {
  try {
    const response = await fetch(`http://localhost:5000/api/wallet-nfts?wallet=${walletAddress}`);
    const nftData = await response.json();
    
    // Fix: Check the correct structure - API returns {nfts: [...]}
    if (nftData && nftData.nfts && Array.isArray(nftData.nfts)) {
      return nftData.nfts.length;
    }
    
    // Fallback: if direct array
    if (Array.isArray(nftData)) {
      return nftData.length;
    }
    
    return 0;
  } catch (error) {
    console.error(`NFT check failed for ${walletAddress}:`, error.message);
    return -1; // Error state - don't remove on API failure
  }
}

// Get governance power for a wallet
async function getGovernancePower(walletAddress) {
  try {
    const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${walletAddress}`);
    const data = await response.json();
    
    return {
      native: data.nativeGovernancePower || 0,
      delegated: data.delegatedGovernancePower || 0,
      total: (data.nativeGovernancePower || 0) + (data.delegatedGovernancePower || 0)
    };
  } catch (error) {
    console.error(`Governance power check failed for ${walletAddress}:`, error.message);
    return { native: 0, delegated: 0, total: 0 };
  }
}

// Archive citizen before removal
async function archiveCitizen(client, citizen) {
  try {
    await client.query(`
      INSERT INTO archived_citizens 
      (wallet, nickname, lat, lng, primary_nft, pfp_nft, bio, twitter_handle, telegram_handle, discord_handle, 
       native_governance_power, delegated_governance_power, total_governance_power, 
       removal_reason, removal_date, original_created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)
    `, [
      citizen.wallet, citizen.nickname, citizen.lat, citizen.lng, 
      citizen.primary_nft, citizen.pfp_nft, citizen.bio, 
      citizen.twitter_handle, citizen.telegram_handle, citizen.discord_handle,
      citizen.native_governance_power, citizen.delegated_governance_power, citizen.total_governance_power,
      'No PERKS NFTs found during daily sync', citizen.created_at
    ]);
    console.log(`📁 Archived citizen ${citizen.nickname || citizen.wallet.slice(0, 8)}`);
  } catch (error) {
    console.error('Archive citizen error:', error.message);
  }
}

// Create archived_citizens table if it doesn't exist
async function ensureArchiveTable(client) {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS archived_citizens (
        id SERIAL PRIMARY KEY,
        wallet VARCHAR(255) NOT NULL,
        nickname VARCHAR(255),
        lat DECIMAL(10, 8),
        lng DECIMAL(11, 8),
        primary_nft VARCHAR(255),
        pfp_nft VARCHAR(255),
        bio TEXT,
        twitter_handle VARCHAR(255),
        telegram_handle VARCHAR(255),
        discord_handle VARCHAR(255),
        native_governance_power DECIMAL(20, 6) DEFAULT 0,
        delegated_governance_power DECIMAL(20, 6) DEFAULT 0,
        total_governance_power DECIMAL(20, 6) DEFAULT 0,
        removal_reason TEXT,
        removal_date TIMESTAMP DEFAULT NOW(),
        original_created_at TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('Archive table creation error:', error.message);
  }
}

// Export updated governance data to JSON
async function exportGovernanceJSON(validCitizens) {
  try {
    const jsonData = {
      summary: {
        totalCitizens: validCitizens.length,
        totalNativeGovernancePower: validCitizens.reduce((sum, c) => sum + (c.native_governance_power || 0), 0),
        totalDelegatedGovernancePower: validCitizens.reduce((sum, c) => sum + (c.delegated_governance_power || 0), 0),
        calculatedAt: new Date().toISOString(),
        version: "2.0.0"
      },
      citizens: validCitizens.map(citizen => ({
        wallet: citizen.wallet,
        nickname: citizen.nickname,
        nativeGovernancePower: citizen.native_governance_power || 0,
        delegatedGovernancePower: citizen.delegated_governance_power || 0,
        totalGovernancePower: citizen.total_governance_power || 0,
        updatedAt: new Date().toISOString()
      }))
    };

    fs.writeFileSync('data/native-governance-power.json', JSON.stringify(jsonData, null, 2));
    console.log(`📄 Exported ${validCitizens.length} citizens to governance JSON`);
  } catch (error) {
    console.error('JSON export error:', error.message);
  }
}

// Main daily sync function
async function performDailySync() {
  const client = await pool.connect();
  
  try {
    console.log(`\n🔄 Starting daily sync: ${new Date().toISOString()}`);
    await client.query('BEGIN');
    await ensureArchiveTable(client);
    
    // Get all current citizens
    const citizensResult = await client.query(`
      SELECT wallet, nickname, lat, lng, primary_nft, pfp_nft, bio, 
             twitter_handle, telegram_handle, discord_handle,
             native_governance_power, delegated_governance_power, total_governance_power,
             created_at
      FROM citizens 
      ORDER BY wallet
    `);
    
    const citizens = citizensResult.rows;
    console.log(`📊 Processing ${citizens.length} citizens`);
    
    let updated = 0;
    let removed = 0;
    let errors = 0;
    const validCitizens = [];
    
    for (const citizen of citizens) {
      try {
        const walletShort = citizen.wallet.slice(0, 8);
        console.log(`🔍 Checking ${citizen.nickname || walletShort}...`);
        
        // Check NFT ownership
        const nftCount = await checkNFTOwnership(citizen.wallet);
        
        if (nftCount === -1) {
          // API error - skip this citizen to be safe
          console.log(`  ⚠️ API error - keeping citizen ${citizen.nickname || walletShort}`);
          validCitizens.push(citizen);
          errors++;
          continue;
        }
        
        if (nftCount === 0) {
          // No PERKS NFTs - remove citizen
          console.log(`  ❌ ${citizen.nickname || walletShort}: No PERKS NFTs found - removing`);
          
          await archiveCitizen(client, citizen);
          await client.query('DELETE FROM citizens WHERE wallet = $1', [citizen.wallet]);
          removed++;
          continue;
        }
        
        // Get fresh governance power
        const governance = await getGovernancePower(citizen.wallet);
        console.log(`  📈 ${citizen.nickname || walletShort}: ${governance.total.toLocaleString()} ISLAND (${nftCount} NFTs)`);
        
        // Update governance power in database
        await client.query(`
          UPDATE citizens SET 
            native_governance_power = $1,
            delegated_governance_power = $2,
            total_governance_power = $3,
            governance_last_updated = NOW()
          WHERE wallet = $4
        `, [governance.native, governance.delegated, governance.total, citizen.wallet]);
        
        // Add to valid citizens for JSON export
        validCitizens.push({
          ...citizen,
          native_governance_power: governance.native,
          delegated_governance_power: governance.delegated,
          total_governance_power: governance.total
        });
        
        updated++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  💥 Error processing ${citizen.nickname || citizen.wallet.slice(0, 8)}: ${error.message}`);
        validCitizens.push(citizen); // Keep citizen on error
        errors++;
      }
    }
    
    await client.query('COMMIT');
    
    // Archive current data and export new JSON
    if (updated > 0 || removed > 0) {
      await archiveCurrentData();
      await exportGovernanceJSON(validCitizens);
    }
    
    console.log(`\n✅ Daily sync completed:`);
    console.log(`   📊 Citizens processed: ${citizens.length}`);
    console.log(`   🔄 Governance updated: ${updated}`);
    console.log(`   ❌ Citizens removed: ${removed}`);
    console.log(`   ⚠️ Errors encountered: ${errors}`);
    console.log(`   📋 Active citizens: ${validCitizens.length}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('💥 Daily sync failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
  }
}

// Track sync attempts to prevent infinite retries
let lastSyncDate = null;
let syncAttempted = false;

// Wrapper function with retry logic
async function performDailySyncWithRetry() {
  const today = new Date().toDateString();
  
  // Reset attempt flag for new day
  if (lastSyncDate !== today) {
    syncAttempted = false;
    lastSyncDate = today;
  }
  
  // Skip if already attempted today
  if (syncAttempted) {
    console.log('Daily sync already attempted today - skipping');
    return;
  }
  
  try {
    await performDailySync();
    syncAttempted = true;
    console.log('✅ Daily sync completed successfully');
  } catch (error) {
    console.error('❌ Daily sync failed on primary attempt:', error.message);
    
    // Schedule retry in 30 minutes
    console.log('⏳ Scheduling retry in 30 minutes...');
    setTimeout(async () => {
      try {
        console.log('🔄 Attempting daily sync retry...');
        await performDailySync();
        syncAttempted = true;
        console.log('✅ Daily sync retry completed successfully');
      } catch (retryError) {
        console.error('❌ Daily sync retry also failed:', retryError.message);
        syncAttempted = true; // Prevent further attempts today
        console.log('⚠️ Daily sync failed twice - will retry tomorrow');
      }
    }, 30 * 60 * 1000); // 30 minutes
  }
}

// Export functions for use by other modules
export { exportGovernanceJSON, performDailySync };

// Schedule daily sync at 00:00 UTC
export function startDailySync() {
  // Schedule at 00:00 UTC daily with retry logic
  cron.schedule('0 0 * * *', performDailySyncWithRetry, {
    timezone: "UTC"
  });
  
  console.log('⏰ Daily sync scheduled for 00:00 UTC (with 30min retry on failure)');
}

// Manual trigger for testing

// Auto-start if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting manual daily sync...');
  performDailySync().then(() => {
    console.log('Manual sync completed');
    process.exit(0);
  }).catch(error => {
    console.error('Manual sync failed:', error);
    process.exit(1);
  });
}