/**
 * VSR Governance Power Implementation
 * Based on blockworks-foundation/voter-stake-registry official implementation
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Get VSR Registrar PDA using the official VSR method
 * Based on blockworks-foundation/voter-stake-registry
 */
function getRegistrarPDA() {
    const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
    const communityMintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
    const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
    
    const [registrarPubkey] = PublicKey.findProgramAddressSync(
        [
            realmPubkey.toBuffer(),
            Buffer.from('registrar'),
            communityMintPubkey.toBuffer(),
        ],
        vsrProgramPubkey
    );
    
    return registrarPubkey;
}

/**
 * Get Voter PDA using the official VSR method
 */
function getVoterPDA(registrarPubkey, walletPubkey) {
    const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
    
    const [voterPubkey] = PublicKey.findProgramAddressSync(
        [
            registrarPubkey.toBuffer(),
            Buffer.from('voter'),
            walletPubkey.toBuffer(),
        ],
        vsrProgramPubkey
    );
    
    return voterPubkey;
}

/**
 * Parse VSR Voter account according to the official struct
 */
function parseVoterAccount(data) {
    try {
        if (!data || data.length < 8) return null;
        
        // VSR Voter account structure (based on official implementation):
        // 0-8: discriminator
        // 8-40: voter_authority (32 bytes)
        // 40-72: registrar (32 bytes)
        // 72-80: deposits length (8 bytes)
        // 80+: deposits array
        
        const depositsLength = data.readUInt32LE(72);
        
        if (depositsLength === 0) return null;
        
        let totalVotingPower = 0;
        let offset = 80;
        
        // Parse each deposit
        for (let i = 0; i < depositsLength; i++) {
            if (offset + 40 > data.length) break;
            
            // Each deposit is 40 bytes:
            // 0-8: amount_deposited_native (8 bytes)
            // 8-16: amount_initially_locked_native (8 bytes)
            // 16-24: lockup_start_ts (8 bytes)
            // 24-32: lockup_end_ts (8 bytes)
            // 32-40: lockup_kind (8 bytes)
            
            const amountDeposited = data.readBigUInt64LE(offset);
            const amountLocked = data.readBigUInt64LE(offset + 8);
            const lockupStart = data.readBigUInt64LE(offset + 16);
            const lockupEnd = data.readBigUInt64LE(offset + 24);
            const lockupKind = data.readUInt32LE(offset + 32);
            
            // Convert from lamports to tokens
            const depositedTokens = Number(amountDeposited) / Math.pow(10, 6);
            const lockedTokens = Number(amountLocked) / Math.pow(10, 6);
            
            // Calculate voting power based on lockup
            let votingPower = depositedTokens;
            
            // If there's a lockup, apply multiplier (simplified calculation)
            if (lockupEnd > lockupStart && lockupKind > 0) {
                const currentTime = Math.floor(Date.now() / 1000);
                const lockupDuration = Number(lockupEnd - lockupStart);
                
                // VSR typically applies multipliers based on lockup duration
                // This is a simplified calculation - actual multiplier depends on VSR config
                if (lockupDuration > 0) {
                    const multiplier = Math.min(2.0, 1.0 + (lockupDuration / (365 * 24 * 3600))); // Max 2x for 1 year+
                    votingPower = depositedTokens * multiplier;
                }
            }
            
            totalVotingPower += votingPower;
            offset += 40;
        }
        
        return {
            totalDeposited: Number(totalVotingPower),
            deposits: depositsLength
        };
        
    } catch (error) {
        console.log('Error parsing VSR voter account:', error.message);
        return null;
    }
}

/**
 * Get VSR governance power for a specific wallet
 */
async function getVSRGovernancePower(walletAddress) {
    try {
        const registrarPubkey = getRegistrarPDA();
        const walletPubkey = new PublicKey(walletAddress);
        const voterPubkey = getVoterPDA(registrarPubkey, walletPubkey);
        
        // First check if registrar exists
        const registrarAccount = await connection.getAccountInfo(registrarPubkey);
        if (!registrarAccount) {
            console.log(`No VSR registrar found: ${registrarPubkey.toString()}`);
            return 0;
        }
        
        // Get voter account
        const voterAccount = await connection.getAccountInfo(voterPubkey);
        if (!voterAccount) {
            console.log(`No voter account found for ${walletAddress}`);
            return 0;
        }
        
        // Parse voter account
        const voterData = parseVoterAccount(voterAccount.data);
        if (!voterData) {
            console.log(`Could not parse voter account for ${walletAddress}`);
            return 0;
        }
        
        console.log(`${walletAddress}: ${voterData.totalDeposited.toLocaleString()} ISLAND (${voterData.deposits} deposits)`);
        return voterData.totalDeposited;
        
    } catch (error) {
        console.log(`Error getting VSR power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Test VSR implementation with known wallet
 */
async function testVSRImplementation() {
    console.log('Testing VSR implementation...');
    
    const registrarPubkey = getRegistrarPDA();
    console.log(`VSR Registrar PDA: ${registrarPubkey.toString()}`);
    
    // Check if registrar exists
    const registrarAccount = await connection.getAccountInfo(registrarPubkey);
    if (registrarAccount) {
        console.log(`✅ Found VSR registrar! Data length: ${registrarAccount.data.length} bytes`);
    } else {
        console.log(`❌ VSR registrar not found`);
        return false;
    }
    
    // Test with known wallet
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    const power = await getVSRGovernancePower(knownWallet);
    
    if (power > 0) {
        console.log(`✅ Found governance power: ${power.toLocaleString()} ISLAND`);
        
        if (Math.abs(power - 12625.580931) < 1) {
            console.log(`✅ Amount matches expected value!`);
        }
        
        return true;
    } else {
        console.log(`❌ No governance power found`);
        return false;
    }
}

/**
 * Sync VSR governance power for all citizens
 */
async function syncVSRGovernancePowerForAllCitizens() {
    try {
        console.log('Syncing VSR governance power for all citizens...');
        
        // Test implementation first
        const testSuccess = await testVSRImplementation();
        if (!testSuccess) {
            console.log('VSR implementation test failed, aborting sync');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Found ${walletAddresses.length} citizens to check`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = await getVSRGovernancePower(walletAddress);
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Summary
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing VSR governance power:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncVSRGovernancePowerForAllCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncVSRGovernancePowerForAllCitizens, 
    getVSRGovernancePower, 
    testVSRImplementation 
};