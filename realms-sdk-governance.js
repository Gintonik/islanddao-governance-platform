/**
 * Realms SDK Governance Commands
 * Test withdraw/deposit governance token functions to understand authentic values
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// IslandDAO governance parameters
const ISLAND_DAO_GOVERNANCE = {
    pubkey: 'F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9',
    authority: '6Vjsy1KabnHtSuHZcXuuCQFWoBML9JscSy3L4NGjqmhM',
    owner: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
    communityMint: 'Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a'
};

const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

/**
 * Calculate Token Owner Record PDA (Program Derived Address)
 * This is where governance deposits are stored in standard SPL Governance
 */
function getTokenOwnerRecordPDA(realmPubkey, governingTokenMint, governingTokenOwner) {
    try {
        const governanceProgramId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        
        const [pda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('governance'),
                realmPubkey.toBuffer(),
                governingTokenMint.toBuffer(),
                governingTokenOwner.toBuffer()
            ],
            governanceProgramId
        );
        
        return pda;
    } catch (error) {
        console.error('Error calculating Token Owner Record PDA:', error.message);
        return null;
    }
}

/**
 * Get Token Owner Record for a specific wallet
 */
async function getTokenOwnerRecord(walletAddress) {
    try {
        console.log(`Getting Token Owner Record for: ${walletAddress}`);
        
        const realmPubkey = new PublicKey(ISLAND_DAO_GOVERNANCE.pubkey);
        const communityMint = new PublicKey(ISLAND_DAO_GOVERNANCE.communityMint);
        const walletPubkey = new PublicKey(walletAddress);
        
        const tokenOwnerRecordPDA = getTokenOwnerRecordPDA(realmPubkey, communityMint, walletPubkey);
        
        if (!tokenOwnerRecordPDA) {
            console.log('Could not calculate Token Owner Record PDA');
            return null;
        }
        
        console.log(`Token Owner Record PDA: ${tokenOwnerRecordPDA.toString()}`);
        
        const accountInfo = await connection.getAccountInfo(tokenOwnerRecordPDA);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('Token Owner Record not found or no data');
            return null;
        }
        
        console.log(`Token Owner Record data length: ${accountInfo.data.length} bytes`);
        console.log(`Token Owner Record owner: ${accountInfo.owner.toString()}`);
        
        // Parse Token Owner Record structure
        const data = accountInfo.data;
        
        if (data.length >= 105) {
            // Standard Token Owner Record structure:
            // - Account type (1 byte)
            // - Realm (32 bytes) 
            // - Governing Token Mint (32 bytes)
            // - Governing Token Owner (32 bytes)
            // - Governing Token Deposit Amount (8 bytes)
            
            const accountType = data.readUInt8(0);
            const depositAmount = data.readBigUInt64LE(97);
            const tokenAmount = Number(depositAmount) / Math.pow(10, 6);
            
            console.log(`Account type: ${accountType}`);
            console.log(`Governing token deposit amount: ${tokenAmount.toLocaleString()} ISLAND`);
            
            return {
                address: tokenOwnerRecordPDA.toString(),
                accountType: accountType,
                depositAmount: tokenAmount,
                rawData: data
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('Error getting Token Owner Record:', error.message);
        return null;
    }
}

/**
 * Simulate withdraw governance tokens instruction to see current values
 */
async function simulateWithdrawGovernanceTokens(walletAddress, amount = 1) {
    try {
        console.log(`Simulating withdraw governance tokens for: ${walletAddress}`);
        console.log(`Amount: ${amount} ISLAND`);
        
        // Get the Token Owner Record first
        const tokenOwnerRecord = await getTokenOwnerRecord(walletAddress);
        
        if (!tokenOwnerRecord) {
            console.log('No Token Owner Record found - wallet may not have governance deposits');
            return null;
        }
        
        console.log('Current governance state:');
        console.log(`  Deposited amount: ${tokenOwnerRecord.depositAmount.toLocaleString()} ISLAND`);
        console.log(`  Available to withdraw: ${Math.min(tokenOwnerRecord.depositAmount, amount)} ISLAND`);
        
        // Check if the amount matches our expected value
        if (Math.abs(tokenOwnerRecord.depositAmount - 12625.580931) < 1) {
            console.log('🎯 Token Owner Record matches expected governance power!');
        }
        
        return tokenOwnerRecord;
        
    } catch (error) {
        console.error('Error simulating withdraw governance tokens:', error.message);
        return null;
    }
}

/**
 * Get governance deposits for all citizens using Token Owner Records
 */
async function getGovernanceDepositsForAllCitizens() {
    try {
        console.log('Getting governance deposits for all citizens using Token Owner Records...');
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Checking ${walletAddresses.length} citizens for governance deposits`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            console.log(`\nChecking ${walletAddress}...`);
            
            const tokenOwnerRecord = await getTokenOwnerRecord(walletAddress);
            
            if (tokenOwnerRecord && tokenOwnerRecord.depositAmount > 0) {
                results[walletAddress] = tokenOwnerRecord.depositAmount;
                console.log(`✅ Found governance deposit: ${tokenOwnerRecord.depositAmount.toLocaleString()} ISLAND`);
            } else {
                results[walletAddress] = 0;
                console.log(`❌ No governance deposit found`);
            }
        }
        
        return results;
        
    } catch (error) {
        console.error('Error getting governance deposits for all citizens:', error.message);
        return {};
    }
}

/**
 * Update citizens with Token Owner Record governance data
 */
async function updateCitizensWithTokenOwnerRecords() {
    try {
        console.log('Updating citizens with Token Owner Record governance data...');
        
        const governanceDeposits = await getGovernanceDepositsForAllCitizens();
        
        if (Object.keys(governanceDeposits).length === 0) {
            console.log('No governance deposits found');
            return {};
        }
        
        console.log('\nUpdating database with Token Owner Record data...');
        
        for (const [walletAddress, amount] of Object.entries(governanceDeposits)) {
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [amount, walletAddress]
            );
            
            if (amount > 0) {
                console.log(`  Updated ${walletAddress}: ${amount.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(governanceDeposits).filter(p => p > 0).length;
        const totalPower = Object.values(governanceDeposits).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nToken Owner Records sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${Object.keys(governanceDeposits).length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return governanceDeposits;
        
    } catch (error) {
        console.error('Error updating citizens with Token Owner Records:', error.message);
        return {};
    }
}

if (require.main === module) {
    // Test with known wallet first
    console.log('Testing Realms SDK governance commands...\n');
    
    simulateWithdrawGovernanceTokens(KNOWN_WALLET)
        .then((result) => {
            if (result) {
                console.log('\n✅ Found Token Owner Record data');
                // If successful, update all citizens
                return updateCitizensWithTokenOwnerRecords();
            } else {
                console.log('\n❌ No Token Owner Record found for known wallet');
                console.log('This wallet may not have governance deposits in standard SPL Governance');
                return {};
            }
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithTokenOwnerRecords,
    getGovernanceDepositsForAllCitizens,
    simulateWithdrawGovernanceTokens,
    getTokenOwnerRecord
};