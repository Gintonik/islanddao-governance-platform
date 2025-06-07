# PERKS Citizen Map & Governance Platform

An interactive Solana-based platform for PERKS NFT collection holders featuring real-time governance power tracking and geographic citizen mapping.

## Overview

This platform enables PERKS NFT holders to:
- Place themselves on an interactive world map
- Display their PERKS NFT collection
- Track real-time VSR governance power
- Participate in decentralized governance

## Features

### Interactive Citizen Map
- Geographic visualization of PERKS community members
- Real-time governance power display
- NFT collection browsing and verification
- Secure wallet-based authentication

### VSR Governance Integration
- Real-time governance power calculations
- Support for locked and vesting token deposits
- Integration with Solana's Voter Stake Registry
- Automated daily data synchronization

### NFT Collection Support
- PERKS collection verification and display
- Dynamic image loading from blockchain metadata
- Collection statistics and analytics

## 🛠️ Technical Implementation

### Core Architecture

The platform consists of three integrated components:

1. **VSR Governance Calculator** (`vsr-api-server.js`)
   - Real-time blockchain data extraction from Solana VSR program
   - Production-grade governance power calculations
   - Support for all lockup types (None, Constant, Vesting)
   - Handles both native deposits and delegated governance

2. **Interactive Map Interface** (`index.js`)
   - Geographic citizen visualization with anti-collision positioning
   - Real-time NFT collection verification
   - Secure wallet signature verification for pin placement
   - PostgreSQL database integration for citizen data

3. **Daily Synchronization System** (`daily-sync.js`)
   - Automated verification of NFT ownership
   - Governance power updates from blockchain state
   - Data integrity maintenance with archival system
   - Runs at 00:00 UTC with retry mechanisms

### VSR Power Calculation Methodology

The governance power calculation follows Solana's VSR specification:

1. **Account Discovery**: Comprehensive scanning of VSR program accounts using targeted memcmp filters
2. **Deposit Parsing**: Extract and deserialize deposit entries using Anchor IDL structures
3. **Multiplier Application**: Calculate time-based bonuses for locked deposits with decay functions
4. **Power Aggregation**: Sum all valid deposits accounting for lockup states and delegation

**Lockup Multiplier Logic:**
```javascript
function calculateVSRMultiplier(lockup, currentTime) {
  if (lockup.kind.none) return 1.0;
  
  const remainingTime = lockup.endTs - currentTime;
  if (remainingTime <= 0) return 1.0;
  
  const totalDuration = lockup.endTs - lockup.startTs;
  const timeProgress = remainingTime / totalDuration;
  
  return 1.0 + timeProgress; // Linear decay bonus
}
```

### Database Architecture

**Citizens Table:**
```sql
CREATE TABLE citizens (
  wallet VARCHAR(255) PRIMARY KEY,
  nickname VARCHAR(255),
  lat NUMERIC(10,8),
  lng NUMERIC(11,8),
  image_url TEXT,
  nft_metadata JSONB,
  native_governance_power NUMERIC(20,6),
  delegated_governance_power NUMERIC(20,6),
  total_governance_power NUMERIC(20,6),
  bio TEXT,
  twitter_handle VARCHAR(255),
  telegram_handle VARCHAR(255),
  discord_handle VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**NFT Integration:**
- Collection verification against PERKS collection ID: `5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8`
- Metadata fetching via Helius API with proper Irys gateway handling
- Dynamic image loading with fallback mechanisms

### Wallet Integration

Universal wallet adapter supporting:
- **Browser Extensions**: Phantom, Solflare, Backpack, Coinbase, Exodus, Glow
- **Hardware Wallets**: Ledger, Trezor with transaction fallback for message signing
- **Mobile Wallets**: Solana Mobile, Trust Wallet, Math Wallet
- **Web Wallets**: Slope, Sollet, Solong, Clover

**Security Features:**
- Ed25519 signature verification for all pin placements
- Nonce-based message generation to prevent replay attacks
- Hardware wallet compatibility with transaction-based verification fallback

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Helius API access for Solana blockchain data

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd perks-citizen-map

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Configure your database and API credentials
```

### Configuration

