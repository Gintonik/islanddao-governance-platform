import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

function CitizenPinForm({ onSubmit, onCancel, nftOwners }) {
  const [wallet, setWallet] = useState('');
  const [ownedNfts, setOwnedNfts] = useState([]);
  const [selectedNfts, setSelectedNfts] = useState([]);
  const [primaryNft, setPrimaryNft] = useState(null);
  const [profileNft, setProfileNft] = useState(null);
  const [xHandle, setXHandle] = useState('');
  const [telegram, setTelegram] = useState('');
  const [discord, setDiscord] = useState('');
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [nftMetadata, setNftMetadata] = useState({});

  // Fetch NFT metadata
  useEffect(() => {
    async function fetchNftMetadata() {
      if (ownedNfts.length === 0) return;
      
      setIsLoading(true);
      
      try {
        // Fetch all NFT data from our collection grid
        const response = await fetch('/perks-collection.json');
        const collectionData = await response.json();
        
        if (!collectionData || collectionData.length === 0) {
          console.error('Error: Collection data is empty or undefined');
          setIsLoading(false);
          return;
        }
        
        console.log(`Found ${collectionData.length} NFTs in collection`);
        
        const metadataObj = {};
        
        // Filter the collection data to get only the NFTs owned by this wallet
        for (const nftId of ownedNfts) {
          // Find the NFT in the collection data
          const nft = collectionData.find(item => item.id === nftId);
          
          if (nft) {
            console.log(`Found NFT in collection: ${nft.name}`);
            // Use the exact data structure from the collection grid
            metadataObj[nftId] = {
              name: nft.name,
              image: nft.imageUrl,
              id: nft.id,
              owner: nft.owner
            };
          } else {
            console.warn(`NFT not found in collection: ${nftId}`);
          }
        }
        
        console.log(`Processed ${Object.keys(metadataObj).length} NFTs for metadata`);
        setNftMetadata(metadataObj);
      } catch (error) {
        console.error('Error fetching NFT metadata:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchNftMetadata();
  }, [ownedNfts]);

  // Handle wallet address change
  const handleWalletChange = (e) => {
    const address = e.target.value.trim();
    setWallet(address);
    
    // Clear previously selected NFTs when wallet changes
    setSelectedNfts([]);
    setOwnedNfts([]);
  };

  // Find NFTs owned by wallet
  const findOwnedNfts = () => {
    if (!wallet) {
      alert('Please enter a wallet address');
      return;
    }
    
    const owned = nftOwners[wallet] || [];
    setOwnedNfts(owned);
    
    if (owned.length === 0) {
      alert('No PERKS NFTs found for this wallet');
    } else {
      setStep(2);
    }
  };

  // Toggle NFT selection
  const toggleNftSelection = (nftId) => {
    if (selectedNfts.includes(nftId)) {
      setSelectedNfts(selectedNfts.filter(id => id !== nftId));
    } else {
      setSelectedNfts([...selectedNfts, nftId]);
    }
  };

  // Move to primary NFT selection step
  const proceedToPrimarySelection = () => {
    if (selectedNfts.length === 0) {
      alert('Please select at least one NFT');
      return;
    }
    
    // If only one NFT is selected, make it the primary automatically
    if (selectedNfts.length === 1) {
      setPrimaryNft(selectedNfts[0]);
    } else if (!primaryNft || !selectedNfts.includes(primaryNft)) {
      // Set the first selected NFT as the default primary if none is set
      setPrimaryNft(selectedNfts[0]);
    }
    
    setStep(3);
  };
  
  // Move to profile NFT selection step
  const proceedToProfileSelection = () => {
    if (!primaryNft) {
      alert('Please select a primary NFT');
      return;
    }
    
    // Initialize profile NFT to primary NFT if not set
    if (!profileNft) {
      setProfileNft(primaryNft);
    }
    
    setStep(4);
  };
  
  // Move to social info step
  const proceedToSocials = () => {
    if (!profileNft) {
      alert('Please select a profile image NFT');
      return;
    }
    
    setStep(5);
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    onSubmit({
      wallet,
      selectedNfts,
      primaryNft,
      pfp: profileNft, // Include the profile image NFT
      nftMetadata,
      xHandle: xHandle.startsWith('https://') ? xHandle : xHandle ? `https://x.com/${xHandle.replace('@', '')}` : '',
      telegram: telegram.startsWith('https://') ? telegram : telegram ? `https://t.me/${telegram.replace('@', '')}` : '',
      discord
    });
  };

  return (
    <FormOverlay>
      <FormContainer>
        <FormHeader>
          <h2>Drop a Citizen Pin</h2>
          <CloseButton onClick={onCancel}>×</CloseButton>
        </FormHeader>
        
        <FormContent>
          {step === 1 && (
            <div>
              <FormField>
                <label htmlFor="wallet">Solana Wallet Address</label>
                <input
                  type="text"
                  id="wallet"
                  value={wallet}
                  onChange={handleWalletChange}
                  placeholder="Enter your Solana wallet address"
                />
              </FormField>
              
              <ButtonGroup>
                <CancelButton onClick={onCancel}>Cancel</CancelButton>
                <SubmitButton onClick={findOwnedNfts}>Find My NFTs</SubmitButton>
              </ButtonGroup>
            </div>
          )}
          
          {step === 2 && (
            <div>
              <h3>Select NFTs to Showcase ({selectedNfts.length} selected)</h3>
              
              {isLoading ? (
                <LoadingMessage>Loading your NFTs...</LoadingMessage>
              ) : (
                <NFTSelectionGrid>
                  {ownedNfts.map((nftId) => (
                    <NFTCard
                      key={nftId}
                      selected={selectedNfts.includes(nftId)}
                      onClick={() => toggleNftSelection(nftId)}
                    >
                      <NFTImage 
                        src={nftMetadata[nftId]?.image || ''}
                        alt={nftMetadata[nftId]?.name || 'PERK NFT'}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/150?text=NFT+Image';
                        }}
                      />
                      <div className="selected-indicator" style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: selectedNfts.includes(nftId) ? '#9945FF' : 'transparent',
                        border: '2px solid #fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        display: selectedNfts.includes(nftId) ? 'block' : 'none'
                      }}></div>
                      <NFTName>
                        {nftMetadata[nftId]?.name || 'PERK NFT'}
                      </NFTName>
                      <NFTId>{nftId.substring(0, 6)}...{nftId.substring(nftId.length - 4)}</NFTId>
                      {nftMetadata[nftId]?.owner && (
                        <NFTOwner>Owner: {nftMetadata[nftId].owner.substring(0, 6)}...{nftMetadata[nftId].owner.substring(nftMetadata[nftId].owner.length - 4)}</NFTOwner>
                      )}
                    </NFTCard>
                  ))}
                </NFTSelectionGrid>
              )}
              
              <ButtonGroup>
                <BackButton onClick={() => setStep(1)}>Back</BackButton>
                <SubmitButton onClick={proceedToPrimarySelection}>Continue</SubmitButton>
              </ButtonGroup>
            </div>
          )}
          
          {step === 3 && (
            <div>
              <h3>Select Your Primary NFT</h3>
              <p>This NFT will be displayed as your icon on the map</p>
              
              {isLoading ? (
                <LoadingMessage>Loading your NFTs...</LoadingMessage>
              ) : (
                <NFTSelectionGrid>
                  {selectedNfts.map((nftId) => (
                    <NFTCard
                      key={nftId}
                      selected={primaryNft === nftId}
                      primary={primaryNft === nftId}
                      onClick={() => setPrimaryNft(nftId)}
                    >
                      <NFTImage 
                        src={nftMetadata[nftId]?.image || ''}
                        alt={nftMetadata[nftId]?.name || 'PERK NFT'}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/150?text=NFT+Image';
                        }}
                      />
                      <div className="primary-indicator" style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: primaryNft === nftId ? '#FF9945' : 'transparent',
                        border: '2px solid #fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        display: primaryNft === nftId ? 'flex' : 'none',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: 'white'
                      }}>★</div>
                      <NFTName>
                        {nftMetadata[nftId]?.name || 'PERK NFT'}
                      </NFTName>
                      <NFTId>{nftId.substring(0, 6)}...{nftId.substring(nftId.length - 4)}</NFTId>
                    </NFTCard>
                  ))}
                </NFTSelectionGrid>
              )}
              
              <ButtonGroup>
                <BackButton onClick={() => setStep(2)}>Back</BackButton>
                <SubmitButton onClick={proceedToProfileSelection}>Continue</SubmitButton>
              </ButtonGroup>
            </div>
          )}
          
          {step === 4 && (
            <div>
              <h3>Select Your Profile Image</h3>
              <p>This NFT will appear as your icon on the map</p>
              
              {isLoading ? (
                <LoadingMessage>Loading your NFTs...</LoadingMessage>
              ) : (
                <NFTSelectionGrid>
                  {selectedNfts.map((nftId) => (
                    <NFTCard
                      key={nftId}
                      selected={profileNft === nftId}
                      primary={profileNft === nftId}
                      onClick={() => setProfileNft(nftId)}
                    >
                      <NFTImage 
                        src={nftMetadata[nftId]?.image || ''}
                        alt={nftMetadata[nftId]?.name || 'PERK NFT'}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/150?text=NFT+Image';
                        }}
                      />
                      <div className="profile-indicator" style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: profileNft === nftId ? '#45C0FF' : 'transparent',
                        border: '2px solid #fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        display: profileNft === nftId ? 'flex' : 'none',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: 'white'
                      }}>👤</div>
                      <NFTName>
                        {nftMetadata[nftId]?.name || 'PERK NFT'}
                      </NFTName>
                      <NFTId>{nftId.substring(0, 6)}...{nftId.substring(nftId.length - 4)}</NFTId>
                    </NFTCard>
                  ))}
                </NFTSelectionGrid>
              )}
              
              <ButtonGroup>
                <BackButton onClick={() => setStep(3)}>Back</BackButton>
                <SubmitButton onClick={proceedToSocials}>Continue</SubmitButton>
              </ButtonGroup>
            </div>
          )}
          
          {step === 5 && (
            <form onSubmit={handleSubmit}>
              <h3>Add Social Links (Optional)</h3>
              
              <FormField>
                <label htmlFor="x-handle">X (Twitter) Handle</label>
                <input
                  type="text"
                  id="x-handle"
                  value={xHandle}
                  onChange={(e) => setXHandle(e.target.value)}
                  placeholder="@username or full URL"
                />
              </FormField>
              
              <FormField>
                <label htmlFor="telegram">Telegram</label>
                <input
                  type="text"
                  id="telegram"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username or full URL"
                />
              </FormField>
              
              <FormField>
                <label htmlFor="discord">Discord</label>
                <input
                  type="text"
                  id="discord"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                  placeholder="username#1234"
                />
              </FormField>
              
              <ButtonGroup>
                <BackButton onClick={() => setStep(2)}>Back</BackButton>
                <SubmitButton type="submit">Drop Pin</SubmitButton>
              </ButtonGroup>
            </form>
          )}
        </FormContent>
      </FormContainer>
    </FormOverlay>
  );
}

