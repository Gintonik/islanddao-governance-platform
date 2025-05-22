# NFT Collection Fetcher - Project Guide

## Overview

This application is a simple Node.js script that fetches NFT data from the PERKS Solana collection using the Helius DAS API. It makes HTTP requests to the Helius RPC endpoint to retrieve NFT assets belonging to a specified collection address.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The system is a simple Node.js application with a single script (`index.js`) that makes HTTP requests to the Helius API. The architecture is minimal:

- **Runtime**: Node.js 20
- **Dependencies**: node-fetch (for making HTTP requests)
- **API Integration**: Helius DAS API for fetching Solana NFT data

The script is designed to retrieve NFT collection data with pagination support to handle large collections, fetching up to 1,000 items per request.

## Key Components

1. **index.js** - The main script file containing the logic to:
   - Connect to Helius API
   - Fetch NFTs for a specific collection
   - Handle pagination (the function appears incomplete in the current version)
   - Process the returned data

2. **Configuration Variables**:
   - `HELIUS_RPC_URL` - The endpoint URL with API key for Helius RPC
   - `COLLECTION_ADDRESS` - The Solana address of the NFT collection to fetch

## Data Flow

1. The script initializes with configuration parameters for the Helius API endpoint and the target NFT collection address
2. It constructs a JSON-RPC request to the `getAssetsByGroup` method
3. The request is sent to the Helius API using node-fetch
4. The response is processed and returned (Note: The current implementation is incomplete and needs finishing)

## External Dependencies

1. **node-fetch (v3.3.2)** - Used to make HTTP requests to the Helius API

2. **Helius DAS API** - External API service that provides NFT data from the Solana blockchain:
   - Endpoint: https://mainnet.helius-rpc.com/
   - Authentication: API key (currently hardcoded in the script)
   - Method used: `getAssetsByGroup`

## Deployment Strategy

The application is configured to run in a Replit environment:

1. **Setup**: 
   - Node.js 20 module is used
   - Nix channel is set to stable-24_05

2. **Execution Flow**:
   - The run button triggers the "Project" workflow
   - The "Project" workflow runs the "NFT Fetcher" workflow in parallel
   - The "NFT Fetcher" workflow installs node-fetch and executes index.js

3. **Deployment Command**:
   - Executes `npm install node-fetch && node index.js`

## Future Development Notes

1. **Completion Needed**: The fetchNFTs function appears incomplete - it's missing error handling completion and potential recursive calls for pagination.

2. **API Key Security**: The Helius API key is currently hardcoded in the source code, which is not a secure practice. Consider using environment variables for sensitive credentials.

3. **Data Processing**: The current script only fetches data but doesn't include logic for processing, storing, or displaying the fetched NFT data.

4. **Error Handling**: The error handling could be improved with more specific handling for different types of errors (network errors, API errors, etc.).