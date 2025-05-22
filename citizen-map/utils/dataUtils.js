// Utility functions for loading and saving citizen data

/**
 * Loads citizen data from the citizens.json file
 * @returns {Promise<Array>} - Array of citizen objects
 */
export async function loadCitizens() {
  try {
    const response = await fetch('/citizens.json');
    if (!response.ok) {
      throw new Error(`Failed to load citizens data: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading citizens data:', error);
    return [];
  }
}

/**
 * Saves a new citizen to the citizens.json file
 * @param {Object} citizenData - The citizen data to save
 * @returns {Promise<void>}
 */
export async function saveCitizen(citizenData) {
  try {
    // First load existing citizens
    const citizens = await loadCitizens();
    
    // Check if this wallet + NFT combination already exists
    const isDuplicate = citizens.some(citizen => 
      citizen.wallet === citizenData.wallet && 
      citizen.nfts.some(nft => citizenData.nfts.includes(nft))
    );
    
    if (isDuplicate) {
      throw new Error('This wallet has already pinned one or more of these NFTs');
    }
    
    // Add the new citizen
    citizens.push(citizenData);
    
    // In a real application, we would send this to a server endpoint
    // For this demo, we'll use a simulated approach
    
    // This would be a server endpoint in a real app
    const response = await fetch('/api/save-citizen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(citizenData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save citizen data: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving citizen data:', error);
    throw error;
  }
}

/**
 * Loads NFT ownership data from the nft-owners.json file
 * @returns {Promise<Object>} - Mapping of wallet addresses to owned NFT IDs
 */
export async function loadNftOwners() {
  try {
    const response = await fetch('/nft-owners.json');
    if (!response.ok) {
      throw new Error(`Failed to load NFT ownership data: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading NFT ownership data:', error);
    return {};
  }
}

/**
 * Gets NFT metadata from the collection data
 * @param {string} nftId - The NFT mint ID
 * @returns {Promise<Object>} - NFT metadata
 */
export async function getNftMetadata(nftId) {
  try {
    // Fetch the NFT data from our perks-collection.json
    const response = await fetch('/perks-collection.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch collection data: ${response.status}`);
    }
    
    const collectionData = await response.json();
    
    // Find the specific NFT in the collection
    const nft = collectionData.find(item => item.id === nftId);
    
    if (!nft) {
      console.warn(`NFT not found in collection: ${nftId}`);
      return null;
    }
    
    // Return the actual NFT data from the collection
    return {
      name: nft.name,
      image: nft.imageUrl,
      id: nft.id,
      owner: nft.owner
    };
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return null;
  }
}

/**
 * Clears all citizen pins from the map
 * @returns {Promise<boolean>} - Success status
 */
export async function clearAllCitizens() {
  try {
    const response = await fetch('/api/clear-citizens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to clear citizen data: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing citizen data:', error);
    throw error;
  }
}