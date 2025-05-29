/**
 * Realms API Governance Data Fetcher
 * Using the official Realms API to get authentic governance deposits
 */

const fetch = require('node-fetch');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// IslandDAO Realm Configuration
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/**
 * Fetch governance data from Realms API
 */
async function fetchGovernanceFromRealmsAPI(walletAddress) {
    try {
        // Try the official Realms API endpoint
        const realmUrl = `https://api.realms.today/api/governance/realm/${ISLAND_DAO_REALM}/voter/${walletAddress}`;
        
        console.log(`Fetching from Realms API: ${walletAddress}`);
        
        const response = await fetch(realmUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'IslandDAO-CitizenMap/1.0'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data && data.voting_power) {
                const votingPower = parseFloat(data.voting_power) || 0;
                console.log(`  Found voting power: ${votingPower.toLocaleString()} ISLAND`);
                return votingPower;
            }
        } else {
            console.log(`  API response: ${response.status} ${response.statusText}`);
        }
        
        return 0;
        
    } catch (error) {
        console.log(`  Error fetching from Realms API: ${error.message}`);
        return 0;
    }
}

/**
 * Alternative: Try Realms governance endpoint
 */
async function fetchFromRealmsGovernanceAPI(walletAddress) {
    try {
        const governanceUrl = `https://governance-api.realms.today/api/voter-record/${GOVERNANCE_PROGRAM_ID}/${ISLAND_DAO_REALM}/${walletAddress}`;
        
        const response = await fetch(governanceUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'IslandDAO-CitizenMap/1.0'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data && data.deposit_amount) {
                const depositAmount = parseFloat(data.deposit_amount) / Math.pow(10, 6); // Convert from lamports
                console.log(`  Found deposit: ${depositAmount.toLocaleString()} ISLAND`);
                return depositAmount;
            }
        }
        
        return 0;
        
    } catch (error) {
        console.log(`  Error fetching governance API: ${error.message}`);
        return 0;
    }
}

/**
 * Try Solana governance RPC method
 */
async function fetchFromSolanaRPC(walletAddress) {
    try {
        const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
        
        // Try getTokenAccountsByOwner for governance deposits
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    walletAddress,
                    {
                        mint: 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a' // ISLAND token mint
                    },
                    {
                        encoding: 'jsonParsed'
                    }
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.result && data.result.value) {
                for (const account of data.result.value) {
                    const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
                    if (balance > 0) {
                        console.log(`  Token account balance: ${balance.toLocaleString()} ISLAND`);
                        // This is wallet balance, not governance deposit
                    }
                }
            }
        }
        
        return 0;
        
    } catch (error) {
        console.log(`  RPC error: ${error.message}`);
        return 0;
    }
}

/**
 * Get governance power using multiple methods
 */
async function getGovernancePowerMultiMethod(walletAddress) {
    console.log(`Getting governance power for: ${walletAddress}`);
    
    // Try Realms API first
    let power = await fetchGovernanceFromRealmsAPI(walletAddress);
    if (power > 0) return power;
    
    // Try alternative governance API
    power = await fetchFromRealmsGovernanceAPI(walletAddress);
    if (power > 0) return power;
    
    // Try RPC method
    power = await fetchFromSolanaRPC(walletAddress);
    if (power > 0) return power;
    
    return 0;
}

/**
 * Sync governance power for all citizens using API methods
 */
async function syncGovernancePowerFromAPIs() {
    try {
        console.log('Syncing governance power using API methods...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Found ${walletAddresses.length} citizens to check`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = await getGovernancePowerMultiMethod(walletAddress);
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            if (power > 0) {
                console.log(`Updated ${walletAddress}: ${power.toLocaleString()} ISLAND`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Summary
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Check known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        if (results[knownWallet]) {
            console.log(`Known wallet governance power: ${results[knownWallet].toLocaleString()} ISLAND`);
        }
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance from APIs:', error.message);
        return {};
    }
}

/**
 * Test with known wallet first
 */
async function testKnownWalletAPIs() {
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    console.log('Testing known wallet with API methods...');
    
    const power = await getGovernancePowerMultiMethod(knownWallet);
    
    if (power > 0) {
        console.log(`✅ Found governance power: ${power.toLocaleString()} ISLAND`);
        
        if (Math.abs(power - 12625.580931) < 1) {
            console.log('✅ Amount matches expected value!');
        }
    } else {
        console.log('❌ No governance power found via APIs');
    }
    
    return power;
}

if (require.main === module) {
    testKnownWalletAPIs()
        .then((power) => {
            if (power > 0) {
                console.log('\nAPI method successful, proceeding with full sync...');
                return syncGovernancePowerFromAPIs();
            } else {
                console.log('\nAPI methods not working, may need authentication or different endpoint');
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernancePowerFromAPIs, 
    getGovernancePowerMultiMethod, 
    testKnownWalletAPIs 
};