/**
 * Direct query to Realms governance using the correct program structure
 * Based on the IDL approach mentioned for StakeDepositRecord types
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getAllTokenOwnerRecords } = require('@solana/spl-governance');

const ISLAND_DAO_REALM = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function getAllIslandDAOGovernancePower() {
    try {
        console.log('🔍 Fetching ALL token owner records for IslandDAO...');
        
        // Get all token owner records for the IslandDAO realm
        const allTokenOwnerRecords = await getAllTokenOwnerRecords(
            connection,
            GOVERNANCE_PROGRAM_ID,
            ISLAND_DAO_REALM
        );
        
        console.log(`✅ Found ${allTokenOwnerRecords.length} token owner records`);
        
        const governancePowerMap = {};
        
        for (const record of allTokenOwnerRecords) {
            const walletAddress = record.account.governingTokenOwner.toBase58();
            
            if (record.account.governingTokenDepositAmount) {
                // Convert from lamports to tokens (6 decimals for $ISLAND)
                const governancePowerLamports = record.account.governingTokenDepositAmount.toNumber();
                const governancePower = governancePowerLamports / Math.pow(10, 6);
                
                if (governancePower > 0) {
                    governancePowerMap[walletAddress] = governancePower;
                    console.log(`${walletAddress}: ${governancePower} $ISLAND`);
                }
            }
        }
        
        // Check for our known wallets
        const wallet1 = '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA';
        const wallet2 = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        
        console.log('\n🎯 Checking known wallets:');
        console.log(`${wallet1}: ${governancePowerMap[wallet1] || 0} $ISLAND (expected: 8,849,081.676143)`);
        console.log(`${wallet2}: ${governancePowerMap[wallet2] || 0} $ISLAND (expected: 625.58)`);
        
        return governancePowerMap;
        
    } catch (error) {
        console.error('❌ Error fetching governance power:', error.message);
        return {};
    }
}

getAllIslandDAOGovernancePower();