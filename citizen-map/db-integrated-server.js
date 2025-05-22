// Integrated Citizen Map server with database connection
const http = require('http');
const fs = require('fs');
const path = require('path');
const citizenMapDb = require('./citizen-map-db');
const db = require('../db');

// Constants
const PORT = 5001;
const HTML_FILE = path.join(__dirname, 'index.simple.html');

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
      // Serve the HTML file for the root route
      if (req.url === '/' || req.url === '/index.html') {
        serveFile(res, HTML_FILE, 'text/html');
      } 
      // Serve citizens data from database
      else if (req.url === '/citizens.json') {
        const citizens = await citizenMapDb.getCitizens();
        sendJsonResponse(res, citizens);
      }
      // Serve NFT ownership data from database
      else if (req.url === '/nft-owners.json') {
        const nftOwners = await citizenMapDb.getNftOwners();
        sendJsonResponse(res, nftOwners);
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
            const result = await citizenMapDb.saveCitizen(citizenData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            console.error('Error saving citizen data:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server error', details: error.message }));
          }
        });
      }
      // API endpoint to clear all citizens
      else if (req.method === 'POST' && req.url === '/api/clear-citizens') {
        try {
          const result = await citizenMapDb.clearCitizens();
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
        
        const metadata = await citizenMapDb.getNftMetadata(nftId);
        
        if (!metadata) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'NFT not found' }));
          return;
        }
        
        sendJsonResponse(res, metadata);
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
      // Serve static files
      else {
        // First check if the file exists in the citizen-map directory
        const requestedPath = path.join(__dirname, req.url);
        
        // Auto-detect content type based on file extension
        const extname = path.extname(requestedPath);
        const contentType = getContentType(extname);
        
        serveFile(res, requestedPath, contentType);
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