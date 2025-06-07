# Deployment Guide

## Production Deployment Checklist

### Pre-deployment Setup

1. **Environment Variables**
   ```bash
   DATABASE_URL=postgresql://username:password@localhost:5432/database
   HELIUS_API_KEY=your_helius_api_key
   ```

2. **Database Setup**
   ```sql
   CREATE TABLE citizens (
     wallet VARCHAR(255) PRIMARY KEY,
     nickname VARCHAR(255),
     lat NUMERIC(10,8),
     lng NUMERIC(11,8),
     primary_nft VARCHAR(255),
     pfp_nft VARCHAR(255),
     image_url TEXT,
     bio TEXT,
     twitter_handle VARCHAR(255),
     telegram_handle VARCHAR(255),
     discord_handle VARCHAR(255),
     nft_metadata JSONB,
     native_governance_power NUMERIC(20,6) DEFAULT 0,
     delegated_governance_power NUMERIC(20,6) DEFAULT 0,
     total_governance_power NUMERIC(20,6) DEFAULT 0,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE archived_citizens (
     id SERIAL PRIMARY KEY,
     wallet VARCHAR(255) NOT NULL,
     nickname VARCHAR(255),
     removal_reason TEXT,
     removal_date TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE security_logs (
     id SERIAL PRIMARY KEY,
     wallet VARCHAR(255) NOT NULL,
     action VARCHAR(50) NOT NULL,
     verified BOOLEAN NOT NULL,
     ip_address INET,
     user_agent TEXT,
     timestamp TIMESTAMP DEFAULT NOW()
   );
   ```

3. **Initialize Data Directory**
   ```bash
   cp data/native-governance-power.template.json data/native-governance-power.json
   ```

### Deployment Commands

```bash
# Install dependencies
npm install

# Start production servers
node index.js &          # Main server (port 5000)
node vsr-api-server.js & # VSR API (port 3001)
```

### Health Checks

- Main Server: `http://localhost:5000/health`
- VSR API: `http://localhost:3001/health`
- Daily Sync: Runs automatically at 00:00 UTC

### Security Features

- Ed25519 signature verification for all pin placements
- Nonce-based message generation preventing replay attacks
- Hardware wallet compatibility with transaction fallbacks
- Comprehensive security logging

### Data Management

- Real-time governance power calculations
- Automated daily synchronization at 00:00 UTC
- PostgreSQL database with JSON fallback
- NFT collection verification

### Monitoring

- Security logs track all verification attempts
- Governance calculation monitoring with detailed logging
- Daily sync status reporting
- Automatic retry mechanisms for failed operations