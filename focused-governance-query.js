/**
 * Focused query for IslandDAO Token Owner Records using efficient filters
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function getIslandDAOTokenOwnerRecords() {
    try {
        console.log('Querying Token Owner Records for IslandDAO with filters');
        
        const programPubkey = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Query with specific filters for Token Owner Records
        const torAccounts = await connection.getProgramAccounts(programPubkey, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: Buffer.from([2]).toString('base64') // Account type 2 = TokenOwnerRecord
                    }
                },
                {
                    memcmp: {
                        offset: 1,
                        bytes: realmPubkey.toBase58()
                    }
                },
                {
                    memcmp: {
                        offset: 33,
                        bytes: mintPubkey.toBase58()
                    }
                }
            ]
        });
        
        console.log(`Found ${torAccounts.length} Token Owner Records for IslandDAO`);
        
        const deposits = [];
        
        for (const torAccount of torAccounts) {
            try {
                const data = torAccount.account.data;
                
                // Parse Token Owner Record
                const wallet = new PublicKey(data.subarray(65, 97));
                const depositLamports = data.readBigUInt64LE(97);
                const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                
                if (depositAmount > 0) {
                    deposits.push({
                        account: torAccount.pubkey.toString(),
                        wallet: wallet.toString(),
                        depositAmount: depositAmount
                    });
                }
            } catch (error) {
                console.log(`Error parsing TOR: ${error.message}`);
            }
        }
        
        deposits.sort((a, b) => b.depositAmount - a.depositAmount);
        
        console.log(`Found ${deposits.length} wallets with governance deposits`);
        
        if (deposits.length > 0) {
            console.log('\nTop governance depositors:');
            deposits.slice(0, 10).forEach((deposit, index) => {
                console.log(`  ${index + 1}. ${deposit.wallet}: ${deposit.depositAmount.toLocaleString()} ISLAND`);
            });
            
            // Check for known wallet
            const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
            const knownDeposit = deposits.find(d => d.wallet === knownWallet);
            
            if (knownDeposit) {
                console.log(`\n🎯 Found known wallet: ${knownDeposit.depositAmount.toLocaleString()} ISLAND`);
            }
        }
        
        return deposits;
        
    } catch (error) {
        console.error('Error querying Token Owner Records:', error.message);
        return [];
    }
}

async function syncCitizenGovernanceDeposits() {
    try {
        const deposits = await getIslandDAOTokenOwnerRecords();
        
        if (deposits.length === 0) {
            console.log('No governance deposits found to sync');
            return [];
        }
        
        const citizens = await db.getAllCitizens();
        console.log(`\nSyncing governance deposits for ${citizens.length} citizens`);
        
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
        const totalDeposits = results.reduce((sum, r) => sum + r.depositAmount, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance deposits: ${citizensWithDeposits.length}/${results.length}`);
        console.log(`Total governance power: ${totalDeposits.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing citizen governance deposits:', error.message);
        return [];
    }
}

if (require.main === module) {
    syncCitizenGovernanceDeposits()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { getIslandDAOTokenOwnerRecords, syncCitizenGovernanceDeposits };