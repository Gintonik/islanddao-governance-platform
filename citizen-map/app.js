import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import CitizenPinForm from './components/CitizenPinForm.js';
import GlobeView from './components/GlobeView.js';
import { loadCitizens, saveCitizen, clearAllCitizens } from './utils/dataUtils.js';

// Globe view handles the marker icons internally

// Location picker component
function LocationPicker({ onLocationSelect, setIsPickingLocation }) {
  const map = useMapEvents({
    click: (e) => {
      onLocationSelect([e.latlng.lat, e.latlng.lng]);
      setIsPickingLocation(false);
      // Remove custom cursor class when done
      document.body.classList.remove('picking-location');
      map.off('click');
    }
  });
  
  // Add a custom cursor class when component mounts
  useEffect(() => {
    document.body.classList.add('picking-location');
    
    return () => {
      // Clean up by removing the class when component unmounts
      document.body.classList.remove('picking-location');
    };
  }, []);
  
  return null;
}

function App() {
  const [citizens, setCitizens] = useState([]);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [nftOwners, setNftOwners] = useState({});
  
  // Load citizens and NFT ownership data on component mount
  useEffect(() => {
    async function loadData() {
      try {
        // Load citizens data
        const citizensData = await loadCitizens();
        setCitizens(citizensData || []);
        
        // Load NFT owners data
        const response = await fetch('/nft-owners.json');
        const ownersData = await response.json();
        setNftOwners(ownersData);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    }
    
    loadData();
  }, []);
  
  // Handle location selection
  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };
  
  // Handle form submission
  const handleFormSubmit = async (formData) => {
    // Use the NFT metadata provided by the form (already fetched from collection data)
    // This ensures we're using real NFT data from our collection
    const newCitizen = {
      location: selectedLocation,
      wallet: formData.wallet,
      nfts: formData.selectedNfts,
      primaryNft: formData.primaryNft,
      pfp: formData.pfp, // Include the profile image NFT
      nftMetadata: formData.nftMetadata,
      socials: {
        x: formData.xHandle,
        telegram: formData.telegram,
        discord: formData.discord
      },
      timestamp: new Date().toISOString()
    };
    
    try {
      await saveCitizen(newCitizen);
      setCitizens([...citizens, newCitizen]);
      setIsAddingPin(false);
      setSelectedLocation(null);
    } catch (error) {
      console.error('Error saving citizen:', error);
      alert('Failed to save citizen data. Please try again.');
    }
  };
  
  // Start pin creation process
  const startAddingPin = () => {
    setIsAddingPin(true);
    setIsPickingLocation(true);
  };
  
  // Cancel pin creation
  const cancelAddingPin = () => {
    setIsAddingPin(false);
    setIsPickingLocation(false);
    setSelectedLocation(null);
  };
  
  return (
    <AppContainer className={isPickingLocation ? 'picking-location' : ''}>
      <Header>
        <Title>PERKS Citizen Map</Title>
        <ButtonGroup>
          <ClearPinsButton 
            onClick={async () => {
              if (window.confirm('Are you sure you want to clear all citizen pins?')) {
                try {
                  await clearAllCitizens();
                  setCitizens([]);
                } catch (error) {
                  console.error('Error clearing pins:', error);
                  alert('Failed to clear pins. Please try again.');
                }
              }
            }} 
            disabled={citizens.length === 0 || isAddingPin}
          >
            Clear All Pins
          </ClearPinsButton>
          <AddPinButton 
            onClick={startAddingPin} 
            disabled={isAddingPin}
            title={isAddingPin ? "Currently placing a pin" : "Click to place a pin on the map"}
          >
            Drop a Citizen Pin
          </AddPinButton>
        </ButtonGroup>
      </Header>
      
      {/* Global styles are added through styled-components */}
      
      <MapContainer
        center={[20, 0]}
        zoom={3}
        style={{ height: 'calc(100vh - 60px)', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Display existing citizen pins */}
        {citizens.map((citizen, index) => {
          // Determine which icon to use - custom NFT icon or default
          // First check profile image NFT, then fallback to primary NFT
          const profileNftId = citizen.pfp || citizen.primaryNft;
          const hasNftIcon = profileNftId && 
                            citizen.nftMetadata && 
                            citizen.nftMetadata[profileNftId] && 
                            citizen.nftMetadata[profileNftId].image;
          
          // Use real NFT data from the collection
          const markerIcon = hasNftIcon 
            ? createNftIcon(citizen.nftMetadata[profileNftId].image)
            : defaultCitizenIcon;
            
          return (
            <Marker 
              key={index} 
              position={citizen.location}
              icon={markerIcon}
            >
            <Popup>
              <PopupContent>
                <h3>{citizen.nfts.length > 0 ? `PERK NFTs (${citizen.nfts.length})` : 'Citizen'}</h3>
                <p>Wallet: {citizen.wallet.substring(0, 6)}...{citizen.wallet.substring(citizen.wallet.length - 4)}</p>
                
                {/* Social links */}
                <SocialLinks>
                  {citizen.socials.x && (
                    <SocialLink href={citizen.socials.x} target="_blank" rel="noopener noreferrer">
                      X
                    </SocialLink>
                  )}
                  {citizen.socials.telegram && (
                    <SocialLink href={citizen.socials.telegram} target="_blank" rel="noopener noreferrer">
                      Telegram
                    </SocialLink>
                  )}
                  {citizen.socials.discord && (
                    <SocialLink>Discord: {citizen.socials.discord}</SocialLink>
                  )}
                </SocialLinks>
                
                {/* Show NFT images with names */}
                <NFTGrid>
                  {citizen.nfts.map((nftId, nftIndex) => {
                    const metadata = citizen.nftMetadata && citizen.nftMetadata[nftId];
                    return (
                      <NFTItem key={nftIndex}>
                        <NFTImage 
                          src={metadata ? metadata.image : ''}
                          alt={metadata ? metadata.name : 'PERK NFT'}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://via.placeholder.com/150?text=NFT+Image';
                          }}
                        />
                        <NFTLabel>{metadata ? metadata.name : `PERK NFT #${nftIndex+1}`}</NFTLabel>
                      </NFTItem>
                    );
                  })}
                </NFTGrid>
                
                <small>Added: {new Date(citizen.timestamp).toLocaleString()}</small>
              </PopupContent>
            </Popup>
          </Marker>
        ))}
        
        {/* Location picker */}
        {isPickingLocation && (
          <LocationPicker 
            onLocationSelect={handleLocationSelect} 
            setIsPickingLocation={setIsPickingLocation}
          />
        )}
      </MapContainer>
      
      {/* Citizen pin form */}
      {isAddingPin && selectedLocation && (
        <CitizenPinForm
          onSubmit={handleFormSubmit}
          onCancel={cancelAddingPin}
          nftOwners={nftOwners}
        />
      )}
      
      {/* Remove pop-up message and use cursor styling instead */}
    </AppContainer>
  );
}

