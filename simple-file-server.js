const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
    console.log(`File server request: ${req.method} ${req.url}`);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.url === '/governance-methodology.txt') {
        try {
            const content = fs.readFileSync('governance-power-methodology.txt', 'utf8');
            res.writeHead(200, {
                'Content-Type': 'text/plain',
                'Content-Disposition': 'attachment; filename="islanddao-governance-methodology.txt"'
            });
            res.end(content);
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        }
    }
    else if (req.url === '/governance-methodology.md') {
        try {
            const content = fs.readFileSync('formatted-governance-methodology.md', 'utf8');
            res.writeHead(200, {
                'Content-Type': 'text/markdown',
                'Content-Disposition': 'attachment; filename="islanddao-governance-methodology.md"'
            });
            res.end(content);
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        }
    }
    else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
            <head><title>IslandDAO Governance Methodology Downloads</title></head>
            <body>
                <h1>IslandDAO Governance Methodology Downloads</h1>
                <p><a href="/governance-methodology.txt" download>Download Plain Text Version (.txt)</a></p>
                <p><a href="/governance-methodology.md" download>Download Formatted Version (.md)</a></p>
            </body>
            </html>
        `);
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`File server running at http://localhost:${PORT}/`);
    console.log(`Download links:`);
    console.log(`  Text version: http://localhost:${PORT}/governance-methodology.txt`);
    console.log(`  Markdown version: http://localhost:${PORT}/governance-methodology.md`);
});