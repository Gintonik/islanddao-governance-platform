/**
 * Examine Governance Structure
 * Analyze actual governance accounts to understand the data layout
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Examine governance account structure
 */
async function examineGovernanceAccountStructure() {
    try {
        console.log('Examining governance account structure...');
        
        const programId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        // Get a few accounts to examine
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                { dataSize: 105 }
            ]
        });
        
        console.log(`Examining ${Math.min(5, accounts.length)} accounts`);
        
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        for (let i = 0; i < Math.min(5, accounts.length); i++) {
            const account = accounts[i];
            const data = account.account.data;
            
            console.log(`\nAccount ${i + 1}: ${account.pubkey.toString()}`);
            console.log(`Data length: ${data.length} bytes`);
            
            // Parse the account structure
            if (data.length >= 105) {
                const accountType = data.readUInt8(0);
                console.log(`Account type: ${accountType}`);
                
                if (accountType === 2) {
                    try {
                        const realm = new PublicKey(data.subarray(1, 33));
                        const mint = new PublicKey(data.subarray(33, 65));
                        const wallet = new PublicKey(data.subarray(65, 97));
                        const depositLamports = data.readBigUInt64LE(97);
                        const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                        
                        console.log(`Realm: ${realm.toString()}`);
                        console.log(`Mint: ${mint.toString()}`);
                        console.log(`Wallet: ${wallet.toString()}`);
                        console.log(`Deposit: ${depositAmount.toLocaleString()}`);
                        
                        // Check if this could be related to IslandDAO
                        if (realm.toString() === ISLAND_DAO_REALM) {
                            console.log('🎯 FOUND ISLAND DAO REALM MATCH!');
                        }
                        
                        if (mint.toString() === ISLAND_TOKEN_MINT) {
                            console.log('🎯 FOUND ISLAND TOKEN MINT MATCH!');
                        }
                        
                        if (wallet.toString() === '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4') {
                            console.log('🎯 FOUND KNOWN WALLET MATCH!');
                        }
                        
                    } catch (error) {
                        console.log(`Error parsing: ${error.message}`);
                    }
                }
            }
        }
        
        return accounts;
        
    } catch (error) {
        console.error('Error examining governance structure:', error.message);
        return [];
    }
}

/**
 * Search for any accounts that reference IslandDAO
 */
async function searchForIslandDAOReferences() {
    try {
        console.log('\nSearching for any accounts that reference IslandDAO...');
        
        const programId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        // Get more accounts to search through
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                { dataSize: { min: 100, max: 200 } }
            ]
        });
        
        console.log(`Searching ${accounts.length} accounts for IslandDAO references`);
        
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        const knownWalletPubkey = new PublicKey('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
        
        const matches = [];
        
        for (const account of accounts) {
            const data = account.account.data;
            
            // Search for realm reference at any position
            for (let offset = 0; offset <= data.length - 32; offset++) {
                try {
                    const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                    
                    if (pubkey.equals(realmPubkey)) {
                        console.log(`Found realm reference in ${account.pubkey.toString()} at offset ${offset}`);
                        matches.push({ account: account.pubkey.toString(), type: 'realm', offset });
                    }
                    
                    if (pubkey.equals(mintPubkey)) {
                        console.log(`Found mint reference in ${account.pubkey.toString()} at offset ${offset}`);
                        matches.push({ account: account.pubkey.toString(), type: 'mint', offset });
                    }
                    
                    if (pubkey.equals(knownWalletPubkey)) {
                        console.log(`Found known wallet in ${account.pubkey.toString()} at offset ${offset}`);
                        matches.push({ account: account.pubkey.toString(), type: 'wallet', offset });
                        
                        // Try to extract deposit amount from this account
                        if (data.length >= 105) {
                            try {
                                const depositLamports = data.readBigUInt64LE(97);
                                const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                                console.log(`  Potential deposit: ${depositAmount.toLocaleString()} ISLAND`);
                            } catch (error) {
                                // Try other positions
                                for (let pos = 80; pos < data.length - 8; pos += 8) {
                                    try {
                                        const amount = data.readBigUInt64LE(pos);
                                        const tokenAmount = Number(amount) / Math.pow(10, 6);
                                        if (tokenAmount > 1000 && tokenAmount < 50000) {
                                            console.log(`  Potential deposit at offset ${pos}: ${tokenAmount.toLocaleString()} ISLAND`);
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        console.log(`\nFound ${matches.length} total references`);
        return matches;
        
    } catch (error) {
        console.error('Error searching for IslandDAO references:', error.message);
        return [];
    }
}

/**
 * Main examination function
 */
async function runGovernanceExamination() {
    try {
        console.log('Running comprehensive governance examination...');
        
        await examineGovernanceAccountStructure();
        const matches = await searchForIslandDAOReferences();
        
        if (matches.length > 0) {
            console.log('\n✅ Found IslandDAO references in governance accounts');
            return true;
        } else {
            console.log('\n❌ No IslandDAO references found');
            return false;
        }
        
    } catch (error) {
        console.error('Error in governance examination:', error.message);
        return false;
    }
}

if (require.main === module) {
    runGovernanceExamination()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    runGovernanceExamination, 
    examineGovernanceAccountStructure, 
    searchForIslandDAOReferences 
};