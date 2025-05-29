/**
 * Authentic Governance Deposit Fetcher using Realms SDK approach
 * Queries SPL Governance for actual deposited amounts in Token Owner Records
 * Based on https://docs.realms.today/sdk
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// IslandDAO Configuration
const ISLAND_DAO_CONFIG = {
    realmId: '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds',
    programId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
    communityMint: 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a'
};

/**
 * Get Token Owner Record PDA for a wallet
 * Following SPL Governance PDA derivation pattern
 */
function getTokenOwnerRecordPDA(realmId, communityMint, walletAddress) {
    const realmPubkey = new PublicKey(realmId);
    const mintPubkey = new PublicKey(communityMint);
    const walletPubkey = new PublicKey(walletAddress);
    const programId = new PublicKey(ISLAND_DAO_CONFIG.programId);
    
    const [tokenOwnerRecordPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('governance'),
            realmPubkey.toBuffer(),
            mintPubkey.toBuffer(),
            walletPubkey.toBuffer()
        ],
        programId
    );
    
    return tokenOwnerRecordPDA;
}

/**
 * Parse Token Owner Record account data to extract deposit amount
 * Following SPL Governance Token Owner Record structure
 */
function parseTokenOwnerRecord(accountData) {
    try {
        // Token Owner Record structure:
        // 0: account_type (1 byte) - should be 2 for TokenOwnerRecord
        // 1-32: realm (32 bytes)
        // 33-64: governing_token_mint (32 bytes) 
        // 65-96: governing_token_owner (32 bytes)
        // 97-104: governing_token_deposit_amount (8 bytes) - THIS IS WHAT WE NEED
        // 105-112: unrelinquished_vote_records_count (8 bytes)
        // 113-120: total_votes_count (8 bytes)
        // 121-128: outstanding_proposal_count (8 bytes)
        // 129+: reserved space
        
        const accountType = accountData.readUInt8(0);
        
        if (accountType !== 2) {
            throw new Error(`Invalid account type: ${accountType}, expected 2 for TokenOwnerRecord`);
        }
        
        // Read the governing token deposit amount (8 bytes at offset 97)
        const depositAmountLamports = accountData.readBigUInt64LE(97);
        
        // Convert to token units (ISLAND has 6 decimals)
        const depositAmount = Number(depositAmountLamports) / Math.pow(10, 6);
        
        return {
            accountType,
            depositAmount,
            depositAmountLamports: depositAmountLamports.toString()
        };
        
    } catch (error) {
        throw new Error(`Failed to parse Token Owner Record: ${error.message}`);
    }
}

/**
 * Get authentic governance deposit for a specific wallet
 */
