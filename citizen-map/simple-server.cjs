const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(express.static(__dirname));
app.use(express.json());

// Serve the main map
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'verified-citizen-map.html'));
});

// API endpoint for citizens data
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
    res.json(result.rows);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch citizens' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Citizen Map server running at http://localhost:${port}`);
});