/**
 * VSR Governance Power Calculator
 * Understand how IslandDAO calculates governance power from VSR deposits
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// VSR Program ID used by IslandDAO
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

/**
 * Find VSR Voter accounts for IslandDAO
 */
async function findVSRVoterAccounts() {
    try {
        console.log('Searching for VSR Voter accounts...');
        
        const programId = new PublicKey(VSR_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        
        // Get all VSR accounts
        const accounts = await connection.getProgramAccounts(programId);
        
        console.log(`Found ${accounts.length} VSR accounts`);
        
        const voterAccounts = [];
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                if (data.length >= 200) { // VSR Voter accounts are typically larger
                    // Look for realm reference
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            if (pubkey.equals(realmPubkey)) {
                                console.log(`Found VSR account referencing IslandDAO realm: ${account.pubkey.toString()}`);
                                
                                // Try to find wallet addresses in this account
                                for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset++) {
                                    try {
                                        const walletPubkey = new PublicKey(data.subarray(walletOffset, walletOffset + 32));
                                        const walletStr = walletPubkey.toString();
                                        
                                        // Check if it's a valid wallet (not our known system addresses)
                                        if (walletStr.length === 44 && 
                                            !walletStr.includes('1111111111111111111') &&
                                            walletStr !== ISLAND_DAO_REALM &&
                                            walletStr !== VSR_PROGRAM_ID) {
                                            
                                            // Look for deposit amounts near this wallet
                                            for (let amountOffset = walletOffset + 32; amountOffset < Math.min(data.length - 8, walletOffset + 200); amountOffset += 8) {
                                                try {
                                                    const amount = data.readBigUInt64LE(amountOffset);
                                                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                                                    
                                                    if (tokenAmount > 100 && tokenAmount < 100000) {
                                                        voterAccounts.push({
                                                            account: account.pubkey.toString(),
                                                            wallet: walletStr,
                                                            amount: tokenAmount,
                                                            walletOffset: walletOffset,
                                                            amountOffset: amountOffset
                                                        });
                                                        
                                                        console.log(`  ${walletStr}: ${tokenAmount.toLocaleString()} ISLAND`);
                                                        
                                                        if (walletStr === KNOWN_WALLET) {
                                                            console.log(`  🎯 Found known wallet with ${tokenAmount.toLocaleString()} ISLAND`);
                                                        }
                                                    }
                                                } catch (error) {
                                                    continue;
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                                
                                break;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return voterAccounts;
        
    } catch (error) {
        console.error('Error finding VSR voter accounts:', error.message);
        return [];
    }
}

/**
 * Analyze VSR governance power calculation
 */
async function analyzeVSRGovernancePower() {
    try {
        console.log('Analyzing VSR governance power calculation...');
        
        const voterAccounts = await findVSRVoterAccounts();
        
        if (voterAccounts.length === 0) {
            console.log('No VSR voter accounts found');
            return {};
        }
        
        console.log(`\nFound ${voterAccounts.length} VSR deposits`);
        
        // Group by wallet to calculate total governance power
        const walletPowers = new Map();
        
        for (const voter of voterAccounts) {
            const existing = walletPowers.get(voter.wallet) || 0;
            walletPowers.set(voter.wallet, existing + voter.amount);
        }
        
        console.log('\nCalculated governance powers:');
        for (const [wallet, power] of walletPowers.entries()) {
            console.log(`${wallet}: ${power.toLocaleString()} ISLAND`);
            
            if (wallet === KNOWN_WALLET) {
                console.log(`🎯 Known wallet governance power: ${power.toLocaleString()} ISLAND`);
            }
        }
        
        return Object.fromEntries(walletPowers);
        
    } catch (error) {
        console.error('Error analyzing VSR governance power:', error.message);
        return {};
    }
}

/**
 * Update citizens with VSR governance power
 */
async function updateCitizensWithVSRGovernance() {
    try {
        console.log('Updating citizens with VSR governance power...');
        
        const governancePowers = await analyzeVSRGovernancePower();
        
        if (Object.keys(governancePowers).length === 0) {
            console.log('No VSR governance powers calculated');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with VSR governance data`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = governancePowers[walletAddress] || 0;
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
        
        console.log(`\nVSR governance sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with VSR governance:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithVSRGovernance()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithVSRGovernance,
    analyzeVSRGovernancePower,
    findVSRVoterAccounts
};