const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5000;

// Database connection with error handling
let pool;
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
} catch (error) {
  console.error('Database connection error:', error);
}

app.use(express.static(path.join(__dirname, 'citizen-map')));
app.use(express.json());

// Serve the main map
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

// Serve the collection page
app.get('/collection', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'collection.html'));
});

// Function to fetch NFTs for a wallet using Helius API
async function fetchWalletNFTs(walletAddress) {
  try {
    if (!process.env.HELIUS_API_KEY) {
      return [];
    }
    
    const response = await fetch(process.env.HELIUS_API_KEY, {
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

// Load authentic governance power data
let governanceData = null;
try {
  governanceData = require('./data/native-governance-power.json');
} catch (error) {
  console.log('No governance data file found, will use database values');
}

// API endpoint for citizens data with NFT information
app.get('/api/citizens', async (req, res) => {
  try {
    if (!pool) {
      return res.json([]);
    }
    
    const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
    const citizens = result.rows;
    
    // Add NFT data and authentic governance power for each citizen
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
      
      // Add authentic governance power from JSON data
      let enhancedCitizen = {
        ...citizen,
        nfts: nftIds,
        nftMetadata: nftMetadata
      };
      
      if (governanceData && governanceData.citizens) {
        const governanceCitizen = governanceData.citizens.find(gc => gc.wallet === citizen.wallet);
        if (governanceCitizen) {
          enhancedCitizen.native_governance_power = governanceCitizen.totalPower;
          enhancedCitizen.locked_governance_power = governanceCitizen.lockedPower;
          enhancedCitizen.unlocked_governance_power = governanceCitizen.unlockedPower;
        }
      }
      
      return enhancedCitizen;
    }));
    
    res.json(citizensWithNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.json([]);
  }
});

// API endpoint to get all NFTs from all citizens for the collection page
app.get('/api/nfts', async (req, res) => {
  try {
    if (!pool) {
      return res.json([]);
    }
    
    const result = await pool.query('SELECT * FROM citizens WHERE wallet IS NOT NULL ORDER BY nickname');
    const citizens = result.rows;
    
    let allNfts = [];
    
    // Use existing NFT fetching logic from citizens endpoint
    for (const citizen of citizens) {
      try {
        const nfts = await fetchWalletNFTs(citizen.wallet);
        
        nfts.forEach(nft => {
          allNfts.push({
            id: nft.mint,
            name: nft.name,
            content: {
              metadata: {
                name: nft.name
              },
              links: {
                image: nft.image
              }
            },
            owner_wallet: citizen.wallet,
            owner_nickname: citizen.nickname || 'Unknown Citizen'
          });
        });
      } catch (error) {
        console.error(`Error fetching NFTs for ${citizen.nickname}:`, error);
      }
    }
    
    console.log(`Total NFTs found: ${allNfts.length}`);
    res.json(allNfts);
  } catch (error) {
    console.error('Database error:', error);
    res.json([]);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`IslandDAO Governance Platform running at http://localhost:${port}`);
});