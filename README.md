# 🌍 Citizen Map - Solana NFT Geospatial Platform

A cutting-edge geospatial mapping platform that leverages blockchain technology to create immersive, community-driven location experiences for IslandDAO Citizens.

![Citizen Map Preview](https://img.shields.io/badge/Status-Live-brightgreen) ![Solana](https://img.shields.io/badge/Blockchain-Solana-purple) ![NFT](https://img.shields.io/badge/NFT-Powered-orange)

## 🚀 Features

### 🗺️ Interactive World Map
- **Smart Anti-Overlap Positioning**: Advanced algorithm prevents pin overlap while maintaining accurate locations
- **Continuous World View**: Single seamless world map without confusing duplicates
- **Zoom-Responsive Layout**: Pins automatically adjust positioning based on zoom level
- **Real-time Updates**: Dynamic citizen detection and map refresh every 10 seconds

### 🎯 Smart Pin Clustering
- **Tight Grid Formation**: Citizens in close proximity arrange in compact 2x2 grids
- **Location Accuracy**: Minimal spacing keeps clustered pins as close as possible to real locations
- **Automatic Separation**: When zoomed in enough, pins smoothly return to exact coordinates

### 🔐 Wallet Integration
- **Multi-Wallet Support**: Phantom, Solflare, and Backpack wallet compatibility
- **Secure Authentication**: Cryptographic signature verification for user verification
- **NFT Verification**: Real-time ownership validation with 462 NFTs in database

### 👥 Citizen Profiles
- **Rich Profiles**: Display nickname, bio, and social media links
- **NFT Profile Pictures**: Authentic NFT images as map pins
- **Social Connections**: Twitter, Telegram, and Discord integration
- **Location Sharing**: Precise geolocation with privacy controls

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript, Leaflet.js for mapping
- **Backend**: Node.js with Express
- **Database**: PostgreSQL with real-time sync
- **Blockchain**: Solana Web3.js integration
- **NFT Data**: Helius DAS API for metadata
- **Maps**: OpenStreetMap with custom styling

## 📊 Current Stats

- **7 Active Citizens** mapped globally
- **462 NFT Collection** items tracked
- **5 Countries** represented (Greece, Portugal, USA, etc.)
- **Real-time Sync** with blockchain data

## 🌟 Key Innovations

### Smart Positioning Algorithm
```javascript
// Prevents overlap while maintaining location accuracy
const degreeThreshold = pixelThreshold / Math.pow(2, zoom) / 256 * 360;
const spacingLat = degreeThreshold * 0.6; // Ultra-tight spacing
```

### Dynamic Clustering
- Citizens within 16km automatically group into compact grids
- 2 citizens per row for maximum compactness
- Preserves geographic accuracy while ensuring visibility

### Continuous World Navigation
- Normalized longitude coordinates prevent map duplication
- Seamless east-west scrolling experience
- No confusing continent copies

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/Gintonik/Solana-NFT-Citizen-Map.git
   cd Solana-NFT-Citizen-Map
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up database**
   ```bash
   node db-setup.js
   ```

4. **Start the server**
   ```bash
   node updated-index.js
   ```

5. **Visit** `http://localhost:5000`

## 🌍 Live Citizens

Currently featuring citizens from:
- **Athens, Greece**: Takisoul, Whale's Friend, Mila
- **Northern Greece**: Alex Perts  
- **Portugal**: legend
- **Los Angeles, USA**: SoCal
- **And growing daily!**

## 🔄 Auto-Updates

- **Daily NFT Sync**: Automatic collection refresh every 24 hours
- **Real-time Detection**: New citizens appear within 10 seconds
- **Database Integrity**: Consistent ownership verification

## 🎨 Design Philosophy

- **User-Centric**: No overlapping pins, intuitive navigation
- **Performance-First**: Optimized for smooth interactions
- **Community-Driven**: Real people, real locations, real connections
- **Blockchain-Native**: Built for the decentralized future

## 🤝 Contributing

This is an active community project! Citizens can:
- Connect their wallets to join the map
- Update their profiles and social links
- Share their locations with the community
- Help test new features

## 📈 Roadmap

- [ ] Mobile app development
- [ ] Enhanced social features
- [ ] Event location sharing
- [ ] Community challenges
- [ ] Multi-collection support

---

**Built with ❤️ for the IslandDAO Community**

*Connecting NFT holders across the globe, one pin at a time.*
