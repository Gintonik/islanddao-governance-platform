/**
 * Extract Governance Deposits
 * Focus on the specific account that contains the known wallet
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KNOWN_GOVERNANCE_ACCOUNT = 'FfaFsewkm3BFQi8pH1xYSoRyLpAMk62iTqYJQZVy6n88';
const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

/**
 * Examine the specific governance account that contains our known wallet
 */
async function examineKnownGovernanceAccount() {
    try {
        console.log(`Examining governance account: ${KNOWN_GOVERNANCE_ACCOUNT}`);
        
        const accountPubkey = new PublicKey(KNOWN_GOVERNANCE_ACCOUNT);
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('Account not found or no data');
            return null;
        }
        
        const data = accountInfo.data;
        console.log(`Account data length: ${data.length} bytes`);
        console.log(`Account owner: ${accountInfo.owner.toString()}`);
        
        // We know the wallet is at offset 33, so let's examine the structure around it
        const knownWalletPubkey = new PublicKey(KNOWN_WALLET);
        
        console.log('\nAnalyzing account structure:');
        
        // Check account type
        const accountType = data.readUInt8(0);
        console.log(`Account type: ${accountType}`);
        
        // Verify wallet location
        const walletAtOffset33 = new PublicKey(data.subarray(33, 65));
        console.log(`Wallet at offset 33: ${walletAtOffset33.toString()}`);
        
        if (walletAtOffset33.equals(knownWalletPubkey)) {
            console.log('✅ Confirmed wallet location at offset 33');
            
            // Now look for the deposit amount
            console.log('\nSearching for deposit amount...');
            
            // Try different positions after the wallet
            for (let offset = 65; offset < data.length - 8; offset += 8) {
                try {
                    const amount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                    
                    if (tokenAmount > 1000 && tokenAmount < 50000) {
                        console.log(`Potential deposit at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                        
                        if (Math.abs(tokenAmount - 12625.580931) < 1) {
                            console.log(`🎯 FOUND MATCHING AMOUNT: ${tokenAmount} ISLAND`);
                            return {
                                wallet: KNOWN_WALLET,
                                amount: tokenAmount,
                                offset: offset
                            };
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Also try reading at standard governance positions
            const standardOffsets = [97, 105, 113, 121];
            for (const offset of standardOffsets) {
                if (data.length >= offset + 8) {
                    try {
                        const amount = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(amount) / Math.pow(10, 6);
                        
                        if (tokenAmount > 0) {
                            console.log(`Standard position ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                            
                            if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                console.log(`🎯 FOUND MATCHING AMOUNT: ${tokenAmount} ISLAND`);
                                return {
                                    wallet: KNOWN_WALLET,
                                    amount: tokenAmount,
                                    offset: offset
                                };
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error examining known governance account:', error.message);
        return null;
    }
}

/**
 * Find all governance accounts with the same structure
 */
async function findAllGovernanceAccountsWithSameStructure() {
    try {
        console.log('Finding all governance accounts with similar structure...');
        
        const governanceAccountInfo = await examineKnownGovernanceAccount();
        
        if (!governanceAccountInfo) {
            console.log('Could not determine governance structure');
            return [];
        }
        
        console.log(`Found structure: deposit at offset ${governanceAccountInfo.offset}`);
        
        // Now scan all governance accounts using this structure
        const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                { dataSize: 105 }
            ]
        });
        
        console.log(`Scanning ${accounts.length} governance accounts...`);
        
        const deposits = [];
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                if (data.length >= 105) {
                    // Extract wallet at offset 33 (same structure as known account)
                    const wallet = new PublicKey(data.subarray(33, 65));
                    const walletStr = wallet.toString();
                    
                    // Extract deposit amount at the discovered offset
                    if (data.length >= governanceAccountInfo.offset + 8) {
                        const amount = data.readBigUInt64LE(governanceAccountInfo.offset);
                        const tokenAmount = Number(amount) / Math.pow(10, 6);
                        
                        if (tokenAmount > 0) {
                            deposits.push({
                                wallet: walletStr,
                                amount: tokenAmount,
                                account: account.pubkey.toString()
                            });
                            
                            console.log(`${walletStr}: ${tokenAmount.toLocaleString()} ISLAND`);
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        console.log(`\nFound ${deposits.length} governance deposits`);
        
        // Sort by amount
        deposits.sort((a, b) => b.amount - a.amount);
        
        return deposits;
        
    } catch (error) {
        console.error('Error finding governance accounts:', error.message);
        return [];
    }
}

/**
 * Update citizens with authentic governance data
 */
async function updateCitizensWithAuthenticGovernance() {
    try {
        console.log('Updating citizens with authentic governance data...');
        
        const deposits = await findAllGovernanceAccountsWithSameStructure();
        
        if (deposits.length === 0) {
            console.log('No governance deposits found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with governance data`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const deposit = deposits.find(d => d.wallet === walletAddress);
            const amount = deposit ? deposit.amount : 0;
            
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
        
        console.log(`\nAuthentic governance sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with authentic governance:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithAuthenticGovernance()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithAuthenticGovernance, 
    findAllGovernanceAccountsWithSameStructure,
    examineKnownGovernanceAccount 
};