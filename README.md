# IslandDAO Governance Intelligence Platform

A sophisticated Solana blockchain governance platform that provides real-time VSR (Voter Stake Registry) power calculations and interactive citizen mapping for decentralized autonomous organizations.

## 🔒 Security Features

### Cryptographic Signature Verification
All pin updates and state changes require cryptographic signature verification using Ed25519:
- **Pin Hijacking Protection**: Existing citizens must provide valid wallet signatures to move pins
- **Time-Limited Verification**: Messages expire after 5 minutes to prevent replay attacks
- **Unique Nonces**: Each verification uses a unique nonce to prevent signature reuse
- **Audit Logging**: All pin operations logged with IP addresses and timestamps

### Authentication Flow
```
1. User requests pin update → Generate verification message
2. Wallet signs message → Cryptographic verification
3. Valid signature → Action authorized & logged
4. Invalid/expired → Request blocked with security log
```

## 🔄 Daily Sync System

### Automated Governance Maintenance
The platform runs automated daily synchronization at 00:00 UTC with intelligent retry mechanisms:

**Primary Process:**
- Verifies all 27 citizens against live blockchain data
- Updates governance power from VSR program accounts
- Removes citizens with 0 PERKS NFTs (with archival)
- Updates fallback JSON for system resilience

**Retry Logic:**
- 30-minute retry on primary failure
- One retry per day maximum
- Complete error logging and audit trail
- Automatic recovery from transient issues

### Data Validation Process
```
For Each Citizen:
1. NFT Ownership Check → API: /api/wallet-nfts?wallet={address}
2. Governance Power Check → API: /api/governance-power?wallet={address}
3. Update Database → citizens table (governance power fields)
4. Archive Removed → archived_citizens table (if 0 NFTs)
5. Export JSON → data/native-governance-power.json (fallback)
```

## 🏗️ Architecture Overview

This platform consists of four core components working in harmony:

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

### 3. Daily Synchronization System (`daily-sync.js`)
Automated daily maintenance ensuring data integrity between blockchain state and application database.

**Sync Process:**
- Scheduled execution at 00:00 UTC with 30-minute retry
- Validates NFT ownership for all citizens via Helius API
- Updates governance power from live VSR blockchain data
- Archives removed citizens for audit trail
- Exports updated JSON fallback file

### 4. Security Layer (`index.js`)
Production-grade security protecting against unauthorized pin manipulation:
- Ed25519 signature verification for all state changes
- Time-limited authentication messages (5-minute expiry)
- Comprehensive audit logging with IP tracking
- Transaction rollback on security failures

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
- `wallet` (primary key) - Solana wallet address
- `lat`, `lng` - Geographic coordinates for map display
- `native_governance_power` - VSR voting power from deposits
- `delegated_governance_power` - Power delegated from others
- `total_governance_power` - Combined governance power
- `primary_nft`, `pfp_nft` - Selected PERKS NFT references
- Profile metadata (nickname, bio, social handles)

**Archived Citizens Table:**
- Complete citizen data backup before removal
- `removal_reason` - Why citizen was archived
- `removal_date` - Timestamp of archival
- `original_created_at` - Original join date

**Security Logs Table:**
- Audit trail for all pin operations
- IP addresses, user agents, timestamps
- Signature verification results

**Fallback Systems:**
- `data/native-governance-power.json` - Governance power cache
- Timestamped backup files for recovery
- Transaction rollback on failures

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
# Start the production server (includes daily sync scheduler)
node index.js

# Start the VSR API server (separate terminal)
node vsr-api-server.js

# Manual daily sync trigger (for testing)
curl -X POST http://localhost:5000/api/sync-governance-power

# Check system health
curl http://localhost:5000/health
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

## 🛡️ Security & Reliability

### Fallback Mechanisms
- **JSON Backup System**: Automatic timestamped backups before any data changes
- **Transaction Rollbacks**: Complete database rollback on any sync failure
- **Citizen Archival**: Soft deletion with full recovery capability
- **API Error Handling**: Citizens preserved on API failures

### Security Monitoring
- **Signature Verification**: Ed25519 cryptographic verification for all pin updates
- **Audit Logging**: Complete trail of all operations with IP tracking
- **Rate Limiting**: Protection against API abuse
- **Time-based Expiry**: 5-minute message expiration prevents replay attacks

## 🗄️ Data Flow

```
Solana Blockchain → VSR Calculator → PostgreSQL → Citizen Map
                                 ↓
                     Daily Sync (00:00 UTC + 30min retry)
                                 ↓
                     JSON Backup → Archive → Update
```

1. **Real-time Queries**: Direct blockchain queries for immediate governance power
2. **Database Cache**: Optimized queries for map display and historical tracking
3. **Daily Sync**: Automated nightly updates with intelligent retry
4. **Security Layer**: Cryptographic verification for all state changes
5. **Fallback Systems**: JSON cache and archived data for recovery

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
├── index.js                   # Production server with security layer
├── vsr-api-server.js          # Core governance calculator (LOCKED)
├── daily-sync.js              # Automated daily synchronization
├── citizen-map/               # Interactive map interface
│   ├── verified-citizen-map.html
│   ├── collection.html
│   ├── simple-wallet.js       # Universal wallet adapter
│   └── verifyWallet.js        # Cryptographic verification
├── data/                      # Governance datasets & backups
│   ├── native-governance-power.json
│   └── native-governance-power-backup-*.json
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