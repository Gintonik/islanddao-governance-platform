// List of global cities with their coordinates and size categories for the globe
// Cities are categorized by size: 
// tier: 1 = Mega cities (always visible)
// tier: 2 = Large cities (visible at medium zoom)
// tier: 3 = Medium cities (visible at close zoom)
// tier: 4 = Small cities (visible only at very close zoom)

const worldCities = [
  // Tier 1 - Mega Cities - Always visible
  { name: 'New York', lat: 40.7128, lng: -74.0060, pop: 8.4, tier: 1 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, pop: 13.9, tier: 1 },
  { name: 'London', lat: 51.5074, lng: -0.1278, pop: 8.9, tier: 1 },
  { name: 'Shanghai', lat: 31.2304, lng: 121.4737, pop: 24.3, tier: 1 },
  { name: 'Delhi', lat: 28.7041, lng: 77.1025, pop: 29.3, tier: 1 },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332, pop: 21.6, tier: 1 },
  { name: 'Beijing', lat: 39.9042, lng: 116.4074, pop: 21.5, tier: 1 },
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333, pop: 22.0, tier: 1 },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777, pop: 20.4, tier: 1 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, pop: 4.0, tier: 1 },
  
  // Tier 2 - Large Cities - Visible at medium zoom
  { name: 'Paris', lat: 48.8566, lng: 2.3522, pop: 2.2, tier: 2 },
  { name: 'Moscow', lat: 55.7558, lng: 37.6173, pop: 12.5, tier: 2 },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784, pop: 15.5, tier: 2 },
  { name: 'Seoul', lat: 37.5665, lng: 126.9780, pop: 9.8, tier: 2 },
  { name: 'Cairo', lat: 30.0444, lng: 31.2357, pop: 9.5, tier: 2 },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, pop: 7.5, tier: 2 },
  { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, pop: 6.7, tier: 2 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, pop: 5.2, tier: 2 },
  { name: 'Berlin', lat: 52.5200, lng: 13.4050, pop: 3.7, tier: 2 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, pop: 5.7, tier: 2 },
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456, pop: 10.6, tier: 2 },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018, pop: 8.3, tier: 2 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298, pop: 2.7, tier: 2 },
  { name: 'Manila', lat: 14.5995, lng: 120.9842, pop: 13.5, tier: 2 },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832, pop: 2.9, tier: 2 },
  
  // Tier 3 - Medium Cities - Visible at close zoom
  { name: 'Madrid', lat: 40.4168, lng: -3.7038, pop: 3.2, tier: 3 },
  { name: 'Rome', lat: 41.9028, lng: 12.4964, pop: 2.9, tier: 3 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, pop: 3.3, tier: 3 },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194, pop: 0.9, tier: 3 },
  { name: 'Johannesburg', lat: -26.2041, lng: 28.0473, pop: 5.6, tier: 3 },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, pop: 0.9, tier: 3 },
  { name: 'Kiev', lat: 50.4501, lng: 30.5234, pop: 2.9, tier: 3 },
  { name: 'Lima', lat: -12.0464, lng: -77.0428, pop: 10.7, tier: 3 },
  { name: 'Warsaw', lat: 52.2297, lng: 21.0122, pop: 1.8, tier: 3 },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734, pop: 1.6, tier: 3 },
  { name: 'Boston', lat: 42.3601, lng: -71.0589, pop: 0.7, tier: 3 },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738, pop: 1.9, tier: 3 },
  { name: 'Brussels', lat: 50.8503, lng: 4.3517, pop: 1.2, tier: 3 },
  { name: 'Munich', lat: 48.1351, lng: 11.5820, pop: 1.5, tier: 3 },
  { name: 'Melbourne', lat: -37.8136, lng: 144.9631, pop: 5.0, tier: 3 },
  { name: 'Auckland', lat: -36.8509, lng: 174.7645, pop: 1.6, tier: 3 },
  { name: 'Montreal', lat: 45.5017, lng: -73.5673, pop: 1.8, tier: 3 },
  { name: 'Vancouver', lat: 49.2827, lng: -123.1207, pop: 0.7, tier: 3 },
  { name: 'Seattle', lat: 47.6062, lng: -122.3321, pop: 0.7, tier: 3 },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219, pop: 4.4, tier: 3 },
  
  // Tier 4 - Small Cities - Visible only at very close zoom
  { name: 'Las Vegas', lat: 36.1699, lng: -115.1398, pop: 0.6, tier: 4 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918, pop: 0.5, tier: 4 },
  { name: 'Lisbon', lat: 38.7223, lng: -9.1393, pop: 0.5, tier: 4 },
  { name: 'Athens', lat: 37.9838, lng: 23.7275, pop: 0.7, tier: 4 },
  { name: 'Prague', lat: 50.0755, lng: 14.4378, pop: 1.3, tier: 4 },
  { name: 'Helsinki', lat: 60.1699, lng: 24.9384, pop: 0.7, tier: 4 },
  { name: 'Oslo', lat: 59.9139, lng: 10.7522, pop: 0.7, tier: 4 },
  { name: 'Copenhagen', lat: 55.6761, lng: 12.5683, pop: 0.6, tier: 4 },
  { name: 'Dublin', lat: 53.3498, lng: -6.2603, pop: 0.5, tier: 4 },
  { name: 'Cape Town', lat: -33.9249, lng: 18.4241, pop: 0.4, tier: 4 },
  { name: 'Austin', lat: 30.2672, lng: -97.7431, pop: 0.9, tier: 4 },
  { name: 'Denver', lat: 39.7392, lng: -104.9903, pop: 0.7, tier: 4 },
  { name: 'Portland', lat: 45.5051, lng: -122.6750, pop: 0.6, tier: 4 },
  { name: 'San Diego', lat: 32.7157, lng: -117.1611, pop: 1.4, tier: 4 },
  { name: 'Nashville', lat: 36.1627, lng: -86.7816, pop: 0.7, tier: 4 },
  { name: 'New Orleans', lat: 29.9511, lng: -90.0715, pop: 0.4, tier: 4 },
  { name: 'Zurich', lat: 47.3769, lng: 8.5417, pop: 0.4, tier: 4 },
  { name: 'Geneva', lat: 46.2044, lng: 6.1432, pop: 0.2, tier: 4 },
  { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818, pop: 0.4, tier: 4 },
  { name: 'Florence', lat: 43.7696, lng: 11.2558, pop: 0.4, tier: 4 },
  { name: 'Venice', lat: 45.4408, lng: 12.3155, pop: 0.3, tier: 4 },
  { name: 'Budapest', lat: 47.4979, lng: 19.0402, pop: 1.8, tier: 4 },
  { name: 'Stockholm', lat: 59.3293, lng: 18.0686, pop: 1.0, tier: 4 },
  { name: 'Kyoto', lat: 35.0116, lng: 135.7681, pop: 1.5, tier: 4 },
  { name: 'Edinburgh', lat: 55.9533, lng: -3.1883, pop: 0.5, tier: 4 },
  { name: 'Quebec City', lat: 46.8139, lng: -71.2080, pop: 0.5, tier: 4 },
  { name: 'Salzburg', lat: 47.8095, lng: 13.0550, pop: 0.2, tier: 4 },
  { name: 'Reykjavik', lat: 64.1466, lng: -21.9426, pop: 0.1, tier: 4 },
  { name: 'Wellington', lat: -41.2865, lng: 174.7762, pop: 0.4, tier: 4 },
  { name: 'Queenstown', lat: -45.0312, lng: 168.6626, pop: 0.02, tier: 4 }
];

// Export the cities (backward compatibility)
const majorCities = worldCities;

module.exports = { worldCities, majorCities };