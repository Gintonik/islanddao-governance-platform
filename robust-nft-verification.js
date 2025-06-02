/**
 * Robust NFT Verification System
 * Cross-references multiple sources to prevent false positives
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PERKS_COLLECTION = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Check NFTs using database records
 */
async function checkDatabaseNFTs(walletAddress, client) {
  try {
    const result = await client.query(
      'SELECT COUNT(*) as count FROM nfts WHERE owner = $1 AND name LIKE $2',
      [walletAddress, 'PERK %']
    );
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error(`Database check failed for ${walletAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Check NFTs using Helius collection API
 */
async function checkCollectionAPI(walletAddress) {
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `collection-${walletAddress}`,
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: PERKS_COLLECTION,
          page: 1,
          limit: 1000
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      const ownedNFTs = data.result.items.filter(nft => 
        nft.ownership && nft.ownership.owner === walletAddress
      );
      return ownedNFTs.length > 0;
    }

    return false;
  } catch (error) {
    console.error(`Collection API check failed for ${walletAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Check NFTs using Helius owner API
 */
async function checkOwnerAPI(walletAddress) {
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `owner-${walletAddress}`,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: 1,
          limit: 1000
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.items) {
      const perksNFTs = data.result.items.filter(nft => {
        // Check collection grouping
        const hasCollection = nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === PERKS_COLLECTION
        );
        
        // Check name pattern
        const hasName = nft.content?.metadata?.name?.includes('PERK');
        
        return hasCollection || hasName;
      });
      
      return perksNFTs.length > 0;
    }

    return false;
  } catch (error) {
    console.error(`Owner API check failed for ${walletAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Robust verification using multiple sources
 * Only returns false if ALL sources confirm no NFTs
 * Returns true if ANY source finds NFTs or if verification fails
 */
async function robustNFTVerification(walletAddress, client) {
  console.log(`Verifying NFTs for ${walletAddress}...`);
  
  // Check all sources
  const [dbResult, collectionResult, ownerResult] = await Promise.all([
    checkDatabaseNFTs(walletAddress, client),
    checkCollectionAPI(walletAddress),
    checkOwnerAPI(walletAddress)
  ]);
  
  console.log(`  Database: ${dbResult}, Collection API: ${collectionResult}, Owner API: ${ownerResult}`);
  
  // If database shows NFTs, keep the citizen (most reliable)
  if (dbResult === true) {
    console.log(`  ✓ Database confirms NFTs exist`);
    return true;
  }
  
  // If any API confirms NFTs, keep the citizen
  if (collectionResult === true || ownerResult === true) {
    console.log(`  ✓ API confirms NFTs exist`);
    return true;
  }
  
  // If any check failed (returned null), keep the citizen (safe approach)
  if (dbResult === null || collectionResult === null || ownerResult === null) {
    console.log(`  ⚠ Verification failed, keeping citizen for safety`);
    return true;
  }
  
  // Only remove if ALL sources confirm no NFTs
  if (dbResult === false && collectionResult === false && ownerResult === false) {
    console.log(`  ✗ All sources confirm no NFTs`);
    return false;
  }
  
  // Default to keeping citizen
  console.log(`  ✓ Default to keeping citizen`);
  return true;
}

/**
 * Test the robust verification system
 */
async function testRobustVerification() {
  const client = await pool.connect();
  
  try {
    // Test with known wallets
    const testWallets = [
      { name: 'Takisoul', wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA' },
      { name: 'Moxie', wallet: '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA' }
    ];
    
    for (const test of testWallets) {
      console.log(`\n=== Testing ${test.name} ===`);
      const hasNFTs = await robustNFTVerification(test.wallet, client);
      console.log(`Result: ${hasNFTs ? 'KEEP' : 'REMOVE'}`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

testRobustVerification();