/**
 * Realms Smart Contract Analysis
 * Understanding how SPL Governance contracts store governance power/voting power
 * Based on the SPL Governance program structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getAllTokenOwnerRecords, getTokenOwnerRecord, getRealm } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLAND_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

/**
 * Analyze the Realms governance structure to understand data storage
 */
async function analyzeRealmsGovernanceStructure() {
    try {
        console.log('🔍 Analyzing Realms governance structure for IslandDAO...');
        console.log(`Realm: ${ISLAND_DAO_REALM.toBase58()}`);
        console.log(`Token Mint: ${ISLAND_TOKEN_MINT.toBase58()}`);
        
        // 1. Get the realm account data
        console.log('\n📋 1. Analyzing Realm Account...');
        const realm = await getRealm(connection, ISLAND_DAO_REALM);
        
        console.log(`Realm Name: ${realm.account.name}`);
        console.log(`Community Mint: ${realm.account.communityMint?.toBase58() || 'None'}`);
        console.log(`Council Mint: ${realm.account.councilMint?.toBase58() || 'None'}`);
        console.log(`Reserved: ${realm.account.reserved?.toString() || 'None'}`);
        
        // 2. Get all token owner records for the realm
        console.log('\n📊 2. Analyzing Token Owner Records...');
        const allTokenOwnerRecords = await getAllTokenOwnerRecords(
            connection,
            GOVERNANCE_PROGRAM_ID,
            ISLAND_DAO_REALM
        );
        
        console.log(`Found ${allTokenOwnerRecords.length} token owner records`);
        
        const governancePowerData = [];
        
        for (const record of allTokenOwnerRecords) {
            const account = record.account;
            const walletAddress = account.governingTokenOwner.toBase58();
            const tokenMint = account.governingTokenMint.toBase58();
            
            console.log(`\n--- Token Owner Record ---`);
            console.log(`Wallet: ${walletAddress}`);
            console.log(`Token Mint: ${tokenMint}`);
            console.log(`Deposit Amount: ${account.governingTokenDepositAmount?.toString() || '0'}`);
            console.log(`Unrelinquished Votes: ${account.unrelinquishedVotesCount}`);
            console.log(`Total Votes Cast: ${account.totalVotesCast}`);
            
            // Check if this matches our token mint
            if (tokenMint === ISLAND_TOKEN_MINT.toBase58()) {
                const depositAmount = account.governingTokenDepositAmount?.toNumber() || 0;
                const governancePower = depositAmount / Math.pow(10, 6); // Assuming 6 decimals
                
                if (governancePower > 0) {
                    governancePowerData.push({
                        wallet: walletAddress,
                        governancePower: governancePower,
                        depositAmount: depositAmount
                    });
                }
            }
        }
        
        // 3. Sort and display governance power data
        console.log('\n🏆 3. Governance Power Rankings...');
        governancePowerData.sort((a, b) => b.governancePower - a.governancePower);
        
        for (const data of governancePowerData.slice(0, 10)) {
            console.log(`${data.wallet}: ${data.governancePower.toLocaleString()} $ISLAND`);
        }
        
        // 4. Check our known test wallets
        console.log('\n🎯 4. Checking Known Test Wallets...');
        const testWallets = [
            '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Expected: 8,849,081.676143
            '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Expected: 625.58
        ];
        
        for (const wallet of testWallets) {
            const found = governancePowerData.find(d => d.wallet === wallet);
            if (found) {
                console.log(`✅ ${wallet}: ${found.governancePower.toLocaleString()} $ISLAND`);
            } else {
                console.log(`❌ ${wallet}: Not found in governance records`);
                
                // Try to get individual token owner record
                try {
                    const walletPubkey = new PublicKey(wallet);
                    const tokenOwnerRecord = await getTokenOwnerRecord(
                        connection,
                        GOVERNANCE_PROGRAM_ID,
                        ISLAND_DAO_REALM,
                        ISLAND_TOKEN_MINT,
                        walletPubkey
                    );
                    
                    if (tokenOwnerRecord) {
                        const depositAmount = tokenOwnerRecord.account.governingTokenDepositAmount?.toNumber() || 0;
                        const governancePower = depositAmount / Math.pow(10, 6);
                        console.log(`   → Found individual record: ${governancePower.toLocaleString()} $ISLAND`);
                    }
                } catch (error) {
                    console.log(`   → Individual lookup failed: ${error.message}`);
                }
            }
        }
        
        return governancePowerData;
        
    } catch (error) {
        console.error('❌ Error analyzing Realms governance structure:', error.message);
        return [];
    }
}

// Run the analysis
analyzeRealmsGovernanceStructure();