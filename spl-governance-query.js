/**
 * SPL Governance Direct Query
 * Using the SPL Governance SDK to access token owner records directly
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Get Token Owner Record PDA for a wallet
 */
function getTokenOwnerRecordPDA(walletAddress) {
    try {
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        const walletPubkey = new PublicKey(walletAddress);
        const governanceProgramPubkey = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        // Standard SPL Governance Token Owner Record PDA derivation
        const [pda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("governance"),
                realmPubkey.toBuffer(),
                mintPubkey.toBuffer(),
                walletPubkey.toBuffer()
            ],
            governanceProgramPubkey
        );
        
        return pda;
    } catch (error) {
        console.log(`Error deriving TOR PDA for ${walletAddress}:`, error.message);
        return null;
    }
}

/**
 * Parse Token Owner Record account data
 */
function parseTokenOwnerRecord(accountData) {
    try {
        if (!accountData || accountData.length < 105) return 0;
        
        // Token Owner Record structure:
        // 0: account_type (1 byte)
        // 1-32: realm (32 bytes)
        // 33-64: governing_token_mint (32 bytes)
        // 65-96: governing_token_owner (32 bytes)
        // 97-104: governing_token_deposit_amount (8 bytes, little endian)
        
        const accountType = accountData.readUInt8(0);
        if (accountType !== 2) return 0; // Must be TokenOwnerRecord type
        
        const depositLamports = accountData.readBigUInt64LE(97);
        const depositAmount = Number(depositLamports) / Math.pow(10, 6);
        
        return depositAmount;
    } catch (error) {
        console.log('Error parsing Token Owner Record:', error.message);
        return 0;
    }
}

/**
 * Get governance power for a specific wallet
 */
async function getGovernancePower(walletAddress) {
    try {
        const torPDA = getTokenOwnerRecordPDA(walletAddress);
        if (!torPDA) return 0;
        
        const accountInfo = await connection.getAccountInfo(torPDA);
        if (!accountInfo) return 0;
        
        const depositAmount = parseTokenOwnerRecord(accountInfo.data);
        return depositAmount;
    } catch (error) {
        console.log(`Error getting governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Batch fetch governance power for multiple wallets
 */
async function batchGetGovernancePower(walletAddresses) {
    try {
        console.log(`Fetching governance power for ${walletAddresses.length} wallets...`);
        
        // Generate all PDAs
        const pdas = [];
        const walletToPdaMap = {};
        
        for (const walletAddress of walletAddresses) {
            const torPDA = getTokenOwnerRecordPDA(walletAddress);
            if (torPDA) {
                pdas.push(torPDA);
                walletToPdaMap[torPDA.toString()] = walletAddress;
            }
        }
        
        console.log(`Generated ${pdas.length} Token Owner Record PDAs`);
        
        // Batch fetch account infos
        const batchSize = 100;
        const results = {};
        
        for (let i = 0; i < pdas.length; i += batchSize) {
            const batch = pdas.slice(i, i + batchSize);
            
            try {
                const accountInfos = await connection.getMultipleAccountsInfo(batch);
                
                for (let j = 0; j < accountInfos.length; j++) {
                    const accountInfo = accountInfos[j];
                    const pda = batch[j];
                    const walletAddress = walletToPdaMap[pda.toString()];
                    
                    if (accountInfo && accountInfo.data) {
                        const depositAmount = parseTokenOwnerRecord(accountInfo.data);
                        results[walletAddress] = depositAmount;
                        
                        if (depositAmount > 0) {
                            console.log(`  ${walletAddress}: ${depositAmount.toLocaleString()} ISLAND`);
                        }
                    } else {
                        results[walletAddress] = 0;
                    }
                }
            } catch (error) {
                console.log(`Error in batch ${i}: ${error.message}`);
                // Set remaining wallets to 0
                for (const pda of batch) {
                    const walletAddress = walletToPdaMap[pda.toString()];
                    if (!(walletAddress in results)) {
                        results[walletAddress] = 0;
                    }
                }
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error in batch governance fetch:', error.message);
        return {};
    }
}

/**
 * Sync governance power for all citizens
 */
async function syncGovernancePowerForCitizens() {
    try {
        console.log('Syncing SPL Governance power for citizens...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        if (walletAddresses.length === 0) {
            console.log('No citizens found');
            return {};
        }
        
        console.log(`Found ${walletAddresses.length} citizens`);
        
        // Batch fetch governance power
        const governancePowerMap = await batchGetGovernancePower(walletAddresses);
        
        // Update database
        console.log('Updating database...');
        
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
        
        // Check known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        if (governancePowerMap[knownWallet]) {
            console.log(`Known wallet: ${governancePowerMap[knownWallet].toLocaleString()} ISLAND`);
            
            if (Math.abs(governancePowerMap[knownWallet] - 12625.580931) < 1) {
                console.log('✅ Amount matches expected value!');
            }
        }
        
        return governancePowerMap;
        
    } catch (error) {
        console.error('Error syncing governance power:', error.message);
        return {};
    }
}

/**
 * Test with known wallet first
 */
async function testKnownWallet() {
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    console.log(`Testing SPL Governance query with known wallet: ${knownWallet}`);
    
    const power = await getGovernancePower(knownWallet);
    
    console.log(`Result: ${power.toLocaleString()} ISLAND`);
    
    if (power > 0) {
        console.log('✅ SPL Governance query successful!');
        
        if (Math.abs(power - 12625.580931) < 1) {
            console.log('✅ Amount matches expected 12,625.580931 ISLAND!');
        }
    } else {
        console.log('❌ No governance deposit found');
    }
    
    return power;
}

if (require.main === module) {
    testKnownWallet()
        .then((power) => {
            if (power > 0) {
                console.log('\nTest successful, proceeding with full citizen sync...');
                return syncGovernancePowerForCitizens();
            } else {
                console.log('\nTest failed - Token Owner Records may not exist or use different structure');
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernancePowerForCitizens, 
    getGovernancePower, 
    batchGetGovernancePower, 
    testKnownWallet 
};