async function getGovernanceDeposit(walletAddress) {
    try {
        console.log(`🔍 Getting governance deposit for: ${walletAddress}`);
        
        // Get the Token Owner Record PDA
        const torPDA = getTokenOwnerRecordPDA(
            ISLAND_DAO_CONFIG.realmId,
            ISLAND_DAO_CONFIG.communityMint,
            walletAddress
        );
        
        console.log(`  Token Owner Record PDA: ${torPDA.toString()}`);
        
        // Fetch the account data
        const accountInfo = await connection.getAccountInfo(torPDA);
        
        if (!accountInfo) {
            console.log(`  ❌ No Token Owner Record found`);
            return 0;
        }
        
        // Verify it's owned by the governance program
        const governanceProgramId = new PublicKey(ISLAND_DAO_CONFIG.programId);
        if (!accountInfo.owner.equals(governanceProgramId)) {
            console.log(`  ❌ Account not owned by governance program`);
            return 0;
        }
        
        console.log(`  ✅ Found Token Owner Record (${accountInfo.data.length} bytes)`);
        
        // Parse the Token Owner Record
        const parsed = parseTokenOwnerRecord(accountInfo.data);
        
        console.log(`  💰 Deposited amount: ${parsed.depositAmount.toLocaleString()} ISLAND`);
        console.log(`  📊 Raw lamports: ${parsed.depositAmountLamports}`);
        
        return parsed.depositAmount;
        
    } catch (error) {
        console.error(`❌ Error getting governance deposit for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get all Token Owner Records for the IslandDAO realm
 */
async function getAllGovernanceDeposits() {
    try {
        console.log('🔍 Getting all governance deposits for IslandDAO');
        
        const realmPubkey = new PublicKey(ISLAND_DAO_CONFIG.realmId);
        const communityMintPubkey = new PublicKey(ISLAND_DAO_CONFIG.communityMint);
        const governanceProgramId = new PublicKey(ISLAND_DAO_CONFIG.programId);
        
        // Get all Token Owner Records for this realm and community mint
        const torAccounts = await connection.getProgramAccounts(governanceProgramId, {
            filters: [
                {
                    memcmp: {
                        offset: 1, // realm offset
                        bytes: realmPubkey.toBase58()
                    }
                },
                {
                    memcmp: {
                        offset: 33, // governing_token_mint offset
                        bytes: communityMintPubkey.toBase58()
                    }
                }
            ]
        });
        
        console.log(`📊 Found ${torAccounts.length} Token Owner Records`);
        
        const deposits = [];
        
        for (const torAccount of torAccounts) {
            try {
                const parsed = parseTokenOwnerRecord(torAccount.account.data);
                
                if (parsed.depositAmount > 0) {
                    // Extract the wallet address from the account data
                    const walletPubkey = new PublicKey(torAccount.account.data.subarray(65, 97));
                    
                    deposits.push({
                        wallet: walletPubkey.toString(),
                        depositAmount: parsed.depositAmount,
                        torAccount: torAccount.pubkey.toString()
                    });
                    
                    console.log(`  💰 ${walletPubkey.toString()}: ${parsed.depositAmount.toLocaleString()} ISLAND`);
                }
            } catch (error) {
                console.log(`  ❌ Error parsing TOR ${torAccount.pubkey.toString()}: ${error.message}`);
            }
        }
        
        return deposits.sort((a, b) => b.depositAmount - a.depositAmount);
        
    } catch (error) {
        console.error('❌ Error getting all governance deposits:', error.message);
        return [];
    }
}

/**
 * Sync authentic governance deposits for all citizens
 */
async function syncGovernanceDepositsForAllCitizens() {
    try {
        console.log('🔄 Syncing authentic governance deposits for all citizens');
        
        const citizens = await db.getAllCitizens();
        console.log(`📊 Processing ${citizens.length} citizens`);
        
        const results = [];
        
        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`\n📊 Processing citizen ${i + 1}/${citizens.length}:`);
            console.log(`  Name: ${citizen.name || 'Unknown'}`);
            console.log(`  Wallet: ${citizen.wallet_address}`);
            
            const depositAmount = await getGovernanceDeposit(citizen.wallet_address);
            
            if (depositAmount > 0) {
                // Update the database with authentic governance deposit
                await db.updateGovernancePower(citizen.wallet_address, depositAmount);
                console.log(`  ✅ Updated database with ${depositAmount.toLocaleString()} ISLAND deposit`);
            } else {
                // Set to 0 if no deposit found
                await db.updateGovernancePower(citizen.wallet_address, 0);
                console.log(`  ℹ️ No governance deposits found`);
            }
            
            results.push({
                wallet: citizen.wallet_address,
                name: citizen.name,
                depositAmount: depositAmount
            });
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('\n📋 Governance Deposits Sync Summary:');
        console.log('='.repeat(60));
        
        const totalWithDeposits = results.filter(r => r.depositAmount > 0).length;
        const totalDeposits = results.reduce((sum, r) => sum + r.depositAmount, 0);
        
        console.log(`Citizens with governance deposits: ${totalWithDeposits}/${results.length}`);
        console.log(`Total governance deposits: ${totalDeposits.toLocaleString()} ISLAND`);
        
        if (totalWithDeposits > 0) {
            console.log('\nTop governance depositors:');
            results
                .filter(r => r.depositAmount > 0)
                .sort((a, b) => b.depositAmount - a.depositAmount)
                .slice(0, 5)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.depositAmount.toLocaleString()} ISLAND`);
                });
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Error syncing governance deposits:', error.message);
        return [];
    }
}

/**
 * Test with the known wallet that has 625.580931 ISLAND deposited
 */
async function testKnownDeposit() {
    const testWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('🧪 Testing governance deposit fetch with known wallet');
    console.log(`Target: ${testWallet}`);
    console.log('Expected: 625.580931 ISLAND');
    console.log('');
    
    const deposit = await getGovernanceDeposit(testWallet);
    
    console.log(`\n📊 Result: ${deposit.toLocaleString()} ISLAND`);
    
    if (Math.abs(deposit - 625.580931) < 0.000001) {
        console.log('🎯 SUCCESS! Matches expected governance deposit exactly!');
    } else if (deposit > 0) {
        console.log('✅ Found governance deposit, but amount differs from expected');
        console.log(`   Difference: ${Math.abs(deposit - 625.580931).toFixed(6)} ISLAND`);
    } else {
        console.log('❌ No governance deposit found');
    }
    
    return deposit;
}

// Export functions
module.exports = {
    getGovernanceDeposit,
    getAllGovernanceDeposits,
    syncGovernanceDepositsForAllCitizens,
    testKnownDeposit
};

// Run test if executed directly
if (require.main === module) {
    testKnownDeposit().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    });
}