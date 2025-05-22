import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import CitizenPinForm from './components/CitizenPinForm.js';
import { loadCitizens, saveCitizen, clearAllCitizens } from './utils/dataUtils.js';

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom marker icon
const citizenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Location picker component
function LocationPicker({ onLocationSelect, setIsPickingLocation }) {
  const map = useMapEvents({
    click: (e) => {
      onLocationSelect([e.latlng.lat, e.latlng.lng]);
      setIsPickingLocation(false);
      map.off('click');
    }
  });
  
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
    const newCitizen = {
      location: selectedLocation,
      wallet: formData.wallet,
      nfts: formData.selectedNfts,
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
    <AppContainer>
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
          <AddPinButton onClick={startAddingPin} disabled={isAddingPin}>
            Drop a Citizen Pin
          </AddPinButton>
        </ButtonGroup>
      </Header>
      
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
        {citizens.map((citizen, index) => (
          <Marker 
            key={index} 
            position={citizen.location}
            icon={citizenIcon}
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
                
                {/* Show NFT images */}
                <NFTGrid>
                  {citizen.nfts.map((nftId, nftIndex) => (
                    <NFTImage 
                      key={nftIndex} 
                      src={`https://gateway.irys.xyz/${nftId}`} 
                      alt="NFT"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/150?text=NFT+Image';
                      }}
                    />
                  ))}
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
      
      {isPickingLocation && (
        <PickLocationMessage>
          Click on the map to select a location for your citizen pin
        </PickLocationMessage>
      )}
    </AppContainer>
  );
}

// Styled components
const AppContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
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

const PickLocationMessage = styled.div`
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px 20px;
  border-radius: 4px;
  z-index: 1000;
  pointer-events: none;
`;

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

const NFTImage = styled.img`
  width: 100%;
  height: auto;
  border-radius: 4px;
  object-fit: cover;
`;

export default App;