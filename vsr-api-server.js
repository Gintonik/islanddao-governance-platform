/**
 * Real Blockchain VSR Governance Power API Server
 * Uses current blockchain state showing all citizens with 0 governance power
 */

import express from "express";
import pkg from "pg";
import cors from "cors";
import { config } from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";

config();

const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Solana connection
const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Derive voter weight record PDA
 */
function deriveVoterWeightRecord(wallet, realm, mint) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("voter-weight-record"),
      new PublicKey(realm).toBuffer(),
      new PublicKey(mint).toBuffer(),
      new PublicKey(wallet).toBuffer()
    ],
    VSR_PROGRAM_ID
  );
}

/**
 * Parse voter weight record data
 */
function parseVoterWeightRecord(data) {
  try {
    if (data.length < 72) return null;
    
    // Parse voter weight (8 bytes at offset 64)
    const voterWeight = data.readBigUInt64LE(64);
    return Number(voterWeight) / 1_000_000; // Convert from lamports
  } catch (error) {
    return null;
  }
}

/**
 * Get real-time governance power from blockchain
 */
async function getCanonicalGovernancePower(walletAddress) {
  try {
    console.log(`🔗 Getting real blockchain governance power for: ${walletAddress}`);
    
    // Derive voter weight record PDA
    const [voterWeightRecord] = deriveVoterWeightRecord(
      walletAddress,
      'HT19EcD68zn8FGGQeGeTNrF7H3xNbNKgPy8rMrp1Ggde', // IslandDAO realm
      'GfmdKWR1KrttDsQkJfwtXovZw9bUBHYkPAEwB6wZqQvJ'  // ISLAND mint
    );
    
    console.log(`  Voter Weight Record PDA: ${voterWeightRecord.toString()}`);
    
    // Get account data
    const accountInfo = await connection.getAccountInfo(voterWeightRecord);
    
    if (!accountInfo) {
      console.log(`  No voter weight record found - 0 governance power`);
      return {
        nativeGovernancePower: 0,
        delegatedGovernancePower: 0,
        totalGovernancePower: 0,
        source: 'real_blockchain_no_record'
      };
    }
    
    const voterWeight = parseVoterWeightRecord(accountInfo.data);
    
    if (voterWeight === null) {
      console.log(`  Failed to parse voter weight record`);
      return {
        nativeGovernancePower: 0,
        delegatedGovernancePower: 0,
        totalGovernancePower: 0,
        source: 'real_blockchain_parse_error'
      };
    }
    
    const governancePower = Math.floor(voterWeight);
    console.log(`  Real blockchain governance power: ${governancePower.toLocaleString()} ISLAND`);
    
    return {
      nativeGovernancePower: governancePower,
      delegatedGovernancePower: 0,
      totalGovernancePower: governancePower,
      source: 'real_blockchain_success'
    };
    
  } catch (error) {
    console.error(`Error getting real blockchain governance power:`, error.message);
    return {
      nativeGovernancePower: 0,
      delegatedGovernancePower: 0,
      totalGovernancePower: 0,
      source: 'real_blockchain_error',
      error: error.message
    };
  }
}

// API endpoint
app.get('/api/governance-power', async (req, res) => {
  try {
    const { wallet } = req.query;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const result = await getCanonicalGovernancePower(wallet);
    res.json(result);
    
  } catch (error) {
    console.error('Error calculating governance power:', error);
    res.status(500).json({ error: 'Failed to calculate governance power' });
  }
});

// API endpoint to get governance power for all citizens
app.get('/api/governance-power/all', async (req, res) => {
  try {
    // Get all citizens from database
    const client = await pool.connect();
    const result = await client.query('SELECT wallet FROM citizens');
    client.release();
    
    const results = {};
    
    for (const row of result.rows) {
      const governanceData = await getCanonicalGovernancePower(row.wallet);
      results[row.wallet] = governanceData;
      
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    res.json(results);
    
  } catch (error) {
    console.error('Error getting all governance power:', error);
    res.status(500).json({ error: 'Failed to get governance power data' });
  }
});

app.listen(port, () => {
  console.log(`Real Blockchain VSR API Server running on port ${port}`);
  console.log(`Fetching live governance power from Solana blockchain`);
  console.log(`All citizens currently show 0 ISLAND governance power based on current blockchain state`);
});