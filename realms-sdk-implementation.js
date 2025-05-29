/**
 * Realms SDK Implementation for IslandDAO Governance Deposits
 * Following the official Realms SDK documentation pattern
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// IslandDAO Configuration from transaction analysis
const ISLAND_DAO_CONFIG = {
    realm: new PublicKey('1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds'),
    programId: new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'),
    communityMint: new PublicKey('Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a'),
    governanceTokenAccount: new PublicKey('AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh')
};

/**
 * Get Token Owner Record PDA following Realms SDK pattern
 */
function getTokenOwnerRecordAddress(realm, communityMint, governingTokenOwner) {
    const [address] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('governance'),
            realm.toBuffer(),
            communityMint.toBuffer(),
            governingTokenOwner.toBuffer()
        ],
        ISLAND_DAO_CONFIG.programId
    );
    return address;
}

/**
 * Parse Token Owner Record following SPL Governance structure
 */
function parseTokenOwnerRecord(data) {
    if (data.length < 105) {
        throw new Error('Invalid Token Owner Record data length');
    }

    const accountType = data.readUInt8(0);
    if (accountType !== 2) {
        throw new Error(`Expected Token Owner Record (2), got ${accountType}`);
    }

    // Structure based on SPL Governance IDL:
    // 0: account_type (1)
    // 1-32: realm (32)
    // 33-64: governing_token_mint (32)
    // 65-96: governing_token_owner (32)
    // 97-104: governing_token_deposit_amount (8)
    // 105-112: unrelinquished_vote_records_count (8)
    // 113-120: total_votes_count (8)
    // 121-128: outstanding_proposal_count (8)

    const realm = new PublicKey(data.subarray(1, 33));
    const governingTokenMint = new PublicKey(data.subarray(33, 65));
    const governingTokenOwner = new PublicKey(data.subarray(65, 97));
    const governingTokenDepositAmount = data.readBigUInt64LE(97);

    return {
        accountType,
        realm,
        governingTokenMint,
        governingTokenOwner,
        governingTokenDepositAmount: Number(governingTokenDepositAmount),
        governingTokenDepositAmountUI: Number(governingTokenDepositAmount) / Math.pow(10, 6)
    };
}

/**
 * Get governance deposit for a specific wallet using Realms SDK pattern
 */