**Required Environment Variables:**
```env
DATABASE_URL=postgresql://username:password@localhost:5432/database
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_key
HELIUS_API_KEY=your_helius_api_key
```

### Running the Application

```bash
# Start the production server (port 5000)
node index.js

# Start the VSR API server (port 3001) - separate terminal
node vsr-api-server.js

# The daily sync runs automatically at 00:00 UTC
```

### Database Setup

```sql
-- Create citizens table
CREATE TABLE citizens (
  wallet VARCHAR(255) PRIMARY KEY,
  nickname VARCHAR(255),
  lat NUMERIC(10,8),
  lng NUMERIC(11,8),
  image_url TEXT,
  nft_metadata JSONB,
  native_governance_power NUMERIC(20,6) DEFAULT 0,
  delegated_governance_power NUMERIC(20,6) DEFAULT 0,
  total_governance_power NUMERIC(20,6) DEFAULT 0,
  bio TEXT,
  twitter_handle VARCHAR(255),
  telegram_handle VARCHAR(255),
  discord_handle VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create archive table for removed citizens
CREATE TABLE archived_citizens (
  id SERIAL PRIMARY KEY,
  wallet VARCHAR(255) NOT NULL,
  nickname VARCHAR(255),
  removal_reason TEXT,
  removal_date TIMESTAMP DEFAULT NOW()
);
```

## 📊 API Reference

### Governance Power Endpoint
```
GET /api/governance-power?wallet={address}
```

**Response:**
```json
{
  "wallet": "wallet_address",
  "nativeGovernancePower": 0,
  "delegatedGovernancePower": 0,
  "totalGovernancePower": 0,
  "deposits": [],
  "source": "vsr_calculation"
}
```

### Citizen Map Endpoints
```
GET /api/citizens              # Get all citizens with metadata
POST /api/save-citizen         # Add new citizen (requires signature)
GET /api/wallet-nfts           # Get PERKS NFTs for wallet
GET /api/governance-stats      # Get realm governance statistics
```

### NFT Collection Endpoint
```
GET /api/all-citizen-nfts      # Get aggregated NFT data
```

## 🏛️ Governance Integration

### VSR Program Interaction
The platform interfaces with Solana's VSR program using:
- Anchor framework for type-safe program calls
- Production IDL for data deserialization
- IslandDAO registrar configuration
- Real-time account scanning and filtering

### Lockup Types Supported
- **None**: 1x multiplier (unlocked tokens)
- **Constant**: Fixed-time lockups with bonus multipliers
- **Vesting**: Linear vesting schedules with time-decay bonuses

### Data Synchronization
- **Real-time**: Direct blockchain queries for governance power
- **Cached**: Optimized database queries for map display
- **Daily Sync**: Automated verification at 00:00 UTC

## 📁 Project Structure

```
├── index.js                   # Production server (port 5000)
├── vsr-api-server.js          # VSR governance calculator (port 3001)
├── daily-sync.js              # Daily synchronization system
├── native-governance-calculator.js  # Production calculator core
├── citizen-map/               # Map interface files
│   ├── verified-citizen-map.html    # Main map interface
│   ├── collection.html              # NFT collection browser
│   ├── simple-wallet.js             # Universal wallet adapter
│   └── verifyWallet.js              # Signature verification
├── data/                      # Governance power datasets
└── vsr_idl.json              # VSR program interface definition
```

## 🔧 Development Guidelines

### Core Principles
- All governance calculations use the production calculator
- Database operations follow PostgreSQL best practices
- Security through wallet signature verification
- Real-time blockchain data integration

### Performance Optimization
- Connection pooling for database operations
- Efficient VSR account scanning with targeted filters
- Image URL optimization with Irys gateway handling
- Anti-collision algorithms for map pin placement

### Security Implementation
- Ed25519 signature verification for citizen registration
- Nonce-based message generation preventing replay attacks
- Input validation on all user-provided data
- Hardware wallet compatibility with transaction fallbacks

## 🚀 Deployment

The platform runs on two processes:
1. **Main Server** (port 5000): Citizen map interface and database operations
2. **VSR API Server** (port 3001): Real-time governance power calculations

Daily synchronization ensures data integrity between blockchain state and application database.

---

*PERKS Citizen Map - Connecting the decentralized community through interactive governance visualization.*