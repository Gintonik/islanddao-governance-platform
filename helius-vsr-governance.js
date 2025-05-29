/**
 * Helius Enhanced VSR Governance Query
 * Using Helius RPC enhanced methods to access IslandDAO VSR data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Use Helius getProgramAccounts with enhanced filtering
 */
async function findVSRRegistrarWithHelius() {
    try {
        console.log('Using Helius to find VSR registrar...');
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getProgramAccounts',
                params: [
                    VSR_PROGRAM_ID,
                    {
                        encoding: 'base64',
                        dataSlice: { offset: 0, length: 100 },
                        filters: [
                            { dataSize: { min: 100, max: 500 } },
                            {
                                memcmp: {
                                    offset: 8,
                                    bytes: ISLAND_DAO_REALM
                                }
                            }
                        ]
                    }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result && data.result.length > 0) {
            console.log(`Found ${data.result.length} potential VSR registrars`);
            
            for (const account of data.result) {
                console.log(`Registrar candidate: ${account.pubkey}`);
                return new PublicKey(account.pubkey);
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding VSR registrar with Helius:', error.message);
        return null;
    }
}

/**
 * Get voter accounts using Helius enhanced methods
 */
async function getVoterAccountsWithHelius(registrarPubkey) {
    try {
        console.log('Getting voter accounts with Helius...');
        
        const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getProgramAccounts',
                params: [
                    VSR_PROGRAM_ID,
                    {
                        encoding: 'base64',
                        filters: [
                            { dataSize: { min: 80, max: 1000 } },
                            {
                                memcmp: {
                                    offset: 40,
                                    bytes: registrarPubkey.toBase58()
                                }
                            }
                        ]
                    }
                ]
            })
        });
        
        const data = await response.json();
        
        if (data.result) {
            console.log(`Found ${data.result.length} voter accounts`);
            return data.result;
        }
        
        return [];
    } catch (error) {
        console.error('Error getting voter accounts with Helius:', error.message);
        return [];
    }
}

/**
 * Parse VSR voter account data
 */
function parseVSRVoterAccount(accountData) {
    try {
        const data = Buffer.from(accountData, 'base64');
        
        if (data.length < 80) return null;
        
        // VSR Voter structure:
        // 8-40: voter_authority
        // 40-72: registrar  
        // 72-80: deposits.len
        
        const depositsLen = data.readUInt32LE(72);
        if (depositsLen === 0) return null;
        
        let totalAmount = 0;
        let offset = 80;
        
        // Parse deposits
        for (let i = 0; i < depositsLen && offset + 40 <= data.length; i++) {
            const amountDeposited = data.readBigUInt64LE(offset);
            const tokenAmount = Number(amountDeposited) / Math.pow(10, 6);
            totalAmount += tokenAmount;
            offset += 40;
        }
        
        return {
            voterAuthority: new PublicKey(data.subarray(8, 40)).toString(),
            totalDeposited: totalAmount,
            deposits: depositsLen
        };
        
    } catch (error) {
        console.log('Error parsing VSR voter account:', error.message);
        return null;
    }
}

/**
 * Get governance power for specific wallet using Helius
 */
async function getGovernancePowerWithHelius(walletAddress) {
    try {
        // Find registrar
        const registrarPubkey = await findVSRRegistrarWithHelius();
        if (!registrarPubkey) {
            console.log('No VSR registrar found');
            return 0;
        }
        
        // Get voter accounts
        const voterAccounts = await getVoterAccountsWithHelius(registrarPubkey);
        
        for (const voterAccount of voterAccounts) {
            const voterData = parseVSRVoterAccount(voterAccount.account.data);
            
            if (voterData && voterData.voterAuthority === walletAddress) {
                console.log(`Found governance power for ${walletAddress}: ${voterData.totalDeposited.toLocaleString()} ISLAND`);
                return voterData.totalDeposited;
            }
        }
        
        return 0;
    } catch (error) {
        console.log(`Error getting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Alternative: Use Helius DAS API for account lookups
 */
async function getGovernanceWithDAS(walletAddress) {
    try {
        const response = await fetch(`${HELIUS_RPC_URL.replace('?api-key=', '/v0/accounts/')}${walletAddress}?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data && data.account) {
            console.log(`DAS account info for ${walletAddress}:`, data.account.executable);
            // Process DAS response for governance data
        }
        
        return 0;
    } catch (error) {
        console.log(`DAS API error for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Test with known wallet to verify Helius approach
 */
async function testHeliusGovernance() {
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    console.log(`Testing Helius governance query with: ${knownWallet}`);
    
    const power = await getGovernancePowerWithHelius(knownWallet);
    
    if (power > 0) {
        console.log(`✅ Found governance power: ${power.toLocaleString()} ISLAND`);
        
        if (Math.abs(power - 12625.580931) < 1) {
            console.log('✅ Amount matches expected value!');
        }
        
        return true;
    } else {
        console.log('❌ No governance power found with Helius');
        
        // Try DAS approach
        console.log('Trying DAS API approach...');
        const dasPower = await getGovernanceWithDAS(knownWallet);
        
        if (dasPower > 0) {
            console.log(`✅ Found governance power via DAS: ${dasPower.toLocaleString()} ISLAND`);
            return true;
        }
        
        return false;
    }
}

/**
 * Sync governance power for all citizens using Helius
 */
async function syncGovernancePowerWithHelius() {
    try {
        console.log('Syncing governance power using Helius enhanced RPC...');
        
        // Test first
        const testSuccess = await testHeliusGovernance();
        if (!testSuccess) {
            console.log('Helius governance test failed');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Processing ${walletAddresses.length} citizens`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = await getGovernancePowerWithHelius(walletAddress);
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            if (power > 0) {
                console.log(`Updated ${walletAddress}: ${power.toLocaleString()} ISLAND`);
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nHelius sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance with Helius:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncGovernancePowerWithHelius()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernancePowerWithHelius, 
    getGovernancePowerWithHelius, 
    testHeliusGovernance 
};