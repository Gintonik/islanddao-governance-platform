/**
 * Analyze the governance token account to understand deposit structure
 * Account: AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh (SPL Governance controlled)
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const GOVERNANCE_TOKEN_ACCOUNT = 'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function analyzeGovernanceTokenAccount() {
    try {
        console.log('Analyzing governance token account structure');
        
        const tokenAccountPubkey = new PublicKey(GOVERNANCE_TOKEN_ACCOUNT);
        const programPubkey = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Get the token account info
        const tokenAccountInfo = await connection.getParsedAccountInfo(tokenAccountPubkey);
        if (tokenAccountInfo.value) {
            console.log('Token Account Info:');
            console.log('Owner:', tokenAccountInfo.value.owner.toString());
            if (tokenAccountInfo.value.data.parsed) {
                console.log('Balance:', tokenAccountInfo.value.data.parsed.info.tokenAmount.uiAmountString, 'ISLAND');
            }
            console.log('');
        }
        
        // Find all Token Owner Records for this realm
        console.log('Searching for Token Owner Records...');
        
        // Search specifically for accounts that have the realm in their data
        const allGovernanceAccounts = await connection.getProgramAccounts(programPubkey, {
            dataSlice: { offset: 0, length: 0 } // Get just the account keys first
        });
        
        console.log(`Found ${allGovernanceAccounts.length} total governance accounts`);
        
        // Now fetch account data for accounts that might be Token Owner Records
        const batchSize = 10;
        const tokenOwnerRecords = [];
        
        for (let i = 0; i < allGovernanceAccounts.length; i += batchSize) {
            const batch = allGovernanceAccounts.slice(i, i + batchSize);
            
            try {
                const accountInfos = await connection.getMultipleAccountsInfo(
                    batch.map(acc => acc.pubkey)
                );
                
                for (let j = 0; j < accountInfos.length; j++) {
                    const accountInfo = accountInfos[j];
                    if (!accountInfo || !accountInfo.data) continue;
                    
                    const data = accountInfo.data;
                    
                    // Check if this is a Token Owner Record (account type 2)
                    if (data.length >= 105 && data.readUInt8(0) === 2) {
                        try {
                            // Check if it references our realm (offset 1-32)
                            const realmInData = new PublicKey(data.subarray(1, 33));
                            if (!realmInData.equals(realmPubkey)) continue;
                            
                            // Check if it's for ISLAND token (offset 33-64)
                            const govMint = new PublicKey(data.subarray(33, 65));
                            if (!govMint.equals(mintPubkey)) continue;
                            
                            // Extract wallet and deposit amount
                            const wallet = new PublicKey(data.subarray(65, 97));
                            const depositLamports = data.readBigUInt64LE(97);
                            const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                            
                            if (depositAmount > 0) {
                                tokenOwnerRecords.push({
                                    account: batch[j].pubkey.toString(),
                                    wallet: wallet.toString(),
                                    depositAmount: depositAmount
                                });
                            }
                        } catch (error) {
                            // Continue with next account
                        }
                    }
                }
            } catch (error) {
                console.log(`Error processing batch ${i}: ${error.message}`);
            }
            
            // Progress indicator
            if (i % 100 === 0) {
                console.log(`Processed ${i}/${allGovernanceAccounts.length} accounts...`);
            }
        }
        
        tokenOwnerRecords.sort((a, b) => b.depositAmount - a.depositAmount);
        
        console.log(`\nFound ${tokenOwnerRecords.length} Token Owner Records with deposits`);
        
        if (tokenOwnerRecords.length > 0) {
            console.log('\nTop governance depositors:');
            tokenOwnerRecords.slice(0, 15).forEach((record, index) => {
                console.log(`  ${index + 1}. ${record.wallet}: ${record.depositAmount.toLocaleString()} ISLAND`);
            });
            
            // Check for known wallet
            const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
            const knownRecord = tokenOwnerRecords.find(r => r.wallet === knownWallet);
            
            if (knownRecord) {
                console.log(`\n🎯 Found known wallet: ${knownRecord.depositAmount.toLocaleString()} ISLAND`);
                
                if (Math.abs(knownRecord.depositAmount - 12625.580931) < 0.000001) {
                    console.log('✅ Amount matches expected 12,625.580931 ISLAND!');
                } else {
                    console.log(`Expected: 12,625.580931, Found: ${knownRecord.depositAmount}`);
                }
            } else {
                console.log(`\n❌ Known wallet ${knownWallet} not found in governance records`);
            }
            
            const totalDeposits = tokenOwnerRecords.reduce((sum, r) => sum + r.depositAmount, 0);
            console.log(`\nTotal governance deposits: ${totalDeposits.toLocaleString()} ISLAND`);
        }
        
        return tokenOwnerRecords;
        
    } catch (error) {
        console.error('Error analyzing governance token account:', error.message);
        return [];
    }
}

async function syncGovernanceDepositsFromTOR() {
    try {
        const deposits = await analyzeGovernanceTokenAccount();
        
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
        const totalCitizenDeposits = results.reduce((sum, r) => sum + r.depositAmount, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance deposits: ${citizensWithDeposits.length}/${results.length}`);
        console.log(`Total citizen governance power: ${totalCitizenDeposits.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance deposits from TOR:', error.message);
        return [];
    }
}

if (require.main === module) {
    syncGovernanceDepositsFromTOR()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { analyzeGovernanceTokenAccount, syncGovernanceDepositsFromTOR };