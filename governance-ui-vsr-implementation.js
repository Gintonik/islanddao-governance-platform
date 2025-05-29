/**
 * VSR Governance Implementation based on Mythic-Project/governance-ui
 * This follows the exact pattern used in the governance UI for fetching authentic VSR data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// IslandDAO VSR Configuration
const ISLAND_DAO_CONFIG = {
    realmId: '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds',
    communityMint: 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a',
    councilMint: '6QqMpiCWGuQtGEKTJvhLBTz6GcjpwVS3ywCPwJ6HLoG8'
};

// VSR Plugin Program ID (from governance-ui)
const VSR_PLUGIN_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Find Voter PDA following governance-ui pattern
 */
function getVoterPDA(walletAddress, realmId) {
    const walletPubkey = new PublicKey(walletAddress);
    const realmPubkey = new PublicKey(realmId);
    
    const [voterPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('voter'),
            realmPubkey.toBuffer(),
            walletPubkey.toBuffer()
        ],
        VSR_PLUGIN_PROGRAM_ID
    );
    
    return voterPDA;
}

/**
 * Calculate voting power from VSR Voter account
 * Based on the governance-ui utils.ts implementation
 */
function calculateVotingPowerFromVoter(voterAccountData) {
    try {
        // Skip the account discriminator (8 bytes)
        let offset = 8;
        
        // Skip voter_authority (32 bytes)
        offset += 32;
        
        // Skip registrar (32 bytes) 
        offset += 32;
        
        // Read deposits array
        const depositsLength = voterAccountData.readUInt32LE(offset);
        offset += 4;
        
        let totalVotingPower = 0;
        
        console.log(`    Found ${depositsLength} deposits`);
        
        for (let i = 0; i < depositsLength; i++) {
            console.log(`    Processing deposit ${i + 1}/${depositsLength}:`);
            
            // Deposit Entry structure from VSR plugin:
            // lockup: Lockup (variable size)
            // amount_deposited_native: u64 (8 bytes)
            // amount_initially_locked_native: u64 (8 bytes)
            // is_used: bool (1 byte)
            // padding: [u8; 7] (7 bytes for alignment)
            
            // Read lockup kind first (1 byte)
            const lockupKind = voterAccountData.readUInt8(offset);
            offset += 1;
            
            console.log(`      Lockup kind: ${lockupKind}`);
            
            // Skip lockup data based on kind
            if (lockupKind === 0) {
                // None - no additional data
            } else if (lockupKind === 1) {
                // Constant - 16 bytes (start_ts: i64, end_ts: i64)
                offset += 16;
            } else if (lockupKind === 2) {
                // Cliff - 16 bytes (start_ts: i64, end_ts: i64)
                offset += 16;
            }
            
            // Read amount_deposited_native (8 bytes)
            const amountDeposited = voterAccountData.readBigUInt64LE(offset);
            offset += 8;
            
            // Read amount_initially_locked_native (8 bytes) 
            const amountInitiallyLocked = voterAccountData.readBigUInt64LE(offset);
            offset += 8;
            
            // Read is_used (1 byte)
            const isUsed = voterAccountData.readUInt8(offset);
            offset += 1;
            
            // Skip padding (7 bytes)
            offset += 7;
            
            // Convert to token units (ISLAND has 6 decimals)
            const depositedTokens = Number(amountDeposited) / Math.pow(10, 6);
            const initiallyLockedTokens = Number(amountInitiallyLocked) / Math.pow(10, 6);
            
            console.log(`      Amount deposited: ${depositedTokens.toLocaleString()} ISLAND`);
            console.log(`      Initially locked: ${initiallyLockedTokens.toLocaleString()} ISLAND`);
            console.log(`      Is used: ${isUsed === 1}`);
            
            if (isUsed === 1) {
                totalVotingPower += depositedTokens;
            }
        }
        
        return totalVotingPower;
        
    } catch (error) {
        console.error('    Error calculating voting power:', error.message);
        return 0;
    }
}

/**
 * Get authentic VSR governance power for a wallet
 */
