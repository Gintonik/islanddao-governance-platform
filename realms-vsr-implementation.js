/**
 * Realms VSR Implementation for IslandDAO
 * Using the correct governance authority and structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// IslandDAO governance parameters from your provided data
const ISLAND_DAO_GOVERNANCE = {
    pubkey: 'F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9',
    authority: '6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM',
    owner: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
    communityMint: 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a',
    councilMint: '6QqMpiCWGuQtGEKTJvhLBTz6GcjpwVS3ywCPwJ6HLoG8'
};

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

/**
 * Get VSR registrar for IslandDAO using the correct governance authority
 */
async function getVSRRegistrar() {
    try {
        console.log('Finding VSR registrar for IslandDAO...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const governanceAuthority = new PublicKey(ISLAND_DAO_GOVERNANCE.authority);
        const communityMint = new PublicKey(ISLAND_DAO_GOVERNANCE.communityMint);
        
        // Get all VSR program accounts
        const accounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Examining ${accounts.length} VSR accounts for IslandDAO references`);
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                // Look for governance authority reference
                for (let offset = 0; offset <= data.length - 32; offset++) {
                    try {
                        const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                        if (pubkey.equals(governanceAuthority) || pubkey.equals(communityMint)) {
                            console.log(`Found VSR account referencing IslandDAO: ${account.pubkey.toString()}`);
                            console.log(`  Data length: ${data.length} bytes`);
                            console.log(`  Reference at offset: ${offset}`);
                            
                            // This might be the registrar
                            return {
                                address: account.pubkey.toString(),
                                data: data,
                                referenceOffset: offset
                            };
                        }
                    } catch (error) {
                        continue;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        console.log('No VSR registrar found for IslandDAO');
        return null;
        
    } catch (error) {
        console.error('Error finding VSR registrar:', error.message);
        return null;
    }
}

/**
 * Get Token Owner Records using the governance authority
 */
async function getTokenOwnerRecords() {
    try {
        console.log('Finding Token Owner Records for IslandDAO...');
        
        const governanceProgramId = new PublicKey(ISLAND_DAO_GOVERNANCE.owner);
        const realmPubkey = new PublicKey(ISLAND_DAO_GOVERNANCE.pubkey);
        const communityMint = new PublicKey(ISLAND_DAO_GOVERNANCE.communityMint);
        
        // Get governance program accounts
        const accounts = await connection.getProgramAccounts(governanceProgramId, {
            filters: [
                { dataSize: 116 } // Token Owner Record size
            ]
        });
        
        console.log(`Found ${accounts.length} potential Token Owner Records`);
        
        const tokenOwnerRecords = [];
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                if (data.length >= 116) {
                    // Check if this record references IslandDAO realm
                    let foundRealm = false;
                    let foundMint = false;
                    let walletAddress = null;
                    let governingTokenDepositAmount = 0;
                    
                    // Look for realm reference
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            if (pubkey.equals(realmPubkey)) {
                                foundRealm = true;
                                break;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    // Look for community mint reference
                    for (let offset = 0; offset <= data.length - 32; offset++) {
                        try {
                            const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                            if (pubkey.equals(communityMint)) {
                                foundMint = true;
                                break;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    if (foundRealm && foundMint) {
                        // This is likely an IslandDAO Token Owner Record
                        // Try to extract wallet address and deposit amount
                        
                        // Standard Token Owner Record structure:
                        // Account type (1 byte) + Realm (32 bytes) + Governing Token Mint (32 bytes) + 
                        // Governing Token Owner (32 bytes) + Governing Token Deposit Amount (8 bytes)
                        
                        try {
                            const governingTokenOwner = new PublicKey(data.subarray(65, 97));
                            walletAddress = governingTokenOwner.toString();
                            
                            // Get deposit amount at offset 97
                            if (data.length >= 105) {
                                const depositAmount = data.readBigUInt64LE(97);
                                governingTokenDepositAmount = Number(depositAmount) / Math.pow(10, 6);
                            }
                            
                            if (governingTokenDepositAmount > 0) {
                                tokenOwnerRecords.push({
                                    account: account.pubkey.toString(),
                                    wallet: walletAddress,
                                    depositAmount: governingTokenDepositAmount
                                });
                                
                                console.log(`${walletAddress}: ${governingTokenDepositAmount.toLocaleString()} ISLAND`);
                                
                                if (walletAddress === KNOWN_WALLET) {
                                    console.log(`🎯 Found known wallet: ${governingTokenDepositAmount.toLocaleString()} ISLAND`);
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
        
        console.log(`\nFound ${tokenOwnerRecords.length} Token Owner Records with deposits`);
        
        return tokenOwnerRecords;
        
    } catch (error) {
        console.error('Error getting Token Owner Records:', error.message);
        return [];
    }
}

/**
 * Update citizens with authentic governance power from Token Owner Records
 */
async function updateCitizensWithAuthenticTokenOwnerRecords() {
    try {
        console.log('Updating citizens with authentic Token Owner Record data...');
        
        const tokenOwnerRecords = await getTokenOwnerRecords();
        
        if (tokenOwnerRecords.length === 0) {
            console.log('No Token Owner Records found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with Token Owner Record data`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const record = tokenOwnerRecords.find(r => r.wallet === walletAddress);
            const amount = record ? record.depositAmount : 0;
            
            results[walletAddress] = amount;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [amount, walletAddress]
            );
            
            if (amount > 0) {
                console.log(`  Updated ${walletAddress}: ${amount.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nToken Owner Records sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Show known wallet result
        if (results[KNOWN_WALLET]) {
            console.log(`Known wallet governance power: ${results[KNOWN_WALLET].toLocaleString()} ISLAND`);
        }
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with Token Owner Records:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithAuthenticTokenOwnerRecords()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithAuthenticTokenOwnerRecords,
    getTokenOwnerRecords,
    getVSRRegistrar
};