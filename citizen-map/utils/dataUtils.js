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
 * Gets NFT metadata from the Helius API
 * @param {string} nftId - The NFT mint ID
 * @returns {Promise<Object>} - NFT metadata
 */
export async function getNftMetadata(nftId) {
  try {
    // In a real app, we would make a request to Helius API
    // For the demo, we'll return mock data
    // This would be replaced with actual API calls
    
    // This function would be implemented with a real API call in production
    return {
      name: `PERK #${Math.floor(Math.random() * 3333) + 1}`,
      image: `https://gateway.irys.xyz/${nftId}`
    };
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return null;
  }
}