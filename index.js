import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting IslandDAO Governance Platform...');

// Start the deploy server
const deployServer = spawn('node', ['deploy-server.cjs'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT || 5000
  }
});

deployServer.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

deployServer.on('close', (code) => {
  if (code !== 0) {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
  }
});

process.on('SIGTERM', () => {
  deployServer.kill('SIGTERM');
});

process.on('SIGINT', () => {
  deployServer.kill('SIGINT');
});