// Styled components
const AppContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  
  &.picking-location {
    cursor: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAFEmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDIgNzkuMTYwOTI0LCAyMDE3LzA3LzEzLTAxOjA2OjM5ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ0MgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNC0wNS0yMlQxMjowMDowMFoiIHhtcDpNb2RpZnlEYXRlPSIyMDI0LTA1LTIyVDEyOjAwOjAwWiIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNC0wNS0yMlQxMjowMDowMFoiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiBwaG90b3Nob3A6SUNDUHJvZmlsZT0ic1JHQiBJRUM2MTk2Ni0yLjEiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6MWI4YjI0M2YtZGFhMy00ZDQxLWJlZGEtYjEyMDVhOTgz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'), auto !important;
  }
`;

const Header = styled.header`
  background-color: #1a1a1a;
  color: white;
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: bold;
  margin: 0;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const AddPinButton = styled.button`
  background-color: #9945FF;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: #8134E0;
  }
  
  &:disabled {
    background-color: #666;
    cursor: not-allowed;
  }
`;

const ClearPinsButton = styled.button`
  background-color: #444;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: #d32f2f;
  }
  
  &:disabled {
    background-color: #666;
    cursor: not-allowed;
  }
`;

// Removed the pick location message popup as requested

const PopupContent = styled.div`
  max-width: 250px;
  
  h3 {
    margin-top: 0;
    margin-bottom: 8px;
  }
  
  p {
    margin-bottom: 8px;
  }
  
  small {
    display: block;
    margin-top: 8px;
    color: #666;
  }
`;

const SocialLinks = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
`;

const SocialLink = styled.a`
  color: #9945FF;
  text-decoration: none;
  font-size: 14px;
  
  &:hover {
    text-decoration: underline;
  }
`;

const NFTGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
`;

const NFTItem = styled.div`
  border-radius: 4px;
  overflow: hidden;
  background-color: #222;
`;

const NFTImage = styled.img`
  width: 100%;
  height: auto;
  border-radius: 4px 4px 0 0;
  object-fit: cover;
  display: block;
`;

const NFTLabel = styled.div`
  font-size: 12px;
  padding: 4px 6px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background-color: #333;
`;

export default App;