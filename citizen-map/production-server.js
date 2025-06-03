const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 5000;

// Rate limiting for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware
app.use(limiter);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com', 'https://citizen-map.replit.app'] 
    : true,
  credentials: true
}));

// Database connection with connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(express.static(path.join(__dirname), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag: true,
  lastModified: true
}));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Serve the main map
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'verified-citizen-map.html'));
});

// Function to fetch NFTs for a wallet using Helius API
async function fetchWalletNFTs(walletAddress) {
  try {
    if (!process.env.HELIUS_API_KEY) {
      console.warn('HELIUS_API_KEY not configured');
      return [];
    }

    const heliusUrl = process.env.HELIUS_API_KEY;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.result && data.result.items) {
      // Filter for PERKS collection NFTs
      const perksNfts = data.result.items.filter(nft => {
        return nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8'
        );
      });

      return perksNfts.map(nft => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image: (nft.content?.files?.[0]?.uri || nft.content?.json_uri || '').replace('https://gateway.irys.xyz/', 'https://uploader.irys.xyz/'),
        collection: 'PERKS'
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for ${walletAddress}:`, error.message);
    return [];
  }
}

// API endpoint for citizens data with NFT information
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM citizens 
      ORDER BY native_governance_power DESC NULLS LAST, created_at ASC
    `);
    const citizens = result.rows;
    
    // Add NFT data for each citizen with error handling
    const citizensWithNfts = await Promise.all(citizens.map(async (citizen) => {
      try {
        const nfts = await fetchWalletNFTs(citizen.wallet);
        const nftMetadata = {};
        const nftIds = [];
        
        nfts.forEach(nft => {
          nftIds.push(nft.mint);
          nftMetadata[nft.mint] = {
            name: nft.name,
            image: nft.image
          };
        });
        
        return {
          ...citizen,
          nfts: nftIds,
          nftMetadata: nftMetadata,
          // Ensure governance power is properly formatted
          native_governance_power: parseFloat(citizen.native_governance_power || 0)
        };
      } catch (error) {
        console.error(`Error processing citizen ${citizen.wallet}:`, error.message);
        return {
          ...citizen,
          nfts: [],
          nftMetadata: {},
          native_governance_power: parseFloat(citizen.native_governance_power || 0)
        };
      }
    }));
    
    res.json(citizensWithNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch citizens data' });
  }
});

// API endpoint to add a new citizen
app.post('/api/citizens', async (req, res) => {
  try {
    const { wallet, name, bio, latitude, longitude } = req.body;
    
    // Validate required fields
    if (!wallet || !name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate wallet address format (basic check)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }
    
    const result = await pool.query(
      `INSERT INTO citizens (wallet, name, bio, latitude, longitude) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (wallet) DO UPDATE SET 
         name = EXCLUDED.name,
         bio = EXCLUDED.bio,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude
       RETURNING *`,
      [wallet, name, bio, latitude, longitude]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding citizen:', error);
    res.status(500).json({ error: 'Failed to add citizen' });
  }
});

// API endpoint for governance power statistics
app.get('/api/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_citizens,
        COUNT(CASE WHEN native_governance_power > 0 THEN 1 END) as citizens_with_power,
        COALESCE(SUM(native_governance_power), 0) as total_native_power,
        COALESCE(MAX(native_governance_power), 0) as max_native_power,
        COALESCE(AVG(native_governance_power), 0) as avg_native_power
      FROM citizens
    `;
    
    const result = await pool.query(statsQuery);
    const stats = result.rows[0];
    
    res.json({
      totalCitizens: parseInt(stats.total_citizens),
      citizensWithPower: parseInt(stats.citizens_with_power),
      totalNativePower: parseFloat(stats.total_native_power),
      maxNativePower: parseFloat(stats.max_native_power),
      avgNativePower: parseFloat(stats.avg_native_power)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 IslandDAO Citizen Map server running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗺️  Access the map at: http://localhost:${port}`);
});

module.exports = app;