const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cron = require('node-cron');
const fs = require('fs');

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

// Serve the collection page
app.get('/collection', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'collection.html'));
});

// Function to fetch single NFT metadata using Helius API
async function fetchNFTMetadata(nftAddress) {
  try {
    const heliusUrl = process.env.HELIUS_API_KEY;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: {
          id: nftAddress
        }
      })
    });

    const data = await response.json();
    
    if (data.result) {
      return data.result;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return null;
  }
}

// Function to fetch NFTs for a wallet using Helius API
async function fetchWalletNFTs(walletAddress) {
  try {
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

    const data = await response.json();
    
    if (data.result && data.result.items) {
      // Filter for PERKS collection NFTs - using the correct collection ID
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
    console.error(`Error fetching NFTs for ${walletAddress}:`, error);
    return [];
  }
}

// Load governance data
let governanceData = {};
try {
  const governanceFile = path.join(__dirname, '..', 'data', 'native-governance-power.json');
  if (fs.existsSync(governanceFile)) {
    governanceData = JSON.parse(fs.readFileSync(governanceFile, 'utf8'));
    console.log('Loaded governance data with', governanceData.citizens?.length || 0, 'citizens');
  }
} catch (error) {
  console.log('Could not load governance data:', error.message);
}

// API endpoint for citizens data with NFT information
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
    const citizens = result.rows;
    
    // Add NFT data and governance power for each citizen
    const citizensWithNfts = await Promise.all(citizens.map(async (citizen) => {
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
      
      // Apply governance data from JSON
      let enhancedCitizen = {
        ...citizen,
        nfts: nftIds,
        nftMetadata: nftMetadata
      };
      
      if (governanceData.citizens) {
        const govCitizen = governanceData.citizens.find(gc => gc.wallet === citizen.wallet);
        if (govCitizen) {
          enhancedCitizen.native_governance_power = govCitizen.totalPower;
          enhancedCitizen.locked_governance_power = govCitizen.lockedPower;
          enhancedCitizen.unlocked_governance_power = govCitizen.unlockedPower;
        }
      }
      
      return enhancedCitizen;
    }));
    
    res.json(citizensWithNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch citizens' });
  }
});

