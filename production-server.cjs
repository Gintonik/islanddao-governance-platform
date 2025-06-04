const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5000;

// Database connection with error handling
let pool;
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
} catch (error) {
  console.error('Database connection error:', error);
}

app.use(express.static(path.join(__dirname, 'citizen-map')));
app.use(express.json());

// Serve the main map
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

// Serve the collection page
app.get('/collection', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'collection.html'));
});

// API endpoint for citizens data
app.get('/api/citizens', async (req, res) => {
  try {
    if (!pool) {
      return res.json([]);
    }
    
    const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
    const citizens = result.rows;
    
    // Return citizens with empty NFT arrays for deployment compatibility
    const citizensWithNfts = citizens.map(citizen => ({
      ...citizen,
      nfts: [],
      nftMetadata: {}
    }));
    
    res.json(citizensWithNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.json([]);
  }
});

// API endpoint for NFTs (empty for deployment compatibility)
app.get('/api/nfts', async (req, res) => {
  res.json([]);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`IslandDAO Governance Platform running at http://localhost:${port}`);
});