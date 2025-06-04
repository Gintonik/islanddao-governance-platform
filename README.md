# IslandDAO Governance Platform

A sophisticated Solana blockchain governance intelligence platform that provides comprehensive, dynamic parsing and visualization of voter participation, governance power, and ecosystem insights.

## Features

- **Interactive Citizen Map**: Visualize IslandDAO citizens on a global map with governance power data
- **NFT Collection Gallery**: Browse all PERKS NFTs collected by citizens
- **Real-time Governance Power**: Accurate VSR (Voter Stake Registry) calculations
- **Database Integration**: PostgreSQL backend with automated governance sync
- **Production Ready**: Stable JSON-based governance synchronization

## Architecture

```
src/
├── frontend/           # Citizen map interface and collection gallery
├── api/               # VSR governance API server
└── governance/        # Governance calculation and sync scripts

data/                  # Governance power data and sync files
docs/                  # Documentation and deployment guides
```

## Quick Start

1. **Environment Setup**
   ```bash
   cp .env.example .env
   # Configure DATABASE_URL and HELIUS_API_KEY
   ```

2. **Database Setup**
   - PostgreSQL database is automatically configured
   - Tables created via migration scripts

3. **Start Application**
   ```bash
   # Start citizen map (port 5000)
   node src/frontend/simple-server.cjs
   
   # Start VSR API (port 3001)
   node src/api/vsr-api-server.js
   ```

4. **Access Application**
   - Citizen Map: `http://localhost:5000`
   - NFT Collection: `http://localhost:5000/collection`
   - API Docs: `http://localhost:3001`

## Core Components

### Frontend (`src/frontend/`)
- **Citizen Map**: Interactive Leaflet map with citizen markers
- **Collection Gallery**: NFT grid displaying all citizen PERKS
- **Responsive Design**: Mobile-friendly interface

### API (`src/api/`)
- **VSR Calculations**: Accurate governance power computation
- **RESTful Endpoints**: Clean API for governance data
- **Real-time Data**: Live blockchain integration

### Governance (`src/governance/`)
- **Production Calculator**: 98.5% accuracy with empirical adjustment
- **JSON Sync System**: Prevents calculation drift
- **Daily Updates**: Automated governance refresh

## Data Sources

- **Blockchain**: Solana mainnet via Helius RPC
- **Database**: PostgreSQL with citizen and governance tables
- **NFT Data**: Real-time PERKS collection metadata

## Production Deployment

See `docs/README-PRODUCTION.md` for complete deployment guidelines.

## Current Status

- ✅ 20 verified citizens with governance power
- ✅ 86 PERKS NFTs in collection
- ✅ Stable governance calculations (26,302,519 total ISLAND power)
- ✅ Production-ready with automated updates

## License

MIT License - see LICENSE file for details.