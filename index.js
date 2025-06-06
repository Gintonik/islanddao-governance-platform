/**
 * Deployment Entry Point
 * Direct require of the citizen map server for production deployment
 */

const path = require('path');

console.log('Starting IslandDAO Governance Platform...');

// Set working directory and require the server directly
process.chdir(path.join(__dirname, 'citizen-map'));
require('./simple-server.cjs');