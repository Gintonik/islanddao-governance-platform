const http = require('http');
const fs = require('fs');
const path = require('path');

// File paths
const HTML_FILE = path.join(__dirname, 'index.simple.html');
const CITIZENS_FILE = path.join(__dirname, '..', 'citizens.json');
const NFT_OWNERS_FILE = path.join(__dirname, '..', 'nft-owners.json');
const PERKS_COLLECTION_FILE = path.join(__dirname, '..', 'perks-collection.json');

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

// Create HTTP server
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  // API endpoint to save citizen data
  if (req.method === 'POST' && req.url === '/api/save-citizen') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const citizenData = JSON.parse(body);
        
        // Validate required fields
        if (!citizenData.location || !citizenData.wallet || !citizenData.nfts) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }
        
        // Read existing citizens data
        let citizens = [];
        try {
          const existingData = fs.readFileSync(CITIZENS_FILE, 'utf8');
          citizens = JSON.parse(existingData);
        } catch (error) {
          // File might not exist yet or be empty
          console.log('Creating new citizens.json file');
        }
        
        // Check for duplicates (same wallet + NFT)
        const isDuplicate = citizens.some(citizen => 
          citizen.wallet === citizenData.wallet && 
          citizen.nfts.some(nft => citizenData.nfts.includes(nft))
        );
        
        if (isDuplicate) {
          res.statusCode = 409; // Conflict
          res.end(JSON.stringify({ error: 'This wallet has already pinned one or more of these NFTs' }));
          return;
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
        res.end(JSON.stringify({ error: 'Server error', details: error.message }));
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
      res.end(JSON.stringify({ error: 'Server error', details: error.message }));
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
      res.end(JSON.stringify({ error: 'Server error', details: error.message }));
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
      res.end(JSON.stringify({ error: 'Server error', details: error.message }));
    }
    return;
  }
  
  // Serve static files
  let filePath = req.url;
  
  // Default to index.html for root path
  if (filePath === '/') {
    filePath = HTML_FILE;
  } else {
    // Resolve path for other files
    filePath = path.join(__dirname, req.url);
  }
  
  // Get file extension
  const extname = path.extname(filePath);
  
  // Set default content type
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';
  
  // Read file and serve
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // File not found - serve the main HTML instead (for SPA client-side routing)
        fs.readFile(HTML_FILE, (err, content) => {
          if (err) {
            res.statusCode = 500;
            res.end('Error loading HTML file');
            return;
          }
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          res.end(content);
        });
      } else {
        // Server error
        res.statusCode = 500;
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      // Success - serve the file
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(content);
    }
  });
});

// Start server
const PORT = 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Citizen Map server running at http://localhost:${PORT}/`);
});