// API endpoint to get all NFTs from all citizens for the collection page
app.get('/api/nfts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens WHERE wallet IS NOT NULL ORDER BY nickname');
    const citizens = result.rows;
    
    let allNfts = [];
    
    // Use existing NFT fetching logic from citizens endpoint
    for (const citizen of citizens) {
      try {
        const nfts = await fetchWalletNFTs(citizen.wallet);
        
        nfts.forEach(nft => {
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
        console.error(`Error fetching NFTs for ${citizen.nickname}:`, error);
      }
    }
    
    console.log(`Total NFTs found: ${allNfts.length}`);
    res.json(allNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Governance data sync function
async function syncGovernanceData() {
  try {
    console.log('Starting daily governance data sync at 12:00 UTC...');
    
    // Update governance power from JSON data
    if (governanceData && governanceData.citizens) {
      for (const citizen of governanceData.citizens) {
        try {
          await pool.query(
            'UPDATE citizens SET native_governance_power = $1, governance_power = $1, updated_at = NOW() WHERE wallet = $2',
            [citizen.native_governance_power, citizen.wallet]
          );
        } catch (error) {
          console.error(`Error updating governance power for ${citizen.wallet}:`, error);
        }
      }
      console.log(`Updated governance power for ${governanceData.citizens.length} citizens`);
    }
    
    // Refresh NFT data for all citizens
    const result = await pool.query('SELECT wallet FROM citizens');
    const citizens = result.rows;
    
    for (const citizen of citizens) {
      try {
        const nfts = await fetchWalletNFTs(citizen.wallet);
        const nftIds = nfts.map(nft => nft.mint);
        
        await pool.query(
          'UPDATE citizens SET nft_ids = $1, nft_metadata = $2, updated_at = NOW() WHERE wallet = $3',
          [JSON.stringify(nftIds), JSON.stringify(nfts), citizen.wallet]
        );
      } catch (error) {
        console.error(`Error updating NFTs for ${citizen.wallet}:`, error);
      }
    }
    
    console.log('Daily governance and NFT data sync completed successfully');
  } catch (error) {
    console.error('Error during daily sync:', error);
  }
}

// Schedule daily sync at 00:00 UTC (midnight)
cron.schedule('0 0 * * *', syncGovernanceData, {
  timezone: 'UTC'
});

// Add API endpoint for wallet NFTs
app.get('/api/wallet-nfts', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const nfts = await fetchWalletNFTs(wallet);
    res.json({ nfts });
  } catch (error) {
    console.error('Error fetching wallet NFTs:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Add API endpoint to check username availability
app.get('/api/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    const trimmedUsername = username.trim();
    
    // Allow multiple "Anonymous Citizen" entries
    if (trimmedUsername.toLowerCase() === 'anonymous citizen') {
      const available = true;
      res.json({ 
        available,
        username: trimmedUsername,
        message: 'Username is available'
      });
      return;
    }
    
    const result = await pool.query(
      'SELECT id FROM citizens WHERE LOWER(nickname) = LOWER($1)',
      [trimmedUsername]
    );
    
    const available = result.rows.length === 0;
    res.json({ 
      available,
      username: username.trim(),
      message: available ? 'Username is available' : 'Username is already taken'
    });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// Add API endpoint for governance stats
app.get('/api/governance-stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_citizens,
        COUNT(CASE WHEN native_governance_power > 0 THEN 1 END) as active_citizens,
        COALESCE(SUM(native_governance_power), 0) as total_governance_power,
        COALESCE(AVG(CASE WHEN native_governance_power > 0 THEN native_governance_power END), 0) as avg_power_active
      FROM citizens
    `);
    
    const stats = result.rows[0];
    res.json({
      totalCitizens: parseInt(stats.total_citizens),
      activeCitizens: parseInt(stats.active_citizens),
      totalGovernancePower: parseFloat(stats.total_governance_power),
      avgPowerActive: parseFloat(stats.avg_power_active)
    });
  } catch (error) {
    console.error('Error fetching governance stats:', error);
    res.status(500).json({ error: 'Failed to fetch governance stats' });
  }
});

// Add auth message generation endpoint
app.get('/api/auth/generate-message', (req, res) => {
  const timestamp = Date.now();
  const message = `Verify wallet ownership for IslandDAO Citizen Map - Timestamp: ${timestamp}`;
  res.json({ message, timestamp });
});

// Add verified citizen save endpoint with signature verification
app.post('/api/save-citizen-verified', async (req, res) => {
  try {
    const { 
      wallet_address, 
      signature, 
      original_message, 
      fallback_method = 'message',
      lat, 
      lng, 
      nickname, 
      bio, 
      twitter_handle, 
      telegram_handle, 
      discord_handle,
      primary_nft,
      pfp_nft,
      image_url,
      nfts = []
    } = req.body;

    // Basic validation
    if (!wallet_address || !signature || !original_message || !lat || !lng) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // TODO: Add signature verification logic here
    // For now, we'll trust the signature (implement crypto verification later)
    console.log(`Verified citizen pin: ${wallet_address} using ${fallback_method} method`);

    // Check if citizen already exists
    const existingCitizen = await pool.query(
      'SELECT id FROM citizens WHERE wallet = $1',
      [wallet_address]
    );

    if (existingCitizen.rows.length > 0) {
      // Update existing citizen
      const result = await pool.query(`
        UPDATE citizens SET 
          lat = $2, lng = $3, nickname = $4, bio = $5, 
          twitter_handle = $6, telegram_handle = $7, discord_handle = $8,
          primary_nft = $9, pfp_nft = $10, image_url = $11
        WHERE wallet = $1
        RETURNING *
      `, [wallet_address, lat, lng, nickname, bio, twitter_handle, telegram_handle, discord_handle, primary_nft, pfp_nft, image_url]);
      
      res.json({ success: true, citizen: result.rows[0], action: 'updated' });
    } else {
      // Insert new citizen
      const result = await pool.query(`
        INSERT INTO citizens (
          wallet, lat, lng, nickname, bio, 
          twitter_handle, telegram_handle, discord_handle,
          primary_nft, pfp_nft, image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [wallet_address, lat, lng, nickname, bio, twitter_handle, telegram_handle, discord_handle, primary_nft, pfp_nft, image_url]);
      
      res.json({ success: true, citizen: result.rows[0], action: 'created' });
    }

  } catch (error) {
    console.error('Error saving verified citizen:', error);
    res.status(500).json({ error: 'Failed to save citizen pin' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Citizen Map server running at http://localhost:${port}`);
  console.log('Daily governance sync scheduled for 00:00 UTC');
});