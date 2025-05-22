// NFT Collection Fetcher for PERKS Solana Collection
// This script serves an HTML page that displays all NFTs from the PERKS collection using Helius DAS API

const http = require('http');
const fs = require('fs');
const path = require('path');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  // Serve the HTML file for the root route
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
  } 
  // Serve the NFT collection data
  else if (req.url === '/perks-collection.json') {
    fs.readFile(path.join(__dirname, 'perks-collection.json'), (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading perks-collection.json');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    });
  }
  // Serve the NFT ownership data
  else if (req.url === '/nft-owners.json') {
    fs.readFile(path.join(__dirname, 'nft-owners.json'), (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading nft-owners.json');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    });
  }
  // Handle requests for the citizen-map page
  else if (req.url.startsWith('/citizen-map')) {
    res.writeHead(302, { 'Location': 'http://localhost:5001/' });
    res.end();
  }
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Set the port and start the server
const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Open your browser to view the PERKS NFT collection grid!`);
});
