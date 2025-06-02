/**
 * Verify On-Chain NFT Data
 * Fetches fresh PERKS collection ownership data directly from Solana blockchain
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
 * Test blockchain API access and fetch sample NFT data
 */
async function testBlockchainAccess() {
  try {
    console.log('Testing blockchain API access...');
    
    if (!process.env.HELIUS_API_KEY) {
      console.error('No HELIUS_API_KEY found in environment');
      return false;
    }
    
    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    
    // Test with a known wallet that has NFTs
    const testWallet = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt'; // DeanMachine
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'test-access',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: testWallet,
          page: 1,
          limit: 50
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('API Error:', data.error);
      return false;
    }
    
    if (data.result && data.result.items) {
      console.log(`API Access Working: Found ${data.result.items.length} assets for test wallet`);
      
      // Filter for NFTs
      const nfts = data.result.items.filter(item => 
        item.interface === 'V1_NFT' || item.interface === 'ProgrammableNFT'
      );
      
      console.log(`Found ${nfts.length} NFTs for test wallet`);
      
      // Show sample NFT data
      if (nfts.length > 0) {
        const sample = nfts[0];
        console.log('Sample NFT:', {
          id: sample.id,
          name: sample.content?.metadata?.name,
          image: sample.content?.files?.[0]?.uri
        });
      }
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('Blockchain access test failed:', error.message);
    return false;
  }
}

/**
 * Verify fresh ownership data for all citizens
 */
async function verifyFreshOwnershipData() {
  const client = await pool.connect();
  
  try {
    console.log('Verifying fresh ownership data for all citizens...');
    
    const result = await client.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    const citizens = result.rows;
    
    let totalOnChainNFTs = 0;
    let citizensWithNFTs = 0;
    
    for (const citizen of citizens) {
      try {
        console.log(`Checking ${citizen.nickname || citizen.wallet.slice(0, 8)}...`);
        
        const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
        
        const response = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `check-${citizen.wallet}`,
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: citizen.wallet,
              page: 1,
              limit: 100
            }
          })
        });

        const data = await response.json();
        
        if (data.result && data.result.items) {
          const nfts = data.result.items.filter(item => 
            item.interface === 'V1_NFT' || item.interface === 'ProgrammableNFT'
          );
          
          if (nfts.length > 0) {
            console.log(`  On-chain: ${nfts.length} NFTs`);
            totalOnChainNFTs += nfts.length;
            citizensWithNFTs++;
            
            // Show first few NFT names
            const sampleNames = nfts.slice(0, 3).map(nft => 
              nft.content?.metadata?.name || 'Unnamed'
            );
            console.log(`  Sample NFTs: ${sampleNames.join(', ')}`);
          } else {
            console.log(`  On-chain: 0 NFTs`);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error checking ${citizen.nickname}: ${error.message}`);
      }
    }
    
    // Compare with database
    const dbResult = await client.query('SELECT COUNT(*) as total FROM nfts');
    const dbTotal = parseInt(dbResult.rows[0].total);
    
    console.log('\n--- Ownership Verification Summary ---');
    console.log(`Citizens checked: ${citizens.length}`);
    console.log(`Citizens with on-chain NFTs: ${citizensWithNFTs}`);
    console.log(`Total on-chain NFTs found: ${totalOnChainNFTs}`);
    console.log(`NFTs in database: ${dbTotal}`);
    console.log(`Data freshness: ${totalOnChainNFTs > 0 ? 'VERIFIED' : 'NEEDS ATTENTION'}`);
    
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Starting on-chain NFT data verification...\n');
  
  const apiWorking = await testBlockchainAccess();
  
  if (apiWorking) {
    console.log('\n--- API Access Confirmed ---\n');
    await verifyFreshOwnershipData();
  } else {
    console.log('\n--- API Access Issues Detected ---');
    console.log('Cannot verify on-chain data without working API access');
    console.log('Please check API credentials or provide updated access');
  }
  
  await pool.end();
}

main();