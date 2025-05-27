// PERKS NFT Collection Grid & Citizen Map Server
// Integrated with PostgreSQL database for NFT data

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const db = require('./db');
const { verifySignature, generateVerificationMessage, isAdminWallet } = require('./wallet-auth');

// Initialize the database on startup
async function initializeApp() {
  try {
    // Create tables if they don't exist
    await db.initializeDatabase();
    console.log('Database initialized successfully');
    
    // Check if we need to sync NFT data
    const nfts = await db.getAllNfts();
    if (nfts.length === 0) {
      console.log('No NFTs found in database. Running initial sync...');
      try {
        // Import and run the sync function
        const { syncNFTCollection } = require('./sync-nft-collection');
        await syncNFTCollection();
        console.log('Initial NFT collection sync completed');
      } catch (syncError) {
        console.error('Error during initial sync:', syncError);
      }
    } else {
      console.log(`Database contains ${nfts.length} NFTs`);
    }
    
    // Start the HTTP server
    startServer();
  } catch (error) {
    console.error('Error initializing the application:', error);
    process.exit(1);
  }
}

// Create a simple HTTP server
function startServer() {
  const server = http.createServer(async (req, res) => {
    console.log(`Request: ${req.method} ${req.url}`);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS requests (for CORS preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Route handling
    try {
      // Serve the HTML file for the root route (NFT Grid)
      if (req.url === '/' || req.url === '/index.html') {
        serveFile(res, path.join(__dirname, 'unified-index.html'), 'text/html');
      }
      // Serve the original citizen map
      else if (req.url === '/citizen-map') {
        serveFile(res, path.join(__dirname, 'citizen-map', 'wallet-nft-map.html'), 'text/html');
      }
      // Serve the verified citizen map with wallet connection
      else if (req.url === '/verified-map') {
        serveFile(res, path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'), 'text/html');
      } 
      // API endpoint for NFT collection data
      else if (req.url === '/api/nfts') {
        const nfts = await db.getAllNfts();
        const formattedNfts = nfts.map(nft => ({
          id: nft.mint_id,
          name: nft.name,
          imageUrl: nft.image_url,
          owner: nft.owner
        }));
        
        sendJsonResponse(res, formattedNfts);
      }
      // API endpoint for NFT ownership data
      else if (req.url === '/api/nft-owners') {
        const ownershipMap = await db.getNftOwnershipMap();
        sendJsonResponse(res, ownershipMap);
      }
      // For backwards compatibility - serve the static NFT collection file
      else if (req.url === '/perks-collection.json') {
        serveFile(res, path.join(__dirname, 'perks-collection.json'), 'application/json');
      }
      // For backwards compatibility - serve the static NFT ownership file
      else if (req.url === '/nft-owners.json') {
        serveFile(res, path.join(__dirname, 'nft-owners.json'), 'application/json');
      }
      // API endpoint for NFT data by mint ID
      else if (req.url.startsWith('/api/nft/')) {
        const mintId = req.url.split('/').pop();
        
        // Get NFT data from database
        const nftResult = await db.pool.query('SELECT * FROM nfts WHERE mint_id = $1', [mintId]);
        
        if (nftResult.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'NFT not found' }));
          return;
        }
        
        const nft = nftResult.rows[0];
        sendJsonResponse(res, {
          id: nft.mint_id,
          name: nft.name,
          imageUrl: nft.image_url,
          owner: nft.owner
        });
      }
      // API endpoint for NFTs by owner wallet
      else if (req.url.startsWith('/api/wallet-nfts')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const wallet = url.searchParams.get('wallet');
        
        if (!wallet) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Wallet address is required' }));
          return;
        }
        
        const nfts = await db.getNftsByOwner(wallet);
        const formattedNfts = nfts.map(nft => ({
          id: nft.mint_id,
          name: nft.name,
          imageUrl: nft.image_url,
          owner: nft.owner
        }));
        
        sendJsonResponse(res, formattedNfts);
      }
      // ===== SECURE WALLET VERIFICATION ENDPOINTS =====
      
      // Generate verification message for wallet signing
      if (req.method === 'GET' && req.url === '/api/auth/generate-message') {
        const timestamp = Date.now();
        const message = generateVerificationMessage(timestamp);
        sendJsonResponse(res, { message, timestamp });
      }
      
      // Verify wallet signature and return authentication status
      else if (req.method === 'POST' && req.url === '/api/auth/verify') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
          try {
            const { wallet_address, original_message, signature } = JSON.parse(body);
            
            if (!wallet_address || !original_message || !signature) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }
            
            const isValid = verifySignature(original_message, signature, wallet_address);
            const isAdmin = isAdminWallet(wallet_address);
            
            if (isValid) {
              console.log(`✅ Verified wallet: ${wallet_address}${isAdmin ? ' (ADMIN)' : ''}`);
              sendJsonResponse(res, { 
                verified: true, 
                isAdmin,
                wallet: wallet_address 
              });
            } else {
              console.log(`⚠️ Invalid signature from wallet: ${wallet_address}`);
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid signature' }));
            }
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      }
      
      // New wallet verification endpoint for signature verification
      else if (req.method === 'POST' && req.url === '/api/verify-wallet') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
          try {
            console.log('Received wallet verification request body:', body);
            const { publicKey, message, signature } = JSON.parse(body);
            
            console.log('Parsed verification data:', { publicKey, message: message?.substring(0, 50), signature: signature?.length });
            
            if (!publicKey || !message || !signature) {
              console.log('Missing required fields:', { publicKey: !!publicKey, message: !!message, signature: !!signature });
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }
            
            // For development - simplified validation
            // In production, this would verify actual Solana signatures
            const isValid = publicKey && message && signature;
            const isAdmin = isAdminWallet(publicKey);
            
            if (isValid) {
              console.log(`✅ Verified wallet connection: ${publicKey}${isAdmin ? ' (ADMIN)' : ''}`);
              sendJsonResponse(res, { 
                verified: true, 
                isAdmin,
                wallet: publicKey 
              });
            } else {
              console.log(`⚠️ Invalid signature during wallet connection: ${publicKey}`);
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ verified: false, error: 'Invalid signature' }));
            }
          } catch (error) {
            console.error('Error verifying wallet:', error);
            console.error('Raw body that caused error:', body);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ verified: false, error: 'Invalid request format' }));
          }
        });
      }
      
      // SECURE API endpoint to save citizen data (requires wallet verification)
      else if (req.method === 'POST' && req.url === '/api/save-citizen-verified') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            console.log('Raw pin creation data received:', data);
            
            const { wallet_address, original_message, signature } = data;
            
            console.log('Pin creation form data received:', {
              nickname: data.nickname,
              bio: data.bio,
              twitter: data.twitter_handle,
              telegram: data.telegram_handle,
              discord: data.discord_handle
            });
            
            // Verify wallet signature
            if (!verifySignature(original_message, signature, wallet_address)) {
              console.log(`⚠️ Unauthorized save attempt from wallet: ${wallet_address}`);
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid wallet signature' }));
              return;
            }
            
            // Verify timestamp (5 minute window)
            const timestampMatch = original_message.match(/Timestamp: (\d+)/);
            if (timestampMatch) {
              const messageTimestamp = parseInt(timestampMatch[1]);
              const timeDiff = Math.abs(Date.now() - messageTimestamp);
              if (timeDiff > 300000) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Message timestamp expired' }));
                return;
              }
            }
            
            // Prepare citizen data with enhanced profile fields
            const citizenData = {
              wallet: wallet_address,
              location: [parseFloat(data.lat), parseFloat(data.lng)],
              primaryNft: data.primary_nft || null,
              pfp: data.pfp_nft || null,
              message: data.message || null,
              nickname: data.nickname || null,
              bio: data.bio || null,
              nfts: data.nfts || [],
              pfpImageUrl: data.image_url || null,
              socials: {
                twitter: data.twitter_handle || null,
                telegram: data.telegram_handle || null,
                discord: data.discord_handle || null
              }
            };
            
            console.log('About to save citizen data:', {
              nickname: citizenData.nickname,
              bio: citizenData.bio,
              wallet: citizenData.wallet
            });
            
            const citizenId = await db.saveCitizen(citizenData);
            
            console.log(`✅ Verified citizen profile saved for wallet: ${wallet_address}`);
            sendJsonResponse(res, { 
              success: true, 
              message: 'Verified citizen profile saved successfully',
              citizenId 
            });
          } catch (error) {
            console.error('Error saving verified citizen data:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error.message }));
          }
        });
      }
      
      // ADMIN-ONLY: Clear all pins (requires admin wallet signature)
      else if (req.method === 'POST' && req.url === '/admin/clear-pins') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const { wallet_address, original_message, signature } = JSON.parse(body);
            
            // Verify admin wallet signature
            if (!verifySignature(original_message, signature, wallet_address) || !isAdminWallet(wallet_address)) {
              console.log(`⚠️ Blocked unauthorized admin attempt from wallet: ${wallet_address}`);
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Admin privileges required' }));
              return;
            }
            
            await db.clearAllCitizens();
            console.log(`✅ Admin cleared all pins`);
            
            sendJsonResponse(res, { 
              success: true, 
              message: 'All citizen pins cleared by admin' 
            });
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error' }));
          }
        });
      }
      
      // ADMIN-ONLY: Remove specific pin by wallet (requires admin wallet signature)
      else if (req.method === 'POST' && req.url === '/admin/remove-pin') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const { wallet_address, original_message, signature, target_wallet } = JSON.parse(body);
            
            // Verify admin wallet signature
            if (!verifySignature(original_message, signature, wallet_address) || !isAdminWallet(wallet_address)) {
              console.log(`⚠️ Blocked unauthorized admin attempt from wallet: ${wallet_address}`);
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Admin privileges required' }));
              return;
            }
            
            if (!target_wallet) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Target wallet address required' }));
              return;
            }
            
            // Remove specific citizen by wallet
            await db.removeCitizenByWallet(target_wallet);
            console.log(`✅ Admin removed pin for wallet: ${target_wallet}`);
            
            sendJsonResponse(res, { 
              success: true, 
              message: `Pin removed for wallet: ${target_wallet}` 
            });
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error' }));
          }
        });
      }
      
      // ===== LEGACY ENDPOINTS (for backwards compatibility) =====
      
      // API endpoint to save citizen pin
      else if (req.method === 'POST' && req.url === '/api/save-citizen') {
        let body = '';
        
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const citizenData = JSON.parse(body);
            
            // Validate required fields
            if (!citizenData.location || !citizenData.wallet || !citizenData.nfts) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }
            
            // Save to database
            const citizenId = await db.saveCitizen(citizenData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Citizen pin added successfully',
              citizenId 
            }));
          } catch (error) {
            console.error('Error saving citizen data:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error.message }));
          }
        });
      }
      // API endpoint to get all citizens
      else if (req.url === '/api/citizens') {
        const citizens = await db.getAllCitizens();
        sendJsonResponse(res, citizens);
      }
      // For backwards compatibility - serve citizens from JSON file
      else if (req.url === '/citizens.json') {
        const citizens = await db.getAllCitizens();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(citizens));
      }
      // API endpoint to clear all citizens
      else if (req.method === 'POST' && req.url === '/api/clear-citizens') {
        await db.clearAllCitizens();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'All citizen pins cleared successfully' 
        }));
      }
      // API endpoint to manually trigger NFT collection sync
      else if (req.method === 'POST' && req.url === '/api/sync-nfts') {
        // Start the sync process in the background
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'NFT collection sync started' 
        }));
        
        // Import and run the sync in the background without blocking the response
        const { syncNFTCollection } = require('./sync-nft-collection');
        syncNFTCollection()
          .then(result => {
            console.log('Manual NFT collection sync completed:', result);
          })
          .catch(error => {
            console.error('Error during manual NFT collection sync:', error);
          });
      }
      // Handle requests for the citizen-map
      else if (req.url === '/citizen-map') {
        // Serve the citizen map HTML directly from this server
        serveFile(res, path.join(__dirname, 'citizen-map/wallet-nft-map.html'), 'text/html');
      }
      // API endpoint to get all citizens for the map
      else if (req.url === '/citizens.json') {
        const citizens = await db.getAllCitizens();
        console.log('Citizens from DB:', citizens.map(c => ({
          wallet: c.wallet,
          twitter: c.twitter_handle,
          telegram: c.telegram_handle,
          discord: c.discord_handle
        })));
        sendJsonResponse(res, citizens);
      }
      // API endpoint to get specific NFT data
      else if (req.url.startsWith('/api/nft/') && req.method === 'GET') {
        const mintId = req.url.split('/')[3];
        if (!mintId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'NFT mint ID is required' }));
          return;
        }
        
        try {
          const query = 'SELECT * FROM nfts WHERE mint_id = $1';
          const result = await pool.query(query, [mintId]);
          
          if (result.rows.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'NFT not found' }));
            return;
          }
          
          sendJsonResponse(res, result.rows[0]);
        } catch (error) {
          console.error('Error fetching NFT:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch NFT' }));
        }
      }
      // API endpoint to save a citizen pin
      else if (req.url === '/api/save-citizen' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const citizenData = JSON.parse(body);
            
            if (!citizenData.wallet || !citizenData.location || !citizenData.primaryNft) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields' }));
              return;
            }
            
            // Add the pfp image URL to the citizen data
            if (citizenData.pfpImageUrl) {
              citizenData.pfp_image_url = citizenData.pfpImageUrl;
            }
            
            console.log('Saving citizen with data:', citizenData);
            
            const citizenId = await db.saveCitizen(citizenData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Citizen pin added successfully',
              citizenId 
            }));
          } catch (error) {
            console.error('Error saving citizen data:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error.message }));
          }
        });
      }
      // API endpoint to clear all citizens
      else if (req.url === '/api/clear-citizens' && req.method === 'POST') {
        try {
          await db.clearAllCitizens();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'All citizen pins cleared' }));
        } catch (error) {
          console.error('Error clearing citizens:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error', details: error.message }));
        }
      }
      // Serve static files from the citizen-map directory
      else if (req.url.startsWith('/citizen-map/')) {
        const filePath = path.join(__dirname, req.url);
        
        // Auto-detect content type based on file extension
        const extname = path.extname(filePath);
        const contentType = getContentType(extname);
        
        serveFile(res, filePath, contentType);
      }
      // Handle any remaining static files or fallback
      else {
        // Check if it's the verified-map route that was missed
        if (req.url === '/verified-map') {
          serveFile(res, path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'), 'text/html');
        } else {
          const filePath = path.join(__dirname, req.url);
          
          // Auto-detect content type based on file extension
          const extname = path.extname(filePath);
          const contentType = getContentType(extname);
          
          serveFile(res, filePath, contentType);
        }
      }
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', details: error.message }));
    }
  });

  // Set the port and start the server
  const PORT = 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Open your browser to view the PERKS NFT collection grid!`);
    console.log(`Visit http://localhost:${PORT}/citizen-map to view the Citizen Map`);
    
    // Set up daily NFT collection updates
    setTimeout(() => {
      try {
        // Start the daily update scheduler
        const { scheduleNextUpdate } = require('./daily-update');
        scheduleNextUpdate(0); // Schedule to run at midnight UTC
        console.log('Daily NFT collection update scheduler initialized');
      } catch (error) {
        console.error('Error setting up daily update scheduler:', error);
      }
    }, 5000); // Wait 5 seconds after server starts to initialize the scheduler
  });
}

// Helper function to serve files
function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        if (!res.headersSent) {
          res.writeHead(404);
          res.end('File not found');
        }
      } else {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end(`Server error: ${err.code}`);
        }
      }
      return;
    }
    
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// Helper function to send JSON responses
function sendJsonResponse(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper function to determine content type based on file extension
function getContentType(extname) {
  switch (extname) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

// Start the application
initializeApp();