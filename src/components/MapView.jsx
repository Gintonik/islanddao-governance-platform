import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for Leaflet default marker icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom NFT marker icon
const nftIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Component to handle map events like clicks
function MapEventHandler({ onClick, isAddingPin }) {
  const map = useMapEvents({
    click: (e) => {
      if (isAddingPin) {
        onClick(e.latlng);
      }
    }
  });
  
  return null;
}

// Component for each pin popup
function PinPopup({ citizen }) {
  const [nftData, setNftData] = useState(null);
  
  // We'll fetch the NFT data for the first NFT in the citizen's list
  useEffect(() => {
    if (citizen.nfts && citizen.nfts.length > 0) {
      // In a real app, you would fetch this data from an API
      // For now, let's simulate loading the NFT data
      const nftId = citizen.nfts[0];
      const dummyNftData = {
        id: nftId,
        name: 'PERK #' + nftId.substring(0, 4),
        image: `https://via.placeholder.com/150/0066FF/FFFFFF/?text=PERK+${nftId.substring(0, 4)}`
      };
      setNftData(dummyNftData);
    }
  }, [citizen.nfts]);
  
  if (!nftData) {
    return <div>Loading NFT data...</div>;
  }
  
  return (
    <div className="pin-popup">
      <img 
        src={nftData.image} 
        alt={nftData.name} 
        className="pin-image" 
      />
      <div className="pin-name">{nftData.name}</div>
      <div className="pin-wallet">
        {citizen.wallet.substring(0, 5)}...{citizen.wallet.substring(citizen.wallet.length - 5)}
      </div>
      <div className="pin-socials">
        {citizen.socials.x && (
          <a href={`https://x.com/${citizen.socials.x}`} className="social-link" target="_blank" rel="noopener noreferrer">X</a>
        )}
        {citizen.socials.telegram && (
          <a href={`https://t.me/${citizen.socials.telegram}`} className="social-link" target="_blank" rel="noopener noreferrer">Telegram</a>
        )}
        {citizen.socials.discord && (
          <a href="#" className="social-link">{citizen.socials.discord}</a>
        )}
      </div>
    </div>
  );
}

// Main MapView component
function MapView({ citizens, onClick, isAddingPin, selectedLocation }) {
  const defaultCenter = [40, 0]; // Default center of the map (geographical center)
  const defaultZoom = 2;

  // For real NFT data, we would fetch from a Helius DAS API endpoint
  const fetchNftMetadata = async (nftId) => {
    // This would be a real fetch call in production
    return {
      id: nftId,
      name: `PERK #${nftId.substring(0, 5)}`,
      image: `https://via.placeholder.com/150/0066FF/FFFFFF/?text=PERK+${nftId.substring(0, 5)}`
    };
  };

  return (
    <div className="map-container">
      <MapContainer 
        center={defaultCenter} 
        zoom={defaultZoom} 
        scrollWheelZoom={true}
        style={{ height: '100vh', width: '100%' }}
      >
        {/* Dark theme map tiles */}
        <TileLayer
          attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        />
        
        {/* Event handler for map clicks */}
        <MapEventHandler onClick={onClick} isAddingPin={isAddingPin} />
        
        {/* Display all existing citizen pins */}
        {citizens.map((citizen, idx) => (
          <Marker 
            key={`${citizen.wallet}-${idx}`} 
            position={citizen.location} 
            icon={nftIcon}
          >
            <Popup className="custom-popup">
              <PinPopup citizen={citizen} />
            </Popup>
          </Marker>
        ))}
        
        {/* Display temporary pin when user is adding a new one */}
        {isAddingPin && selectedLocation && (
          <Marker 
            position={selectedLocation} 
            icon={nftIcon}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default MapView;