// Styled components
const FormOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const FormContainer = styled.div`
  background-color: #1a1a1a;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
`;

const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #333;
  
  h2 {
    margin: 0;
    color: white;
    font-size: 20px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #aaa;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  
  &:hover {
    color: white;
  }
`;

const FormContent = styled.div`
  padding: 20px;
  color: white;
  
  h3 {
    margin-top: 0;
    margin-bottom: 15px;
  }
`;

const FormField = styled.div`
  margin-bottom: 15px;
  
  label {
    display: block;
    margin-bottom: 5px;
    font-size: 14px;
    color: #ccc;
  }
  
  input {
    width: 100%;
    padding: 10px;
    border: 1px solid #444;
    border-radius: 4px;
    background-color: #222;
    color: white;
    font-size: 16px;
    
    &:focus {
      outline: none;
      border-color: #9945FF;
    }
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`;

const Button = styled.button`
  padding: 10px 15px;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s ease;
`;

const SubmitButton = styled(Button)`
  background-color: #9945FF;
  color: white;
  border: none;
  
  &:hover {
    background-color: #8134E0;
  }
`;

const CancelButton = styled(Button)`
  background-color: transparent;
  color: #ccc;
  border: 1px solid #444;
  
  &:hover {
    background-color: #333;
    color: white;
  }
`;

const BackButton = styled(Button)`
  background-color: #333;
  color: white;
  border: none;
  
  &:hover {
    background-color: #444;
  }
`;

const NFTSelectionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 10px;
`;

const NFTCard = styled.div`
  border: 2px solid ${props => props.selected ? '#9945FF' : '#333'};
  border-radius: 8px;
  overflow: hidden;
  background-color: #222;
  cursor: pointer;
  transition: transform 0.2s;
  position: relative;
  
  &:hover {
    transform: translateY(-3px);
  }
`;

const NFTImage = styled.img`
  width: 100%;
  height: 150px;
  object-fit: cover;
  display: block;
`;

const NFTName = styled.div`
  padding: 8px;
  font-weight: bold;
  font-size: 14px;
`;

const NFTId = styled.div`
  padding: 0 8px 4px 8px;
  font-size: 12px;
  color: #aaa;
`;

const NFTOwner = styled.div`
  padding: 0 8px 8px 8px;
  font-size: 11px;
  color: #998;
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: #ccc;
`;

export default CitizenPinForm;