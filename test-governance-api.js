/**
 * Test governance API calls to debug the "Unauthorized" issue
 */

const fetch = require('node-fetch');

const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a';
const TEST_WALLET = 'DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt'; // Kornel's wallet
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function testGovernanceAPI() {
    console.log('🔍 Testing governance API call...');
    console.log('Endpoint:', RPC_ENDPOINT.replace(process.env.HELIUS_API_KEY, '[API_KEY]'));
    console.log('Token mint:', ISLAND_TOKEN_MINT);
    console.log('Test wallet:', TEST_WALLET);
    
    try {
        const response = await fetch(RPC_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    TEST_WALLET,
                    {
                        mint: ISLAND_TOKEN_MINT
                    },
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('Error during API call:', error);
    }
}

testGovernanceAPI();