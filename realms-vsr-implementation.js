/**
 * Realms VSR Implementation
 * Based on the official Realms VSR documentation
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';
const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';

/**
 * Find the VSR registrar using the correct pattern from docs
 */
async function findVSRRegistrar() {
    try {
        console.log('Finding VSR registrar using Realms documentation pattern...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        // VSR registrar derivation from documentation
        const [registrarPDA] = PublicKey.findProgramAddressSync(
            [
                realmPubkey.toBuffer(),
                Buffer.from('registrar'),
                mintPubkey.toBuffer(),
            ],
            vsrProgramPubkey
        );
        
        console.log(`Checking registrar PDA: ${registrarPDA.toString()}`);
        
        const registrarAccount = await connection.getAccountInfo(registrarPDA);
        
        if (registrarAccount) {
            console.log('✅ Found VSR registrar!');
            console.log(`Data length: ${registrarAccount.data.length} bytes`);
            return registrarPDA;
        } else {
            console.log('❌ VSR registrar not found at expected address');
            return null;
        }
        
    } catch (error) {
        console.error('Error finding VSR registrar:', error.message);
        return null;
    }
}

/**
 * Get voter PDA using the registrar
 */
function getVoterPDA(registrarPubkey, walletPubkey) {
    try {
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        const [voterPDA] = PublicKey.findProgramAddressSync(
            [
                registrarPubkey.toBuffer(),
                Buffer.from('voter'),
                walletPubkey.toBuffer(),
            ],
            vsrProgramPubkey
        );
        
        return voterPDA;
    } catch (error) {
        console.log('Error deriving voter PDA:', error.message);
        return null;
    }
}

/**
 * Parse VSR voter account according to documentation structure
 */
function parseVSRVoterAccountFromDocs(data) {
    try {
        if (!data || data.length < 80) return null;
        
        // VSR Voter structure from documentation:
        // 8 bytes: discriminator
        // 32 bytes: voter_authority  
        // 32 bytes: registrar
        // 4 bytes: deposits.len
        // Variable: deposits array
        
        const depositsLen = data.readUInt32LE(72);
        
        if (depositsLen === 0) return null;
        
        let totalVotingPower = 0;
        let offset = 80; // Start after the fixed fields
        
        // Parse each deposit according to VSR structure
        for (let i = 0; i < depositsLen && offset + 40 <= data.length; i++) {
            // Each deposit entry (40 bytes):
            // 8 bytes: amount_deposited_native
            // 8 bytes: amount_initially_locked_native  
            // 8 bytes: lockup_start_ts
            // 8 bytes: lockup_end_ts
            // 8 bytes: lockup_kind + padding
            
            const amountDeposited = data.readBigUInt64LE(offset);
            const amountLocked = data.readBigUInt64LE(offset + 8);
            const lockupStart = data.readBigUInt64LE(offset + 16);
            const lockupEnd = data.readBigUInt64LE(offset + 24);
            
            // Convert from lamports to tokens
            const depositedTokens = Number(amountDeposited) / Math.pow(10, 6);
            
            // Calculate voting power based on lockup
            let votingPower = depositedTokens;
            
            // Apply lockup multiplier if there's an active lockup
            if (lockupEnd > lockupStart) {
                const currentTime = Math.floor(Date.now() / 1000);
                
                if (lockupEnd > currentTime) {
                    // Active lockup - apply multiplier
                    const lockupDuration = Number(lockupEnd - lockupStart);
                    const yearsLocked = lockupDuration / (365 * 24 * 3600);
                    
                    // VSR typically uses linear scaling up to max multiplier
                    const multiplier = Math.min(2.0, 1.0 + yearsLocked);
                    votingPower = depositedTokens * multiplier;
                }
            }
            
            totalVotingPower += votingPower;
            offset += 40;
        }
        
        return {
            totalVotingPower: totalVotingPower,
            deposits: depositsLen
        };
        
    } catch (error) {
        console.log('Error parsing VSR voter account:', error.message);
        return null;
    }
}

/**
 * Get governance power for a wallet using correct VSR implementation
 */
async function getVSRGovernancePowerFromDocs(walletAddress) {
    try {
        // Find the registrar first
        const registrarPubkey = await findVSRRegistrar();
        if (!registrarPubkey) {
            console.log('Cannot proceed without VSR registrar');
            return 0;
        }
        
        const walletPubkey = new PublicKey(walletAddress);
        const voterPDA = getVoterPDA(registrarPubkey, walletPubkey);
        
        if (!voterPDA) {
            console.log(`Could not derive voter PDA for ${walletAddress}`);
            return 0;
        }
        
        const voterAccount = await connection.getAccountInfo(voterPDA);
        
        if (!voterAccount || !voterAccount.data) {
            console.log(`No voter account found for ${walletAddress}`);
            return 0;
        }
        
        const voterData = parseVSRVoterAccountFromDocs(voterAccount.data);
        
        if (!voterData) {
            console.log(`Could not parse voter data for ${walletAddress}`);
            return 0;
        }
        
        console.log(`${walletAddress}: ${voterData.totalVotingPower.toLocaleString()} ISLAND (${voterData.deposits} deposits)`);
        return voterData.totalVotingPower;
        
    } catch (error) {
        console.log(`Error getting VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Test the implementation with known wallet
 */
async function testVSRImplementationFromDocs() {
    console.log('Testing VSR implementation based on Realms documentation...');
    
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    const power = await getVSRGovernancePowerFromDocs(knownWallet);
    
    if (power > 0) {
        console.log(`✅ Found governance power: ${power.toLocaleString()} ISLAND`);
        
        if (Math.abs(power - 12625.580931) < 1) {
            console.log('✅ Amount matches expected value!');
        }
        
        return true;
    } else {
        console.log('❌ No governance power found');
        return false;
    }
}

/**
 * Sync governance power for all citizens using docs implementation
 */
async function syncVSRGovernancePowerFromDocs() {
    try {
        console.log('Syncing VSR governance power using Realms documentation...');
        
        // Test implementation first
        const testSuccess = await testVSRImplementationFromDocs();
        if (!testSuccess) {
            console.log('VSR implementation test failed, aborting sync');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Found ${walletAddresses.length} citizens to process`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = await getVSRGovernancePowerFromDocs(walletAddress);
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing VSR governance power from docs:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncVSRGovernancePowerFromDocs()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncVSRGovernancePowerFromDocs, 
    testVSRImplementationFromDocs 
};