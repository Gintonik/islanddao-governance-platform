/**
 * PERKS Map Production Server
 * Single clean entry point for deployment
 */

import express from 'express';
import path from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { startDailySync } from './daily-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

// Security: Cryptographic signature verification
function verifySignature(publicKeyString, signature, message) {
  try {
    // Convert public key string to PublicKey object
    const publicKey = new PublicKey(publicKeyString);
    
    // Decode signature from base64
    const signatureBytes = typeof signature === 'string' 
      ? new Uint8Array(Buffer.from(signature, 'base64'))
      : signature;
    
    // Encode message to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Verify signature using nacl
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Security: Generate time-limited verification nonce
function generateVerificationMessage() {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);
  return {
    message: `IslandDAO Citizen Map Verification\nTimestamp: ${timestamp}\nNonce: ${nonce}\nSign to verify wallet ownership.`,
    timestamp,
    nonce,
    expiresAt: timestamp + (5 * 60 * 1000) // 5 minutes
  };
}

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

// Serve static files from citizen-map directory
app.use('/citizen-map', express.static(path.join(__dirname, 'citizen-map')));
// Also serve citizen-map files at root for backward compatibility
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
    const response = await fetch(process.env.HELIUS_RPC_URL, {
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
      const formattedNfts = perksNfts.map(nft => {
        // Fix Irys gateway URLs for reliable image loading
        let imageUrl = nft.content?.links?.image || nft.content?.files?.[0]?.uri || '';
        if (imageUrl.includes('gateway.irys.xyz')) {
          imageUrl = imageUrl.replace('gateway.irys.xyz', 'uploader.irys.xyz');
        }
        
        return {
          mint: nft.id,
          id: nft.id,
          name: nft.content?.metadata?.name || 'PERKS NFT',
          image: imageUrl,
          content: {
            metadata: { name: nft.content?.metadata?.name || 'PERKS NFT' },
            links: { image: imageUrl }
          }
        };
      });

      return res.json({ nfts: formattedNfts });
    }

    console.log(`No PERKS NFTs found for wallet ${walletAddress}`);
    return res.json({ nfts: [] });
    
  } catch (error) {
    console.error('Wallet NFTs API error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet NFTs' });
  }
});

// Get all NFTs from all citizens for collection tab
app.get('/api/all-citizen-nfts', async (req, res) => {
  try {
    const query = `
      SELECT wallet, nickname, nft_metadata 
      FROM citizens 
      WHERE nft_metadata IS NOT NULL AND nft_metadata != ''
    `;
    
    const result = await pool.query(query);
    
    let allNfts = [];
    let totalCitizens = 0;
    
    for (const citizen of result.rows) {
      try {
        const nftData = JSON.parse(citizen.nft_metadata);
        if (Array.isArray(nftData)) {
          // Add citizen info to each NFT
          const citizenNfts = nftData.map(nft => ({
            ...nft,
            ownerWallet: citizen.wallet,
            ownerNickname: citizen.nickname
          }));
          allNfts = allNfts.concat(citizenNfts);
          totalCitizens++;
        }
      } catch (error) {
        console.error(`Error parsing NFT metadata for citizen ${citizen.wallet}:`, error);
      }
    }
    
    console.log(`Aggregated ${allNfts.length} NFTs from ${totalCitizens} citizens`);
    
    res.json({
      nfts: allNfts,
      totalNfts: allNfts.length,
      totalCitizens: totalCitizens
    });
    
  } catch (error) {
    console.error('All citizen NFTs API error:', error);
    res.status(500).json({ error: 'Failed to fetch citizen NFTs' });
  }
});

