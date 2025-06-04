/**
 * Governance Power API
 * API endpoints for serving native governance power data
 */

import express from 'express';
import { loadNativeGovernanceResults, calculateWalletNativeGovernancePower } from './native-governance-calculator.js';
import pg from 'pg';
import { config } from 'dotenv';
config();

const router = express.Router();

// Get native governance power for a specific citizen
router.get('/citizen/:wallet/native-governance', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    // First try to get from cached JSON
    const cachedResults = loadNativeGovernanceResults();
    
    if (cachedResults) {
      const citizen = cachedResults.citizens.find(c => c.wallet === wallet);
      if (citizen) {
        return res.json({
          success: true,
          data: {
            wallet: citizen.wallet,
            totalPower: citizen.totalPower,
            lockedPower: citizen.lockedPower,
            unlockedPower: citizen.unlockedPower,
            deposits: citizen.deposits,
            lastUpdated: citizen.calculatedAt,
            source: 'cached'
          }
        });
      }
    }
    
    // If not in cache, calculate real-time
    const result = await calculateWalletNativeGovernancePower(wallet);
    
    res.json({
      success: true,
      data: {
        wallet: result.wallet,
        totalPower: result.totalPower,
        lockedPower: result.lockedPower,
        unlockedPower: result.unlockedPower,
        deposits: result.deposits,
        lastUpdated: result.calculatedAt,
        source: 'realtime'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all citizens native governance power
router.get('/citizens/native-governance', async (req, res) => {
  try {
    const cachedResults = loadNativeGovernanceResults();
    
    if (cachedResults) {
      res.json({
        success: true,
        data: {
          summary: cachedResults.summary,
          citizens: cachedResults.citizens.map(c => ({
            wallet: c.wallet,
            totalPower: c.totalPower,
            lockedPower: c.lockedPower,
            unlockedPower: c.unlockedPower
          }))
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No cached governance data available'
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get citizens with governance power from database
router.get('/citizens/with-governance', async (req, res) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const result = await pool.query(`
      SELECT 
        wallet,
        native_governance_power,
        locked_governance_power,
        unlocked_governance_power,
        governance_last_updated
      FROM citizens 
      WHERE native_governance_power > 0 
      ORDER BY native_governance_power DESC
    `);
    
    res.json({
      success: true,
      data: result.rows.map(row => ({
        wallet: row.wallet,
        totalPower: parseFloat(row.native_governance_power),
        lockedPower: parseFloat(row.locked_governance_power),
        unlockedPower: parseFloat(row.unlocked_governance_power),
        lastUpdated: row.governance_last_updated
      }))
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await pool.end();
  }
});

export { router as governanceApiRouter };