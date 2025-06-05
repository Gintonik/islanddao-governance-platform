# IslandDAO Governance Platform

A Solana blockchain governance intelligence platform for citizen participation tracking.

## Core Files

### Production Systems
- `vsr-api-server.js` - **MAIN GOVERNANCE CALCULATOR** (do not modify)
- `citizen-map/simple-server.cjs` - Citizen map server with daily sync
- `citizen-map/verified-citizen-map.html` - Interactive citizen map
- `citizen-map/collection.html` - NFT collection viewer

### Data Management
- `sync-governance-to-map.js` - Sync governance data to map files
- `validate-production-system.js` - System integrity validation

### Configuration
- `.env` - Environment variables
- `package.json` - Node.js dependencies

## Data Directories

### Citizen Map Data
- `citizen-map/data/citizens.json` - Current citizen data
- `citizen-map/data/governance-power.json` - Governance power data

### Archive
- `archive/` - Historical and experimental files (safe to ignore)

## Key Features

- Real-time governance power calculation for 14 verified citizens
- Interactive map with citizen profiles and governance data
- Automated daily synchronization with blockchain data
- Secure wallet integration for PERKS NFT holders

## System Status
- Production Ready ✅
- Governance Calculator Secured ✅  
- Daily Sync Configured ✅
- All Data Validated ✅