// Update citizen NFT collection endpoint
app.post('/api/update-citizen-nfts', async (req, res) => {
  try {
    const { wallet, forceRefresh } = req.body;
    
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    console.log(`Updating NFT collection for wallet: ${wallet}`);

    // Fetch current NFTs for this wallet using same method as wallet-nfts endpoint
    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets-by-owner',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: false,
            showNativeBalance: false,
            showInscriptions: false,
            showZeroBalance: false
          }
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      // Filter for PERKS collection NFTs only
      const perksNfts = data.result.items.filter(nft => {
        return nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8'
        );
      });

      console.log(`Found ${perksNfts.length} PERKS NFTs for wallet ${wallet}`);

      // Format NFTs for database storage
      const formattedNfts = perksNfts.map(nft => {
        let imageUrl = nft.content?.links?.image || nft.content?.files?.[0]?.uri || '';
        if (imageUrl.includes('gateway.irys.xyz')) {
          imageUrl = imageUrl.replace('gateway.irys.xyz', 'uploader.irys.xyz');
        }
        
        return {
          mint: nft.id,
          name: nft.content?.metadata?.name || 'PERKS NFT',
          image: imageUrl
        };
      });

      // Update database with complete NFT collection
      const updateQuery = `
        UPDATE citizens 
        SET nft_metadata = $1, updated_at = NOW()
        WHERE wallet = $2
      `;
      
      await pool.query(updateQuery, [JSON.stringify(formattedNfts), wallet]);
      
      console.log(`Updated ${formattedNfts.length} NFTs for wallet ${wallet}`);
      
      res.json({ 
        success: true, 
        nftCount: formattedNfts.length,
        message: `Updated ${formattedNfts.length} NFTs for citizen`
      });
    } else {
      res.json({ success: true, nftCount: 0, message: 'No PERKS NFTs found' });
    }
    
  } catch (error) {
    console.error('Update citizen NFTs error:', error);
    res.status(500).json({ error: 'Failed to update citizen NFTs' });
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

// Enhanced authentication endpoints with cryptographic verification
app.get('/api/auth/generate-message', (req, res) => {
  try {
    const verificationData = generateVerificationMessage();
    console.log('Generated verification message for signature');
    
    res.json({
      message: verificationData.message,
      timestamp: verificationData.timestamp,
      nonce: verificationData.nonce,
      expiresAt: verificationData.expiresAt,
      success: true
    });
  } catch (error) {
    console.error('Message generation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate verification message' 
    });
  }
});

