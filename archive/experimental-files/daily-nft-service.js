/**
 * Daily NFT Refresh Service
 * Runs automatically every day at 2 AM to update NFT ownership from blockchain
 */

import { config } from "dotenv";
import pkg from "pg";
import cron from "node-cron";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Initialize refresh tracking table
 */
async function initializeRefreshTracking() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nft_refresh_log (
        id SERIAL PRIMARY KEY,
        refresh_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        citizens_processed INTEGER DEFAULT 0,
        nfts_updated INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        error_message TEXT
      )
    `);
    
    console.log('NFT refresh tracking initialized');
  } catch (error) {
    console.error('Error initializing refresh tracking:', error);
  } finally {
    client.release();
  }
}

/**
 * Perform daily NFT ownership refresh
 */
async function performDailyRefresh() {
  const client = await pool.connect();
  let logId;
  
  try {
    // Log start of refresh
    const logResult = await client.query(`
      INSERT INTO nft_refresh_log (refresh_date, status) 
      VALUES (CURRENT_TIMESTAMP, 'running') 
      RETURNING id
    `);
    logId = logResult.rows[0].id;
    
    console.log(`Starting daily NFT refresh: ${new Date().toISOString()}`);
    
    // Import the refresh functions dynamically
    const { dailyOwnershipRefresh } = await import('./refresh-nft-ownership.js');
    
    const totalUpdated = await dailyOwnershipRefresh();
    
    // Update log with success
    await client.query(`
      UPDATE nft_refresh_log 
      SET status = 'completed', nfts_updated = $1 
      WHERE id = $2
    `, [totalUpdated, logId]);
    
    console.log(`Daily NFT refresh completed successfully: ${totalUpdated} NFTs updated`);
    
  } catch (error) {
    console.error('Daily NFT refresh failed:', error);
    
    if (logId) {
      await client.query(`
        UPDATE nft_refresh_log 
        SET status = 'failed', error_message = $1 
        WHERE id = $2
      `, [error.message, logId]);
    }
  } finally {
    client.release();
  }
}

/**
 * Start the daily refresh scheduler
 */
async function startDailyRefreshService() {
  await initializeRefreshTracking();
  
  // Schedule daily at 2:00 AM UTC
  cron.schedule('0 2 * * *', performDailyRefresh, {
    timezone: "UTC"
  });
  
  console.log('Daily NFT refresh service started - runs every day at 2:00 AM UTC');
  
  // Also run immediately if no refresh in last 24 hours
  const client = await pool.connect();
  try {
    const lastRefresh = await client.query(`
      SELECT refresh_date 
      FROM nft_refresh_log 
      WHERE status = 'completed' 
      ORDER BY refresh_date DESC 
      LIMIT 1
    `);
    
    if (lastRefresh.rows.length === 0 || 
        new Date() - new Date(lastRefresh.rows[0].refresh_date) > 24 * 60 * 60 * 1000) {
      console.log('No recent refresh found, running initial refresh...');
      setTimeout(performDailyRefresh, 5000); // Run after 5 seconds
    }
  } finally {
    client.release();
  }
}

export { startDailyRefreshService, performDailyRefresh };