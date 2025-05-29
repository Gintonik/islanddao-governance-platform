/**
 * Analyze Type 12 Governance Accounts
 * Since IslandDAO uses account type 12 instead of type 2
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Analyze type 12 governance accounts to understand their structure
 */
async function analyzeType12GovernanceAccounts() {
    try {
        console.log('Analyzing type 12 governance accounts...');
        
        const programId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        // Get type 12 governance accounts
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                { dataSize: 105 }
            ]
        });
        
        console.log(`Found ${accounts.length} governance accounts`);
        
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        const knownWalletPubkey = new PublicKey('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
        
        const islandDeposits = [];
        
        for (const account of accounts) {
            const data = account.account.data;
            
            if (data.length >= 105) {
                const accountType = data.readUInt8(0);
                
                // Focus on type 12 accounts
                if (accountType === 12) {
                    try {
                        // For type 12, the structure might be different
                        // Let's check all possible positions for realm, mint, and wallet
                        
                        let foundRealm = false;
                        let foundMint = false;
                        let foundWallet = false;
                        let walletAddress = null;
                        let depositAmount = 0;
                        
                        // Check for realm at different positions
                        for (let offset = 1; offset <= data.length - 32; offset++) {
                            try {
                                const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                                if (pubkey.equals(realmPubkey)) {
                                    foundRealm = true;
                                    console.log(`Found realm at offset ${offset} in ${account.pubkey.toString()}`);
                                    break;
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        // Check for mint at different positions
                        for (let offset = 1; offset <= data.length - 32; offset++) {
                            try {
                                const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                                if (pubkey.equals(mintPubkey)) {
                                    foundMint = true;
                                    console.log(`Found mint at offset ${offset} in ${account.pubkey.toString()}`);
                                    break;
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        // Check for known wallet at different positions
                        for (let offset = 1; offset <= data.length - 32; offset++) {
                            try {
                                const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                                if (pubkey.equals(knownWalletPubkey)) {
                                    foundWallet = true;
                                    walletAddress = pubkey.toString();
                                    console.log(`Found known wallet at offset ${offset} in ${account.pubkey.toString()}`);
                                    
                                    // Try to find deposit amount near the wallet
                                    for (let amountOffset = 80; amountOffset < data.length - 8; amountOffset += 8) {
                                        try {
                                            const amount = data.readBigUInt64LE(amountOffset);
                                            const tokenAmount = Number(amount) / Math.pow(10, 6);
                                            
                                            if (tokenAmount > 1000 && tokenAmount < 50000) {
                                                console.log(`  Potential deposit at offset ${amountOffset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                                
                                                if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                                    console.log(`  🎯 MATCHES EXPECTED AMOUNT!`);
                                                    depositAmount = tokenAmount;
                                                }
                                            }
                                        } catch (error) {
                                            continue;
                                        }
                                    }
                                    break;
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        // If we found IslandDAO references, check for any wallet addresses
                        if (foundRealm || foundMint) {
                            console.log(`Account ${account.pubkey.toString()} references IslandDAO:`);
                            console.log(`  Realm: ${foundRealm}, Mint: ${foundMint}, Known Wallet: ${foundWallet}`);
                            
                            // Try to extract any wallet addresses and amounts
                            for (let offset = 1; offset <= data.length - 32; offset++) {
                                try {
                                    const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                                    const pubkeyStr = pubkey.toString();
                                    
                                    // Check if this looks like a wallet (not our known addresses)
                                    if (pubkeyStr.length === 44 && 
                                        !pubkeyStr.includes('1111111111111111111') &&
                                        pubkeyStr !== ISLAND_DAO_REALM &&
                                        pubkeyStr !== ISLAND_TOKEN_MINT &&
                                        pubkeyStr !== GOVERNANCE_PROGRAM_ID) {
                                        
                                        console.log(`  Potential wallet at offset ${offset}: ${pubkeyStr}`);
                                        
                                        // Look for deposit amounts
                                        for (let amountOffset = offset + 32; amountOffset < Math.min(data.length - 8, offset + 100); amountOffset += 8) {
                                            try {
                                                const amount = data.readBigUInt64LE(amountOffset);
                                                const tokenAmount = Number(amount) / Math.pow(10, 6);
                                                
                                                if (tokenAmount > 1 && tokenAmount < 100000000) {
                                                    console.log(`    Potential deposit: ${tokenAmount.toLocaleString()} ISLAND`);
                                                    
                                                    islandDeposits.push({
                                                        wallet: pubkeyStr,
                                                        amount: tokenAmount,
                                                        account: account.pubkey.toString()
                                                    });
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
                        }
                        
                    } catch (error) {
                        console.log(`Error analyzing account: ${error.message}`);
                    }
                }
            }
        }
        
        console.log(`\nFound ${islandDeposits.length} potential governance deposits`);
        
        if (islandDeposits.length > 0) {
            // Remove duplicates and sort
            const uniqueDeposits = new Map();
            
            for (const deposit of islandDeposits) {
                const existing = uniqueDeposits.get(deposit.wallet) || 0;
                uniqueDeposits.set(deposit.wallet, Math.max(existing, deposit.amount));
            }
            
            const sortedDeposits = Array.from(uniqueDeposits.entries())
                .map(([wallet, amount]) => ({ wallet, amount }))
                .sort((a, b) => b.amount - a.amount);
            
            console.log('\nTop governance deposits found:');
            sortedDeposits.slice(0, 10).forEach((deposit, index) => {
                console.log(`  ${index + 1}. ${deposit.wallet}: ${deposit.amount.toLocaleString()} ISLAND`);
            });
            
            return sortedDeposits;
        }
        
        return [];
        
    } catch (error) {
        console.error('Error analyzing type 12 governance accounts:', error.message);
        return [];
    }
}

/**
 * Update citizens with found governance data
 */
async function updateCitizensWithType12Data() {
    try {
        console.log('Updating citizens with type 12 governance data...');
        
        const deposits = await analyzeType12GovernanceAccounts();
        
        if (deposits.length === 0) {
            console.log('No governance deposits found in type 12 accounts');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens`);
        
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
        
        console.log(`\nType 12 governance sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with type 12 data:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithType12Data()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithType12Data, 
    analyzeType12GovernanceAccounts 
};