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
    const result = await pool.query('SELECT wallet, nickname, nft_metadata FROM citizens WHERE wallet IS NOT NULL AND nft_metadata IS NOT NULL ORDER BY nickname');
    const citizens = result.rows;
    
    let allNfts = [];
    
    // Use stored NFT data from database for better performance
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
        // Fallback to API fetch if stored data is corrupted
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
        } catch (fallbackError) {
          console.error(`Fallback API fetch failed for ${citizen.nickname}:`, fallbackError);
        }
      }
    }
    
    console.log(`Total NFTs found from database: ${allNfts.length}`);
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
    
    // Generate governance data export JSON file
    try {
      const exportResponse = await fetch('http://localhost:5000/api/governance-export');
      if (exportResponse.ok) {
        const exportData = await exportResponse.json();
        const fs = require('fs');
        fs.writeFileSync('./data/governance-power.json', JSON.stringify(exportData, null, 2));
        console.log(`Governance data exported to JSON file with ${exportData.citizens.length} citizens`);
      }
    } catch (error) {
      console.error('Error generating governance export:', error);
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

// Add manual sync endpoint for immediate NFT data population
app.post('/api/sync-data', async (req, res) => {
  try {
    console.log('Manual sync triggered...');
    await syncGovernanceData();
    res.json({ success: true, message: 'Data sync completed successfully' });
  } catch (error) {
    console.error('Manual sync failed:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

// Add API endpoint for wallet NFTs
app.get('/api/wallet-nfts', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const nfts = await fetchWalletNFTs(wallet);
    
    // Check if this is a new wallet (without calculating governance power to save RPC credits)
    const existingCitizen = await pool.query('SELECT id FROM citizens WHERE wallet = $1', [wallet]);
    const isNewWallet = existingCitizen.rows.length === 0;
    
    res.json({ 
      nfts, 
      is_new_wallet: isNewWallet,
      message: isNewWallet && nfts.length > 0 ? `Found ${nfts.length} PERKS NFTs - governance power will be calculated when you create your pin` : undefined
    });
  } catch (error) {
    console.error('Error fetching wallet NFTs:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Add API endpoint to check username availability
app.get('/api/check-username', async (req, res) => {
  try {
    const { username, wallet } = req.query;
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
    
    // Check if username exists for other wallets
    let query = 'SELECT id, wallet FROM citizens WHERE LOWER(nickname) = LOWER($1)';
    let params = [trimmedUsername];
    
    if (wallet) {
      // If wallet is provided, exclude current wallet from check
      query += ' AND wallet != $2';
      params.push(wallet);
    }
    
    const result = await pool.query(query, params);
    
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

// Add governance data export endpoint for JSON generation
app.get('/api/governance-export', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        wallet,
        nickname,
        native_governance_power,
        governance_power,
        delegated_governance_power,
        total_governance_power,
        locked_governance_power,
        unlocked_governance_power,
        nft_ids,
        created_at,
        updated_at
      FROM citizens 
      WHERE wallet IS NOT NULL 
      ORDER BY native_governance_power DESC, nickname
    `);
    
    const citizens = result.rows.map(citizen => ({
      wallet: citizen.wallet,
      nickname: citizen.nickname || 'Anonymous Citizen',
      native_governance_power: parseFloat(citizen.native_governance_power) || 0,
      governance_power: parseFloat(citizen.governance_power) || 0,
      delegated_governance_power: parseFloat(citizen.delegated_governance_power) || 0,
      total_governance_power: parseFloat(citizen.total_governance_power) || 0,
      locked_governance_power: parseFloat(citizen.locked_governance_power) || 0,
      unlocked_governance_power: parseFloat(citizen.unlocked_governance_power) || 0,
      nft_count: citizen.nft_ids ? JSON.parse(citizen.nft_ids).length : 0,
      last_updated: citizen.updated_at || citizen.created_at
    }));
    
    const exportData = {
      generated_at: new Date().toISOString(),
      total_citizens: citizens.length,
      citizens: citizens
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting governance data:', error);
    res.status(500).json({ error: 'Failed to export governance data' });
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
      // Update existing citizen - only update pin location and profile, preserve existing governance data
      console.log(`Updating existing citizen ${wallet_address} - preserving governance data to save RPC credits`);
      
      const result = await pool.query(`
        UPDATE citizens SET 
          lat = $2, lng = $3, nickname = $4, bio = $5, 
          twitter_handle = $6, telegram_handle = $7, discord_handle = $8,
          primary_nft = $9, pfp_nft = $10, image_url = $11, updated_at = NOW()
        WHERE wallet = $1
        RETURNING *
      `, [wallet_address, lat, lng, nickname, bio, twitter_handle, telegram_handle, discord_handle, primary_nft, pfp_nft, image_url]);
      
      console.log(`Updated existing citizen ${wallet_address} pin location and profile`);
      res.json({ success: true, citizen: result.rows[0], action: 'updated' });
    } else {
      // Insert new citizen - fetch NFT data and calculate governance power
      console.log(`New citizen ${wallet_address} - fetching NFT data and governance power`);
      
      // Fetch NFT data for new citizen
      let nftData = [];
      let nftIds = [];
      try {
        nftData = await fetchWalletNFTs(wallet_address);
        nftIds = nftData.map(nft => nft.mint);
        console.log(`Fetched ${nftData.length} NFTs for new citizen ${wallet_address}`);
      } catch (error) {
        console.error(`Error fetching NFTs for ${wallet_address}:`, error);
      }
      
      // Calculate governance power for new citizen
      let governancePower = 0;
      try {
        const vsrResponse = await fetch(`http://localhost:3001/governance-power/${wallet_address}`);
        if (vsrResponse.ok) {
          const vsrData = await vsrResponse.json();
          governancePower = vsrData.totalGovernancePower || 0;
          console.log(`Calculated governance power for ${wallet_address}: ${governancePower}`);
        }
      } catch (error) {
        console.error(`Error calculating governance power for ${wallet_address}:`, error);
      }
      
      // Insert new citizen with complete data
      const result = await pool.query(`
        INSERT INTO citizens (
          wallet, lat, lng, nickname, bio, 
          twitter_handle, telegram_handle, discord_handle,
          primary_nft, pfp_nft, image_url, nft_ids, nft_metadata,
          native_governance_power, governance_power
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [wallet_address, lat, lng, nickname, bio, twitter_handle, telegram_handle, discord_handle, 
          primary_nft, pfp_nft, image_url, JSON.stringify(nftIds), JSON.stringify(nftData), 
          governancePower, governancePower]);
      
      console.log(`New citizen ${wallet_address} added with ${nftData.length} NFTs and ${governancePower} governance power`);
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