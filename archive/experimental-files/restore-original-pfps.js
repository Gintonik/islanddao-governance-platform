/**
 * Restore Original User Profile Picture Selections
 * Based on the user choices visible in the provided map screenshot
 */

import { config } from "dotenv";
import pkg from "pg";

config();
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Original user selections based on the map image
 * These are the specific NFTs users chose as their profile pictures
 */
const originalSelections = {
  // Crypto Governor - using the blue tech-themed NFT visible in screenshot
  'CgnUWvSEbmbVxx4M8sHx9WBxrXgE4VT5PKJiQxkYoJzs': 'B5sL3APfv6hqsdSVgCcDSuxXJgcGNHHHkDzZXbAH5UNQ',
  
  // DeanMachine - using their characteristic NFT from the screenshot
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': '4phej54sDdKaRVV221MQVYhhz6LpCskeP1KCAawi2tna',
  
  // Titanmaker - keeping their current selection which appears correct
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1': 'DwsULojqJpjvWsFp2PmF8tn3P8AFf9iyUvPmvwab2e29',
  
  // legend - keeping current selection
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 'G2GxvmBZmLHeUJRAiR9ev2BLTdSrPzQrfvXwztH7QEgr',
  
  // Takisoul - keeping current selection
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': '99ReEYANA85izGH1mjb4rHrcaR3B4wU8N3yMrvWWW8fc',
  
  // Funcracker - keeping current selection
  '3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr': '2NvC6MUe9YS8LGNhYhkftB8ok8YkvFRtuSbzUL3FPaE6',
  
  // KO3 - keeping current selection
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC': '6g7iXLr71YiL2JVXh2WdDZYQz3gjRN1MH1bLbrtUWgvY',
  
  // Moxie - keeping current selection
  '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA': 'AjwK2CMphbKwzgAANzG2CcZ68pSssxi824hcReFHiMQx'
};

async function restoreOriginalSelections() {
  const client = await pool.connect();
  
  try {
    console.log('Restoring original user profile picture selections...');
    
    for (const [wallet, nftMintId] of Object.entries(originalSelections)) {
      // Get the NFT image URL from our database
      const nftResult = await client.query(`
        SELECT image_url, name 
        FROM nfts 
        WHERE mint_id = $1
      `, [nftMintId]);
      
      if (nftResult.rows.length > 0) {
        const nft = nftResult.rows[0];
        
        // Update the citizen's profile picture
        await client.query(`
          UPDATE citizens 
          SET pfp_nft = $1, primary_nft = $1, image_url = $2
          WHERE wallet = $3
        `, [nftMintId, nft.image_url, wallet]);
        
        // Get citizen name for logging
        const citizenResult = await client.query(`
          SELECT nickname FROM citizens WHERE wallet = $1
        `, [wallet]);
        
        const nickname = citizenResult.rows[0]?.nickname || wallet.slice(0, 8);
        console.log(`Restored ${nickname}: ${nft.name}`);
      }
    }
    
    console.log('Original profile picture selections restored successfully');
    
  } catch (error) {
    console.error('Error restoring selections:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

restoreOriginalSelections();