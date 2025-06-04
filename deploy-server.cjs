const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5000;

// Database connection with fallback
let pool;
try {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
} catch (error) {
  console.error('Database connection error:', error);
}

// Load governance data
let governanceData = {};
try {
  const governanceFile = path.join(__dirname, 'data', 'native-governance-power.json');
  if (fs.existsSync(governanceFile)) {
    governanceData = JSON.parse(fs.readFileSync(governanceFile, 'utf8'));
    console.log('Loaded governance data with', governanceData.citizens?.length || 0, 'citizens');
  }
} catch (error) {
  console.log('Could not load governance data:', error.message);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'citizen-map')));

// Main routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'verified-citizen-map.html'));
});

app.get('/collection', (req, res) => {
  res.sendFile(path.join(__dirname, 'citizen-map', 'collection.html'));
});

// Function to fetch NFTs for a wallet
async function fetchWalletNFTs(walletAddress) {
  try {
    if (!process.env.HELIUS_API_KEY) {
      return [];
    }
    
    const response = await fetch(process.env.HELIUS_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    
    if (data.result?.items) {
      const perksNfts = data.result.items.filter(nft => {
        return nft.grouping?.some(group => 
          group.group_key === 'collection' && 
          group.group_value === '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8'
        );
      });

      return perksNfts.map(nft => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || 'PERKS NFT',
        image: (nft.content?.files?.[0]?.uri || nft.content?.json_uri || '')
          .replace('https://gateway.irys.xyz/', 'https://uploader.irys.xyz/'),
        collection: 'PERKS'
      }));
    }
    return [];
  } catch (error) {
    console.error(`Error fetching NFTs for ${walletAddress}:`, error);
    return [];
  }
}

// Citizens API endpoint
app.get('/api/citizens', async (req, res) => {
  try {
    let citizens = [];
    
    if (pool) {
      const result = await pool.query('SELECT * FROM citizens ORDER BY native_governance_power DESC NULLS LAST');
      citizens = result.rows;
    }
    
    // Enhanced citizens with NFT and governance data
    const enhancedCitizens = await Promise.all(citizens.map(async (citizen) => {
      // Fetch NFTs
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
      
      // Apply governance data from JSON
      let enhancedCitizen = {
        ...citizen,
        nfts: nftIds,
        nftMetadata: nftMetadata
      };
      
      if (governanceData.citizens) {
        const govCitizen = governanceData.citizens.find(gc => gc.wallet === citizen.wallet);
        if (govCitizen) {
          enhancedCitizen.native_governance_power = govCitizen.totalPower;
          enhancedCitizen.locked_governance_power = govCitizen.lockedPower;
          enhancedCitizen.unlocked_governance_power = govCitizen.unlockedPower;
        }
      }
      
      return enhancedCitizen;
    }));
    
    res.json(enhancedCitizens);
  } catch (error) {
    console.error('Citizens API error:', error);
    res.json([]);
  }
});

// NFTs API endpoint for collection page
app.get('/api/nfts', async (req, res) => {
  try {
    let allNfts = [];
    
    if (pool) {
      const result = await pool.query('SELECT * FROM citizens WHERE wallet IS NOT NULL ORDER BY nickname');
      const citizens = result.rows;
      
      for (const citizen of citizens) {
        try {
          const nfts = await fetchWalletNFTs(citizen.wallet);
          
          nfts.forEach(nft => {
            allNfts.push({
              id: nft.mint,
              name: nft.name,
              content: {
                metadata: { name: nft.name },
                links: { image: nft.image }
              },
              owner_wallet: citizen.wallet,
              owner_nickname: citizen.nickname || 'Unknown Citizen'
            });
          });
        } catch (error) {
          console.error(`Error fetching NFTs for ${citizen.nickname}:`, error);
        }
      }
    }
    
    console.log(`Total NFTs found: ${allNfts.length}`);
    res.json(allNfts);
  } catch (error) {
    console.error('NFTs API error:', error);
    res.json([]);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`IslandDAO Governance Platform running on port ${port}`);
  console.log(`Database: ${pool ? 'Connected' : 'Not available'}`);
  console.log(`Governance data: ${governanceData.citizens?.length || 0} citizens loaded`);
});