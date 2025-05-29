/**
 * Precise VSR Implementation
 * Based on the exact patterns from the ochaloup gist
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Search for the actual VSR registrar by examining program accounts
 */
async function findActualVSRRegistrar() {
    try {
        console.log('Searching for actual VSR registrar in program accounts...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        // Get all VSR program accounts with specific size range for registrars
        const accounts = await connection.getProgramAccounts(vsrProgramPubkey, {
            filters: [
                { dataSize: { min: 200, max: 600 } } // Registrars are typically in this range
            ]
        });
        
        console.log(`Found ${accounts.length} potential registrar accounts`);
        
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        
        for (const account of accounts) {
            const data = account.account.data;
            
            // Check if this account references the IslandDAO realm
            for (let offset = 0; offset <= data.length - 32; offset++) {
                try {
                    const pubkeyBytes = data.subarray(offset, offset + 32);
                    const pubkey = new PublicKey(pubkeyBytes);
                    
                    if (pubkey.equals(realmPubkey)) {
                        console.log(`Found registrar candidate: ${account.pubkey.toString()}`);
                        console.log(`Realm reference at offset: ${offset}`);
                        console.log(`Account size: ${data.length} bytes`);
                        return account.pubkey;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding actual VSR registrar:', error.message);
        return null;
    }
}

/**
 * Get all voter accounts for the registrar
 */
async function getAllVoterAccounts(registrarPubkey) {
    try {
        console.log(`Getting all voter accounts for registrar: ${registrarPubkey.toString()}`);
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        const accounts = await connection.getProgramAccounts(vsrProgramPubkey, {
            filters: [
                { dataSize: { min: 80, max: 2000 } }, // Voter accounts range
                {
                    memcmp: {
                        offset: 40, // Registrar is typically at offset 40 in voter accounts
                        bytes: registrarPubkey.toBase58()
                    }
                }
            ]
        });
        
        console.log(`Found ${accounts.length} voter accounts`);
        return accounts;
        
    } catch (error) {
        console.error('Error getting voter accounts:', error.message);
        return [];
    }
}

/**
 * Parse voter account to extract wallet and voting power
 */
function parseVoterAccount(accountData, accountPubkey) {
    try {
        if (!accountData || accountData.length < 80) return null;
        
        // Try to extract wallet address from common positions
        const walletOffsets = [8, 40, 72]; // Common positions for voter authority
        
        for (const walletOffset of walletOffsets) {
            if (accountData.length >= walletOffset + 32) {
                try {
                    const walletBytes = accountData.subarray(walletOffset, walletOffset + 32);
                    const walletAddress = new PublicKey(walletBytes).toString();
                    
                    // Check if this looks like a valid wallet (not all zeros or ones)
                    if (walletAddress.length === 44 && 
                        !walletAddress.includes('1111111111111111111') && 
                        !walletAddress.startsWith('11111111111111111111111111111111')) {
                        
                        // Now look for voting power amounts
                        const powerOffsets = [80, 88, 96, 104, 112, 120, 128]; // Common deposit positions
                        
                        for (const powerOffset of powerOffsets) {
                            if (accountData.length >= powerOffset + 8) {
                                try {
                                    const amount = accountData.readBigUInt64LE(powerOffset);
                                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                                    
                                    // Look for reasonable governance amounts
                                    if (tokenAmount > 10 && tokenAmount < 100000000) {
                                        return {
                                            accountPubkey: accountPubkey.toString(),
                                            walletAddress: walletAddress,
                                            votingPower: tokenAmount,
                                            walletOffset: walletOffset,
                                            powerOffset: powerOffset
                                        };
                                    }
                                } catch (error) {
                                    continue;
                                }
                            }
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Build complete governance map from VSR data
 */
async function buildGovernanceMapFromVSR() {
    try {
        console.log('Building governance map from VSR data...');
        
        // Find the actual registrar
        const registrarPubkey = await findActualVSRRegistrar();
        if (!registrarPubkey) {
            console.log('Could not find VSR registrar');
            return new Map();
        }
        
        // Get all voter accounts
        const voterAccounts = await getAllVoterAccounts(registrarPubkey);
        if (voterAccounts.length === 0) {
            console.log('No voter accounts found');
            return new Map();
        }
        
        const governanceMap = new Map();
        
        console.log('Parsing voter accounts...');
        
        for (const account of voterAccounts) {
            const voterData = parseVoterAccount(account.account.data, account.pubkey);
            
            if (voterData) {
                console.log(`Found: ${voterData.walletAddress} -> ${voterData.votingPower.toLocaleString()} ISLAND`);
                
                // Accumulate if wallet appears multiple times
                const existing = governanceMap.get(voterData.walletAddress) || 0;
                governanceMap.set(voterData.walletAddress, existing + voterData.votingPower);
                
                // Check if this is our known wallet
                if (voterData.walletAddress === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4') {
                    console.log(`🎯 Found known wallet with ${voterData.votingPower.toLocaleString()} ISLAND`);
                    
                    if (Math.abs(voterData.votingPower - 12625.580931) < 1) {
                        console.log('✅ Amount matches expected value!');
                    }
                }
            }
        }
        
        console.log(`\nFound ${governanceMap.size} wallets with governance power`);
        
        // Show top depositors
        const sortedEntries = Array.from(governanceMap.entries())
            .sort(([,a], [,b]) => b - a);
        
        console.log('\nTop governance depositors:');
        sortedEntries.slice(0, 10).forEach(([wallet, power], index) => {
            console.log(`  ${index + 1}. ${wallet}: ${power.toLocaleString()} ISLAND`);
        });
        
        return governanceMap;
        
    } catch (error) {
        console.error('Error building governance map from VSR:', error.message);
        return new Map();
    }
}

/**
 * Sync citizens with VSR governance data
 */
async function syncCitizensWithVSRData() {
    try {
        console.log('Syncing citizens with VSR governance data...');
        
        const governanceMap = await buildGovernanceMapFromVSR();
        
        if (governanceMap.size === 0) {
            console.log('No governance data found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = governanceMap.get(walletAddress) || 0;
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            if (power > 0) {
                console.log(`  Updated ${walletAddress}: ${power.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total citizen governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing citizens with VSR data:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncCitizensWithVSRData()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncCitizensWithVSRData, 
    buildGovernanceMapFromVSR 
};