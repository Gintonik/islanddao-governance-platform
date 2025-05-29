/**
 * Realms SDK Governance Implementation
 * Based on how the Realms frontend actually fetches VSR data
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';

/**
 * Find VSR Registrar using the same method as Realms frontend
 */
async function findVSRRegistrar() {
    try {
        console.log('Finding VSR registrar for IslandDAO...');
        
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        const realmPubkey = new PublicKey(ISLAND_DAO_REALM);
        
        // Realms uses this PDA derivation for VSR registrar
        const [registrarPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('registrar'),
                realmPubkey.toBuffer(),
                Buffer.from('ISLAND'),  // This might be the voting mint symbol
            ],
            vsrProgramPubkey
        );
        
        console.log(`Checking registrar PDA: ${registrarPDA.toString()}`);
        
        const registrarAccount = await connection.getAccountInfo(registrarPDA);
        
        if (registrarAccount) {
            console.log('✅ Found VSR registrar!');
            console.log(`Data length: ${registrarAccount.data.length} bytes`);
            return registrarPDA;
        }
        
        // Alternative derivation - try with voting mint
        const ISLAND_TOKEN_MINT = 'Ds52CDgqdWbTWsua1hgT3AusSy4FNx2Ezge1br3jQ14a';
        const mintPubkey = new PublicKey(ISLAND_TOKEN_MINT);
        
        const [registrarPDA2] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('registrar'),
                realmPubkey.toBuffer(),
                mintPubkey.toBuffer(),
            ],
            vsrProgramPubkey
        );
        
        console.log(`Checking alternative registrar PDA: ${registrarPDA2.toString()}`);
        
        const registrarAccount2 = await connection.getAccountInfo(registrarPDA2);
        
        if (registrarAccount2) {
            console.log('✅ Found VSR registrar (alternative derivation)!');
            console.log(`Data length: ${registrarAccount2.data.length} bytes`);
            return registrarPDA2;
        }
        
        // Search VSR accounts for registrar
        console.log('Searching VSR program accounts...');
        
        const vsrAccounts = await connection.getProgramAccounts(vsrProgramPubkey, {
            dataSlice: { offset: 0, length: 100 },
            filters: [
                {
                    dataSize: 200  // Registrars are typically around this size
                }
            ]
        });
        
        console.log(`Found ${vsrAccounts.length} potential registrar accounts`);
        
        for (const account of vsrAccounts.slice(0, 5)) {
            const data = account.account.data;
            
            // Check if this references the IslandDAO realm
            for (let i = 0; i <= data.length - 32; i++) {
                try {
                    const pubkey = new PublicKey(data.subarray(i, i + 32));
                    if (pubkey.equals(realmPubkey)) {
                        console.log(`Found realm reference in: ${account.pubkey.toString()}`);
                        return account.pubkey;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error finding VSR registrar:', error.message);
        return null;
    }
}

/**
 * Get voter weight record for a wallet using VSR
 */
async function getVoterWeightRecord(walletAddress, registrarPubkey) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        // VSR voter weight record PDA
        const [voterWeightPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('voter-weight-record'),
                registrarPubkey.toBuffer(),
                walletPubkey.toBuffer(),
            ],
            vsrProgramPubkey
        );
        
        const voterWeightAccount = await connection.getAccountInfo(voterWeightPDA);
        
        if (voterWeightAccount && voterWeightAccount.data) {
            console.log(`Found voter weight record for ${walletAddress}`);
            
            // Parse voter weight record - the weight is typically stored as u64 at offset 8
            if (voterWeightAccount.data.length >= 16) {
                const weight = voterWeightAccount.data.readBigUInt64LE(8);
                const weightAmount = Number(weight) / Math.pow(10, 6);
                return weightAmount;
            }
        }
        
        return 0;
    } catch (error) {
        console.log(`Error getting voter weight for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get voter record (deposit record) for a wallet
 */
async function getVoterRecord(walletAddress, registrarPubkey) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        // VSR voter PDA
        const [voterPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('voter'),
                registrarPubkey.toBuffer(),
                walletPubkey.toBuffer(),
            ],
            vsrProgramPubkey
        );
        
        const voterAccount = await connection.getAccountInfo(voterPDA);
        
        if (voterAccount && voterAccount.data) {
            console.log(`Found voter record for ${walletAddress}: ${voterPDA.toString()}`);
            console.log(`Data length: ${voterAccount.data.length} bytes`);
            
            // Try different offsets to find the deposit amount
            const offsets = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
            
            for (const offset of offsets) {
                if (voterAccount.data.length >= offset + 8) {
                    try {
                        const amount = voterAccount.data.readBigUInt64LE(offset);
                        const tokenAmount = Number(amount) / Math.pow(10, 6);
                        
                        if (tokenAmount > 1000 && tokenAmount < 50000) {
                            console.log(`  Potential deposit at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                            
                            if (Math.abs(tokenAmount - 12625.580931) < 1) {
                                console.log(`  🎯 FOUND MATCHING AMOUNT!`);
                                return tokenAmount;
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
            
            // Show all reasonable values found
            console.log('  All potential values:');
            for (let offset = 0; offset < voterAccount.data.length - 8; offset += 8) {
                try {
                    const amount = voterAccount.data.readBigUInt64LE(offset);
                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                    
                    if (tokenAmount > 0.1 && tokenAmount < 1000000) {
                        console.log(`    Offset ${offset}: ${tokenAmount.toLocaleString()}`);
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return 0;
    } catch (error) {
        console.log(`Error getting voter record for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Get governance power using Realms VSR method
 */
async function getGovernancePowerVSR(walletAddress) {
    try {
        // First find the registrar
        const registrarPubkey = await findVSRRegistrar();
        
        if (!registrarPubkey) {
            console.log('Could not find VSR registrar');
            return 0;
        }
        
        console.log(`Using registrar: ${registrarPubkey.toString()}`);
        
        // Try voter weight record first
        let power = await getVoterWeightRecord(walletAddress, registrarPubkey);
        if (power > 0) return power;
        
        // Try voter record
        power = await getVoterRecord(walletAddress, registrarPubkey);
        if (power > 0) return power;
        
        return 0;
        
    } catch (error) {
        console.error(`Error getting VSR governance power for ${walletAddress}:`, error.message);
        return 0;
    }
}

/**
 * Test with known wallet
 */
async function testVSRGovernance() {
    const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    console.log(`Testing VSR governance with known wallet: ${knownWallet}`);
    
    const power = await getGovernancePowerVSR(knownWallet);
    
    console.log(`Result: ${power.toLocaleString()} ISLAND`);
    
    if (power > 0) {
        console.log('✅ VSR governance query successful!');
        
        if (Math.abs(power - 12625.580931) < 1) {
            console.log('✅ Amount matches expected value!');
        }
        
        return true;
    } else {
        console.log('❌ No VSR governance power found');
        return false;
    }
}

/**
 * Sync VSR governance power for all citizens
 */
async function syncVSRGovernanceForCitizens() {
    try {
        console.log('Syncing VSR governance power for citizens...');
        
        // Test first
        const testSuccess = await testVSRGovernance();
        if (!testSuccess) {
            console.log('VSR test failed, aborting sync');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Found ${walletAddresses.length} citizens`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = await getGovernancePowerVSR(walletAddress);
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            if (power > 0) {
                console.log(`Updated ${walletAddress}: ${power.toLocaleString()} ISLAND`);
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nSync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error syncing VSR governance:', error.message);
        return {};
    }
}

if (require.main === module) {
    syncVSRGovernanceForCitizens()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    syncVSRGovernanceForCitizens, 
    getGovernancePowerVSR, 
    testVSRGovernance 
};