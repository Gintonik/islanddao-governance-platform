/**
 * Daily PERKS Ownership Refresh
 * Updates NFT ownership data while preserving user profile picture choices
 */

import { config } from "dotenv";
import pkg from "pg";
import fetch from "node-fetch";
import cron from "node-cron";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PERKS_COLLECTION = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Get current PERKS NFTs for a wallet
 */
async function getCurrentPERKSNFTs(walletAddress) {
  try {
    const response = await fetch(process.env.HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `perks-${walletAddress}`,
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
        if (nft.grouping) {
          return nft.grouping.some(group => 
            group.group_key === 'collection' && 
            group.group_value === PERKS_COLLECTION
          );
        }
        return nft.content?.metadata?.name?.includes('PERK');
      });

      return perksNFTs.map(nft => ({
        mint_id: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image_url: nft.content?.files?.[0]?.uri || nft.content?.links?.image,
        json_uri: nft.content?.json_uri,
        owner: walletAddress
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching PERKS for ${walletAddress}: ${error.message}`);
    return [];
  }
}

/**
 * Update ownership while preserving user choices
 */
async function refreshOwnershipData() {
  const client = await pool.connect();
  
  try {
    console.log(`Starting daily PERKS ownership refresh: ${new Date().toISOString()}`);
    
    const citizens = await client.query('SELECT wallet, nickname, pfp_nft FROM citizens');
    
    let totalUpdated = 0;
    let ownershipIssues = 0;
    
    for (const citizen of citizens.rows) {
      try {
        const currentPERKS = await getCurrentPERKSNFTs(citizen.wallet);
        
        // Update NFT ownership records
        for (const nft of currentPERKS) {
          await client.query(`
            INSERT INTO nfts (mint_id, name, image_url, json_uri, owner, last_updated)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (mint_id) 
            DO UPDATE SET 
              owner = EXCLUDED.owner,
              last_updated = CURRENT_TIMESTAMP
          `, [nft.mint_id, nft.name, nft.image_url, nft.json_uri, nft.owner]);
        }
        
        // Check if citizen still owns their chosen profile picture
        if (citizen.pfp_nft) {
          const stillOwnsChosenNFT = currentPERKS.some(nft => nft.mint_id === citizen.pfp_nft);
          
          if (!stillOwnsChosenNFT) {
            console.log(`${citizen.nickname}: No longer owns chosen NFT ${citizen.pfp_nft}`);
            ownershipIssues++;
            
            // Don't change their selection, just log the issue
            await client.query(`
              INSERT INTO ownership_issues (citizen_wallet, nft_mint, issue_date, issue_type)
              VALUES ($1, $2, CURRENT_TIMESTAMP, 'chosen_nft_lost')
              ON CONFLICT (citizen_wallet, nft_mint) DO NOTHING
            `, [citizen.wallet, citizen.pfp_nft]);
          }
        }
        
        totalUpdated += currentPERKS.length;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing ${citizen.nickname}: ${error.message}`);
      }
    }
    
    console.log(`Daily refresh completed: ${totalUpdated} PERKS updated, ${ownershipIssues} ownership issues`);
    
  } finally {
    client.release();
  }
}

/**
 * Initialize tracking tables
 */
async function initializeTables() {
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
  } finally {
    client.release();
  }
}

/**
 * Start daily refresh service
 */
async function startDailyRefreshService() {
  await initializeTables();
  
  // Schedule daily at 2:00 AM UTC
  cron.schedule('0 2 * * *', refreshOwnershipData, {
    timezone: "UTC"
  });
  
  console.log('Daily PERKS ownership refresh scheduled (2:00 AM UTC)');
}

export { refreshOwnershipData, startDailyRefreshService };

// Run immediately if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshOwnershipData().then(() => {
    console.log('Manual refresh completed');
    process.exit(0);
  });
}