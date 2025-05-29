/**
 * Analyze the governance token account to understand deposit structure
 * Account: AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh (SPL Governance controlled)
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// The governance-controlled token account that receives deposits
const GOVERNANCE_TOKEN_ACCOUNT = 'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

async function analyzeGovernanceTokenAccount() {
    try {
        console.log('Analyzing governance token account structure');
        console.log(`Account: ${GOVERNANCE_TOKEN_ACCOUNT}`);
        console.log('');

        // Get the token account info
        const tokenAccountPubkey = new PublicKey(GOVERNANCE_TOKEN_ACCOUNT);
        const accountInfo = await connection.getParsedAccountInfo(tokenAccountPubkey);
        
        if (accountInfo.value && accountInfo.value.data.parsed) {
            const parsedData = accountInfo.value.data.parsed.info;
            
            console.log('Governance Token Account Details:');
            console.log(`  Owner: ${parsedData.owner}`);
            console.log(`  Mint: ${parsedData.mint}`);
            console.log(`  Token Amount: ${parsedData.tokenAmount.uiAmountString} ISLAND`);
            console.log(`  Raw Amount: ${parsedData.tokenAmount.amount}`);
            console.log(`  Decimals: ${parsedData.tokenAmount.decimals}`);
            
            // This tells us the total amount deposited in governance
            const totalDeposited = parseFloat(parsedData.tokenAmount.uiAmountString);
            console.log(`\nTotal ISLAND tokens in governance: ${totalDeposited.toLocaleString()}`);
        }

        // Now we need to find how individual deposits are tracked
        // Let's look for Token Owner Records that reference this account
        console.log('\nSearching for Token Owner Records...');
        
        const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        const realmId = new PublicKey('1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds');
        const communityMint = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Get all Token Owner Records for IslandDAO realm
        const torAccounts = await connection.getProgramAccounts(governanceProgramId, {
            filters: [
                {
                    memcmp: {
                        offset: 1, // realm reference
                        bytes: realmId.toBase58()
                    }
                },
                {
                    memcmp: {
                        offset: 33, // governing token mint
                        bytes: communityMint.toBase58()
                    }
                }
            ]
        });

        console.log(`Found ${torAccounts.length} Token Owner Records`);

        if (torAccounts.length > 0) {
            console.log('\nAnalyzing Token Owner Records:');
            
            const deposits = [];
            
            for (const tor of torAccounts) {
                try {
                    const data = tor.account.data;
                    
                    // Parse Token Owner Record
                    const accountType = data.readUInt8(0);
                    if (accountType === 2) { // TokenOwnerRecord
                        const governingTokenOwner = new PublicKey(data.subarray(65, 97));
                        const depositAmount = data.readBigUInt64LE(97);
                        const tokenAmount = Number(depositAmount) / Math.pow(10, 6);
                        
                        if (tokenAmount > 0) {
                            deposits.push({
                                wallet: governingTokenOwner.toString(),
                                depositAmount: tokenAmount,
                                torAccount: tor.pubkey.toString()
                            });
                            
                            console.log(`  ${governingTokenOwner.toString()}: ${tokenAmount.toLocaleString()} ISLAND`);
                        }
                    }
                } catch (error) {
                    console.log(`  Error parsing TOR: ${error.message}`);
                }
            }
            
            if (deposits.length > 0) {
                const totalFromRecords = deposits.reduce((sum, d) => sum + d.depositAmount, 0);
                console.log(`\nTotal from individual records: ${totalFromRecords.toLocaleString()} ISLAND`);
                
                // Check if any of our citizens have deposits
                console.log('\nChecking our citizens for governance deposits...');
                
                const citizens = await db.getAllCitizens();
                const citizenDeposits = [];
                
                for (const citizen of citizens) {
                    const deposit = deposits.find(d => d.wallet === citizen.wallet_address);
                    if (deposit) {
                        citizenDeposits.push({
                            name: citizen.name,
                            wallet: citizen.wallet_address,
                            depositAmount: deposit.depositAmount
                        });
                        
                        console.log(`  ${citizen.name || 'Unknown'}: ${deposit.depositAmount.toLocaleString()} ISLAND`);
                    }
                }
                
                console.log(`\nFound ${citizenDeposits.length} citizens with governance deposits out of ${citizens.length} total citizens`);
                
                return {
                    totalDeposited: deposits.reduce((sum, d) => sum + d.depositAmount, 0),
                    allDeposits: deposits,
                    citizenDeposits: citizenDeposits
                };
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error analyzing governance token account:', error.message);
        return null;
    }
}

/**
 * Sync governance deposits for all citizens using Token Owner Records
 */
async function syncGovernanceDepositsFromTOR() {
    try {
        console.log('Syncing governance deposits for all citizens from Token Owner Records');
        
        const analysis = await analyzeGovernanceTokenAccount();
        
        if (!analysis || !analysis.allDeposits) {
            console.log('No governance deposits found');
            return [];
        }
        
        const citizens = await db.getAllCitizens();
        const results = [];
        
        for (const citizen of citizens) {
            const deposit = analysis.allDeposits.find(d => d.wallet === citizen.wallet_address);
            const depositAmount = deposit ? deposit.depositAmount : 0;
            
            // Update database with authentic governance deposit
            await db.updateGovernancePower(citizen.wallet_address, depositAmount);
            
            results.push({
                wallet: citizen.wallet_address,
                name: citizen.name,
                depositAmount: depositAmount
            });
            
            if (depositAmount > 0) {
                console.log(`Updated ${citizen.name || 'Unknown'}: ${depositAmount.toLocaleString()} ISLAND`);
            }
        }
        
        const totalWithDeposits = results.filter(r => r.depositAmount > 0).length;
        console.log(`\nSynced governance deposits for ${totalWithDeposits} citizens`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance deposits:', error.message);
        return [];
    }
}

// Export functions
module.exports = {
    analyzeGovernanceTokenAccount,
    syncGovernanceDepositsFromTOR
};

// Run analysis if executed directly
if (require.main === module) {
    analyzeGovernanceTokenAccount().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Analysis failed:', error.message);
        process.exit(1);
    });
}