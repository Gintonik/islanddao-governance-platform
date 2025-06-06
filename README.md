# IslandDAO Governance Intelligence Platform

An advanced Solana blockchain platform engineered for real-time VSR (Voter Stake Registry) governance power analysis and geographic visualization of DAO participation. Features production-grade blockchain data processing, comprehensive NFT collection tracking, and enterprise-level wallet integration supporting 15+ Solana wallet providers.

## 🏗️ Architecture Overview

This platform consists of three core components working in harmony:

### 1. VSR Governance Power Calculator (`vsr-api-server.js`)
The heart of the system - a production-grade calculator that interfaces directly with Solana's VSR program to extract authentic governance power from blockchain state.

**Technical Deep Dive:**
- Performs comprehensive account scanning across all VSR program accounts (dataSize: 2728 bytes)
- Implements proper VSR multiplier calculations based on lockup duration and time decay
- Processes deposit entries using Anchor IDL deserialization
- Handles both native VSR deposits and SPL Governance delegations
- Filters stale/withdrawn deposits using account state analysis

**Key Features:**
- Real-time blockchain data fetching via Helius RPC
- Anchor-based program interaction for type safety
- Lockup multiplier calculations with time-based decay
- Comprehensive error handling and validation

### 2. Interactive Citizen Map (`citizen-map/`)
A full-featured mapping interface that visualizes governance participation geographically.

**Components:**
- `verified-citizen-map.html` - Main interactive map interface
- `collection.html` - NFT collection browser with governance integration
- `simple-wallet.js` - Universal Solana wallet connector supporting 15+ wallets
- `api-routes.js` - Database integration layer with PostgreSQL

**Map Features:**
- Geographic pin placement with anti-collision algorithms
- Real-time governance power display
- NFT collection verification and display
- Wallet signature verification for pin creation

### 3. Database Synchronization System
Automated daily sync maintaining data integrity between blockchain state and application database.

**Sync Process:**
- `complete-data-sync.cjs` - Main synchronization script
- Fetches fresh governance data for all registered citizens
- Updates PostgreSQL database with current blockchain state
- Maintains historical governance power tracking

## 🛠️ Technical Implementation

### VSR Power Calculation Methodology

The governance power calculation follows Solana's VSR specification:

1. **Account Discovery**: Scan all VSR program accounts using `getProgramAccounts` with authority filters
2. **Deposit Parsing**: Extract deposit entries from account data using proper offset calculations
3. **Multiplier Application**: Apply time-based multipliers for locked deposits
4. **Aggregation**: Sum all valid deposits accounting for different lockup types

**Multiplier Formula:**
```javascript
// VSR multiplier calculation follows Solana's specification
const basePower = depositAmount;
const timeBonus = calculateLockupBonus(lockupType, duration, timeRemaining);
const governancePower = basePower * multiplier;
```

### Database Schema

**Citizens Table:**
- Wallet address (primary key)
- Geographic coordinates (lat/lng)
- Governance power metrics
- NFT collection references
- Profile metadata

**NFT Integration:**
- Collection verification against specific program IDs
- Metadata fetching via Metaplex standards
- Image URL validation and caching

### Wallet Integration

Universal wallet adapter supporting:
- Phantom, Solflare, Backpack, Coinbase
- Hardware wallets (Ledger, Trezor)
- Browser extension wallets
- Mobile wallet connections via WalletConnect

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Solana RPC endpoint (Helius recommended)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd islanddao-governance-platform

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

**Required Environment Variables:**
```env
DATABASE_URL=postgresql://username:password@localhost:5432/database
HELIUS_API_KEY=your_helius_api_key
PORT=3001
```

### Running the Application

```bash
# Start the VSR API server
npm run start:api

# Start the citizen map interface (separate terminal)
npm run start:map

# Run daily sync (automated via cron)
npm run sync
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
  "nativeGovernancePower": 1000000.123,
  "delegatedGovernancePower": 500000.456,
  "totalGovernancePower": 1500000.579,
  "deposits": [
    {
      "amount": 1000000,
      "multiplier": 1.5,
      "power": 1500000,
      "isLocked": true,
      "lockupDetails": {
        "type": "Vesting",
        "endDate": "2025-12-31"
      }
    }
  ],
  "source": "vsr_sdk"
}
```

## 🏛️ Governance Integration

### VSR Program Interaction
The platform interfaces with Solana's official VSR program (`vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ`) using:
- Anchor framework for type-safe program calls
- Custom IDL for proper data deserialization
- Registrar-specific configuration handling

### Lockup Types Supported
- **None**: 1x multiplier (unlocked tokens)
- **Constant**: Fixed-time lockups with bonus multipliers
- **Vesting**: Linear vesting schedules with time-decay bonuses

### Delegation Handling
Processes SPL Governance TokenOwnerRecord accounts to calculate delegated voting power from other wallets.

## 🗄️ Data Flow

```
Solana Blockchain → VSR Calculator → PostgreSQL → Citizen Map
                                 ↓
                            Daily Sync Process
```

1. **Real-time Queries**: Direct blockchain queries for immediate governance power
2. **Database Cache**: Optimized queries for map display and historical tracking
3. **Sync Process**: Nightly updates ensuring data consistency

## 🔧 Development Notes

### Adding New Features
1. All governance calculations must use the locked production calculator
2. Database migrations should use PostgreSQL-compatible SQL
3. New wallet types require updates to the universal adapter

### Performance Considerations
- VSR account scanning is compute-intensive (6000+ accounts per query)
- Implement proper caching for frequently accessed data
- Use connection pooling for database operations

### Security Best Practices
- Wallet signatures required for all state-changing operations
- Input validation on all user-provided data
- Rate limiting on API endpoints

## 📁 Project Structure

```
├── vsr-api-server.js          # Core governance calculator
├── complete-data-sync.cjs     # Daily synchronization
├── citizen-map/               # Interactive map interface
│   ├── verified-citizen-map.html
│   ├── collection.html
│   ├── simple-wallet.js       # Universal wallet adapter
│   └── api-routes.js          # Database integration
├── governance-sdk-local/      # Solana governance SDK
├── data/                      # Governance datasets
└── archive/                   # Legacy and experimental code
```

## 🚨 Production Notes

The VSR calculator (`vsr-api-server.js`) is locked in production mode. Any modifications to governance calculations should be thoroughly tested against known blockchain state before deployment.

**Critical Files - Do Not Modify:**
- `vsr-api-server.js` - Production calculator
- `vsr_idl.json` - VSR program interface definition

## 🤝 Contributing

When contributing to this codebase:
1. Understand the VSR specification thoroughly
2. Test against mainnet data before proposing changes
3. Maintain compatibility with existing database schema
4. Follow the established error handling patterns

Built for the culture, by the culture. 🏴‍☠️

---

*This platform demonstrates advanced Solana development techniques including VSR integration, comprehensive wallet support, and real-time blockchain data processing. Use it as a reference for building sophisticated DAO governance tools.*