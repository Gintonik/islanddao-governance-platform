/**
 * Query Realms API directly for IslandDAO governance data
 * Based on the URL: https://app.realms.today/dao/IslandDAO
 */

const fetch = require('node-fetch');

// Target wallet we know has 625.58 deposited
const TARGET_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

async function queryRealmsAPI() {
    try {
        console.log('🔍 Querying Realms API for IslandDAO governance data');
        console.log('Target wallet:', TARGET_WALLET);
        console.log('');

        // Try different API endpoints that Realms might use
        const apiEndpoints = [
            'https://app.realms.today/api/dao/IslandDAO',
            'https://api.realms.today/dao/IslandDAO',
            'https://app.realms.today/api/v1/dao/IslandDAO',
            'https://realms-api.vercel.app/api/dao/IslandDAO',
            'https://governance-api.solana.com/v1/realms/IslandDAO'
        ];

        for (const endpoint of apiEndpoints) {
            console.log(`📡 Trying endpoint: ${endpoint}`);
            
            try {
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (compatible; GovernanceQuery/1.0)'
                    }
                });

                console.log(`  Status: ${response.status}`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('  ✅ Success! Response data:');
                    console.log(JSON.stringify(data, null, 2));
                    
                    return data;
                } else {
                    console.log(`  ❌ Failed with status: ${response.status}`);
                }
                
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
            
            console.log('');
        }

        // Try querying for specific governance power data
        console.log('🔍 Trying governance power specific endpoints...');
        
        const governanceEndpoints = [
            `https://app.realms.today/api/governance/${TARGET_WALLET}`,
            `https://api.realms.today/governance/${TARGET_WALLET}`,
            `https://app.realms.today/api/voting-power/${TARGET_WALLET}`,
            `https://realms-api.vercel.app/api/voting-power/${TARGET_WALLET}`
        ];

        for (const endpoint of governanceEndpoints) {
            console.log(`📡 Trying: ${endpoint}`);
            
            try {
                const response = await fetch(endpoint);
                console.log(`  Status: ${response.status}`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('  ✅ Governance data found:');
                    console.log(JSON.stringify(data, null, 2));
                    return data;
                }
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
        }

        // Try searching for the realm configuration that Realms uses
        console.log('🔍 Trying to get realm configuration...');
        
        const configEndpoints = [
            'https://app.realms.today/api/realms',
            'https://api.realms.today/realms',
            'https://app.realms.today/api/v1/realms'
        ];

        for (const endpoint of configEndpoints) {
            console.log(`📡 Trying: ${endpoint}`);
            
            try {
                const response = await fetch(endpoint);
                console.log(`  Status: ${response.status}`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('  ✅ Realms list found');
                    
                    // Look for IslandDAO in the realms list
                    if (Array.isArray(data)) {
                        const islandDAO = data.find(realm => 
                            realm.name?.toLowerCase().includes('island') ||
                            realm.displayName?.toLowerCase().includes('island')
                        );
                        
                        if (islandDAO) {
                            console.log('  🎯 Found IslandDAO configuration:');
                            console.log(JSON.stringify(islandDAO, null, 2));
                            return islandDAO;
                        }
                    } else if (data.realms) {
                        const islandDAO = data.realms.find(realm => 
                            realm.name?.toLowerCase().includes('island') ||
                            realm.displayName?.toLowerCase().includes('island')
                        );
                        
                        if (islandDAO) {
                            console.log('  🎯 Found IslandDAO configuration:');
                            console.log(JSON.stringify(islandDAO, null, 2));
                            return islandDAO;
                        }
                    }
                }
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
        }

        console.log('❌ Could not find IslandDAO data through API endpoints');
        return null;

    } catch (error) {
        console.error('❌ Error querying Realms API:', error.message);
        return null;
    }
}

// Run the API query
queryRealmsAPI().then((result) => {
    if (result) {
        console.log('\n✅ Successfully retrieved IslandDAO data from Realms API');
    } else {
        console.log('\n❌ Could not retrieve IslandDAO data from public APIs');
        console.log('The Realms interface likely uses internal APIs or requires authentication');
    }
    process.exit(0);
});