app.post('/api/auth/verify-signature', async (req, res) => {
  try {
    const { publicKey, signature, message, timestamp } = req.body;
    
    if (!publicKey || !signature || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields for signature verification' 
      });
    }
    
    // Verify message timestamp (5 minute expiry)
    if (timestamp && Date.now() - timestamp > 5 * 60 * 1000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Verification message expired' 
      });
    }
    
    // Cryptographic signature verification
    const isValidSignature = verifySignature(publicKey, signature, message);
    
    if (!isValidSignature) {
      console.log(`Failed signature verification for wallet: ${publicKey}`);
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid signature - wallet verification failed' 
      });
    }
    
    console.log(`Successfully verified signature for wallet: ${publicKey}`);
    
    res.json({
      success: true,
      publicKey,
      verified: true,
      message: 'Wallet verified successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Signature verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed - server error' 
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
      image_url,
      nickname,
      bio,
      twitter_handle,
      telegram_handle,
      discord_handle,
      nfts
    } = req.body;

    // Use wallet_address from request but store in wallet field
    const walletAddress = wallet_address;

    // Basic validation with detailed error messages
    const missingFields = [];
    if (!walletAddress) missingFields.push('wallet_address');
    if (!lat) missingFields.push('lat');
    if (!lng) missingFields.push('lng');
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields, 'Request body:', req.body);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // If image_url not provided, fetch it from the NFT API
    let profileImageUrl = image_url;
    if (!profileImageUrl && pfp_nft) {
      try {
        const nftResponse = await fetch(`${req.protocol}://${req.get('host')}/api/wallet-nfts?wallet=${walletAddress}`);
        const nftData = await nftResponse.json();
        const selectedNft = nftData.nfts?.find(nft => nft.mint === pfp_nft || nft.id === pfp_nft);
        if (selectedNft) {
          profileImageUrl = selectedNft.image || selectedNft.content?.links?.image;
        }
      } catch (error) {
        console.error('Error fetching NFT image for profile:', error);
      }
    }

    // SECURITY: Check if citizen already exists and require signature verification for updates
    const existingResult = await pool.query(
      'SELECT id, wallet FROM citizens WHERE wallet = $1',
      [walletAddress]
    );

    // Critical security check: Pin movement requires signature verification
    if (existingResult.rows.length > 0) {
      console.log(`Existing citizen detected for wallet: ${walletAddress} - signature verification required`);
      
      if (!signature || !original_message) {
        return res.status(403).json({
          success: false,
          message: 'Signature verification required for pin updates. Please sign the verification message.',
          requiresSignature: true
        });
      }
      
      // Verify the signature cryptographically
      const isValidSignature = verifySignature(walletAddress, signature, original_message);
      
      if (!isValidSignature) {
        console.log(`SECURITY ALERT: Invalid signature for pin update attempt from wallet: ${walletAddress}`);
        return res.status(403).json({
          success: false,
          message: 'Invalid signature. Pin updates require valid wallet ownership proof.',
          signatureVerification: 'failed'
        });
      }
      
      console.log(`Pin update authorized: Valid signature verified for wallet: ${walletAddress}`);
      
      // Security audit log for pin updates
      try {
        await pool.query(`
          INSERT INTO security_logs (wallet, action, ip_address, user_agent, timestamp, verified)
          VALUES ($1, $2, $3, $4, NOW(), $5)
        `, [
          walletAddress, 
          'pin_update', 
          req.ip || req.connection.remoteAddress,
          req.get('User-Agent'),
          true
        ]);
      } catch (logError) {
        // Log error but don't fail the request
        console.error('Security log insertion failed:', logError);
      }
    } else {
      console.log(`New citizen pin creation for wallet: ${walletAddress}`);
      
      // Security audit log for new pins
      try {
        await pool.query(`
          INSERT INTO security_logs (wallet, action, ip_address, user_agent, timestamp, verified)
          VALUES ($1, $2, $3, $4, NOW(), $5)
        `, [
          walletAddress, 
          'pin_creation', 
          req.ip || req.connection.remoteAddress,
          req.get('User-Agent'),
          signature ? true : false
        ]);
      } catch (logError) {
        console.error('Security log insertion failed:', logError);
      }
    }

    // Calculate governance power ONLY for new citizens
    let totalGovernancePower = 0;
    let nativeGovernancePower = 0;
    let delegatedGovernancePower = 0;
    const isNewCitizen = existingResult.rows.length === 0;
    
    if (isNewCitizen) {
      try {
        const govResponse = await fetch(`http://localhost:3001/api/governance-power?wallet=${walletAddress}`);
        if (govResponse.ok) {
          const govData = await govResponse.json();
          nativeGovernancePower = govData.nativeGovernancePower || 0;
          delegatedGovernancePower = govData.delegatedGovernancePower || 0;
          totalGovernancePower = nativeGovernancePower + delegatedGovernancePower;
          console.log(`NEW CITIZEN: Calculated governance power for ${walletAddress}: ${totalGovernancePower} ISLAND`);
        }
      } catch (error) {
        console.error('Governance power calculation failed for new citizen:', error.message);
      }
    } else {
      // For existing citizens, preserve current governance values
      const currentCitizen = await pool.query(
        'SELECT native_governance_power, delegated_governance_power, total_governance_power FROM citizens WHERE wallet = $1',
        [walletAddress]
      );
      if (currentCitizen.rows.length > 0) {
        nativeGovernancePower = currentCitizen.rows[0].native_governance_power || 0;
        delegatedGovernancePower = currentCitizen.rows[0].delegated_governance_power || 0;
        totalGovernancePower = currentCitizen.rows[0].total_governance_power || 0;
        console.log(`PIN UPDATE: Preserving existing governance power for ${walletAddress}: ${totalGovernancePower} ISLAND`);
      }
    }

    // Fetch complete NFT collection for citizen
    let nftMetadata = null;
    let actualPrimaryNft = primary_nft;
    let actualPfpNft = pfp_nft;
    let actualImageUrl = profileImageUrl;
    
    try {
      const nftResponse = await fetch(`${req.protocol}://${req.get('host')}/api/wallet-nfts?wallet=${walletAddress}`);
      const nftData = await nftResponse.json();
      if (nftData.nfts && nftData.nfts.length > 0) {
        // Format NFTs for database storage
        const formattedNfts = nftData.nfts.map(nft => ({
          mint: nft.mint,
          name: nft.name,
          image: nft.image
        }));
        nftMetadata = JSON.stringify(formattedNfts);
        console.log(`Stored ${formattedNfts.length} NFTs for citizen ${walletAddress}`);
        
        // Auto-select primary NFT if none provided (mobile wallet fallback)
        if (!actualPrimaryNft && formattedNfts.length > 0) {
          actualPrimaryNft = formattedNfts[0].mint;
          console.log(`Auto-selected primary NFT: ${actualPrimaryNft}`);
        }
        
        // Auto-select PFP NFT if none provided
        if (!actualPfpNft && formattedNfts.length > 0) {
          actualPfpNft = formattedNfts[0].mint;
        }
        
        // Auto-select image URL if none provided
        if (!actualImageUrl && formattedNfts.length > 0) {
          actualImageUrl = formattedNfts[0].image;
        }
      } else {
        // No PERKS NFTs found - this user cannot place a pin
        return res.status(400).json({
          success: false,
          message: 'No PERKS NFTs found in wallet. You must own PERKS NFTs to place a pin.'
        });
      }
    } catch (error) {
      console.error('Error fetching NFT collection for citizen:', error);
      // Fallback to provided NFTs if any
      nftMetadata = nfts ? JSON.stringify(nfts) : null;
      if (!actualPrimaryNft && nfts && nfts.length > 0) {
        actualPrimaryNft = nfts[0].mint;
      }
    }

    if (existingResult.rows.length > 0) {
      // Update existing citizen
      await pool.query(`
        UPDATE citizens SET
          lat = $1, lng = $2, primary_nft = $3, pfp_nft = $4,
          nickname = $5, bio = $6, twitter_handle = $7,
          telegram_handle = $8, discord_handle = $9, image_url = $10,
          native_governance_power = $11, delegated_governance_power = $12, 
          total_governance_power = $13, nft_metadata = $14,
          governance_last_updated = NOW(), updated_at = NOW()
        WHERE wallet = $15
      `, [lat, lng, actualPrimaryNft, actualPfpNft, nickname, bio, 
          twitter_handle, telegram_handle, discord_handle, actualImageUrl,
          nativeGovernancePower, delegatedGovernancePower, totalGovernancePower, nftMetadata, walletAddress]);
    } else {
      // Insert new citizen
      await pool.query(`
        INSERT INTO citizens (
          wallet, lat, lng, primary_nft, pfp_nft, nickname,
          bio, twitter_handle, telegram_handle, discord_handle, image_url,
          native_governance_power, delegated_governance_power, total_governance_power, nft_metadata,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      `, [walletAddress, lat, lng, actualPrimaryNft, actualPfpNft, nickname,
          bio, twitter_handle, telegram_handle, discord_handle, actualImageUrl,
          nativeGovernancePower, delegatedGovernancePower, totalGovernancePower, nftMetadata]);
    }

    res.json({
      success: true,
      message: 'Citizen pin created successfully'
    });

  } catch (error) {
    console.error('Save citizen error:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    res.status(500).json({
      success: false,
      message: 'Failed to save citizen data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Manual sync endpoint for testing
app.post('/api/sync-governance-power', async (req, res) => {
  try {
    console.log('Manual governance power sync triggered');
    const { performDailySync } = await import('./daily-sync.js');
    await performDailySync();
    res.json({ 
      success: true, 
      message: 'Governance power sync completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sync failed',
      error: error.message 
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

// Global error handler for Express
app.use((error, req, res, next) => {
  console.error('Global Express error:', error);
  console.error('Request URL:', req.url);
  console.error('Request method:', req.method);
  console.error('Error stack:', error.stack);
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      url: req.url
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Production server running on port ${port}`);
  console.log(`🌐 Available at: http://0.0.0.0:${port}`);
  console.log(`📊 Health check: http://0.0.0.0:${port}/health`);
  
  // Start daily sync scheduler
  startDailySync();
});