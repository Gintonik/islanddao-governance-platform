// Integrated Citizen Map server with database connection
const http = require('http');
const fs = require('fs');
const path = require('path');
const apiRoutes = require('./api-routes');
const db = require('../db');

// Constants
const PORT = 5000;
const HTML_FILE = path.join(__dirname, 'verified-citizen-map.html');
const GLOBE_HTML_FILE = path.join(__dirname, 'verified-citizen-map.html');
const COLLECTION_HTML_FILE = path.join(__dirname, '..', 'unified-index.html');

// Initialize the database on startup
async function initializeApp() {
  try {
    // Create tables if they don't exist
    await db.initializeDatabase();
    console.log('Database initialized successfully for Citizen Map');
    
    // Start the HTTP server
    startServer();
  } catch (error) {
    console.error('Error initializing the Citizen Map application:', error);
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
      // Redirect to collection grid on main server when requested
      if (req.url === '/collection-grid') {
        res.writeHead(302, { 'Location': 'http://localhost:5000/' });
        res.end();
        return;
      }
      // Handle collection route - serve the NFT collection grid
      else if (req.url === '/collection' || req.url === '/collection.html') {
        serveFile(res, COLLECTION_HTML_FILE, 'text/html');
      }
      // Serve the HTML file for the root route
      else if (req.url === '/' || req.url === '/index.html') {
        serveFile(res, HTML_FILE, 'text/html');
      }
      // Serve the globe view HTML
      else if (req.url === '/globe' || req.url === '/globe.html') {
        serveFile(res, GLOBE_HTML_FILE, 'text/html');
      } 
      // Serve citizens data from database
      else if (req.url === '/citizens.json') {
        const citizens = await apiRoutes.getAllCitizens();
        sendJsonResponse(res, citizens);
      }
      // API endpoint for citizens (used by verified citizen map)
      else if (req.url === '/api/citizens') {
        const citizens = await apiRoutes.getAllCitizens();
        sendJsonResponse(res, citizens);
      }
      // API endpoint to sync governance power
      else if (req.url === '/api/sync-governance' && req.method === 'POST') {
        const result = await apiRoutes.syncGovernancePower();
        sendJsonResponse(res, result);
      }
      // API endpoint for governance statistics
      else if (req.url === '/api/governance-stats') {
        const result = await apiRoutes.getGovernanceStats();
        sendJsonResponse(res, result);
      }
      // Download link for governance methodology document
      else if (req.url === '/governance-methodology.txt') {
        try {
          const methodologyPath = path.join(__dirname, '..', 'governance-power-methodology.txt');
          const methodologyContent = fs.readFileSync(methodologyPath, 'utf8');
          
          res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="islanddao-governance-methodology.txt"'
          });
          res.end(methodologyContent);
        } catch (error) {
          console.error('Error serving methodology document:', error);
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Methodology document not found');
        }
      }
      // Download link for formatted methodology document
      else if (req.url === '/governance-methodology.md') {
        try {
          const methodologyPath = path.join(__dirname, '..', 'formatted-governance-methodology.md');
          const methodologyContent = fs.readFileSync(methodologyPath, 'utf8');
          
          res.writeHead(200, {
            'Content-Type': 'text/markdown',
            'Content-Disposition': 'attachment; filename="islanddao-governance-methodology.md"'
          });
          res.end(methodologyContent);
        } catch (error) {
          console.error('Error serving formatted methodology document:', error);
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Formatted methodology document not found');
        }
      }
      // API endpoint for all NFTs (used by collection grid)
      else if (req.url === '/api/nfts') {
        try {
          const client = await db.pool.connect();
          
          try {
            // Get all NFTs from database
            const result = await client.query(`
              SELECT mint_id, name, image_url, owner, json_uri
              FROM nfts 
              ORDER BY name
            `);
            
            // Format for collection grid
            const nfts = result.rows.map(nft => ({
              id: nft.mint_id,
              name: nft.name,
              imageUrl: nft.image_url,
              owner: nft.owner,
              jsonUri: nft.json_uri
            }));
            
            sendJsonResponse(res, nfts);
          } finally {
            client.release();
          }
        } catch (error) {
          console.error('Error fetching NFTs:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error fetching NFTs' }));
        }
      }
      // Add endpoint for nft-owners.json to support the existing code
      else if (req.url === '/nft-owners.json') {
        try {
          // Get all NFT ownership data from database
          const client = await db.pool.connect();
          
          try {
            // Get all NFTs with owners
            const result = await client.query(`
              SELECT mint_id, owner FROM nfts 
              WHERE owner IS NOT NULL AND owner != ''
            `);
            
            // Create wallet -> NFTs mapping
            const ownershipMap = {};
            
            for (const row of result.rows) {
              if (!ownershipMap[row.owner]) {
                ownershipMap[row.owner] = [];
              }
              ownershipMap[row.owner].push(row.mint_id);
            }
            
            // Send the ownership map
            sendJsonResponse(res, ownershipMap);
          } finally {
            client.release();
          }
        } catch (error) {
          console.error('Error generating NFT ownership map:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error generating ownership map' }));
        }
      }
      // API endpoint for wallet NFTs - direct database access
      else if (req.url.startsWith('/api/wallet-nfts')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const wallet = url.searchParams.get('wallet');
        
        if (!wallet) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Wallet address is required' }));
          return;
        }
        
        const result = await apiRoutes.getWalletNfts(wallet);
        sendJsonResponse(res, result);
      }
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
            
            console.log('Saving citizen pin with data:', JSON.stringify({
              wallet: citizenData.wallet,
              location: citizenData.location,
              nftCount: citizenData.nfts.length,
              primaryNft: citizenData.primaryNft
            }));
            
            // Save to database using direct API
            const result = await apiRoutes.saveCitizenPin(citizenData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            console.error('Error saving citizen data:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error.message }));
          }
        });
      }
      // API endpoint for wallet verification
      else if (req.method === 'POST' && req.url === '/api/verify-wallet') {
        let body = '';
        
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const walletAddress = data.walletAddress || data.publicKey;
            console.log('Wallet verification request:', walletAddress);
            
            // For now, just return success - wallet verification logic can be added later
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              verified: true,
              success: true, 
              message: 'Wallet verified successfully',
              walletAddress: walletAddress 
            }));
          } catch (error) {
            console.error('Error verifying wallet:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Wallet verification failed' }));
          }
        });
      }
      // API endpoint to save verified citizen pin (with wallet signature)
      else if (req.method === 'POST' && req.url === '/api/save-citizen-verified') {
        let body = '';
        
        req.on('data', chunk => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            console.log('Verified citizen data received:', {
              wallet: data.wallet_address,
              nickname: data.nickname,
              bio: data.bio,
              lat: data.lat,
              lng: data.lng
            });
            
            // Prepare citizen data for saving
            const citizenData = {
              wallet: data.wallet_address,
              location: [parseFloat(data.lat), parseFloat(data.lng)],
              primaryNft: data.primary_nft,
              pfp: data.pfp_nft,
              nfts: data.nfts || [data.primary_nft],
              nickname: data.nickname,
              bio: data.bio,
              socials: {
                twitter: data.twitter_handle,
                telegram: data.telegram_handle,
                discord: data.discord_handle
              }
            };
            
            console.log('Saving verified citizen with nickname:', citizenData.nickname, 'and bio:', citizenData.bio);
            
            // Save to database
            const result = await apiRoutes.saveCitizenPin(citizenData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            console.error('Error saving verified citizen data:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error.message }));
          }
        });
      }
      // API endpoint to clear all citizens
      else if (req.method === 'POST' && req.url === '/api/clear-citizens') {
        try {
          const result = await apiRoutes.clearAllCitizens();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error('Error clearing citizens:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error', details: error.message }));
        }
      }
      // API endpoint to get NFT metadata
      else if (req.url.startsWith('/api/nft-metadata')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const nftId = url.searchParams.get('id');
        
        if (!nftId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'NFT ID is required' }));
          return;
        }
        
        try {
          // Query database directly for NFT metadata
          const client = await db.pool.connect();
          
          try {
            const result = await client.query(
              'SELECT * FROM nfts WHERE mint_id = $1',
              [nftId]
            );
            
            if (result.rows.length === 0) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'NFT not found' }));
              return;
            }
            
            const nft = result.rows[0];
            
            // Format metadata for frontend consumption
            const metadata = {
              id: nft.mint_id,
              name: nft.name,
              image: nft.image_url,
              imageUrl: nft.image_url,
              owner: nft.owner,
              jsonUri: nft.json_uri
            };
            
            sendJsonResponse(res, metadata);
          } finally {
            client.release();
          }
        } catch (error) {
          console.error('Error fetching NFT metadata:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error fetching NFT metadata' }));
        }
      }
      // Serve perks-collection.json 
      else if (req.url === '/perks-collection.json') {
        // Get all NFTs from database
        const nfts = await db.getAllNfts();
        const formattedNfts = nfts.map(nft => ({
          id: nft.mint_id,
          name: nft.name,
          imageUrl: nft.image_url,
          owner: nft.owner
        }));
        
        sendJsonResponse(res, formattedNfts);
      }
      // Serve the verified citizen map
      else if (req.url === '/verified-map') {
        serveFile(res, path.join(__dirname, 'verified-citizen-map.html'), 'text/html');
      }
      // Serve static files
      else {
        // Handle logo files specifically
        if (req.url.includes('logo') && req.url.endsWith('.png')) {
          const logoFileName = path.basename(req.url);
          const logoPath = path.join(__dirname, logoFileName);
          serveFile(res, logoPath, 'image/png');
        }
        // Handle other citizen-map assets
        else if (req.url.includes('citizen-map/') || req.url.includes('.png') || req.url.includes('.js') || req.url.includes('.css')) {
          const requestedPath = path.join(__dirname, req.url.replace('/citizen-map/', ''));
          const extname = path.extname(requestedPath);
          const contentType = getContentType(extname);
          serveFile(res, requestedPath, contentType);
        }
        // Default file serving
        else {
          const requestedPath = path.join(__dirname, req.url);
          const extname = path.extname(requestedPath);
          const contentType = getContentType(extname);
          serveFile(res, requestedPath, contentType);
        }
      }
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error', details: error.message }));
    }
  });

  // Start the server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Citizen Map server (DB integrated) running at http://localhost:${PORT}/`);
  });
}

// Helper function to serve files
function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end(`Server error: ${err.code}`);
      }
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
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