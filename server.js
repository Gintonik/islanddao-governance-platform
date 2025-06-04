// Production server for IslandDAO Governance Platform
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const port = process.env.PORT || 5000;

// Database connection
let pool;
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
} catch (error) {
  console.error('Database connection error:', error);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // API routes
    if (url.pathname === '/api/citizens') {
      try {
        if (!pool) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
          return;
        }
        
        const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
        const citizens = result.rows.map(citizen => ({
          ...citizen,
          nfts: [],
          nftMetadata: {}
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(citizens));
      } catch (error) {
        console.error('Database error:', error);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
      }
      return;
    }
    
    if (url.pathname === '/api/nfts') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
      return;
    }
    
    // Static file serving
    let filePath;
    if (url.pathname === '/' || url.pathname === '/index.html') {
      filePath = path.join(__dirname, 'citizen-map', 'verified-citizen-map.html');
    } else if (url.pathname === '/collection') {
      filePath = path.join(__dirname, 'citizen-map', 'collection.html');
    } else {
      filePath = path.join(__dirname, 'citizen-map', url.pathname);
    }
    
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      let contentType = 'text/html';
      
      switch (ext) {
        case '.js': contentType = 'application/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpeg'; break;
        case '.gif': contentType = 'image/gif'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
      }
      
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`IslandDAO Governance Platform running at http://localhost:${port}`);
});