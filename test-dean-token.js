/**
 * Test governance power with $DEAN token references
 * The token may have been renamed from $DEAN to $ISLAND but Realms might still use old references
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getAllTokenOwnerRecords, getTokenOwnerRecord } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const DEAN_TOKEN_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy'); // Same mint, possibly still referenced as $DEAN

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function testDeanTokenGovernance() {
    try {
        console.log('🔍 Testing governance power with $DEAN token references...');
        console.log(`Realm: ${ISLAND_DAO_REALM.toBase58()}`);
        console.log(`Token Mint: ${DEAN_TOKEN_MINT.toBase58()}`);
        
        // Test the known wallets with $DEAN token context
        const testWallets = [
            '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA', // Expected: 8,849,081.676143
            '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Expected: 625.58
        ];
        
        for (const walletAddress of testWallets) {
            console.log(`\n🎯 Checking wallet: ${walletAddress}`);
            
            try {
                const walletPubkey = new PublicKey(walletAddress);
                
                // Try to get token owner record with $DEAN token mint
                const tokenOwnerRecord = await getTokenOwnerRecord(
                    connection,
                    GOVERNANCE_PROGRAM_ID,
                    ISLAND_DAO_REALM,
                    DEAN_TOKEN_MINT,
                    walletPubkey
                );
                
                if (tokenOwnerRecord && tokenOwnerRecord.account.governingTokenDepositAmount) {
                    const depositAmount = tokenOwnerRecord.account.governingTokenDepositAmount.toNumber();
                    const governancePower = depositAmount / Math.pow(10, 6); // $DEAN has 6 decimals
                    
                    console.log(`✅ Found governance power: ${governancePower.toLocaleString()} $DEAN/$ISLAND`);
                    console.log(`Raw deposit amount: ${depositAmount}`);
                } else {
                    console.log(`❌ No token owner record found for ${walletAddress}`);
                }
                
            } catch (error) {
                console.log(`❌ Error checking ${walletAddress}: ${error.message}`);
            }
        }
        
        // Also try to get all token owner records for the realm with $DEAN mint
        console.log('\n🔄 Fetching all token owner records with $DEAN mint...');
        
        try {
            const allRecords = await getAllTokenOwnerRecords(
                connection,
                GOVERNANCE_PROGRAM_ID,
                ISLAND_DAO_REALM,
                DEAN_TOKEN_MINT
            );
            
            console.log(`✅ Found ${allRecords.length} token owner records with $DEAN mint`);
            
            if (allRecords.length > 0) {
                console.log('\n📊 Top governance power holders:');
                
                const sortedRecords = allRecords
                    .filter(record => record.account.governingTokenDepositAmount && record.account.governingTokenDepositAmount.toNumber() > 0)
                    .sort((a, b) => b.account.governingTokenDepositAmount.toNumber() - a.account.governingTokenDepositAmount.toNumber())
                    .slice(0, 10);
                
                for (const record of sortedRecords) {
                    const walletAddress = record.account.governingTokenOwner.toBase58();
                    const depositAmount = record.account.governingTokenDepositAmount.toNumber();
                    const governancePower = depositAmount / Math.pow(10, 6);
                    
                    console.log(`${walletAddress}: ${governancePower.toLocaleString()} $DEAN/$ISLAND`);
                }
            }
            
        } catch (error) {
            console.log(`❌ Error fetching all records: ${error.message}`);
        }
        
    } catch (error) {
        console.error('❌ Error testing $DEAN token governance:', error.message);
    }
}

testDeanTokenGovernance();