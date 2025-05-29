/**
 * Analyze VSR Registrar to understand the governance structure
 * The registrar Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd should contain configuration
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// From transaction analysis
const VSR_REGISTRAR = 'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd';
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

async function analyzeVSRRegistrar() {
    try {
        console.log('Analyzing VSR Registrar to understand governance structure');
        console.log(`Registrar: ${VSR_REGISTRAR}`);
        
        const registrarPubkey = new PublicKey(VSR_REGISTRAR);
        const accountInfo = await connection.getAccountInfo(registrarPubkey);
        
        if (!accountInfo) {
            console.log('Registrar account not found');
            return null;
        }
        
        console.log(`Owner: ${accountInfo.owner.toString()}`);
        console.log(`Data length: ${accountInfo.data.length} bytes`);
        
        // VSR Registrar typically contains realm reference and voting mint configuration
        // Let me search through all accounts owned by VSR program to find voter records
        
        console.log('\nSearching for all VSR voter accounts...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramPubkey);
        
        console.log(`Found ${allVSRAccounts.length} total VSR accounts`);
        
        const voterAccounts = [];
        
        for (const account of allVSRAccounts) {
            // Look for accounts that might be voter records
            // VSR voter accounts typically have specific discriminators
            if (account.account.data.length > 100) {
                try {
                    // Search for any amounts that look like governance deposits
                    for (let offset = 0; offset <= account.account.data.length - 8; offset += 8) {
                        const value = account.account.data.readBigUInt64LE(offset);
                        const tokenAmount = Number(value) / Math.pow(10, 6);
                        
                        // Look for reasonable governance amounts
                        if (tokenAmount >= 1 && tokenAmount <= 100000000) {
                            voterAccounts.push({
                                account: account.pubkey.toString(),
                                offset: offset,
                                amount: tokenAmount,
                                dataLength: account.account.data.length
                            });
                        }
                    }
                } catch (error) {
                    // Continue
                }
            }
        }
        
        // Remove duplicates and sort by amount
        const uniqueVoters = voterAccounts.reduce((acc, current) => {
            const existing = acc.find(item => item.account === current.account);
            if (!existing || current.amount > existing.amount) {
                return [...acc.filter(item => item.account !== current.account), current];
            }
            return acc;
        }, []);
        
        uniqueVoters.sort((a, b) => b.amount - a.amount);
        
        console.log(`\nFound ${uniqueVoters.length} potential voter accounts with deposits:`);
        
        uniqueVoters.slice(0, 10).forEach((voter, index) => {
            console.log(`  ${index + 1}. ${voter.account}: ${voter.amount.toLocaleString()} ISLAND (offset ${voter.offset})`);
        });
        
        // Check if our known amount is in there
        const knownAmount = 12625.580931;
        const matchingVoter = uniqueVoters.find(v => Math.abs(v.amount - knownAmount) < 0.000001);
        
        if (matchingVoter) {
            console.log(`\n🎯 Found matching voter account for known amount:`);
            console.log(`  Account: ${matchingVoter.account}`);
            console.log(`  Amount: ${matchingVoter.amount} ISLAND`);
            console.log(`  Offset: ${matchingVoter.offset}`);
            
            // Now we need to figure out how to map this back to wallet addresses
            return await mapVoterAccountsToWallets(uniqueVoters);
        }
        
        return uniqueVoters;
        
    } catch (error) {
        console.error('Error analyzing VSR registrar:', error.message);
        return null;
    }
}

async function mapVoterAccountsToWallets(voterAccounts) {
    console.log('\nAttempting to map voter accounts to wallet addresses...');
    
    const results = [];
    
    for (const voter of voterAccounts.slice(0, 20)) { // Check top 20
        try {
            const accountPubkey = new PublicKey(voter.account);
            const accountInfo = await connection.getAccountInfo(accountPubkey);
            
            if (accountInfo) {
                // Search for wallet addresses in the account data
                for (let offset = 0; offset <= accountInfo.data.length - 32; offset++) {
                    try {
                        const potentialWallet = new PublicKey(accountInfo.data.subarray(offset, offset + 32));
                        
                        // Validate this looks like a real wallet by checking if it has any activity
                        const walletInfo = await connection.getAccountInfo(potentialWallet);
                        if (walletInfo) {
                            results.push({
                                voterAccount: voter.account,
                                walletAddress: potentialWallet.toString(),
                                depositAmount: voter.amount,
                                walletOffset: offset
                            });
                            
                            console.log(`  Mapped: ${potentialWallet.toString()} -> ${voter.amount.toLocaleString()} ISLAND`);
                            break; // Found a wallet for this voter account
                        }
                    } catch (error) {
                        // Continue searching
                    }
                }
            }
        } catch (error) {
            // Continue with next voter account
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

async function syncGovernanceFromVSRMapping(mappings) {
    console.log('\nSyncing governance deposits for citizens using VSR mapping...');
    
    const citizens = await db.getAllCitizens();
    const results = [];
    
    for (const citizen of citizens) {
        const mapping = mappings.find(m => m.walletAddress === citizen.wallet_address);
        const depositAmount = mapping ? mapping.depositAmount : 0;
        
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
    console.log(`\nSynced: ${citizensWithDeposits.length}/${results.length} citizens have governance deposits`);
    
    return results;
}

// Run the analysis
if (require.main === module) {
    analyzeVSRRegistrar()
        .then((mappings) => {
            if (mappings && mappings.length > 0) {
                return syncGovernanceFromVSRMapping(mappings);
            } else {
                console.log('No valid VSR mappings found');
                return [];
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = { analyzeVSRRegistrar, mapVoterAccountsToWallets, syncGovernanceFromVSRMapping };