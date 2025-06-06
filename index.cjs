/**
 * Deployment Entry Point - Standalone server for Replit deployment
 */

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

console.log('Starting IslandDAO Governance Platform on port:', port);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'citizen-map')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

app.get('/collection', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'collection.html'));
});

// API route for citizens
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching citizens:', error);
    res.status(500).json({ error: 'Failed to fetch citizens' });
  }
});

// API route for PERKS stats
app.get('/api/governance-stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_citizens,
        SUM(
          CASE 
            WHEN nft_ids IS NOT NULL AND nft_ids != '[]' THEN 
              array_length(string_to_array(trim(both '[]' from nft_ids), ','), 1)
            ELSE 0 
          END
        ) as total_perks
      FROM citizens
      WHERE nft_ids IS NOT NULL AND nft_ids != '[]'
    `);
    
    const stats = result.rows[0];
    res.json({
      totalCitizens: parseInt(stats.total_citizens) || 0,
      totalPerks: parseInt(stats.total_perks) || 0
    });
  } catch (error) {
    console.error('Error fetching PERKS stats:', error);
    res.status(500).json({ error: 'Failed to fetch PERKS stats' });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`IslandDAO Governance Platform running at http://localhost:${port}`);
  console.log('Ready for production deployment');
});