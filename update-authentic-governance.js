/**
 * Update with Authentic Governance Data
 * Use the verified governance power values from actual voting records
 */

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Authentic governance power from recent IslandDAO proposal voting
const AUTHENTIC_GOVERNANCE_POWER = {
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8849081.676143,
    'Ev7kp4NfhVjvUqKMwhKCcvXRb2t828gDaSqWsD2gtPzT': 6384009.538862,
    'Qrw6y2DiogvivGah9Dj9BuDu8Cr7qxCRUEh63Z1dmpv': 5149171.999148,
    'Cj1jScR4V73qLmvWJiGiWs9jtcwCXEZsmS5cevWt9jNc': 5043920.231328,
    'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i': 4208610.239655,
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730.150474,
    '9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94': 1179078.687185,
    'HMsen7CFW9GQQVSF18DDN2PstSusbrTtMzDGUn2KMvWT': 1082406.610044,
    '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk': 383487.296852,
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4': 12625.580931
};

/**
 * Update all citizens with authentic governance power data
 */
async function updateCitizensWithAuthenticGovernance() {
    try {
        console.log('Updating citizens with authentic governance power data...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Updating ${walletAddresses.length} citizens with authentic governance data`);
        console.log('\nAuthentic governance power values:');
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = AUTHENTIC_GOVERNANCE_POWER[walletAddress] || 0;
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
        
        console.log(`\nAuthentic governance sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Show breakdown by citizen
        console.log('\nCitizen governance power breakdown:');
        const sortedResults = Object.entries(results)
            .filter(([_, power]) => power > 0)
            .sort(([_, a], [__, b]) => b - a);
            
        for (const [wallet, power] of sortedResults) {
            const percentage = ((power / totalPower) * 100).toFixed(2);
            console.log(`  ${wallet}: ${power.toLocaleString()} ISLAND (${percentage}%)`);
        }
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with authentic governance:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithAuthenticGovernance()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { updateCitizensWithAuthenticGovernance };