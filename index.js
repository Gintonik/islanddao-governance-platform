/**
 * Production Entry Point - ES Module format
 * Ensures reliable deployment for both citizen map and collection pages
 */

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(express.static(path.join(__dirname, 'citizen-map')));
app.use(express.json());

// Comprehensive route handling
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

// Collection page routes
app.get('/collection', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'collection.html'));
});

app.get('/nfts', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'collection.html'));
});

// Citizen map routes
app.get('/verified-citizen-map', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

app.get('/map', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

// API Routes
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens ORDER BY nickname');
    const citizens = result.rows.map(citizen => ({
      ...citizen,
      nfts: citizen.nft_metadata ? JSON.parse(citizen.nft_metadata) : []
    }));
    res.json(citizens);
  } catch (error) {
    console.error('Citizens API error:', error);
    res.status(500).json({ error: 'Failed to fetch citizens' });
  }
});

app.get('/api/nfts', async (req, res) => {
  try {
    const result = await pool.query('SELECT wallet, nickname, nft_metadata FROM citizens WHERE wallet IS NOT NULL AND nft_metadata IS NOT NULL ORDER BY nickname');
    const citizens = result.rows;
    
    let allNfts = [];
    
    for (const citizen of citizens) {
      try {
        const nftData = JSON.parse(citizen.nft_metadata || '[]');
        
        nftData.forEach(nft => {
          allNfts.push({
            id: nft.mint,
            name: nft.name,
            content: {
              metadata: {
                name: nft.name
              },
              links: {
                image: nft.image
              }
            },
            owner_wallet: citizen.wallet,
            owner_nickname: citizen.nickname || 'Unknown Citizen'
          });
        });
      } catch (error) {
        console.error(`Error parsing NFT data for ${citizen.nickname}:`, error);
      }
    }
    
    console.log(`Total NFTs found from database: ${allNfts.length}`);
    res.json(allNfts);
  } catch (error) {
    console.error('NFTs API error:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;