# IslandDAO Citizen Map

A sophisticated decentralized governance platform that visualizes DAO members on an interactive global map, displaying authentic governance power extracted directly from Solana blockchain data.

## Features

- **Interactive Global Map**: 3D globe visualization showing verified DAO citizens worldwide
- **Authentic Governance Power**: Real-time extraction of weighted voting power from VSR (Voter State Recorder) accounts
- **Wallet Integration**: Support for Phantom, Solflare, and Backpack wallets
- **NFT Profile Integration**: Display citizen NFTs and social profiles
- **Real-time Statistics**: Live governance metrics and citizen participation data
- **PostgreSQL Database**: Persistent storage for citizen data and governance metrics

## Architecture

### Frontend
- Pure HTML5/CSS3/JavaScript (no framework dependencies)
- Three.js for 3D globe rendering
- Responsive design with mobile support
- Real-time data updates via REST API

### Backend
- Node.js server with Express
- PostgreSQL database for data persistence
- Solana blockchain integration via Helius RPC
- VSR governance power calculation engine

### Blockchain Integration
- **SPL Governance**: Standard Solana governance program integration
- **VSR (Voter State Recorder)**: Advanced weighted voting power calculation
- **Helius API**: High-performance Solana RPC for blockchain data
- **Authentic Data**: Direct blockchain queries, no mock or placeholder data

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Helius API key (for Solana blockchain access)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/islanddao-citizen-map.git
   cd islanddao-citizen-map
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Required
   DATABASE_URL=postgresql://username:password@host:port/database
   HELIUS_API_KEY=your_helius_api_key
   
   # Optional (auto-configured in most environments)
   PORT=5000
   ```

4. **Initialize database**
   ```bash
   node db.js
   ```

5. **Start the server**
   ```bash
   node citizen-map/db-integrated-server.js
   ```

6. **Access the application**
   Open `http://localhost:5000` in your browser

## Governance Power Calculation

This application implements authentic governance power extraction from Solana's VSR system:

### VSR Integration
- Extracts weighted voting power (not raw token deposits)
- Accounts for lock-up multipliers and delegation
- Matches Realms interface calculations exactly
- Updates governance power in real-time

### Data Authenticity
- No mock or placeholder data
- Direct blockchain queries via Helius API
- Comprehensive error handling for API failures
- Clear messaging when data cannot be retrieved

## API Endpoints

### Core Endpoints
- `GET /` - Serve the main application
- `GET /api/citizens` - Get all verified citizens with governance data
- `POST /api/citizens` - Add new citizen pin
- `DELETE /api/citizens/:wallet` - Remove citizen pin
- `POST /api/sync-governance` - Manually sync governance power

### Data Format
```json
{
  "wallet_address": "3PKhzE9wF...",
  "name": "Citizen Name",
  "location": "City, Country",
  "lat": 40.7128,
  "lng": -74.0060,
  "governance_power": 10353648.013,
  "nft_image": "https://...",
  "twitter": "@username",
  "discord": "username#1234"
}
```

## Deployment

### Replit Deployment
This application is optimized for Replit deployment:

1. Import the repository to Replit
2. Set environment variables in Replit Secrets
3. Click "Run" to start the application
4. Use Replit's deployment feature for production

### Other Platforms
The application can be deployed on any Node.js hosting platform:
- Heroku
- Railway
- Render
- DigitalOcean App Platform

## Development

### Project Structure
```
├── citizen-map/
│   ├── db-integrated-server.js    # Main server file
│   ├── verified-citizen-map.html  # Frontend application
│   ├── api-routes.js              # API endpoint handlers
│   ├── major-cities.js           # Geographic data
│   ├── components/               # React-style components
│   └── utils/                    # Utility functions
├── db.js                         # Database operations
├── package.json                  # Dependencies
└── README.md                     # This file
```

### Database Schema
```sql
CREATE TABLE citizens (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    name VARCHAR(100),
    location VARCHAR(200),
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    governance_power DECIMAL(20, 6) DEFAULT 0,
    nft_image TEXT,
    twitter VARCHAR(100),
    discord VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Maintain data authenticity - no mock data
- Follow existing code style and patterns
- Test governance power calculations thoroughly
- Ensure mobile responsiveness

## Technical Documentation

### VSR Governance Power Extraction
The application uses a sophisticated method to extract authentic governance power:

1. **Account Discovery**: Searches VSR program accounts for citizen wallets
2. **Data Parsing**: Extracts governance power from account data (32 bytes after wallet reference)
3. **Weight Calculation**: Applies proper VSR multipliers for lock-up periods
4. **Verification**: Cross-checks results against known voting records

### Error Handling
- Comprehensive API error responses
- Graceful degradation when blockchain data unavailable
- Clear user messaging for authentication failures
- Retry logic for temporary network issues

## License

MIT License - see LICENSE file for details

## Support

For questions or issues:
- Open a GitHub issue
- Contact the IslandDAO community
- Review the SPL Governance documentation

---

Built with ❤️ for the IslandDAO community