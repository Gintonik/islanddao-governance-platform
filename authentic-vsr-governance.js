/**
 * Authentic VSR Governance Power Calculator
 * Using the correct VSR program ID discovered from transaction analysis
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// Correct VSR Plugin Program ID from transaction analysis
const VSR_PLUGIN_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// IslandDAO Configuration
const ISLAND_DAO_CONFIG = {
    realmId: '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds',
    communityMint: 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a'
};

/**
 * Get VSR Voter PDA for a wallet
 */
function getVSRVoterPDA(walletAddress) {
    const walletPubkey = new PublicKey(walletAddress);
    const realmPubkey = new PublicKey(ISLAND_DAO_CONFIG.realmId);
    
    const [voterPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('voter'),
            realmPubkey.toBuffer(),
            walletPubkey.toBuffer()
        ],
        VSR_PLUGIN_PROGRAM_ID
    );
    
    return voterPDA;
}

/**
 * Parse VSR Voter account data to extract governance power
 */
function parseVSRVoterAccount(accountData) {
    try {
        // Skip discriminator (8 bytes)
        let offset = 8;
        
        // Skip voter_authority (32 bytes)
        offset += 32;
        
        // Skip registrar (32 bytes)
        offset += 32;
        
        // Read deposits array length
        const depositsLength = accountData.readUInt32LE(offset);
        offset += 4;
        
        let totalGovernancePower = 0;
        
        for (let i = 0; i < depositsLength; i++) {
            // VSR Deposit Entry structure
            // lockup: Lockup (variable size based on kind)
            // amount_deposited_native: u64
            // amount_initially_locked_native: u64
            // is_used: bool
            // padding: [u8; 7]
            
            // Read lockup kind
            const lockupKind = accountData.readUInt8(offset);
            offset += 1;
            
            // Skip lockup data based on kind
            if (lockupKind === 0) {
                // None - no additional data
            } else if (lockupKind === 1) {
                // Constant - start_ts (8) + end_ts (8)
                offset += 16;
            } else if (lockupKind === 2) {
                // Cliff - start_ts (8) + end_ts (8)
                offset += 16;
            }
            
            // Read amount_deposited_native
            const amountDeposited = accountData.readBigUInt64LE(offset);
            offset += 8;
            
            // Read amount_initially_locked_native
            const amountInitiallyLocked = accountData.readBigUInt64LE(offset);
            offset += 8;
            
            // Read is_used
            const isUsed = accountData.readUInt8(offset);
            offset += 1;
            
            // Skip padding
            offset += 7;
            
            // Convert to token units (ISLAND has 6 decimals)
            const depositedTokens = Number(amountDeposited) / Math.pow(10, 6);
            
            if (isUsed === 1) {
                totalGovernancePower += depositedTokens;
            }
        }
        
        return totalGovernancePower;
        
    } catch (error) {
        console.error('Error parsing VSR voter account:', error.message);
        return 0;
    }
}

/**
 * Get authentic governance power for a specific wallet
 */
async function getAuthenticVSRGovernancePower(walletAddress) {
    try {
        const voterPDA = getVSRVoterPDA(walletAddress);
        
        const voterAccount = await connection.getAccountInfo(voterPDA);
        
        if (!voterAccount) {
            return 0;
        }
        
        if (!voterAccount.owner.equals(VSR_PLUGIN_PROGRAM_ID)) {
            return 0;
        }
        
        const governancePower = parseVSRVoterAccount(voterAccount.data);
        
        return governancePower;
        
    } catch (error) {
        console.error(`Error getting VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get authentic governance power for multiple wallets
 */
async function getMultipleAuthenticVSRGovernancePower(walletAddresses) {
    const results = {};
    
    for (let i = 0; i < walletAddresses.length; i++) {
        const wallet = walletAddresses[i];
        const power = await getAuthenticVSRGovernancePower(wallet);
        results[wallet] = power;
        
        // Small delay to avoid rate limiting
        if (i < walletAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * Sync authentic governance power for all citizens
 */
async function syncAuthenticGovernancePowerForAllCitizens() {
    try {
        console.log('Syncing authentic VSR governance power for all citizens');
        
        const citizens = await db.getAllCitizens();
        console.log(`Processing ${citizens.length} citizens`);
        
        const results = [];
        
        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`Processing ${i + 1}/${citizens.length}: ${citizen.name || 'Unknown'}`);
            
            const governancePower = await getAuthenticVSRGovernancePower(citizen.wallet_address);
            
            // Update database with authentic governance power
            await db.updateGovernancePower(citizen.wallet_address, governancePower);
            
            if (governancePower > 0) {
                console.log(`  Updated: ${governancePower.toLocaleString()} ISLAND`);
            }
            
            results.push({
                wallet: citizen.wallet_address,
                name: citizen.name,
                governancePower: governancePower
            });
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const totalWithGovernance = results.filter(r => r.governancePower > 0).length;
        const totalGovernancePower = results.reduce((sum, r) => sum + r.governancePower, 0);
        
        console.log(`Citizens with governance power: ${totalWithGovernance}/${results.length}`);
        console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
        
        if (totalWithGovernance > 0) {
            console.log('Top governance holders:');
            results
                .filter(r => r.governancePower > 0)
                .sort((a, b) => b.governancePower - a.governancePower)
                .slice(0, 5)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.governancePower.toLocaleString()} ISLAND`);
                });
        }
        
        return results;
        
    } catch (error) {
        console.error('Error syncing authentic governance power:', error.message);
        return [];
    }
}

/**
 * Test with known wallets
 */
async function testAuthenticVSRGovernancePower() {
    const testWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('Testing authentic VSR governance power');
    console.log(`Target: ${testWallet}`);
    console.log('Expected: 625.580931 ISLAND');
    
    const power = await getAuthenticVSRGovernancePower(testWallet);
    
    console.log(`Result: ${power.toLocaleString()} ISLAND`);
    
    if (Math.abs(power - 625.580931) < 0.000001) {
        console.log('SUCCESS! Matches expected governance deposit exactly!');
        return true;
    } else if (power > 0) {
        console.log('Found governance power, but amount differs');
        console.log(`Difference: ${Math.abs(power - 625.580931).toFixed(6)} ISLAND`);
        return false;
    } else {
        console.log('No governance power found');
        return false;
    }
}

module.exports = {
    getAuthenticVSRGovernancePower,
    getMultipleAuthenticVSRGovernancePower,
    syncAuthenticGovernancePowerForAllCitizens,
    testAuthenticVSRGovernancePower
};

// Run test if executed directly
if (require.main === module) {
    testAuthenticVSRGovernancePower().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Test failed:', error.message);
        process.exit(1);
    });
}