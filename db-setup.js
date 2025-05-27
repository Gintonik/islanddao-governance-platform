
const { Client } = require('pg');
const fetch = require('node-fetch');

// Database connection
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

// Helius API configuration
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '088dfd59-6d2e-4695-a42a-2e0c257c2d00'}`;
const COLLECTION_ADDRESS = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

async function setupDatabase() {
  try {
    await client.connect();
    
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS nfts (
        mint_id TEXT PRIMARY KEY,
        name TEXT,
        image_url TEXT,
        json_uri TEXT,
        owner TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await client.end();
  }
}

setupDatabase();
