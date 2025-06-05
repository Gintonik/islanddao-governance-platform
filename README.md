# IslandDAO PERKS Citizen Map

A sophisticated Solana blockchain governance intelligence platform that leverages PERKS Collection NFTs to enable dynamic citizen participation and profile management.

## 🏝️ Features

- **Interactive Citizen Map**: Visual representation of PERKS NFT holders with authentic blockchain data
- **Real-time Governance Power**: Live VSR (Voter Stake Registry) governance power calculations
- **Multi-wallet Support**: Hardware wallet compatibility (Ledger, Trezor) and browser wallets
- **NFT Profile System**: Authentic PERKS Collection NFT display with metadata resolution
- **Daily Data Sync**: Automated governance power updates for all citizens

## 🚀 Quick Start

1. **Start the Application**:
   ```bash
   npm install
   npm start
   ```

2. **Access the Map**: Navigate to `http://localhost:5000`

3. **Connect Wallet**: Use any supported Solana wallet to create your citizen pin

## 📁 Project Structure

```
├── citizen-map/          # Main web application
│   ├── verified-citizen-map.html    # Interactive map interface
│   ├── collection.html              # PERKS collection display
│   ├── api-routes.js                # API endpoints
│   └── data/                        # Governance and citizen data
├── scripts/              # Development and utility scripts
├── docs/                 # Documentation and guides
├── assets/               # Images, logos, and media files
├── data/                 # JSON data files and exports
├── archive/              # Historical and experimental files
└── vsr-api-server.js     # Core governance API server
```

## 🎯 Core Technologies

- **Blockchain**: Solana Web3.js, Anchor framework
- **NFTs**: PERKS Collection (5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8)
- **Governance**: VSR (Voter Stake Registry) integration
- **Frontend**: Vanilla JavaScript with Leaflet.js mapping
- **Backend**: Node.js with real-time governance calculations

## 🔧 Configuration

The application requires these environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- RPC endpoints for Solana blockchain connectivity

## 📊 Governance Power

The system calculates real-time governance power using:
- Native VSR deposits with time-decay multipliers
- Delegated governance from SPL Token Owner Records
- PERKS NFT verification for citizen eligibility

## 🗺️ Interactive Map

Citizens can create pins on the interactive world map by:
1. Connecting their Solana wallet
2. Verifying PERKS NFT ownership
3. Selecting location and adding profile information
4. Automatic governance power calculation and display

## 🔐 Security

- All wallet connections use secure signature verification
- NFT ownership verified through on-chain data
- No private keys stored or transmitted
- Read-only blockchain interactions for governance calculations

## 📈 Daily Sync

Automated daily synchronization ensures:
- Fresh governance power calculations
- Updated NFT metadata
- Accurate citizen statistics
- Real-time leaderboard data

---

**Collection**: PERKS NFTs  
**Governance**: IslandDAO VSR  
**Network**: Solana Mainnet