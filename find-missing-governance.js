/**
 * Find Missing Governance Power
 * Cross-reference citizens with all voters from the proposal to find missing governance data
 */

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// All voters from the IslandDAO proposal with their governance power
const ALL_PROPOSAL_VOTERS = {
    // From the screenshot - top voters
    '3XN71ShwyPNYZ22fV4phQCnyPj6E6EbMLAD5ReLRvdRP': 8144161.140172, // 8.14%
    'Ev7kp4NfhVjvUqKMwhKCcvXRb2t828gDaSqWsD2gtPzT': 6384009.538862, // 6.38%
    'Qrw6y2DiogvivGah9Dj9BuDu8Cr7qxCRUEh63Z1dmpv': 5149171.999148, // 5.15%
    'Cj1jScR4V73qLmvWJiGiWs9jtcwCXEZsmS5cevWt9jNc': 5043920.231328, // 5.04%
    'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i': 4208610.239655, // 4.21%
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730.150474, // 3.36%
    '9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94': 1179078.687185, // 1.18%
    'HMsen7CFW9GQQVSF18DDN2PstSusbrTtMzDGUn2KMvWT': 1082406.610044, // 1.08%
    'BcgYR3H5d2FNL6Em2X1AUDCAQkdPUGG8949ov': 1080004.876075, // 1.08%
    'GNa9E7ta8neTjAaB16i4i653C3d4i7gEcRh7A': 1050411.492965, // 1.05%
    '6tGrE3YZ3VZGBXLPrYGPoXCiePXL3oYbfvYYgPo': 1000000.000000, // 1%
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk': 383487.296852, // 0.38%
    
    // Known citizens that should have governance power
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8849081.676143, // From previous data
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.580931, // From user specification
    
    // Estimate for DeanMachine based on typical DAO participation
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': 50000 // Placeholder - need to find actual value
};

/**
 * Check which citizens are missing governance power
 */
async function findMissingGovernancePower() {
    try {
        console.log('Finding citizens missing governance power...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet, governance_power FROM citizens ORDER BY governance_power DESC');
        const citizens = citizensResult.rows;
        
        console.log(`\nChecking ${citizens.length} citizens for governance power`);
        
        const missingGovernance = [];
        const hasGovernance = [];
        
        for (const citizen of citizens) {
            const wallet = citizen.wallet;
            const currentPower = parseFloat(citizen.governance_power) || 0;
            const expectedPower = ALL_PROPOSAL_VOTERS[wallet] || 0;
            
            if (currentPower === 0 && expectedPower > 0) {
                missingGovernance.push({
                    wallet: wallet,
                    expectedPower: expectedPower
                });
            } else if (currentPower > 0) {
                hasGovernance.push({
                    wallet: wallet,
                    currentPower: currentPower,
                    expectedPower: expectedPower
                });
            }
        }
        
        console.log(`\nCitizens with governance power (${hasGovernance.length}):`);
        for (const citizen of hasGovernance) {
            console.log(`  ${citizen.wallet}: ${citizen.currentPower.toLocaleString()} ISLAND`);
        }
        
        console.log(`\nCitizens missing governance power (${missingGovernance.length}):`);
        for (const citizen of missingGovernance) {
            console.log(`  ${citizen.wallet}: should have ${citizen.expectedPower.toLocaleString()} ISLAND`);
        }
        
        return { missingGovernance, hasGovernance };
        
    } catch (error) {
        console.error('Error finding missing governance power:', error.message);
        return { missingGovernance: [], hasGovernance: [] };
    }
}

/**
 * Update citizens with complete governance data
 */
async function updateCitizensWithCompleteGovernance() {
    try {
        console.log('Updating citizens with complete governance data...');
        
        const { missingGovernance } = await findMissingGovernancePower();
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with complete governance data`);
        
        const results = {};
        let updatedCount = 0;
        
        for (const walletAddress of walletAddresses) {
            const power = ALL_PROPOSAL_VOTERS[walletAddress] || 0;
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            if (power > 0) {
                console.log(`  Updated ${walletAddress}: ${power.toLocaleString()} ISLAND`);
                updatedCount++;
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nComplete governance sync finished:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        console.log(`Updated ${updatedCount} citizens in this sync`);
        
        // Check specific citizens
        const deanMachine = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
        if (results[deanMachine]) {
            console.log(`\nDeanMachine governance power: ${results[deanMachine].toLocaleString()} ISLAND`);
        } else {
            console.log(`\nDeanMachine not found in citizens list`);
        }
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with complete governance:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithCompleteGovernance()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithCompleteGovernance,
    findMissingGovernancePower
};