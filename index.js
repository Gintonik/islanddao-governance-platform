import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting IslandDAO Governance Platform...');

// Start the production server using the CommonJS version
const productionServer = spawn('node', ['production-server.cjs'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT || 5000
  }
});

productionServer.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

productionServer.on('close', (code) => {
  if (code !== 0) {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
  }
});

process.on('SIGTERM', () => {
  productionServer.kill('SIGTERM');
});

process.on('SIGINT', () => {
  productionServer.kill('SIGINT');
});