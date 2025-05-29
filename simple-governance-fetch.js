/**
 * Simple Governance Fetch
 * Direct query of governance program accounts without complex filters
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Get all governance program accounts and filter for IslandDAO
 */
async function getAllGovernanceAccounts() {
    try {
        console.log('Getting all governance program accounts...');
        
        const programId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        
        // Get accounts with minimal filtering
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                {
                    dataSize: 105, // Token Owner Record size
                }
            ]
        });
        
        console.log(`Found ${accounts.length} governance accounts with size 105`);
        
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        const islandDeposits = [];
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                // Check if this is a Token Owner Record for IslandDAO
                if (data.length >= 105) {
                    // Check account type (should be 2)
                    const accountType = data.readUInt8(0);
                    if (accountType !== 2) continue;
                    
                    // Check if realm matches
                    const realm = new PublicKey(data.subarray(1, 33));
                    if (!realm.equals(realmPubkey)) continue;
                    
                    // Check if mint matches
                    const mint = new PublicKey(data.subarray(33, 65));
                    if (!mint.equals(mintPubkey)) continue;
                    
                    // Extract wallet and deposit amount
                    const wallet = new PublicKey(data.subarray(65, 97));
                    const depositLamports = data.readBigUInt64LE(97);
                    const depositAmount = Number(depositLamports) / Math.pow(10, 6);
                    
                    if (depositAmount > 0) {
                        islandDeposits.push({
                            wallet: wallet.toString(),
                            amount: depositAmount,
                            account: account.pubkey.toString()
                        });
                        
                        console.log(`Found deposit: ${wallet.toString()} -> ${depositAmount.toLocaleString()} ISLAND`);
                    }
                }
            } catch (error) {
                // Skip invalid accounts
                continue;
            }
        }
        
        console.log(`\nFound ${islandDeposits.length} IslandDAO governance deposits`);
        
        // Sort by amount
        islandDeposits.sort((a, b) => b.amount - a.amount);
        
        // Check for known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        const knownDeposit = islandDeposits.find(d => d.wallet === knownWallet);
        
        if (knownDeposit) {
            console.log(`\n🎯 Found known wallet: ${knownDeposit.amount.toLocaleString()} ISLAND`);
            
            if (Math.abs(knownDeposit.amount - 12625.580931) < 1) {
                console.log('✅ Amount matches expected value!');
            }
        }
        
        return islandDeposits;
        
    } catch (error) {
        console.error('Error getting governance accounts:', error.message);
        return [];
    }
}

/**
 * Sync governance deposits with citizens
 */
async function syncGovernanceDeposits() {
    try {
        console.log('Syncing governance deposits with citizens...');
        
        const deposits = await getAllGovernanceAccounts();
        
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
                console.log(`  ${walletAddress}: ${amount.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nGovernance sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing governance deposits:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncGovernanceDeposits()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncGovernanceDeposits, 
    getAllGovernanceAccounts 
};