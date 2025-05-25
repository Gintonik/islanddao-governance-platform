/**
 * Direct Database Integration for Citizen Map
 * 
 * This script provides a completely new implementation for the wallet NFT selection
 * process, querying the database directly for accurate NFT data.
 */

// Initialize form state when the page loads
document.addEventListener('DOMContentLoaded', () => {
  setupWalletForm();
});

// Setup wallet form with direct database integration
function setupWalletForm() {
  const walletInput = document.getElementById('wallet-address');
  const checkWalletButton = document.getElementById('check-wallet');
  
  if (checkWalletButton) {
    checkWalletButton.addEventListener('click', async () => {
      const walletAddress = walletInput.value.trim();
      
      if (!walletAddress) {
        alert('Please enter a wallet address first');
        return;
      }
      
      await fetchWalletNftsFromDatabase(walletAddress);
    });
  }
}

// Fetch NFTs directly from database via API
async function fetchWalletNftsFromDatabase(walletAddress) {
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-3').style.display = 'none';
  document.getElementById('loading-message').style.display = 'block';
  
  try {
    // Call our direct database API endpoint
    const response = await fetch(`/api/wallet-nfts?wallet=${walletAddress}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Error fetching NFTs');
    }
    
    if (!data.success || !data.nfts || data.nfts.length === 0) {
      alert('No NFTs found for this wallet address');
      document.getElementById('step-2').style.display = 'block';
      document.getElementById('loading-message').style.display = 'none';
      return;
    }
    
    console.log(`Found ${data.nfts.length} NFTs for wallet ${walletAddress}`);
    
    // Clear previous NFT selection
    selectedNFTs = [];
    
    // Display NFTs in selection UI
    displayWalletNfts(data.nfts);
    
    // Move to step 3
    document.getElementById('step-2').style.display = 'none';
    document.getElementById('step-3').style.display = 'block';
    document.getElementById('loading-message').style.display = 'none';
    document.getElementById('prev-step').style.display = 'block';
    currentStep = 3;
  } catch (error) {
    console.error('Error fetching wallet NFTs:', error);
    alert(`Error fetching NFTs: ${error.message}`);
    document.getElementById('step-2').style.display = 'block';
    document.getElementById('loading-message').style.display = 'none';
  }
}

// Display wallet NFTs in selection UI
function displayWalletNfts(nfts) {
  const nftSelection = document.getElementById('nft-selection');
  nftSelection.innerHTML = '';
  
  nfts.forEach(nft => {
    const item = document.createElement('div');
    item.className = 'nft-select-item';
    
    // Create checkbox for selection
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'nft-select-checkbox';
    checkbox.dataset.nftId = nft.id;
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        selectedNFTs.push(nft.id);
      } else {
        selectedNFTs = selectedNFTs.filter(id => id !== nft.id);
      }
    });
    
    // Create primary NFT radio button
    const radioWrap = document.createElement('div');
    radioWrap.className = 'primary-selector';
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'primary-nft';
    radio.className = 'primary-radio';
    radio.dataset.nftId = nft.id;
    radio.addEventListener('change', function() {
      if (this.checked) {
        primaryNft = nft.id;
      }
    });
    
    const radioLabel = document.createElement('label');
    radioLabel.textContent = 'Primary';
    
    radioWrap.appendChild(radio);
    radioWrap.appendChild(radioLabel);
    
    // Add NFT image and information
    const imageWrap = document.createElement('div');
    imageWrap.className = 'nft-image-wrap';
    
    const image = document.createElement('img');
    image.className = 'nft-select-image';
    image.src = nft.image;
    image.alt = nft.name;
    image.onerror = function() {
      this.src = 'https://via.placeholder.com/50?text=NFT';
    };
    
    imageWrap.appendChild(image);
    
    const infoWrap = document.createElement('div');
    infoWrap.className = 'nft-select-info';
    
    const nameElem = document.createElement('div');
    nameElem.className = 'nft-select-name';
    nameElem.textContent = nft.name;
    
    const idElem = document.createElement('div');
    idElem.className = 'nft-select-id';
    idElem.textContent = `${nft.id.substring(0, 8)}...${nft.id.substring(nft.id.length - 8)}`;
    
    infoWrap.appendChild(nameElem);
    infoWrap.appendChild(idElem);
    
    // Add all elements to item
    item.appendChild(checkbox);
    item.appendChild(imageWrap);
    item.appendChild(infoWrap);
    item.appendChild(radioWrap);
    
    // Add item to selection container
    nftSelection.appendChild(item);
  });
}