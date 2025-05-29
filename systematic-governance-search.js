/**
 * Systematic search through SPL Governance accounts for IslandDAO
 * Find Token Owner Records by examining account structure directly
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function findAllIslandDAOGovernanceAccounts() {
    try {
        console.log('Systematically searching SPL Governance for IslandDAO accounts');
        
        const programPubkey = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Get all accounts from the governance program
        console.log('Fetching all governance program accounts...');
        const allAccounts = await connection.getProgramAccounts(programPubkey, {
            commitment: 'confirmed'
        });
        
        console.log(`Found ${allAccounts.length} total governance accounts`);
        
        // Filter for accounts that reference IslandDAO realm
        const realmAccounts = [];
        const tokenOwnerRecords = [];
        
        for (const account of allAccounts) {
            const data = account.account.data;
            
            if (data.length < 33) continue;
            
            try {
                // Check if this account references our realm
                for (let offset = 1; offset <= data.length - 32; offset++) {
                    const realmRef = data.subarray(offset, offset + 32);
                    if (realmRef.equals(realmPubkey.toBuffer())) {
                        
                        // Check account type
                        const accountType = data.readUInt8(0);
                        
                        if (accountType === 2) { // Token Owner Record
                            // Verify it's for ISLAND token
                            if (data.length >= 65) {
                                try {
                                    const mintRef = new PublicKey(data.subarray(33, 65));
                                    if (mintRef.equals(mintPubkey)) {
                                        
                                        // Extract wallet and deposit amount
                                        const wallet = new PublicKey(data.subarray(65, 97));
                                        const depositLamports = data.readBigUInt64LE(97);
                                        const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                                        
                                        tokenOwnerRecords.push({
                                            account: account.pubkey.toString(),
                                            wallet: wallet.toString(),
                                            depositAmount: depositAmount
                                        });
                                        
                                        console.log(`Found TOR: ${wallet.toString()} -> ${depositAmount.toLocaleString()} ISLAND`);
                                    }
                                } catch (error) {
                                    // Continue
                                }
                            }
                        }
                        
                        realmAccounts.push({
                            account: account.pubkey.toString(),
                            accountType: accountType,
                            realmOffset: offset
                        });
                        
                        break; // Found realm reference, move to next account
                    }
                }
            } catch (error) {
                // Continue with next account
            }
        }
        
        console.log(`\nFound ${realmAccounts.length} accounts referencing IslandDAO realm`);
        console.log(`Found ${tokenOwnerRecords.length} Token Owner Records with deposits`);
        
        if (tokenOwnerRecords.length > 0) {
            // Sort by deposit amount
            tokenOwnerRecords.sort((a, b) => b.depositAmount - a.depositAmount);
            
            console.log('\nTop depositors:');
            tokenOwnerRecords.slice(0, 10).forEach((record, index) => {
                console.log(`  ${index + 1}. ${record.wallet}: ${record.depositAmount.toLocaleString()} ISLAND`);
            });
            
            // Check if our known wallet is in there
            const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
            const knownRecord = tokenOwnerRecords.find(r => r.wallet === knownWallet);
            
            if (knownRecord) {
                console.log(`\n🎯 Found known wallet deposit: ${knownRecord.depositAmount.toLocaleString()} ISLAND`);
            }
        }
        
        return tokenOwnerRecords;
        
    } catch (error) {
        console.error('Error in systematic governance search:', error.message);
        return [];
    }
}

async function syncGovernanceFromSystematicSearch() {
    try {
        console.log('\nSyncing governance deposits from systematic search...');
        
        // Get governance records
        const governanceRecords = await findAllIslandDAOGovernanceAccounts();
        
        if (governanceRecords.length === 0) {
            console.log('No governance records found');
            return [];
        }
        
        // Get citizens
        const citizens = await db.getAllCitizens();
        console.log(`Updating ${citizens.length} citizens with governance data`);
        
        const results = [];
        
        for (const citizen of citizens) {
            const record = governanceRecords.find(r => r.wallet === citizen.wallet_address);
            const depositAmount = record ? record.depositAmount : 0;
            
            // Update database
            await db.updateGovernancePower(citizen.wallet_address, depositAmount);
            
            results.push({
                wallet: citizen.wallet_address,
                name: citizen.name,
                depositAmount: depositAmount
            });
            
            if (depositAmount > 0) {
                console.log(`  ${citizen.name || 'Unknown'}: ${depositAmount.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithDeposits = results.filter(r => r.depositAmount > 0);
        const totalDeposits = results.reduce((sum, r) => sum + r.depositAmount, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance deposits: ${citizensWithDeposits.length}/${results.length}`);
        console.log(`Total governance power: ${totalDeposits.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance from systematic search:', error.message);
        return [];
    }
}

// Run the systematic search
if (require.main === module) {
    syncGovernanceFromSystematicSearch()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Systematic search failed:', error.message);
            process.exit(1);
        });
}

module.exports = { findAllIslandDAOGovernanceAccounts, syncGovernanceFromSystematicSearch };