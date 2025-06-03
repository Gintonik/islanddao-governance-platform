# Citizen Map - IslandDAO Governance Intelligence Platform

A cutting-edge blockchain governance intelligence platform that provides comprehensive, dynamic, and user-friendly analysis of Solana governance ecosystems, with advanced parsing and visualization of voter participation and governance power.

![IslandDAO Citizen Map](https://img.shields.io/badge/Solana-Governance-brightgreen) ![VSR](https://img.shields.io/badge/VSR-Compatible-blue) ![Real--time](https://img.shields.io/badge/Real--time-Data-orange)

## 🌟 Features

### Geospatial Governance Visualization
- **Interactive World Map**: Real-time visualization of IslandDAO citizens worldwide
- **Smart Pin Positioning**: Anti-overlap algorithm for clear citizen distribution display
- **Citizen Profiles**: Detailed stats cards with governance power, NFT collections, and bio information

### Canonical Governance Power Analysis
- **Native Governance Power**: Accurate VSR (Voter Stake Registry) account parsing
- **Delegation Detection**: Comprehensive delegation relationship mapping
- **Real-time Updates**: Live blockchain data synchronization
- **Database Integration**: Persistent storage with PostgreSQL

### Advanced Blockchain Parsing
- **VSR Account Analysis**: Deep parsing of 16,586+ VSR program accounts
- **Canonical Multiplier Calculations**: Authentic lockup period multipliers (up to 5x)
- **Authority Validation**: Verified wallet alias support for controlled accounts
- **Phantom Deposit Filtering**: Removes invalid 1,000 ISLAND entries

## 🚀 Live Platform

The IslandDAO Citizen Map represents **23,182,625.54 ISLAND tokens** of native governance power across **14 active citizens** with voting power.

### Top Citizens by Governance Power
1. **3PKhzE9w...**: 10,394,142.75 ISLAND (5 deposits, 5 accounts)
2. **7pPJt2xo... (Takisoul)**: 7,183,474.63 ISLAND (4 deposits, 1 account)  
3. **Fywb7YDC...**: 3,375,944.44 ISLAND (7 deposits, 4 accounts)
4. **6aJo6zRi...**: 537,007.08 ISLAND (6 deposits, 2 accounts)
5. **37TGrYNu...**: 536,529.26 ISLAND (3 deposits, 1 account)

## 🛠 Technology Stack

### Frontend
- **Leaflet.js**: Interactive mapping with custom styling
- **Vanilla JavaScript**: High-performance client-side rendering
- **CSS3 Animations**: Smooth transitions and hover effects
- **Responsive Design**: Mobile-first approach

### Backend
- **Node.js**: Server runtime with Express.js framework
- **PostgreSQL**: Reliable data persistence with governance power caching
- **Helius RPC**: High-performance Solana blockchain data access
- **Real-time APIs**: Live citizen data and governance power endpoints

### Blockchain Integration
- **Solana Web3.js**: Direct blockchain interaction
- **VSR Program**: vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ
- **Anchor Framework**: Proper struct deserialization
- **SPL Governance**: Native delegation detection

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Helius RPC API key

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/your-username/citizen-map.git
cd citizen-map
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment setup**
Create a `.env` file:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/citizen_map
HELIUS_API_KEY=your_helius_api_key_here
```

4. **Database initialization**
```bash
# Create citizens table
psql $DATABASE_URL -c "CREATE TABLE IF NOT EXISTS citizens (
    id SERIAL PRIMARY KEY,
    wallet VARCHAR(44) UNIQUE NOT NULL,
    name VARCHAR(255),
    bio TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    native_governance_power DECIMAL(20,6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);"
```

5. **Start the application**
```bash
# Development mode
npm start

# Production mode
NODE_ENV=production npm start
```

The application will be available at `http://localhost:5000`

## 🔧 Core Components

### Citizen Map Server (`citizen-map/simple-server.cjs`)
- Express.js server with PostgreSQL integration
- NFT collection fetching via Helius API
- Real-time citizen data endpoints
- Static file serving with optimized caching

### Governance Power Scanner (`canonical-native-governance-locked.js`)
- Processes all VSR program accounts on Solana
- Extracts native governance power with canonical accuracy
- Implements verified wallet alias support
- Filters phantom deposits for clean results

### Database Integration (`update-citizen-governance-power.js`)
- Syncs governance power data to PostgreSQL
- Maintains citizen records with real-time updates
- Provides statistics and ranking functionality

### Frontend Visualization (`citizen-map/verified-citizen-map.html`)
- Interactive Leaflet.js map with custom IslandDAO styling
- Real-time citizen stats cards with governance power display
- Responsive design for desktop and mobile
- Dark/light theme support

## 📊 Governance Power Calculation

### Native Power Algorithm
```javascript
// Canonical VSR multiplier calculation
function calculateMultiplier(lockupKind, lockupEndTs) {
    if (lockupKind === 0) return 1; // No lockup
    
    const now = Date.now() / 1000;
    const timeRemaining = Math.max(0, lockupEndTs - now);
    const yearsRemaining = timeRemaining / (365.25 * 24 * 3600);
    
    return Math.min(5, 1 + Math.min(yearsRemaining, 4)); // Cap at 5x
}
```

### Data Processing Pipeline
1. **VSR Account Discovery**: Scan all 16,586 program accounts
2. **Authority Validation**: Match wallet ownership with alias support
3. **Deposit Extraction**: Parse using canonical byte offsets
4. **Multiplier Application**: Calculate time-weighted governance power
5. **Database Sync**: Update citizen records with results

## 🗂 Project Structure

```
citizen-map/
├── README.md                              # This file
├── .env                                   # Environment configuration
├── package.json                           # Dependencies and scripts
├── citizen-map/
│   ├── simple-server.cjs                  # Main server application
│   ├── verified-citizen-map.html          # Frontend map interface
│   └── components/                        # Reusable UI components
├── canonical-native-governance-locked.js  # VSR governance scanner
├── update-citizen-governance-power.js     # Database sync utility
├── get-all-citizens.js                    # Live citizen management
├── delegation-power-scanner.js            # Delegation detection foundation
└── governance-implementation-summary.md   # Technical documentation
```

## 🔐 Security & Performance

### Data Integrity
- **Canonical Validation**: All governance power calculations verified against Realms UI
- **Authority Verification**: Multi-method wallet ownership validation
- **Real-time Sync**: Live blockchain data with database caching
- **Error Handling**: Comprehensive logging and graceful degradation

### Performance Optimization
- **Efficient Queries**: Optimized PostgreSQL indexes on governance power
- **Caching Strategy**: Smart data caching to reduce RPC calls
- **Batch Processing**: Bulk operations for large dataset handling
- **Resource Management**: Connection pooling and memory optimization

## 🤝 Contributing

We welcome contributions to the IslandDAO Citizen Map! Please read our contributing guidelines and submit pull requests for any improvements.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (no breaking changes!)
5. Submit a pull request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- **IslandDAO**: [Official Website](https://islanddao.io)
- **Solana**: [Blockchain Explorer](https://solscan.io)
- **VSR Documentation**: [Voter Stake Registry](https://docs.realms.today/VSR)

## 📧 Support

For technical support or questions about the governance calculations, please open an issue or contact the IslandDAO development team.

---

**Built with ❤️ for the IslandDAO community**