async function getAuthenticVSRGovernancePower(walletAddress) {
    try {
        console.log(`🔍 Getting authentic VSR governance power for: ${walletAddress}`);
        
        const voterPDA = getVoterPDA(walletAddress, ISLAND_DAO_CONFIG.realmId);
        console.log(`  Voter PDA: ${voterPDA.toString()}`);
        
        const voterAccount = await connection.getAccountInfo(voterPDA);
        
        if (!voterAccount) {
            console.log(`  ❌ No VSR Voter account found`);
            return 0;
        }
        
        if (!voterAccount.owner.equals(VSR_PLUGIN_PROGRAM_ID)) {
            console.log(`  ❌ Account not owned by VSR plugin`);
            return 0;
        }
        
        console.log(`  ✅ Found VSR Voter account (${voterAccount.data.length} bytes)`);
        
        const votingPower = calculateVotingPowerFromVoter(voterAccount.data);
        
        console.log(`  💰 Total voting power: ${votingPower.toLocaleString()} ISLAND`);
        
        return votingPower;
        
    } catch (error) {
        console.error(`❌ Error getting VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Sync authentic VSR governance power for all citizens
 */
async function syncVSRGovernancePowerForAllCitizens() {
    try {
        console.log('🔄 Syncing authentic VSR governance power for all citizens');
        
        const citizens = await db.getAllCitizens();
        console.log(`📊 Processing ${citizens.length} citizens`);
        
        const results = [];
        
        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`\n📊 Processing citizen ${i + 1}/${citizens.length}:`);
            console.log(`  Name: ${citizen.name || 'Unknown'}`);
            console.log(`  Wallet: ${citizen.wallet_address}`);
            
            const governancePower = await getAuthenticVSRGovernancePower(citizen.wallet_address);
            
            if (governancePower > 0) {
                // Update the database with authentic governance power
                await db.updateGovernancePower(citizen.wallet_address, governancePower);
                console.log(`  ✅ Updated database with ${governancePower.toLocaleString()} ISLAND`);
            } else {
                console.log(`  ℹ️ No governance deposits found`);
            }
            
            results.push({
                wallet: citizen.wallet_address,
                name: citizen.name,
                governancePower: governancePower
            });
            
            // Small delay to avoid rate limiting
            if (i < citizens.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        console.log('\n📋 VSR Governance Power Sync Summary:');
        console.log('='.repeat(60));
        
        const totalWithGovernance = results.filter(r => r.governancePower > 0).length;
        const totalGovernancePower = results.reduce((sum, r) => sum + r.governancePower, 0);
        
        console.log(`Citizens with governance power: ${totalWithGovernance}/${results.length}`);
        console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} ISLAND`);
        
        if (totalWithGovernance > 0) {
            console.log('\nTop governance holders:');
            results
                .filter(r => r.governancePower > 0)
                .sort((a, b) => b.governancePower - a.governancePower)
                .slice(0, 5)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.governancePower.toLocaleString()} ISLAND`);
                });
        }
        
        return results;
        
    } catch (error) {
        console.error('❌ Error syncing VSR governance power:', error.message);
        return [];
    }
}

/**
 * Test with the known wallet that should have ~625.58 ISLAND
 */
async function testKnownWallet() {
    const testWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('🧪 Testing VSR governance power with known wallet');
    console.log(`Target: ${testWallet}`);
    console.log('Expected: ~625.58 ISLAND');
    console.log('');
    
    const power = await getAuthenticVSRGovernancePower(testWallet);
    
    console.log(`\n📊 Result: ${power.toLocaleString()} ISLAND`);
    
    if (Math.abs(power - 625.58) < 0.1) {
        console.log('🎯 SUCCESS! Matches expected governance deposit!');
    } else if (power > 0) {
        console.log('✅ Found governance power, but amount differs from expected');
    } else {
        console.log('❌ No governance power found - may need different VSR plugin approach');
    }
    
    return power;
}

// Export functions
module.exports = {
    getAuthenticVSRGovernancePower,
    syncVSRGovernancePowerForAllCitizens,
    testKnownWallet
};

// Run test if executed directly
if (require.main === module) {
    testKnownWallet().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    });
}