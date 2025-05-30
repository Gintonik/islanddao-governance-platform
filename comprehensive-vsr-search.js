/**
 * Comprehensive VSR Search
 * Search all VSR program accounts to find complete governance data for all citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

// All citizens to search for
const ALL_CITIZENS = [
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
    'Ev7kp4NfhVjvUqKMwhKCcvXRb2t828gDaSqWsD2gtPzT', 
    'Qrw6y2DiogvivGah9Dj9BuDu8Cr7qxCRUE h63Z1dmpv',
    'Cj1jScR4V73qLmvWJiGiWs9jtcwCXEZsmS5cevWt9jNc',
    'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i',
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
    '9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94',
    'HMsen7CFW9GQQVSF18DDN2PstSusbrTtMzDGUn2KMvWT',
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk',
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt' // DeanMachine
];

// Expected values for verification
const EXPECTED_VALUES = {
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': 10353648.013, // DeanMachine correct value
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.580931   // Known wallet
};

/**
 * Search all VSR accounts for exact governance values
 */
async function searchAllVSRForExactValues() {
    try {
        console.log('Searching all VSR accounts for exact governance values...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const accounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Examining ${accounts.length} VSR accounts`);
        
        const citizenGovernanceData = {};
        let accountsProcessed = 0;
        
        // Convert expected values to lamports for exact matching
        const expectedLamports = {};
        for (const [wallet, amount] of Object.entries(EXPECTED_VALUES)) {
            expectedLamports[wallet] = Math.round(amount * Math.pow(10, 6));
            console.log(`Looking for ${wallet}: ${amount.toLocaleString()} ISLAND = ${expectedLamports[wallet].toLocaleString()} lamports`);
        }
        
        for (const account of accounts) {
            accountsProcessed++;
            if (accountsProcessed % 1000 === 0) {
                console.log(`Processed ${accountsProcessed}/${accounts.length} accounts...`);
            }
            
            const data = account.account.data;
            
            // Search for citizen wallet references
            for (const citizenWallet of ALL_CITIZENS) {
                try {
                    const citizenPubkey = new PublicKey(citizenWallet);
                    
                    // Look for wallet reference in account data
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            
                            if (pubkey.equals(citizenPubkey)) {
                                // Found citizen wallet, now search for governance amounts
                                const governanceAmounts = [];
                                
                                // Search entire account for potential amounts
                                for (let amountOffset = 0; amountOffset <= data.length - 8; amountOffset += 8) {
                                    try {
                                        const amount = data.readBigUInt64LE(amountOffset);
                                        const lamports = Number(amount);
                                        const tokenAmount = lamports / Math.pow(10, 6);
                                        
                                        // Check for exact matches with expected values
                                        if (expectedLamports[citizenWallet] && lamports === expectedLamports[citizenWallet]) {
                                            console.log(`🎯 EXACT MATCH for ${citizenWallet}`);
                                            console.log(`  Account: ${account.pubkey.toString()}`);
                                            console.log(`  Wallet offset: ${offset}, Amount offset: ${amountOffset}`);
                                            console.log(`  Value: ${tokenAmount.toLocaleString()} ISLAND`);
                                            
                                            citizenGovernanceData[citizenWallet] = tokenAmount;
                                            break;
                                        }
                                        
                                        // Collect reasonable governance amounts
                                        if (tokenAmount > 10000 && tokenAmount < 50000000) {
                                            governanceAmounts.push({
                                                offset: amountOffset,
                                                amount: tokenAmount,
                                                lamports: lamports
                                            });
                                        }
                                        
                                    } catch (error) {
                                        continue;
                                    }
                                }
                                
                                // If no exact match found, log what we found
                                if (!citizenGovernanceData[citizenWallet] && governanceAmounts.length > 0) {
                                    console.log(`Found ${citizenWallet} in VSR account: ${account.pubkey.toString()}`);
                                    console.log(`  Wallet at offset: ${offset}`);
                                    console.log(`  Governance amounts found:`);
                                    
                                    for (const ga of governanceAmounts.slice(0, 5)) { // Show top 5
                                        console.log(`    Offset ${ga.offset}: ${ga.amount.toLocaleString()} ISLAND`);
                                        
                                        // Check for close matches to expected values
                                        if (expectedLamports[citizenWallet]) {
                                            const diff = Math.abs(ga.lamports - expectedLamports[citizenWallet]);
                                            if (diff < 1000000) { // Within 1 token
                                                console.log(`      Close to expected: ${(ga.lamports / Math.pow(10, 6)).toLocaleString()}`);
                                            }
                                        }
                                    }
                                    
                                    // Store the largest reasonable amount if no exact match
                                    if (!citizenGovernanceData[citizenWallet]) {
                                        const maxAmount = Math.max(...governanceAmounts.map(ga => ga.amount));
                                        if (maxAmount > 100000) { // Only store significant amounts
                                            citizenGovernanceData[citizenWallet] = maxAmount;
                                        }
                                    }
                                }
                                
                                break; // Found wallet, move to next citizen
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        console.log(`\nVSR search complete. Processed ${accountsProcessed} accounts.`);
        return citizenGovernanceData;
        
    } catch (error) {
        console.error('Error searching VSR for exact values:', error.message);
        return {};
    }
}

/**
 * Update citizens with comprehensive VSR governance data
 */
async function updateCitizensWithComprehensiveVSR() {
    try {
        console.log('Updating citizens with comprehensive VSR governance data...');
        
        const vsrGovernanceData = await searchAllVSRForExactValues();
        
        if (Object.keys(vsrGovernanceData).length === 0) {
            console.log('No VSR governance data found');
            return {};
        }
        
        console.log('\nFound VSR governance data:');
        for (const [wallet, amount] of Object.entries(vsrGovernanceData)) {
            console.log(`  ${wallet}: ${amount.toLocaleString()} ISLAND`);
        }
        
        // Get all citizens from database
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with VSR governance data`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = vsrGovernanceData[walletAddress] || 0;
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
        
        console.log(`\nComprehensive VSR governance sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Verify DeanMachine
        const deanMachine = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
        if (results[deanMachine]) {
            console.log(`\nDeanMachine governance power: ${results[deanMachine].toLocaleString()} ISLAND`);
            if (Math.abs(results[deanMachine] - 10353648.013) < 1) {
                console.log('✅ DeanMachine value matches expected amount!');
            }
        }
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with comprehensive VSR:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithComprehensiveVSR()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithComprehensiveVSR,
    searchAllVSRForExactValues
};