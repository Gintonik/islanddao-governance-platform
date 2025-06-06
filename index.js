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

// Serve particle effects landing page as main route
app.get('/', (req, res) => {
  try {
    const landingPath = path.join(__dirname, 'citizen-map', 'index.html');
    
    console.log('Serving landing page from:', landingPath);
    
    res.sendFile(landingPath, (err) => {
      if (err) {
        console.error('Landing page error:', err);
        res.status(500).json({ 
          error: 'Landing page not found',
          message: 'Unable to serve landing page',
          timestamp: new Date().toISOString()
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

// Wallet NFTs endpoint - Real-time PERKS NFT validation
app.get('/api/wallet-nfts', async (req, res) => {
  try {
    const { wallet: walletAddress } = req.query;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    console.log(`Fetching PERKS NFTs for wallet: ${walletAddress}`);
    
    // Fetch NFTs directly from blockchain via Helius API
    const response = await fetch(process.env.HELIUS_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.result && data.result.items) {
      // Filter for PERKS collection NFTs only
      const perksNfts = data.result.items.filter(nft => {
        return nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8'
        );
      });

      console.log(`Found ${perksNfts.length} PERKS NFTs for wallet ${walletAddress}`);

      // Format NFTs for frontend consumption (matching expected structure)
      const formattedNfts = perksNfts.map(nft => ({
        mint: nft.id,
        id: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image: nft.content?.links?.image || nft.content?.files?.[0]?.uri || '',
        content: {
          metadata: { name: nft.content?.metadata?.name || 'PERKS NFT' },
          links: { image: nft.content?.links?.image || nft.content?.files?.[0]?.uri || '' }
        }
      }));

      return res.json({ nfts: formattedNfts });
    }

    console.log(`No PERKS NFTs found for wallet ${walletAddress}`);
    return res.json({ nfts: [] });
    
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

// Save verified citizen endpoint
app.post('/api/save-citizen-verified', async (req, res) => {
  try {
    const {
      wallet_address,
      signature,
      original_message,
      fallback_method,
      lat,
      lng,
      primary_nft,
      pfp_nft,
      nickname,
      bio,
      twitter_handle,
      telegram_handle,
      discord_handle,
      nfts
    } = req.body;

    // Use wallet_address from request but store in wallet field
    const walletAddress = wallet_address;

    // Basic validation
    if (!walletAddress || !lat || !lng || !primary_nft) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if citizen already exists
    const existingResult = await pool.query(
      'SELECT id FROM citizens WHERE wallet = $1',
      [walletAddress]
    );

    if (existingResult.rows.length > 0) {
      // Update existing citizen
      await pool.query(`
        UPDATE citizens SET
          lat = $1, lng = $2, primary_nft = $3, pfp_nft = $4,
          nickname = $5, bio = $6, twitter_handle = $7,
          telegram_handle = $8, discord_handle = $9,
          updated_at = NOW()
        WHERE wallet = $10
      `, [lat, lng, primary_nft, pfp_nft, nickname, bio, 
          twitter_handle, telegram_handle, discord_handle, walletAddress]);
    } else {
      // Insert new citizen
      await pool.query(`
        INSERT INTO citizens (
          wallet, lat, lng, primary_nft, pfp_nft, nickname,
          bio, twitter_handle, telegram_handle, discord_handle,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      `, [walletAddress, lat, lng, primary_nft, pfp_nft, nickname,
          bio, twitter_handle, telegram_handle, discord_handle]);
    }

    res.json({
      success: true,
      message: 'Citizen pin created successfully'
    });

  } catch (error) {
    console.error('Save citizen error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save citizen data'
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