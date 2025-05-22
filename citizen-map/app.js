// Simple server for Citizen Map application
const http = require('http');
const fs = require('fs');
const path = require('path');

// File paths
const HTML_FILE = path.join(__dirname, 'index.simple.html');
const CITIZENS_FILE = path.join(__dirname, '..', 'citizens.json');
const NFT_OWNERS_FILE = path.join(__dirname, '..', 'nft-owners.json');
const PERKS_COLLECTION_FILE = path.join(__dirname, '..', 'perks-collection.json');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  // For the API endpoint to save citizen data
  if (req.method === 'POST' && req.url === '/api/save-citizen') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const citizenData = JSON.parse(body);
        
        // Read existing citizens data
        let citizens = [];
        try {
          const existingData = fs.readFileSync(CITIZENS_FILE, 'utf8');
          citizens = JSON.parse(existingData);
        } catch (error) {
          // File might not exist yet or be empty
          console.log('Creating new citizens.json file');
        }
        
        // Add new citizen and save to file
        citizens.push(citizenData);
        fs.writeFileSync(CITIZENS_FILE, JSON.stringify(citizens, null, 2));
        
        // Return success response
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, message: 'Citizen pin added successfully' }));
      } catch (error) {
        console.error('Error saving citizen data:', error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Server error' }));
      }
    });
    return;
  }
  
  // Serve citizens.json
  if (req.url === '/citizens.json') {
    try {
      let data = '[]';
      try {
        data = fs.readFileSync(CITIZENS_FILE, 'utf8');
      } catch (error) {
        // If file doesn't exist, return empty array
        fs.writeFileSync(CITIZENS_FILE, '[]');
      }
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(data);
    } catch (error) {
      console.error('Error serving citizens.json:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }
  
  // Serve nft-owners.json
  if (req.url === '/nft-owners.json') {
    try {
      const data = fs.readFileSync(NFT_OWNERS_FILE, 'utf8');
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(data);
    } catch (error) {
      console.error('Error serving nft-owners.json:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }
  
  // Serve perks-collection.json
  if (req.url === '/perks-collection.json') {
    try {
      const data = fs.readFileSync(PERKS_COLLECTION_FILE, 'utf8');
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(data);
    } catch (error) {
      console.error('Error serving perks-collection.json:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }
  
  // API endpoint to get NFT metadata by mint ID
  if (req.url.startsWith('/api/nft-metadata')) {
    try {
      // Parse the URL to get NFT ID from query parameters
      const urlObj = new URL(req.url, 'http://localhost');
      const nftId = urlObj.searchParams.get('id');
      
      if (!nftId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'NFT ID is required' }));
        return;
      }
      
      // Read the collection data
      const collectionData = JSON.parse(fs.readFileSync(PERKS_COLLECTION_FILE, 'utf8'));
      
      // Find the NFT in the collection
      const nft = collectionData.find(item => item.id === nftId);
      
      if (!nft) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'NFT not found' }));
        return;
      }
      
      // Return NFT metadata
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(nft));
    } catch (error) {
      console.error('Error fetching NFT metadata:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }
  
  // Serve main HTML file for all other requests
  fs.readFile(HTML_FILE, (error, content) => {
    if (error) {
      res.statusCode = 500;
      res.end(`Server Error: ${error.code}`);
      return;
    }
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(content);
  });
});

// Set the port and start the server
const PORT = 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Citizen Map server running at http://localhost:${PORT}/`);
});