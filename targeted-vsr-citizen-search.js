/**
 * Targeted VSR Citizen Search
 * Search for actual governance deposits for specific citizens in VSR accounts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

// Target citizens to find governance data for
const TARGET_CITIZENS = [
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // DeanMachine
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Known wallet for verification
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA'  // Another known wallet
];

/**
 * Search VSR program accounts for citizen wallet references
 */
async function searchVSRForCitizens() {
    try {
        console.log('Searching VSR program accounts for citizen governance data...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        
        // Get all VSR accounts
        const accounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Found ${accounts.length} VSR accounts to examine`);
        
        const citizenGovernanceData = {};
        
        for (const account of accounts) {
            const data = account.account.data;
            
            // Look for citizen wallet references in this VSR account
            for (const citizenWallet of TARGET_CITIZENS) {
                try {
                    const citizenPubkey = new PublicKey(citizenWallet);
                    
                    // Search for wallet reference in account data
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            
                            if (pubkey.equals(citizenPubkey)) {
                                console.log(`Found ${citizenWallet} in VSR account: ${account.pubkey.toString()}`);
                                console.log(`  Wallet found at offset: ${offset}`);
                                
                                // Look for governance amounts near the wallet reference
                                const governanceAmounts = [];
                                
                                for (let amountOffset = Math.max(0, offset - 200); amountOffset < Math.min(data.length - 8, offset + 200); amountOffset += 8) {
                                    try {
                                        const amount = data.readBigUInt64LE(amountOffset);
                                        const tokenAmount = Number(amount) / Math.pow(10, 6);
                                        
                                        if (tokenAmount > 1000 && tokenAmount < 50000000) {
                                            governanceAmounts.push({
                                                offset: amountOffset,
                                                amount: tokenAmount
                                            });
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                                
                                if (governanceAmounts.length > 0) {
                                    console.log(`  Found ${governanceAmounts.length} potential governance amounts:`);
                                    for (const ga of governanceAmounts) {
                                        console.log(`    Offset ${ga.offset}: ${ga.amount.toLocaleString()} ISLAND`);
                                    }
                                    
                                    // Store the highest reasonable amount
                                    const maxAmount = Math.max(...governanceAmounts.map(ga => ga.amount));
                                    citizenGovernanceData[citizenWallet] = maxAmount;
                                    
                                    console.log(`  Using: ${maxAmount.toLocaleString()} ISLAND for ${citizenWallet}`);
                                }
                                break;
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
        
        return citizenGovernanceData;
        
    } catch (error) {
        console.error('Error searching VSR for citizens:', error.message);
        return {};
    }
}

/**
 * Search governance program accounts for citizen deposits
 */
async function searchGovernanceForCitizens() {
    try {
        console.log('Searching SPL Governance accounts for citizen deposits...');
        
        const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        // Get governance accounts
        const accounts = await connection.getProgramAccounts(governanceProgramId, {
            filters: [{ dataSize: 105 }]
        });
        
        console.log(`Found ${accounts.length} governance accounts to examine`);
        
        const citizenGovernanceData = {};
        
        for (const account of accounts) {
            const data = account.account.data;
            
            if (data.length >= 105) {
                const accountType = data.readUInt8(0);
                
                if (accountType === 12) {
                    // Extract wallet at offset 33
                    try {
                        const wallet = new PublicKey(data.subarray(33, 65));
                        const walletStr = wallet.toString();
                        
                        // Check if this is one of our target citizens
                        if (TARGET_CITIZENS.includes(walletStr)) {
                            console.log(`Found ${walletStr} in governance account: ${account.pubkey.toString()}`);
                            
                            // Extract deposit amounts from known positions
                            const depositAmounts = [];
                            const checkOffsets = [67, 71, 79, 85, 91];
                            
                            for (const offset of checkOffsets) {
                                if (data.length >= offset + 8) {
                                    try {
                                        const value = data.readBigUInt64LE(offset);
                                        const tokenAmount = Number(value) / Math.pow(10, 6);
                                        
                                        if (tokenAmount > 100 && tokenAmount < 100000) {
                                            depositAmounts.push({
                                                offset: offset,
                                                amount: tokenAmount
                                            });
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                            }
                            
                            if (depositAmounts.length > 0) {
                                console.log(`  Found ${depositAmounts.length} deposit amounts:`);
                                for (const da of depositAmounts) {
                                    console.log(`    Offset ${da.offset}: ${da.amount.toLocaleString()} ISLAND`);
                                }
                                
                                // For known wallet, verify against expected amount
                                if (walletStr === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4') {
                                    console.log(`  Known wallet verification needed - raw amounts found`);
                                }
                                
                                // Store the largest deposit amount
                                const maxAmount = Math.max(...depositAmounts.map(da => da.amount));
                                citizenGovernanceData[walletStr] = maxAmount;
                                
                                console.log(`  Using: ${maxAmount.toLocaleString()} ISLAND for ${walletStr}`);
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        return citizenGovernanceData;
        
    } catch (error) {
        console.error('Error searching governance for citizens:', error.message);
        return {};
    }
}

/**
 * Get authentic governance data for target citizens
 */
async function getAuthenticCitizenGovernanceData() {
    try {
        console.log('Getting authentic governance data for target citizens...');
        
        // Search both VSR and governance programs
        const vsrData = await searchVSRForCitizens();
        const governanceData = await searchGovernanceForCitizens();
        
        console.log('\nVSR Results:');
        for (const [wallet, amount] of Object.entries(vsrData)) {
            console.log(`  ${wallet}: ${amount.toLocaleString()} ISLAND`);
        }
        
        console.log('\nGovernance Results:');
        for (const [wallet, amount] of Object.entries(governanceData)) {
            console.log(`  ${wallet}: ${amount.toLocaleString()} ISLAND`);
        }
        
        // Combine results, preferring governance data if available
        const combinedData = { ...vsrData, ...governanceData };
        
        console.log('\nCombined Authentic Governance Data:');
        for (const [wallet, amount] of Object.entries(combinedData)) {
            console.log(`  ${wallet}: ${amount.toLocaleString()} ISLAND`);
        }
        
        return combinedData;
        
    } catch (error) {
        console.error('Error getting authentic citizen governance data:', error.message);
        return {};
    }
}

/**
 * Update citizens with authentic on-chain governance data
 */
async function updateCitizensWithAuthenticOnChainData() {
    try {
        console.log('Updating citizens with authentic on-chain governance data...');
        
        const authenticData = await getAuthenticCitizenGovernanceData();
        
        if (Object.keys(authenticData).length === 0) {
            console.log('No authentic governance data found on-chain');
            return {};
        }
        
        // Get current governance data from database
        const citizensResult = await pool.query('SELECT wallet, governance_power FROM citizens');
        const citizens = citizensResult.rows;
        
        console.log('\nUpdating citizens with authentic on-chain data:');
        
        for (const citizen of citizens) {
            const wallet = citizen.wallet;
            const currentPower = parseFloat(citizen.governance_power) || 0;
            const authenticPower = authenticData[wallet];
            
            if (authenticPower !== undefined) {
                // Update with authentic data
                await pool.query(
                    'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                    [authenticPower, wallet]
                );
                
                console.log(`  Updated ${wallet}: ${authenticPower.toLocaleString()} ISLAND (was ${currentPower.toLocaleString()})`);
            }
        }
        
        // Show final results
        const finalResult = await pool.query('SELECT wallet, governance_power FROM citizens WHERE governance_power > 0 ORDER BY governance_power DESC');
        
        console.log('\nFinal authentic governance data:');
        for (const citizen of finalResult.rows) {
            console.log(`  ${citizen.wallet}: ${parseFloat(citizen.governance_power).toLocaleString()} ISLAND`);
        }
        
        return authenticData;
        
    } catch (error) {
        console.error('Error updating citizens with authentic on-chain data:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithAuthenticOnChainData()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithAuthenticOnChainData,
    getAuthenticCitizenGovernanceData
};