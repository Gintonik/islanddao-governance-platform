# Contributing to Citizen Map

Thank you for your interest in contributing to the IslandDAO Citizen Map project! This document provides guidelines for contributing to this governance intelligence platform.

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Helius RPC API key for Solana blockchain access

### Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`
4. Initialize database with the citizens table
5. Start development server: `npm start`

## Project Overview

The Citizen Map is a sophisticated governance intelligence platform that:
- Visualizes IslandDAO citizens on an interactive world map
- Calculates authentic governance power from Solana VSR accounts
- Provides real-time blockchain data synchronization
- Maintains canonical accuracy with Realms UI governance calculations

## Code Architecture

### Core Components
- **Frontend**: `citizen-map/verified-citizen-map.html` - Interactive map with Leaflet.js
- **Backend**: `citizen-map/simple-server.cjs` - Express.js server with PostgreSQL
- **Governance Scanner**: `canonical-native-governance-locked.js` - VSR account analysis
- **Database Sync**: `update-citizen-governance-power.js` - Data synchronization

### Data Flow
1. VSR accounts scanned from Solana blockchain
2. Governance power calculated using canonical multipliers
3. Results stored in PostgreSQL database
4. Frontend displays real-time citizen statistics

## Development Guidelines

### Code Quality
- Maintain existing functionality - never break working features
- Use consistent coding style matching existing codebase
- Add comprehensive error handling for blockchain operations
- Include detailed logging for debugging governance calculations

### Database Operations
- Always use parameterized queries to prevent SQL injection
- Maintain backward compatibility with existing schema
- Test database migrations thoroughly before deployment

### Blockchain Integration
- Use only authentic on-chain data - no mock or placeholder data
- Implement proper RPC error handling and retry logic
- Validate all governance power calculations against known values
- Respect rate limits for blockchain API calls

## Testing

### Manual Testing Checklist
- [ ] Map loads correctly with all citizen pins
- [ ] Citizen stats cards display accurate governance power
- [ ] Database queries return expected results
- [ ] Governance scanner produces correct calculations
- [ ] No console errors in browser or server logs

### Governance Power Validation
- Compare results against Realms UI for accuracy
- Verify calculations for known citizen wallets
- Test edge cases like expired lockups and delegation

## Submission Process

### Pull Request Guidelines
1. Create a descriptive branch name (e.g., `feature/delegation-scanner`)
2. Include detailed description of changes
3. Test thoroughly to ensure no breaking changes
4. Update documentation if adding new features
5. Reference any related issues

### Review Criteria
- Code maintains existing functionality
- Changes align with project architecture
- Governance calculations remain canonically accurate
- No security vulnerabilities introduced
- Performance impact is minimal

## Security Considerations

### Environment Variables
- Never commit API keys or database credentials
- Use secure connection strings for production databases
- Rotate API keys regularly

### Data Handling
- Validate all user inputs
- Sanitize database queries
- Implement proper error boundaries
- Log security events appropriately

## Governance Power Standards

### Canonical Requirements
- All calculations must match Realms UI exactly
- Use official VSR program structs and multipliers
- Implement proper lockup time calculations
- Handle delegation relationships correctly

### Data Integrity
- Source all data from authentic blockchain sources
- Validate against known governance power values
- Implement comprehensive error checking
- Maintain audit trails for calculations

## Community

### Communication
- Open issues for bugs or feature requests
- Participate in discussions about governance calculations
- Share knowledge about VSR account structures
- Help review pull requests from other contributors

### Code of Conduct
- Be respectful and inclusive
- Focus on technical merit
- Help others learn about blockchain governance
- Maintain professional communication

## Resources

### Documentation
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [VSR Program Documentation](https://docs.realms.today/VSR)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

### IslandDAO Resources
- [Official Website](https://islanddao.io)
- [Governance Portal](https://app.realms.today/dao/ISLAND)
- [Community Discord](https://discord.gg/islanddao)

Thank you for contributing to the IslandDAO Citizen Map project!