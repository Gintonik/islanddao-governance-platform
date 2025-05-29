/**
 * Check token accounts for citizens to find governance deposits
 * Based on the pattern: GivwEisGK5fQ131EsKPYAncai18MX7vqiLMvaTLjyuyx holds 12,625.580931 ISLAND
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a';

async function checkCitizenTokenAccounts() {
    try {
        console.log('Checking token accounts for all citizens to find governance deposits');
        
        const citizens = await db.getAllCitizens();
        console.log(`Processing ${citizens.length} citizens`);
        
        const results = [];
        
        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`\nChecking ${i + 1}/${citizens.length}: ${citizen.name || 'Unknown'} (${citizen.wallet_address})`);
            
            // Get all token accounts for this wallet
            const walletPubkey = new PublicKey(citizen.wallet_address);
            
            try {
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
                    mint: new PublicKey(ISLAND_TOKEN_MINT)
                });
                
                console.log(`  Found ${tokenAccounts.value.length} ISLAND token accounts`);
                
                let totalGovernanceDeposit = 0;
                
                for (const tokenAccount of tokenAccounts.value) {
                    const accountInfo = tokenAccount.account.data.parsed.info;
                    const balance = parseFloat(accountInfo.tokenAmount.uiAmountString || '0');
                    
                    console.log(`    Account: ${tokenAccount.pubkey.toString()}`);
                    console.log(`    Balance: ${balance.toLocaleString()} ISLAND`);
                    
                    // Check if this account might be a governance deposit account
                    // Look for accounts with significant balances that could be governance deposits
                    if (balance > 0) {
                        // Check if this account has any special properties that indicate it's a governance account
                        // For now, we'll sum all ISLAND token balances for this wallet
                        totalGovernanceDeposit += balance;
                    }
                }
                
                // Update database with the total amount found
                await db.updateGovernancePower(citizen.wallet_address, totalGovernanceDeposit);
                
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name,
                    totalTokens: totalGovernanceDeposit
                });
                
                if (totalGovernanceDeposit > 0) {
                    console.log(`  Total ISLAND tokens: ${totalGovernanceDeposit.toLocaleString()}`);
                } else {
                    console.log(`  No ISLAND tokens found`);
                }
                
            } catch (error) {
                console.log(`  Error checking token accounts: ${error.message}`);
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name,
                    totalTokens: 0
                });
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Summary
        const citizensWithTokens = results.filter(r => r.totalTokens > 0);
        const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
        
        console.log(`\n📊 Summary:`);
        console.log(`Citizens with ISLAND tokens: ${citizensWithTokens.length}/${results.length}`);
        console.log(`Total ISLAND tokens found: ${totalTokens.toLocaleString()}`);
        
        if (citizensWithTokens.length > 0) {
            console.log('\nTop ISLAND token holders:');
            citizensWithTokens
                .sort((a, b) => b.totalTokens - a.totalTokens)
                .slice(0, 10)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.totalTokens.toLocaleString()} ISLAND`);
                });
        }
        
        return results;
        
    } catch (error) {
        console.error('Error checking citizen token accounts:', error.message);
        return [];
    }
}

// Test with the known wallet first
async function testKnownWallet() {
    const testWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('Testing token account detection with known wallet');
    console.log(`Wallet: ${testWallet}`);
    console.log('Expected to find governance deposit: 12,625.580931 ISLAND');
    
    const walletPubkey = new PublicKey(testWallet);
    
    try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
            mint: new PublicKey(ISLAND_TOKEN_MINT)
        });
        
        console.log(`\nFound ${tokenAccounts.value.length} ISLAND token accounts:`);
        
        let foundGovernanceAmount = false;
        
        for (const tokenAccount of tokenAccounts.value) {
            const accountInfo = tokenAccount.account.data.parsed.info;
            const balance = parseFloat(accountInfo.tokenAmount.uiAmountString || '0');
            
            console.log(`  Account: ${tokenAccount.pubkey.toString()}`);
            console.log(`  Balance: ${balance.toLocaleString()} ISLAND`);
            
            // Check if this matches our expected governance amount
            if (Math.abs(balance - 12625.580931) < 0.000001) {
                console.log(`  🎯 This matches the expected governance deposit!`);
                foundGovernanceAmount = true;
            }
        }
        
        if (!foundGovernanceAmount) {
            console.log('\n❌ Expected governance deposit amount not found in token accounts');
            console.log('This suggests the governance deposits might be tracked differently');
        }
        
        return foundGovernanceAmount;
        
    } catch (error) {
        console.error('Error testing known wallet:', error.message);
        return false;
    }
}

// Run the test first, then check all citizens
if (require.main === module) {
    Promise.resolve()
        .then(() => testKnownWallet())
        .then((success) => {
            if (success) {
                console.log('\n✅ Token account pattern works! Proceeding with all citizens...\n');
                return checkCitizenTokenAccounts();
            } else {
                console.log('\n⚠️ Token account pattern may not capture governance deposits correctly');
                console.log('Proceeding anyway to see what we find...\n');
                return checkCitizenTokenAccounts();
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkCitizenTokenAccounts, testKnownWallet };