#!/usr/bin/env node

/**
 * IslandDAO Governance Platform - Production Entry Point
 * Serves the citizen map interface and governance API
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🌴 Starting IslandDAO Governance Platform...');

// Start the citizen map server (primary interface)
const mapServer = spawn('node', ['simple-server.cjs'], {
  cwd: path.join(__dirname, 'citizen-map'),
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT || 5000
  }
});

mapServer.on('error', (error) => {
  console.error('Failed to start citizen map server:', error);
  process.exit(1);
});

mapServer.on('close', (code) => {
  console.log(`Citizen map server exited with code ${code}`);
  if (code !== 0) {
    process.exit(code);
  }
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  mapServer.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  mapServer.kill('SIGINT');
});