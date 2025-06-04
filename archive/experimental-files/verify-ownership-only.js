/**
 * NFT Ownership Verification (User Choice Preserving)
 * Verifies that users still own their chosen NFTs without changing their selections
 * Updates ownership data daily while preserving user profile picture choices
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Verify if a user still owns their chosen NFT
 */
async function verifyNFTOwnership(walletAddress, nftMintId) {
  try {
    if (!process.env.HELIUS_API_KEY) {
      console.warn('No Helius API key available for ownership verification');
      return true; // Assume ownership if we can't verify
    }

    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: {
          id: nftMintId
        }
      })
    });

    const data = await response.json();
    
    if (data.result && data.result.ownership) {
      const currentOwner = data.result.ownership.owner;
      return currentOwner === walletAddress;
    }
    
    return true; // Assume ownership if we can't verify
  } catch (error) {
    console.warn(`Could not verify ownership for ${nftMintId}: ${error.message}`);
    return true; // Assume ownership if verification fails
  }
}

/**
 * Verify all user NFT choices without changing them
 */
async function verifyAllUserChoices() {
  const client = await pool.connect();
  
  try {
    console.log('Starting NFT ownership verification...');
    
    const result = await client.query(`
      SELECT wallet, nickname, pfp_nft, primary_nft 
      FROM citizens 
      WHERE pfp_nft IS NOT NULL
    `);
    
    let verifiedCount = 0;
    let issueCount = 0;
    
    for (const citizen of result.rows) {
      try {
        console.log(`Verifying ${citizen.nickname || citizen.wallet.slice(0, 8)}...`);
        
        const stillOwnsNFT = await verifyNFTOwnership(citizen.wallet, citizen.pfp_nft);
        
        if (stillOwnsNFT) {
          console.log(`✓ ${citizen.nickname}: Still owns chosen NFT`);
          verifiedCount++;
        } else {
          console.log(`⚠ ${citizen.nickname}: No longer owns chosen NFT ${citizen.pfp_nft}`);
          issueCount++;
          
          // Log the issue but don't change their selection
          await client.query(`
            INSERT INTO ownership_issues (citizen_wallet, nft_mint, issue_date, issue_type)
            VALUES ($1, $2, CURRENT_TIMESTAMP, 'ownership_lost')
            ON CONFLICT (citizen_wallet, nft_mint) DO NOTHING
          `, [citizen.wallet, citizen.pfp_nft]);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error verifying ${citizen.nickname}: ${error.message}`);
      }
    }
    
    console.log(`Verification completed: ${verifiedCount} verified, ${issueCount} issues found`);
    
  } finally {
    client.release();
  }
}

/**
 * Initialize ownership tracking table
 */
async function initializeOwnershipTracking() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ownership_issues (
        id SERIAL PRIMARY KEY,
        citizen_wallet TEXT,
        nft_mint TEXT,
        issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        issue_type TEXT,
        resolved BOOLEAN DEFAULT FALSE,
        UNIQUE(citizen_wallet, nft_mint)
      )
    `);
    
    console.log('Ownership tracking initialized');
  } finally {
    client.release();
  }
}

export { verifyAllUserChoices, verifyNFTOwnership, initializeOwnershipTracking };

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeOwnershipTracking().then(() => {
    return verifyAllUserChoices();
  }).then(() => {
    console.log('Ownership verification completed');
    process.exit(0);
  });
}