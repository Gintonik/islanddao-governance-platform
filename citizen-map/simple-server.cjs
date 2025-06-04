const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(express.static(__dirname));
app.use(express.json());

// Serve the main map
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'verified-citizen-map.html'));
});

// Serve the collection page
app.get('/collection', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'collection.html'));
});

// Function to fetch single NFT metadata using Helius API
async function fetchNFTMetadata(nftAddress) {
  try {
    const heliusUrl = process.env.HELIUS_API_KEY;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-asset',
        method: 'getAsset',
        params: {
          id: nftAddress
        }
      })
    });

    const data = await response.json();
    
    if (data.result) {
      return data.result;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return null;
  }
}

// Function to fetch NFTs for a wallet using Helius API
async function fetchWalletNFTs(walletAddress) {
  try {
    const heliusUrl = process.env.HELIUS_API_KEY;
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-assets',
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
      // Filter for PERKS collection NFTs - using the correct collection ID
      const perksNfts = data.result.items.filter(nft => {
        return nft.grouping && nft.grouping.some(group => 
          group.group_key === 'collection' && 
          group.group_value === '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8'
        );
      });

      return perksNfts.map(nft => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image: (nft.content?.files?.[0]?.uri || nft.content?.json_uri || '').replace('https://gateway.irys.xyz/', 'https://uploader.irys.xyz/'),
        collection: 'PERKS'
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for ${walletAddress}:`, error);
    return [];
  }
}

// API endpoint for citizens data with NFT information
app.get('/api/citizens', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
    const citizens = result.rows;
    
    // Add NFT data for each citizen
    const citizensWithNfts = await Promise.all(citizens.map(async (citizen) => {
      const nfts = await fetchWalletNFTs(citizen.wallet);
      const nftMetadata = {};
      const nftIds = [];
      
      nfts.forEach(nft => {
        nftIds.push(nft.mint);
        nftMetadata[nft.mint] = {
          name: nft.name,
          image: nft.image
        };
      });
      
      return {
        ...citizen,
        nfts: nftIds,
        nftMetadata: nftMetadata
      };
    }));
    
    res.json(citizensWithNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch citizens' });
  }
});

// API endpoint to get all NFTs from all citizens for the collection page
app.get('/api/nfts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.wallet,
        c.nickname,
        c.primary_nft
      FROM citizens c 
      WHERE c.primary_nft IS NOT NULL 
      AND c.primary_nft != ''
      ORDER BY c.nickname
    `);
    
    let allNfts = [];
    
    for (const citizen of result.rows) {
      if (citizen.primary_nft && citizen.primary_nft.trim() !== '') {
        try {
          // Fetch real NFT data from Helius API
          const nftData = await fetchNFTMetadata(citizen.primary_nft);
          
          if (nftData) {
            const nft = {
              id: citizen.primary_nft,
              name: nftData.content?.metadata?.name || `PERKS #${citizen.primary_nft.slice(-4)}`,
              content: nftData.content,
              owner_wallet: citizen.wallet,
              owner_nickname: citizen.nickname || 'Unknown Citizen'
            };
            allNfts.push(nft);
          }
        } catch (error) {
          console.error(`Error fetching NFT data for ${citizen.nickname}:`, error);
          // Fallback to basic info if API fails
          const nft = {
            id: citizen.primary_nft,
            name: `PERKS #${citizen.primary_nft.slice(-4)}`,
            content: {
              metadata: {
                name: `PERKS #${citizen.primary_nft.slice(-4)}`
              },
              links: {
                image: 'https://via.placeholder.com/300?text=NFT'
              }
            },
            owner_wallet: citizen.wallet,
            owner_nickname: citizen.nickname || 'Unknown Citizen'
          };
          allNfts.push(nft);
        }
      }
    }
    
    res.json(allNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Citizen Map server running at http://localhost:${port}`);
});