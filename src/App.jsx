import React, { useState, useEffect } from 'react';
import MapView from './components/MapView';
import AddPinForm from './components/AddPinForm';
import './index.css';

function App() {
  const [citizens, setCitizens] = useState([]);
  const [nftOwners, setNftOwners] = useState({});
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  
  // Load citizens and NFT owners data on component mount
  useEffect(() => {
    // Fetch citizens data (pins)
    fetch('/citizens.json')
      .then(response => response.json())
      .then(data => {
        setCitizens(data);
      })
      .catch(error => {
        console.error('Error loading citizens data:', error);
        setCitizens([]);
      });
    
    // Fetch NFT owners data
    fetch('/nft-owners.json')
      .then(response => response.json())
      .then(data => {
        setNftOwners(data);
      })
      .catch(error => {
        console.error('Error loading NFT owners data:', error);
        setNftOwners({});
      });
  }, []);
  
  // Handler to start the pin creation process
  const handleAddPinClick = () => {
    setIsAddingPin(true);
  };
  
  // Handler when user clicks on map to select a location
  const handleMapClick = (latlng) => {
    if (isAddingPin) {
      setSelectedLocation(latlng);
    }
  };
  
  // Handler to cancel pin creation
  const handleCancelAddPin = () => {
    setIsAddingPin(false);
    setSelectedLocation(null);
  };
  
  // Handler to save a new pin
  const handleSavePin = (pinData) => {
    // Create a new citizen pin with timestamp
    const newPin = {
      location: [selectedLocation.lat, selectedLocation.lng],
      wallet: pinData.wallet,
      nfts: pinData.selectedNfts,
      socials: {
        x: pinData.twitter || '',
        telegram: pinData.telegram || '',
        discord: pinData.discord || ''
      },
      timestamp: new Date().toISOString()
    };
    
    // Update the citizens array with the new pin
    const updatedCitizens = [...citizens, newPin];
    setCitizens(updatedCitizens);
    
    // Save the updated data to the citizens.json file
    // In a real application, this would be a server call
    // For now, we'll just update our state
    console.log('New pin added:', newPin);
    
    // Reset the form state
    setIsAddingPin(false);
    setSelectedLocation(null);
  };
  
  return (
    <div className="app">
      <MapView 
        citizens={citizens} 
        onClick={handleMapClick} 
        isAddingPin={isAddingPin}
        selectedLocation={selectedLocation}
      />
      
      <div className="controls">
        <button 
          className="add-pin-btn" 
          onClick={handleAddPinClick}
          disabled={isAddingPin}
        >
          Drop Citizen Pin
        </button>
      </div>
      
      {isAddingPin && selectedLocation && (
        <AddPinForm 
          location={selectedLocation}
          nftOwners={nftOwners}
          onSubmit={handleSavePin}
          onCancel={handleCancelAddPin}
        />
      )}
    </div>
  );
}

export default App;