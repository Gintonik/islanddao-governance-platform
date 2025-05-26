// PERKS NFT Collection Grid & Citizen Map Server
// Integrated with PostgreSQL database for NFT data

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');

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
        sendJsonResponse(res, citizens);
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
      // Serve static files from the root directory
      else {
        const filePath = path.join(__dirname, req.url);
        
        // Auto-detect content type based on file extension
        const extname = path.extname(filePath);
        const contentType = getContentType(extname);
        
        serveFile(res, filePath, contentType);
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