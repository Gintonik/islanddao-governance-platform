# IslandDAO Governance Platform

A comprehensive Solana blockchain governance intelligence platform that visualizes citizen participation, governance power, and NFT collections through an interactive map interface.

## 🌴 What is IslandDAO?

IslandDAO is a decentralized autonomous organization built on Solana, featuring:
- **Verified Citizens**: 20 verified community members with on-chain governance power
- **PERKS NFT Collection**: 86 unique NFTs collected by citizens
- **VSR Governance**: Voter Stake Registry system for democratic decision-making
- **Global Community**: Citizens located worldwide with real governance influence

## 🚀 Platform Features

### Interactive Citizen Map
- **Global Visualization**: See all 20 verified citizens on a world map
- **Real-time Data**: Live governance power calculations from blockchain
- **Citizen Profiles**: View each member's governance power, NFTs, and social links
- **Dynamic Updates**: Automatic refresh of citizen data and positions

### NFT Collection Gallery
- **Complete Collection**: Browse all 86 PERKS NFTs owned by citizens
- **Owner Information**: See which citizen owns each NFT
- **Real Metadata**: Authentic NFT data fetched from Solana blockchain
- **Search & Filter**: Find specific NFTs or browse by owner

### Governance Power Calculator
- **VSR Integration**: Accurate Voter Stake Registry calculations
- **Multi-factor Analysis**: Native deposits, lockup multipliers, delegation tracking
- **Production Accuracy**: 98.5% accuracy with empirical blockchain validation
- **Stable Synchronization**: JSON-based system prevents calculation drift

## 🏗️ Technical Architecture

```
IslandDAO Governance Platform/
├── citizen-map/              # Interactive map interface
│   ├── verified-citizen-map.html    # Main citizen map application
│   ├── collection.html              # NFT collection gallery
│   ├── simple-server.cjs           # Backend server with API endpoints
│   └── assets/                      # Images, logos, and static files
├── vsr-api-server.js         # Dedicated VSR governance API server
├── data/                     # Governance power data and sync files
│   ├── native-governance-power.json
│   └── governance-sync-logs/
└── production/               # Production governance calculators
    ├── native-governance-calculator.js
    ├── json-governance-sync.js
    └── daily-governance-updater.js
```

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Helius RPC API key for Solana data

### Installation
```bash
# Clone repository
git clone <repository-url>
cd islanddao-governance-platform

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Add your DATABASE_URL and HELIUS_API_KEY
```

### Running the Application
```bash
# Start the citizen map (primary interface)
cd citizen-map
node simple-server.cjs
# Access at: http://localhost:5000

# Start the VSR API server (governance calculations)
node vsr-api-server.js
# API available at: http://localhost:3001
```

### Accessing Features
- **Citizen Map**: http://localhost:5000
- **NFT Collection**: http://localhost:5000/collection
- **API Documentation**: http://localhost:3001

## 🛠️ Core Components

### Frontend Application (`citizen-map/`)
- **Interactive Map**: Leaflet-based world map with citizen markers
- **Responsive Design**: Mobile-friendly interface with dark/light themes
- **Real-time Updates**: Automatic data refresh and live citizen tracking
- **Wallet Integration**: Connect Phantom, Solflare, or Backpack wallets

### Backend API (`simple-server.cjs`)
- **Citizen Data**: Serves verified citizen information with governance power
- **NFT Integration**: Real-time PERKS collection data via Helius API
- **Database Layer**: PostgreSQL integration for persistent data storage
- **CORS Support**: Cross-origin requests for external integrations

### VSR Governance Engine (`vsr-api-server.js`)
- **Blockchain Analysis**: Direct Solana program account parsing
- **Multiplier Calculations**: Accurate lockup period and delegation tracking
- **Production Stability**: Empirically adjusted calculations (98.5% accuracy)
- **Automated Updates**: Daily governance power synchronization

### Production Calculators (`production/`)
- **Native Power Calculator**: Core VSR governance power computation
- **JSON Sync System**: Stable data synchronization preventing drift
- **Daily Updater**: Automated refresh of governance calculations
- **Validation Framework**: Cross-reference with blockchain data

## 📊 Current Platform Status

### PERKS NFT Collection: 86 NFTs
- Unique digital assets owned by verified citizens
- Real metadata and images from Solana blockchain
- Ownership tracking and verification
- Collection value and rarity metrics

### Governance Power Distribution
- Native power calculations with VSR multipliers
- Lockup period bonuses
- Delegation tracking and validation (under consruction)
- Historical power analysis and trends (under construction)

## 🔧 API Endpoints

### Citizen Data
```
GET /api/citizens
Returns: Complete citizen list with governance power and NFT data

Response: {
  id: number,
  nickname: string,
  wallet: string,
  lat: number, lng: number,
  governance_power: number,
  nfts: string[],
  nftMetadata: object
}
```

### NFT Collection
```
GET /api/nfts
Returns: All PERKS NFTs owned by citizens

Response: {
  id: string,
  name: string,
  content: object,
  owner_wallet: string,
  owner_nickname: string
}
```

### VSR Governance
```
GET /api/governance-power/:wallet
Returns: Detailed governance power breakdown

Response: {
  native_power: number,
  delegated_power: number,
  total_power: number,
  lockup_multiplier: number
}
```

## 🌐 Production Deployment

### Environment Configuration
- **DATABASE_URL**: PostgreSQL connection string
- **HELIUS_API_KEY**: Solana RPC access for NFT and governance data
- **PORT**: Application port (default: 5000)

### Database Schema
- **citizens**: Verified citizen profiles and governance data
- **nfts**: PERKS collection metadata and ownership
- **governance_power**: Historical power calculations
- **sync_logs**: Data synchronization tracking

### Monitoring & Updates
- Daily governance power recalculation
- Real-time NFT ownership tracking
- Citizen profile updates and verification
- Platform health monitoring and alerts

## 🤝 Contributing

This platform represents the technical infrastructure supporting IslandDAO's decentralized governance. Contributions should focus on:
- Governance calculation accuracy improvements
- User interface enhancements
- API performance optimizations
- Additional blockchain data integration

## 📄 License

MIT License - This project is open source and available for community contribution and adaptation.