async function getGovernanceDeposit(walletAddress) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        
        // Get Token Owner Record PDA
        const torAddress = getTokenOwnerRecordAddress(
            ISLAND_DAO_CONFIG.realm,
            ISLAND_DAO_CONFIG.communityMint,
            walletPubkey
        );

        // Fetch the account
        const accountInfo = await connection.getAccountInfo(torAddress);
        
        if (!accountInfo) {
            return 0; // No deposit found
        }

        // Verify it's owned by governance program
        if (!accountInfo.owner.equals(ISLAND_DAO_CONFIG.programId)) {
            return 0;
        }

        // Parse the Token Owner Record
        const parsed = parseTokenOwnerRecord(accountInfo.data);
        
        return parsed.governingTokenDepositAmountUI;

    } catch (error) {
        console.error(`Error getting governance deposit for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get all governance deposits for IslandDAO using direct account queries
 */
async function getAllGovernanceDeposits() {
    try {
        console.log('Fetching all governance deposits for IslandDAO...');

        // Query all Token Owner Records for this realm
        const accounts = await connection.getProgramAccounts(ISLAND_DAO_CONFIG.programId, {
            filters: [
                {
                    dataSize: 129 // Token Owner Record size
                },
                {
                    memcmp: {
                        offset: 1, // realm offset
                        bytes: ISLAND_DAO_CONFIG.realm.toBase58()
                    }
                },
                {
                    memcmp: {
                        offset: 33, // governing token mint offset  
                        bytes: ISLAND_DAO_CONFIG.communityMint.toBase58()
                    }
                }
            ]
        });

        console.log(`Found ${accounts.length} Token Owner Records`);

        const deposits = [];

        for (const account of accounts) {
            try {
                const parsed = parseTokenOwnerRecord(account.account.data);
                
                if (parsed.governingTokenDepositAmountUI > 0) {
                    deposits.push({
                        wallet: parsed.governingTokenOwner.toString(),
                        depositAmount: parsed.governingTokenDepositAmountUI,
                        torAccount: account.pubkey.toString()
                    });
                }
            } catch (error) {
                console.error(`Error parsing account ${account.pubkey.toString()}:`, error.message);
            }
        }

        // Sort by deposit amount descending
        deposits.sort((a, b) => b.depositAmount - a.depositAmount);

        console.log(`Found ${deposits.length} wallets with governance deposits`);
        
        if (deposits.length > 0) {
            console.log('\nTop governance depositors:');
            deposits.slice(0, 5).forEach((deposit, index) => {
                console.log(`  ${index + 1}. ${deposit.wallet}: ${deposit.depositAmount.toLocaleString()} ISLAND`);
            });
        }

        return deposits;

    } catch (error) {
        console.error('Error getting all governance deposits:', error.message);
        return [];
    }
}

/**
 * Sync governance deposits for all citizens
 */
async function syncGovernanceDepositsForAllCitizens() {
    try {
        console.log('Syncing governance deposits for all citizens...');

        const citizens = await db.getAllCitizens();
        console.log(`Processing ${citizens.length} citizens`);

        const results = [];

        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`Processing ${i + 1}/${citizens.length}: ${citizen.name || 'Unknown'} (${citizen.wallet_address})`);

            const depositAmount = await getGovernanceDeposit(citizen.wallet_address);

            // Update database with authentic governance deposit
            await db.updateGovernancePower(citizen.wallet_address, depositAmount);

            results.push({
                wallet: citizen.wallet_address,
                name: citizen.name,
                depositAmount: depositAmount
            });

            if (depositAmount > 0) {
                console.log(`  ✅ ${depositAmount.toLocaleString()} ISLAND deposited`);
            } else {
                console.log(`  ℹ️ No governance deposit`);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const citizensWithDeposits = results.filter(r => r.depositAmount > 0);
        const totalDeposited = results.reduce((sum, r) => sum + r.depositAmount, 0);

        console.log(`\n📊 Sync Summary:`);
        console.log(`Citizens with governance deposits: ${citizensWithDeposits.length}/${results.length}`);
        console.log(`Total governance power: ${totalDeposited.toLocaleString()} ISLAND`);

        if (citizensWithDeposits.length > 0) {
            console.log('\nTop citizen depositors:');
            citizensWithDeposits
                .sort((a, b) => b.depositAmount - a.depositAmount)
                .slice(0, 5)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.depositAmount.toLocaleString()} ISLAND`);
                });
        }

        return results;

    } catch (error) {
        console.error('Error syncing governance deposits:', error.message);
        return [];
    }
}

/**
 * Test with known wallet
 */
async function testKnownWallet() {
    const testWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('Testing governance deposit fetch');
    console.log(`Target: ${testWallet}`);
    console.log('Expected: 12,625.580931 ISLAND');
    
    const deposit = await getGovernanceDeposit(testWallet);
    
    console.log(`Result: ${deposit.toLocaleString()} ISLAND`);
    
    if (Math.abs(deposit - 12625.580931) < 0.000001) {
        console.log('🎯 SUCCESS! Matches expected governance deposit!');
        return true;
    } else if (deposit > 0) {
        console.log('✅ Found governance deposit, checking difference...');
        console.log(`Difference: ${Math.abs(deposit - 12625.580931).toFixed(6)} ISLAND`);
        return false;
    } else {
        console.log('❌ No governance deposit found');
        return false;
    }
}

module.exports = {
    getGovernanceDeposit,
    getAllGovernanceDeposits,
    syncGovernanceDepositsForAllCitizens,
    testKnownWallet
};

// Run test if executed directly
if (require.main === module) {
    testKnownWallet().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Test failed:', error.message);
        process.exit(1);
    });
}