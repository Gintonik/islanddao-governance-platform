# IslandDAO Citizen Map - Clean Project Structure

## Core Production Files

### Main Application
- `vsr-api-server.js` - **LOCKED** Production VSR governance calculator
- `complete-data-sync.cjs` - Daily database synchronization
- `package.json` - Project dependencies
- `vsr_idl.json` - VSR program IDL for Solana integration

### Citizen Map Interface
- `citizen-map/` - Complete citizen map application
  - `verified-citizen-map.html` - Main map interface
  - `collection.html` - NFT collection view
  - `api-routes.js` - Database and API integration
  - `simple-server.js` - Production server
  - `simple-wallet.js` - Wallet connection system
  - `data/` - Governance and citizen data
  - `components/` - Reusable UI components

### Core Data
- `data/` - Governance power datasets
- `governance-sdk-local/` - Solana governance SDK

## Archived Components
- `archive/` - All legacy and experimental files
  - `experimental-scripts/` - Testing and development scripts
  - `validation-scripts/` - Data validation utilities
  - `data-sync-scripts/` - Sync automation tools
  - `legacy-files/` - Deprecated components
  - Historical calculators and experimental versions

## Configuration
- `.env` - Environment variables
- `.replit` - Replit configuration
- `PRODUCTION_CALCULATOR_LOCKED.md` - Calculator protection documentation

## Project Status
- **Production Ready**: VSR calculator locked and verified
- **Database Integration**: Complete with PostgreSQL
- **Real-time Updates**: Blockchain data synchronization active
- **Citizen Map**: Fully functional with NFT collection support