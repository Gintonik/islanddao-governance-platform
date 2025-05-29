/**
 * Simple governance query without complex filters
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function findGovernanceDeposits() {
    try {
        console.log('Searching for IslandDAO governance deposits');
        
        const programPubkey = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Query accounts that reference the IslandDAO realm
        const realmRefAccounts = await connection.getProgramAccounts(programPubkey, {
            filters: [
                {
                    memcmp: {
                        offset: 1,
                        bytes: realmPubkey.toBase58()
                    }
                }
            ]
        });
        
        console.log(`Found ${realmRefAccounts.length} accounts referencing IslandDAO realm`);
        
        const tokenOwnerRecords = [];
        
        for (const account of realmRefAccounts) {
            try {
                const data = account.account.data;
                
                // Check if this is a Token Owner Record (type 2)
                if (data.length >= 105 && data.readUInt8(0) === 2) {
                    // Check if it's for ISLAND token
                    const govMint = new PublicKey(data.subarray(33, 65));
                    
                    if (govMint.equals(mintPubkey)) {
                        const wallet = new PublicKey(data.subarray(65, 97));
                        const depositLamports = data.readBigUInt64LE(97);
                        const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                        
                        if (depositAmount > 0) {
                            tokenOwnerRecords.push({
                                account: account.pubkey.toString(),
                                wallet: wallet.toString(),
                                depositAmount: depositAmount
                            });
                        }
                    }
                }
            } catch (error) {
                // Continue with next account
            }
        }
        
        tokenOwnerRecords.sort((a, b) => b.depositAmount - a.depositAmount);
        
        console.log(`Found ${tokenOwnerRecords.length} Token Owner Records with deposits`);
        
        if (tokenOwnerRecords.length > 0) {
            console.log('\\nGovernance depositors:');
            tokenOwnerRecords.forEach((record, index) => {
                console.log(`  ${index + 1}. ${record.wallet}: ${record.depositAmount.toLocaleString()} ISLAND`);
            });
            
            // Check for known wallet
            const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
            const knownRecord = tokenOwnerRecords.find(r => r.wallet === knownWallet);
            
            if (knownRecord) {
                console.log(`\\n🎯 Found known wallet: ${knownRecord.depositAmount.toLocaleString()} ISLAND`);
                
                if (Math.abs(knownRecord.depositAmount - 12625.580931) < 0.000001) {
                    console.log('✅ Amount matches expected deposit!');
                }
            }
        }
        
        return tokenOwnerRecords;
        
    } catch (error) {
        console.error('Error finding governance deposits:', error.message);
        return [];
    }
}

async function syncCitizenGovernance() {
    try {
        const deposits = await findGovernanceDeposits();
        
        const citizens = await db.getAllCitizens();
        console.log(`\\nSyncing governance for ${citizens.length} citizens`);
        
        const results = [];
        
        for (const citizen of citizens) {
            const deposit = deposits.find(d => d.wallet === citizen.wallet_address);
            const depositAmount = deposit ? deposit.depositAmount : 0;
            
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
        console.log(`\\nComplete: ${citizensWithDeposits.length}/${results.length} citizens have governance deposits`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing citizen governance:', error.message);
        return [];
    }
}

if (require.main === module) {
    syncCitizenGovernance()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { findGovernanceDeposits, syncCitizenGovernance };