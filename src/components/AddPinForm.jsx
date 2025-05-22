import React, { useState, useEffect } from 'react';

const AddPinForm = ({ location, nftOwners, onSubmit, onCancel }) => {
  const [wallet, setWallet] = useState('');
  const [ownedNfts, setOwnedNfts] = useState([]);
  const [selectedNfts, setSelectedNfts] = useState([]);
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [discord, setDiscord] = useState('');
  const [formStep, setFormStep] = useState(1);
  const [nftMetadata, setNftMetadata] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // When wallet changes, look up owned NFTs
  useEffect(() => {
    if (wallet && nftOwners[wallet]) {
      setOwnedNfts(nftOwners[wallet]);
      // Reset selected NFTs when wallet changes
      setSelectedNfts([]);
      loadNftMetadata(nftOwners[wallet]);
    } else {
      setOwnedNfts([]);
      setNftMetadata({});
    }
  }, [wallet, nftOwners]);

  // Function to load metadata for NFTs
  const loadNftMetadata = async (nftIds) => {
    setIsLoading(true);
    try {
      // In a real app, we would fetch this from the Helius API
      // For now, we're simulating loading NFT metadata
      const metadata = {};
      
      for (const nftId of nftIds) {
        // Simulate API call to get NFT metadata
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate network delay
        
        // For demo purposes, create some fake metadata
        const nftNumber = nftId.substring(0, 4);
        metadata[nftId] = {
          name: `PERK #${nftNumber}`,
          image: `https://via.placeholder.com/150/0066FF/FFFFFF/?text=PERK+${nftNumber}`
        };
      }
      
      setNftMetadata(metadata);
    } catch (error) {
      console.error('Error loading NFT metadata:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle NFT selection/deselection
  const handleNftClick = (nftId) => {
    if (selectedNfts.includes(nftId)) {
      setSelectedNfts(selectedNfts.filter(id => id !== nftId));
    } else {
      setSelectedNfts([...selectedNfts, nftId]);
    }
  };

  // Go to next step in the form
  const handleNextStep = () => {
    if (formStep === 1 && wallet) {
      setFormStep(2);
    } else if (formStep === 2 && selectedNfts.length > 0) {
      setFormStep(3);
    }
  };

  // Go back to previous step
  const handlePrevStep = () => {
    if (formStep > 1) {
      setFormStep(formStep - 1);
    }
  };

  // Submit the form
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (selectedNfts.length === 0) {
      alert('Please select at least one NFT');
      return;
    }
    
    onSubmit({
      wallet,
      selectedNfts,
      twitter,
      telegram,
      discord
    });
  };

  return (
    <div className="form-container">
      <h2 className="form-title">
        {formStep === 1 && 'Step 1: Enter Solana Wallet Address'}
        {formStep === 2 && 'Step 2: Select Your NFTs'}
        {formStep === 3 && 'Step 3: Add Social Links (Optional)'}
      </h2>
      
      <form onSubmit={handleSubmit}>
        {/* Step 1: Wallet Address */}
        {formStep === 1 && (
          <div className="form-group">
            <label className="form-label">Solana Wallet Address:</label>
            <input
              type="text"
              className="form-input"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="Enter your Solana wallet address"
              required
            />
            <div className="form-info" style={{ fontSize: '0.8em', marginTop: '5px', color: '#aaa' }}>
              Selected Location: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </div>
          </div>
        )}
        
        {/* Step 2: NFT Selection */}
        {formStep === 2 && (
          <div className="form-group">
            <label className="form-label">Select NFTs to showcase:</label>
            
            {isLoading && <div>Loading your NFTs...</div>}
            
            {!isLoading && ownedNfts.length === 0 && (
              <div className="no-nfts">
                No PERKS NFTs found for this wallet address.
              </div>
            )}
            
            {!isLoading && ownedNfts.length > 0 && (
              <div className="nft-grid">
                {ownedNfts.map(nftId => (
                  <div
                    key={nftId}
                    className={`nft-item ${selectedNfts.includes(nftId) ? 'selected' : ''}`}
                    onClick={() => handleNftClick(nftId)}
                  >
                    <img
                      src={nftMetadata[nftId]?.image || `https://via.placeholder.com/150/cccccc/666666/?text=Loading...`}
                      alt={nftMetadata[nftId]?.name || 'Loading...'}
                      className="nft-image"
                    />
                    <div className="nft-name">
                      {nftMetadata[nftId]?.name || nftId.substring(0, 6) + '...'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Step 3: Social Links */}
        {formStep === 3 && (
          <>
            <div className="form-group">
              <label className="form-label">Twitter/X Username:</label>
              <input
                type="text"
                className="form-input"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="Twitter/X username (without @)"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Telegram Username:</label>
              <input
                type="text"
                className="form-input"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="Telegram username"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Discord Username:</label>
              <input
                type="text"
                className="form-input"
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                placeholder="Discord username"
              />
            </div>
          </>
        )}
        
        <div className="form-actions">
          <button 
            type="button" 
            className="form-btn cancel-btn" 
            onClick={formStep === 1 ? onCancel : handlePrevStep}
          >
            {formStep === 1 ? 'Cancel' : 'Back'}
          </button>
          
          {formStep < 3 ? (
            <button 
              type="button" 
              className="form-btn submit-btn" 
              onClick={handleNextStep}
              disabled={
                (formStep === 1 && !wallet) || 
                (formStep === 2 && selectedNfts.length === 0)
              }
            >
              Next
            </button>
          ) : (
            <button 
              type="submit" 
              className="form-btn submit-btn"
            >
              Save Citizen Pin
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AddPinForm;