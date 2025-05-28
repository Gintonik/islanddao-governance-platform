/**
 * Test script to find the correct $ISLAND token mint address and fetch governance data
 */

const fetch = require('node-fetch');

// Known possible $ISLAND token addresses to test
const POSSIBLE_ISLAND_MINTS = [
    'isLanD1CnFJUdh4xyVjNvjgBkn1TFPQ1w7Fkg8kv8', // Common $ISLAND format
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', // Another possible format
    'iSLANDd7F9vNH2jrXSfJfnpFfUDY1xK7nW8sPqE4mJA', // Variation
    'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a' // The governance realm address
];

// Test wallet (one of our citizens with activity)
const TEST_WALLET = 'DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt'; // Kornel

const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function testTokenMint(mintAddress) {
    try {
        console.log(`\n🔍 Testing mint address: ${mintAddress}`);
        
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
                        mint: mintAddress
                    },
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.log(`❌ Error: ${data.error.message}`);
            return false;
        }

        if (data.result && data.result.value && data.result.value.length > 0) {
            console.log(`✅ Found token accounts! Count: ${data.result.value.length}`);
            data.result.value.forEach((account, index) => {
                const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
                console.log(`   Account ${index + 1}: ${balance} tokens`);
            });
            return true;
        } else {
            console.log(`⚪ No token accounts found for this mint`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ Error testing mint: ${error.message}`);
        return false;
    }
}

async function findIslandToken() {
    console.log('🏝️  Searching for $ISLAND token mint address...');
    console.log(`📍 Testing with wallet: ${TEST_WALLET}`);
    
    for (const mint of POSSIBLE_ISLAND_MINTS) {
        const found = await testTokenMint(mint);
        if (found) {
            console.log(`\n🎉 Found valid $ISLAND token mint: ${mint}`);
            break;
        }
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Also try to get account info for the governance realm
    console.log('\n🏛️  Checking governance realm account...');
    try {
        const response = await fetch(RPC_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [
                    'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a',
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            })
        });

        const data = await response.json();
        if (data.result && data.result.value) {
            console.log('✅ Governance realm account exists');
            console.log('Account owner:', data.result.value.owner);
        }
    } catch (error) {
        console.log('❌ Error checking governance realm:', error.message);
    }
}

// Run the test
findIslandToken().catch(console.error);