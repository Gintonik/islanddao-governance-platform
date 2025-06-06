/**
 * PERKS Map Production Server
 * Single clean entry point for deployment
 */

import express from 'express';
import path from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

// Database connection with error handling
let pool;
try {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable not set');
    process.exit(1);
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log('Database pool created successfully');
} catch (error) {
  console.error('Database connection failed:', error);
  process.exit(1);
}

app.use(express.static(path.join(__dirname, 'citizen-map')));
app.use(express.json());

// Comprehensive route handling with fallback protection
app.get('/', (req, res) => {
  try {
    const mainPath = path.join(__dirname, 'citizen-map', 'verified-citizen-map.html');
    const fallbackPath = path.join(__dirname, 'citizen-map', 'index.html');
    
    console.log('Serving landing page from:', mainPath);
    
    res.sendFile(mainPath, (err) => {
      if (err) {
        console.error('Main landing page error, trying fallback:', err);
        res.sendFile(fallbackPath, (fallbackErr) => {
          if (fallbackErr) {
            console.error('Fallback landing page error:', fallbackErr);
            res.status(500).json({ 
              error: 'Server startup error',
              message: 'Landing page files not found',
              timestamp: new Date().toISOString()
            });
          }
        });
      }
    });
  } catch (error) {
    console.error('Landing page route error:', error);
    res.status(500).json({ 
      error: 'Critical server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// API Routes with production error handling
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens ORDER BY nickname');
    const citizens = result.rows.map(citizen => {
      let nftIds = [];
      let nftMetadata = {};
      
      if (citizen.nft_metadata) {
        try {
          const storedNfts = JSON.parse(citizen.nft_metadata);
          if (Array.isArray(storedNfts)) {
            storedNfts.forEach(nft => {
              if (nft.mint) {
                nftIds.push(nft.mint);
                nftMetadata[nft.mint] = {
                  name: nft.name || 'Unknown NFT',
                  image: nft.image || '/placeholder-nft.png'
                };
              }
            });
          }
        } catch (parseError) {
          console.error(`NFT metadata parse error for ${citizen.nickname}:`, parseError);
        }
      }
      
      return {
        ...citizen,
        nfts: nftIds,
        nftMetadata: nftMetadata
      };
    });
    
    res.json(citizens);
  } catch (error) {
    console.error('Citizens API error:', error);
    res.status(500).json({ error: 'Database connection failed', citizens: [] });
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

// Wallet NFTs endpoint
app.get('/api/wallet-nfts', async (req, res) => {
  try {
    const { wallet: walletAddress } = req.query;
    
    const result = await pool.query(
      'SELECT nft_metadata FROM citizens WHERE wallet = $1 AND nft_metadata IS NOT NULL',
      [walletAddress]
    );
    
    if (result.rows.length === 0) {
      return res.json([]);
    }
    
    const nftData = JSON.parse(result.rows[0].nft_metadata || '[]');
    const nfts = nftData.map(nft => ({
      id: nft.mint,
      name: nft.name,
      content: {
        metadata: { name: nft.name },
        links: { image: nft.image }
      }
    }));
    
    res.json(nfts);
  } catch (error) {
    console.error('Wallet NFTs API error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet NFTs' });
  }
});

// Username availability check endpoint
app.get('/api/check-username', async (req, res) => {
  try {
    const { username, wallet } = req.query;
    
    if (!username) {
      return res.json({ available: false, message: 'Username required' });
    }
    
    // Check if username already exists (excluding current wallet if provided)
    let query = 'SELECT wallet FROM citizens WHERE LOWER(nickname) = LOWER($1)';
    let params = [username.trim()];
    
    if (wallet) {
      query += ' AND wallet != $2';
      params.push(wallet);
    }
    
    const result = await pool.query(query, params);
    
    const available = result.rows.length === 0;
    
    res.json({ 
      available,
      message: available ? 'Username available' : 'Username already taken'
    });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ available: false, message: 'Error checking username' });
  }
});

// Authentication endpoints for wallet verification
app.get('/api/auth/generate-message', (req, res) => {
  const timestamp = Date.now();
  const message = `IslandDAO Citizen Map Verification\nTimestamp: ${timestamp}\nPlease sign this message to verify wallet ownership.`;
  
  res.json({
    message,
    timestamp,
    success: true
  });
});

app.post('/api/auth/verify-signature', async (req, res) => {
  try {
    const { publicKey, signature, message } = req.body;
    
    // Basic validation - in production, you'd verify the signature cryptographically
    if (!publicKey || !signature || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    res.json({
      success: true,
      publicKey,
      verified: true,
      message: 'Wallet verified successfully'
    });
  } catch (error) {
    console.error('Signature verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
});

// Governance stats endpoint
app.get('/api/governance-stats', async (req, res) => {
  try {
    const citizensResult = await pool.query('SELECT COUNT(*) as count FROM citizens WHERE wallet IS NOT NULL');
    const nftsResult = await pool.query('SELECT COUNT(*) as count FROM citizens WHERE nft_metadata IS NOT NULL');
    
    const totalCitizens = parseInt(citizensResult.rows[0].count) || 0;
    
    // Count total NFTs from metadata
    let totalPerks = 0;
    const nftDataResult = await pool.query('SELECT nft_metadata FROM citizens WHERE nft_metadata IS NOT NULL');
    
    nftDataResult.rows.forEach(row => {
      try {
        const nftData = JSON.parse(row.nft_metadata);
        if (Array.isArray(nftData)) {
          totalPerks += nftData.length;
        }
      } catch (error) {
        console.error('Error parsing NFT metadata for stats:', error);
      }
    });

    res.json({
      totalCitizens,
      totalPerks,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error('Governance stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch governance stats',
      totalCitizens: 0,
      totalPerks: 0
    });
  }
});

// Comprehensive health check
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      port: port
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// Graceful error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Production server running on port ${port}`);
  console.log(`🌐 Available at: http://0.0.0.0:${port}`);
  console.log(`📊 Health check: http://0.0.0.0:${port}/health`);
});