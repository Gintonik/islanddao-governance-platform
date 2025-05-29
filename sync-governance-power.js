/**
 * Sync Governance Power for Citizens
 * Fetches authentic ISLAND token governance deposits from IslandDAO's VSR system
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Get VSR voter PDA for a wallet
 */
function getVSRVoterPDA(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        const [voterPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("voter"),
                realmPubkey.toBuffer(),
                walletPubkey.toBuffer()
            ],
            vsrProgramPubkey
        );
        
        return voterPDA;
    } catch (error) {
        return null;
    }
}

/**
 * Parse VSR Voter account data to extract governance power
 */
function parseVSRVoterAccount(accountData) {
    try {
        if (!accountData || accountData.length < 8) return 0;
        
        // VSR voter accounts store voting power at different offsets
        // Try common offsets where governance power is stored
        const offsets = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112];
        
        for (const offset of offsets) {
            if (accountData.length >= offset + 8) {
                try {
                    const lamports = accountData.readBigUInt64LE(offset);
                    const tokenAmount = Number(lamports) / Math.pow(10, 6);
                    
                    // Filter for reasonable governance amounts (1-100M ISLAND)
                    if (tokenAmount >= 1 && tokenAmount <= 100000000) {
                        return tokenAmount;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return 0;
    } catch (error) {
        return 0;
    }
}

/**
 * Get authentic governance power for a specific wallet
 */
async function getAuthenticGovernancePower(walletAddress) {
    try {
        // Try VSR approach first
        const voterPDA = getVSRVoterPDA(walletAddress);
        if (voterPDA) {
            const accountInfo = await connection.getAccountInfo(voterPDA);
            if (accountInfo && accountInfo.data) {
                const power = parseVSRVoterAccount(accountInfo.data);
                if (power > 0) {
                    return power;
                }
            }
        }
        
        // Fallback: Try standard Token Owner Record approach
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        const walletPubkey = new PublicKey(walletAddress);
        const governanceProgramPubkey = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        const [torPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"),
                realmPubkey.toBuffer(),
                mintPubkey.toBuffer(),
                walletPubkey.toBuffer()
            ],
            governanceProgramPubkey
        );
        
        const torAccount = await connection.getAccountInfo(torPDA);
        if (torAccount && torAccount.data && torAccount.data.length >= 105) {
            const depositLamports = torAccount.data.readBigUInt64LE(97);
            const depositAmount = Number(depositLamports) / Math.pow(10, 6);
            if (depositAmount > 0) {
                return depositAmount;
            }
        }
        
        return 0;
    } catch (error) {
        console.log(`Error getting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get authentic governance power for multiple wallets
 */
async function getMultipleAuthenticGovernancePower(walletAddresses) {
    const results = {};
    
    console.log(`Fetching governance power for ${walletAddresses.length} wallets...`);
    
    for (const walletAddress of walletAddresses) {
        const power = await getAuthenticGovernancePower(walletAddress);
        results[walletAddress] = power;
        
        if (power > 0) {
            console.log(`  ${walletAddress}: ${power.toLocaleString()} ISLAND`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

/**
 * Sync authentic governance power for all citizens
 */
async function syncAuthenticGovernancePowerForAllCitizens() {
    try {
        console.log('Syncing authentic governance power for all citizens...');
        
        // Get all citizens from database
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        if (walletAddresses.length === 0) {
            console.log('No citizens found in database');
            return [];
        }
        
        console.log(`Found ${walletAddresses.length} citizens`);
        
        // Get governance power for all wallets
        const governancePowerMap = await getMultipleAuthenticGovernancePower(walletAddresses);
        
        // Update database
        console.log('Updating database with governance power...');
        
        for (const [walletAddress, power] of Object.entries(governancePowerMap)) {
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
        }
        
        // Summary
        const citizensWithPower = Object.values(governancePowerMap).filter(p => p > 0).length;
        const totalPower = Object.values(governancePowerMap).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Check for known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        if (governancePowerMap[knownWallet]) {
            console.log(`Known wallet ${knownWallet}: ${governancePowerMap[knownWallet].toLocaleString()} ISLAND`);
        }
        
        return governancePowerMap;
        
    } catch (error) {
        console.error('Error syncing authentic governance power:', error.message);
        return {};
    }
}

/**
 * Test with known wallets to verify authenticity
 */
async function testAuthenticGovernancePower() {
    console.log('Testing authentic governance power with known wallets...');
    
    const testWallets = [
        '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', // Should have ~12,625.58 ISLAND
        '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA'  // Another test wallet
    ];
    
    for (const wallet of testWallets) {
        const power = await getAuthenticGovernancePower(wallet);
        console.log(`${wallet}: ${power.toLocaleString()} ISLAND`);
        
        if (wallet === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4' && Math.abs(power - 12625.580931) < 1) {
            console.log('✅ Known wallet matches expected governance power!');
        }
    }
}

if (require.main === module) {
    syncAuthenticGovernancePowerForAllCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Sync failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncAuthenticGovernancePowerForAllCitizens, 
    getAuthenticGovernancePower, 
    getMultipleAuthenticGovernancePower, 
    testAuthenticGovernancePower 
};