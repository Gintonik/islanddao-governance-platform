/**
 * Direct SPL Governance Query
 * Using proper Helius RPC calls for SPL Governance data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Query SPL Governance Token Owner Records directly
 */
async function queryTokenOwnerRecords() {
    try {
        console.log('Querying SPL Governance Token Owner Records...');
        
        const programId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const realm = new PublicKey(ISLAND_DAO_REALM);
        const mint = new PublicKey(ISLAND_TOKEN_MINT);
        
        // Get program accounts with proper filters
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                {
                    dataSize: 105, // Token Owner Record size
                },
                {
                    memcmp: {
                        offset: 0,
                        bytes: Buffer.from([2]).toString('base64'), // Account type 2 (TokenOwnerRecord)
                    },
                },
                {
                    memcmp: {
                        offset: 1,
                        bytes: realm.toBase58(),
                    },
                },
                {
                    memcmp: {
                        offset: 33,
                        bytes: mint.toBase58(),
                    },
                },
            ],
        });
        
        console.log(`Found ${accounts.length} Token Owner Records`);
        
        const deposits = [];
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                // Parse Token Owner Record
                if (data.length >= 105) {
                    const wallet = new PublicKey(data.subarray(65, 97));
                    const depositLamports = data.readBigUInt64LE(97);
                    const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                    
                    if (depositAmount > 0) {
                        deposits.push({
                            wallet: wallet.toString(),
                            amount: depositAmount,
                            account: account.pubkey.toString()
                        });
                        
                        console.log(`${wallet.toString()}: ${depositAmount.toLocaleString()} ISLAND`);
                    }
                }
            } catch (error) {
                console.log(`Error parsing account: ${error.message}`);
            }
        }
        
        // Sort by amount
        deposits.sort((a, b) => b.amount - a.amount);
        
        console.log(`\nFound ${deposits.length} wallets with governance deposits`);
        
        // Check for known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        const knownDeposit = deposits.find(d => d.wallet === knownWallet);
        
        if (knownDeposit) {
            console.log(`\n🎯 Found known wallet: ${knownDeposit.amount.toLocaleString()} ISLAND`);
        }
        
        return deposits;
        
    } catch (error) {
        console.error('Error querying Token Owner Records:', error.message);
        return [];
    }
}

/**
 * Sync governance deposits with citizens
 */
async function syncGovernanceWithCitizens() {
    try {
        console.log('Syncing governance deposits with citizens...');
        
        const deposits = await queryTokenOwnerRecords();
        
        if (deposits.length === 0) {
            console.log('No governance deposits found');
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
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance with citizens:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncGovernanceWithCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernanceWithCitizens, 
    queryTokenOwnerRecords 
};