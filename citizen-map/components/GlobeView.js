import React, { useRef, useEffect, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';

function GlobeView({ citizens, onLocationSelect, isPickingLocation, nftMetadata }) {
  const globeRef = useRef();
  const [globeReady, setGlobeReady] = useState(false);
  const [dimensions, setDimensions] = useState({
    height: window.innerHeight - 60,
    width: window.innerWidth
  });
  
  // Handle window resize
  useEffect(() => {
    function handleResize() {
      setDimensions({
        height: window.innerHeight - 60,
        width: window.innerWidth
      });
    }
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Initialize globe
  useEffect(() => {
    if (globeRef.current) {
      // Set initial rotation and camera position
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.5;
      globeRef.current.pointOfView({ altitude: 2.5 });
      
      // Stop auto-rotation when the globe is interacted with
      globeRef.current.controls().addEventListener('start', () => {
        globeRef.current.controls().autoRotate = false;
      });
      
      setGlobeReady(true);
    }
  }, [globeRef.current]);
  
  // Format citizen data for the globe
  const pointsData = citizens.map(citizen => ({
    lat: citizen.location[0],
    lng: citizen.location[1],
    citizen: citizen,
    color: '#9945FF'
  }));
  
  // Create a custom point marker material
  const markerMaterial = (citizen) => {
    if (!citizen) return null;
    
    // Use profile image or primary NFT for the marker
    const nftId = citizen.pfp || citizen.primaryNft;
    
    if (nftId && citizen.nftMetadata && citizen.nftMetadata[nftId] && citizen.nftMetadata[nftId].image) {
      // Create texture from NFT image
      const texture = new THREE.TextureLoader().load(citizen.nftMetadata[nftId].image);
      texture.minFilter = THREE.LinearFilter;
      
      // Create a circular material with the NFT image
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 1
      });
      
      return material;
    }
    
    // Default material if no NFT image
    return new THREE.SpriteMaterial({
      color: '#9945FF',
      transparent: true,
      opacity: 0.7
    });
  };
  
  // Handle point click for displaying NFT info
  const handlePointClick = (point) => {
    console.log('Clicked citizen:', point.citizen);
  };
  
  // Handle globe click for location selection when adding a pin
  const handleGlobeClick = ({ lat, lng }) => {
    if (isPickingLocation && onLocationSelect) {
      onLocationSelect([lat, lng]);
    }
  };
  
  return (
    <div style={{ position: 'relative', height: dimensions.height, width: '100%' }}>
      <Globe
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        width={dimensions.width}
        height={dimensions.height}
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={0.01}
        pointColor="color"
        pointRadius={0.5}
        pointLabel={point => {
          const citizen = point.citizen;
          return `
            <div style="
              background-color: rgba(20, 20, 20, 0.9);
              color: white;
              border-radius: 6px;
              padding: 10px;
              font-family: Arial, sans-serif;
              width: 200px;
              box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
              border: 1px solid #9945FF;
            ">
              <div style="font-weight: bold; margin-bottom: 5px;">
                ${citizen.nfts.length > 0 ? `PERK NFTs (${citizen.nfts.length})` : 'Citizen'}
              </div>
              <div style="font-size: 12px; margin-bottom: 8px;">
                Wallet: ${citizen.wallet.substring(0, 6)}...${citizen.wallet.substring(citizen.wallet.length - 4)}
              </div>
              ${citizen.message ? `<div style="font-size: 12px; margin-bottom: 8px;">${citizen.message}</div>` : ''}
              <div style="font-size: 10px; color: #aaa;">
                Added: ${new Date(citizen.timestamp).toLocaleString()}
              </div>
            </div>
          `;
        }}
        onPointClick={handlePointClick}
        onGlobeClick={handleGlobeClick}
        pointsMerge={false}
      />
      
      {isPickingLocation && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          Click on the globe to place your pin
        </div>
      )}
    </div>
  );
}

export default GlobeView;