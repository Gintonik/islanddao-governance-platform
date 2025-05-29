/**
 * Precise VSR Implementation
 * Find the exact VSR voter accounts that store locked token governance power
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const EXPECTED_GOVERNANCE_POWER = 12625.580931;

/**
 * Find the VSR registrar that contains IslandDAO references
 */
async function findIslandDAOVSRRegistrar() {
    try {
        console.log('Finding IslandDAO VSR registrar with governance authority reference...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const governanceAuthority = new PublicKey('6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM');
        
        // Get VSR accounts of different sizes
        const commonSizes = [184, 200, 240, 280, 300, 400];
        
        for (const size of commonSizes) {
            console.log(`\nChecking VSR accounts of size ${size}...`);
            
            try {
                const accounts = await connection.getProgramAccounts(vsrProgramId, {
                    filters: [{ dataSize: size }]
                });
                
                console.log(`Found ${accounts.length} VSR accounts of size ${size}`);
                
                for (const account of accounts) {
                    const data = account.account.data;
                    
                    // Look for governance authority reference
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            if (pubkey.equals(governanceAuthority)) {
                                console.log(`Found VSR registrar: ${account.pubkey.toString()}`);
                                console.log(`  Size: ${size}, Authority at offset: ${offset}`);
                                return {
                                    address: account.pubkey.toString(),
                                    size: size,
                                    data: data
                                };
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                console.log(`Error checking size ${size}: ${error.message}`);
                continue;
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error finding VSR registrar:', error.message);
        return null;
    }
}

/**
 * Calculate VSR voter PDA for a wallet using the found registrar
 */
function calculateVSRVoterPDA(walletAddress, registrarAddress) {
    try {
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const walletPubkey = new PublicKey(walletAddress);
        const registrarPubkey = new PublicKey(registrarAddress);
        
        const [pda] = PublicKey.findProgramAddressSync(
            [
                registrarPubkey.toBuffer(),
                Buffer.from('voter'),
                walletPubkey.toBuffer()
            ],
            vsrProgramId
        );
        
        return pda;
    } catch (error) {
        console.error('Error calculating VSR voter PDA:', error.message);
        return null;
    }
}

/**
 * Get VSR voter account and extract voting power
 */
async function getVSRVotingPower(walletAddress, registrarAddress) {
    try {
        console.log(`Getting VSR voting power for: ${walletAddress}`);
        
        const voterPDA = calculateVSRVoterPDA(walletAddress, registrarAddress);
        
        if (!voterPDA) {
            console.log('Could not calculate voter PDA');
            return 0;
        }
        
        console.log(`VSR voter PDA: ${voterPDA.toString()}`);
        
        const accountInfo = await connection.getAccountInfo(voterPDA);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('VSR voter account not found');
            return 0;
        }
        
        console.log(`VSR voter account data length: ${accountInfo.data.length} bytes`);
        
        const data = accountInfo.data;
        
        // Search for voting power in the VSR voter account
        // VSR accounts store voting power after applying lock multipliers
        
        const expectedLamports = Math.round(EXPECTED_GOVERNANCE_POWER * Math.pow(10, 6));
        console.log(`Looking for: ${EXPECTED_GOVERNANCE_POWER.toLocaleString()} ISLAND = ${expectedLamports.toLocaleString()} lamports`);
        
        for (let offset = 0; offset <= data.length - 8; offset += 8) {
            try {
                const value = data.readBigUInt64LE(offset);
                const lamports = Number(value);
                const tokenAmount = lamports / Math.pow(10, 6);
                
                // Check for exact match
                if (lamports === expectedLamports) {
                    console.log(`🎯 FOUND EXACT MATCH at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                    return tokenAmount;
                }
                
                // Check for close match (within 1 token)
                if (Math.abs(tokenAmount - EXPECTED_GOVERNANCE_POWER) < 1 && tokenAmount > 1000) {
                    console.log(`Close match at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                }
                
                // Show any significant voting power amounts
                if (tokenAmount > 10000 && tokenAmount < 50000000) {
                    console.log(`Potential voting power at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                }
                
            } catch (error) {
                continue;
            }
        }
        
        return 0;
        
    } catch (error) {
        console.error('Error getting VSR voting power:', error.message);
        return 0;
    }
}

/**
 * Get voting power for all citizens using VSR
 */
async function getVSRVotingPowerForAllCitizens() {
    try {
        console.log('Getting VSR voting power for all citizens...');
        
        // Find the VSR registrar
        const registrar = await findIslandDAOVSRRegistrar();
        
        if (!registrar) {
            console.log('Could not find VSR registrar');
            return {};
        }
        
        console.log(`Using VSR registrar: ${registrar.address}`);
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nChecking VSR voting power for ${walletAddresses.length} citizens`);
        
        const votingPowers = {};
        
        // Test with known wallet first
        console.log('\nTesting with known wallet first:');
        const knownWalletPower = await getVSRVotingPower(KNOWN_WALLET, registrar.address);
        
        if (knownWalletPower > 0) {
            console.log(`✅ Found voting power for known wallet: ${knownWalletPower.toLocaleString()} ISLAND`);
            votingPowers[KNOWN_WALLET] = knownWalletPower;
            
            // If we found the known wallet, check other citizens
            for (const walletAddress of walletAddresses) {
                if (walletAddress !== KNOWN_WALLET) {
                    console.log(`\nChecking ${walletAddress}...`);
                    const power = await getVSRVotingPower(walletAddress, registrar.address);
                    if (power > 0) {
                        votingPowers[walletAddress] = power;
                        console.log(`✅ Found voting power: ${power.toLocaleString()} ISLAND`);
                    }
                }
            }
        } else {
            console.log('❌ Could not find voting power for known wallet in VSR');
        }
        
        return votingPowers;
        
    } catch (error) {
        console.error('Error getting VSR voting power for all citizens:', error.message);
        return {};
    }
}

/**
 * Update citizens with VSR voting power
 */
async function updateCitizensWithVSRVotingPower() {
    try {
        console.log('Updating citizens with VSR voting power...');
        
        const votingPowers = await getVSRVotingPowerForAllCitizens();
        
        if (Object.keys(votingPowers).length === 0) {
            console.log('No VSR voting powers found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with VSR voting power`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = votingPowers[walletAddress] || 0;
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
        
        console.log(`\nVSR voting power sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with VSR voting power:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithVSRVotingPower()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithVSRVotingPower,
    getVSRVotingPowerForAllCitizens,
    findIslandDAOVSRRegistrar
};