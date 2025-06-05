# IslandDAO Governance Platform

A Solana blockchain governance intelligence platform providing real-time citizen participation tracking for PERKS NFT holders.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Add your DATABASE_URL and API keys
   ```

3. **Start the platform:**
   ```bash
   # Terminal 1: Start governance calculator
   node vsr-api-server.js

   # Terminal 2: Start citizen map
   cd citizen-map && node simple-server.cjs
   ```

4. **Access the platform:**
   - Citizen Map: http://localhost:5000
   - NFT Collection: http://localhost:5000/collection
   - Governance API: http://localhost:3001/api/governance-power

## Core Features

- **Interactive Citizen Map** - Visual representation of all PERKS NFT holders with governance power
- **Real-time Governance Calculation** - Authentic blockchain data for 14 verified citizens
- **Wallet Integration** - Secure connection for PERKS NFT collection holders
- **Automated Daily Sync** - Fresh blockchain data synchronized at 00:00 UTC

## Production Files

| File | Purpose |
|------|---------|
| `vsr-api-server.js` | **Main governance calculator** (production locked) |
| `citizen-map/simple-server.cjs` | Citizen map server with daily sync |
| `sync-governance-to-map.js` | Manual governance data synchronization |
| `validate-production-system.js` | System integrity validation |

## Current Citizens with Governance Power

- **DeanMachine:** 10,354,147 ISLAND
- **Takisoul:** 8,974,792 ISLAND  
- **GintoniK:** 4,239,442 ISLAND
- **KO3:** 1,349,608 ISLAND
- **scientistjoe:** 1,007,398 ISLAND
- **Moxie:** 536,529 ISLAND
- **nurtan:** 398,681 ISLAND
- **Yamparala Rahul:** 377,734 ISLAND
- **Icoder:** 332,768 ISLAND
- **null:** 143,635 ISLAND
- **Alex Perts:** 124,693 ISLAND
- **SoCal:** 29,484 ISLAND
- **Miao:** 12,625 ISLAND
- **Reijo:** 4,879 ISLAND

## System Status

✅ **Production Ready** - All systems operational  
✅ **Governance Calculator Secured** - Single source of truth established  
✅ **Daily Sync Configured** - Automated blockchain synchronization  
✅ **Data Validated** - 14 citizens with verified governance power

## Archive

Historical analysis files, experimental calculators, and data exports are stored in the `archive/` directory for reference.

## Support

For technical issues or questions about the governance platform, please reference the production calculator protection documentation.