import React, { useRef, useEffect, useState } from 'react';
import Globe from 'react-globe.gl';

function GlobeView({ citizens, onLocationSelect, isPickingLocation }) {
  const globeEl = useRef();
  const [hoverCitizen, setHoverCitizen] = useState(null);

  // Initialize globe when component mounts
  useEffect(() => {
    // Auto-rotate
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.5;
      
      // Initial position
      globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });
    }
  }, []);

  // Prepare citizen data for the globe
  const pointsData = citizens.map(citizen => ({
    lat: citizen.location[0],
    lng: citizen.location[1],
    size: 0.8,
    color: '#9945FF',
    citizen: citizen
  }));

  // For profile images, we'll use the built-in customThreeObject
  // method in a future enhancement. For now we'll use built-in
  // point visualization with our brand colors

  return (
    <Globe
      ref={globeEl}
      width={window.innerWidth}
      height={window.innerHeight - 60}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
      
      // Points representing citizens
      pointsData={pointsData}
      pointAltitude={0.05}
      pointColor="color"
      pointRadius="size"
      pointLabel={point => {
        const citizen = point.citizen;
        if (!citizen) return '';
        
        return `
          <div style="
            background: rgba(20, 20, 20, 0.9);
            color: white;
            border-radius: 6px;
            padding: 10px;
            width: 200px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
            border: 1px solid #9945FF;
            font-family: Arial, sans-serif;
          ">
            <div style="font-weight: bold; margin-bottom: 5px;">
              ${citizen.nfts?.length > 0 ? `PERK NFTs (${citizen.nfts.length})` : 'Citizen'}
            </div>
            <div style="font-size: 12px; margin-bottom: 5px;">
              Wallet: ${citizen.wallet.substring(0, 6)}...${citizen.wallet.substring(citizen.wallet.length - 4)}
            </div>
            ${citizen.message ? `<div style="font-size: 12px; margin-bottom: 5px;">${citizen.message}</div>` : ''}
            <div style="font-size: 10px; color: #aaa; margin-top: 5px;">
              Added: ${new Date(citizen.timestamp).toLocaleString()}
            </div>
          </div>
        `;
      }}
      
      // Handle globe interactions
      onGlobeClick={({ lat, lng }) => {
        if (isPickingLocation && onLocationSelect) {
          onLocationSelect([lat, lng]);
        }
      }}
      onPointClick={(point) => {
        console.log('Clicked citizen:', point.citizen);
      }}
      onPointHover={setHoverCitizen}
    />
  );
}

export default GlobeView;