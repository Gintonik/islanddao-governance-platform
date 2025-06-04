const { execSync } = require('child_process');

// Try to start the CommonJS production server first
try {
  execSync('node production-server.js', { stdio: 'inherit' });
} catch (error) {
  console.error('Production server failed:', error);
  // Fallback to index.cjs
  try {
    execSync('node index.cjs', { stdio: 'inherit' });
  } catch (fallbackError) {
    console.error('Fallback server also failed:', fallbackError);
    process.exit(1);
  }
}