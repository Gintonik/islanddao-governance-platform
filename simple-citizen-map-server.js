const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Simple HTTP server
const server = http.createServer(async (req, res) => {
  const urlPath = req.url;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    if (urlPath === '/' || urlPath === '/index.html') {
      // Serve the main HTML file
      const htmlPath = path.join(__dirname, 'citizen-map', 'verified-citizen-map.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlContent);
      
    } else if (urlPath === '/api/citizens') {
      // API endpoint for citizens data
      console.log('Request: GET /api/citizens');
      
      const query = `
        SELECT 
          id,
          nickname,
          wallet_address,
          latitude,
          longitude,
          native_governance_power,
          delegated_governance_power,
          total_governance_power,
          created_at,
          updated_at
        FROM citizens 
        ORDER BY total_governance_power DESC NULLS LAST, created_at ASC
      `;
      
      const result = await pool.query(query);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
      
    } else if (urlPath.startsWith('/citizen-map/') || urlPath.startsWith('/islanddao-logo.png')) {
      // Serve static files
      let filePath;
      if (urlPath.startsWith('/citizen-map/')) {
        filePath = path.join(__dirname, urlPath);
      } else {
        filePath = path.join(__dirname, urlPath);
      }
      
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath);
        let contentType = 'text/plain';
        
        if (ext === '.html') contentType = 'text/html';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.css') contentType = 'text/css';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.svg') contentType = 'image/svg+xml';
        
        const fileContent = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fileContent);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
      
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
    
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');
    
    server.listen(PORT, () => {
      console.log(`🚀 Citizens Map server running at http://localhost:${PORT}/`);
      console.log('Citizens Map with interactive visualization is now available');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();