import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import CitizenPinForm from './components/CitizenPinForm.js';
import GlobeView from './components/GlobeView.js';
import { loadCitizens, saveCitizen, clearAllCitizens } from './utils/dataUtils.js';

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
    setIsPickingLocation(false);
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
      message: formData.message || '',
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
        <Title>PERKS Citizen Globe</Title>
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
            title={isAddingPin ? "Currently placing a pin" : "Click to place a pin on the globe"}
          >
            Drop a Citizen Pin
          </AddPinButton>
        </ButtonGroup>
      </Header>
      
      {/* 3D Globe View */}
      <GlobeView 
        citizens={citizens}
        onLocationSelect={handleLocationSelect}
        isPickingLocation={isPickingLocation}
      />
      
      {/* Citizen pin form */}
      {isAddingPin && selectedLocation && (
        <CitizenPinForm
          onSubmit={handleFormSubmit}
          onCancel={cancelAddingPin}
          nftOwners={nftOwners}
        />
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
  
  &.picking-location {
    cursor: crosshair;
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
  z-index: 10;
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

export default App;