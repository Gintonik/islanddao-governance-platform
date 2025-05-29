/**
 * Targeted VSR search for citizen governance power
 * Query VSR voter accounts directly for our known citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const ISLAND_DAO_REALM = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds';

// VSR Registrar account for IslandDAO (derived from realm)
const VSR_REGISTRAR = '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds'; // This might need adjustment

function getVSRVoterPDA(walletAddress, registrarAccount) {
    try {
        const walletPubkey = new PublicKey(walletAddress);
        const registrarPubkey = new PublicKey(registrarAccount);
        const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
        
        const [voterPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("voter"),
                registrarPubkey.toBuffer(),
                walletPubkey.toBuffer()
            ],
            vsrProgramPubkey
        );
        
        return voterPDA;
    } catch (error) {
        console.log(`Error deriving VSR voter PDA for ${walletAddress}:`, error.message);
        return null;
    }
}

function parseVSRVoterAccount(accountData) {
    try {
        if (!accountData || accountData.length < 8) return 0;
        
        // VSR Voter account structure varies, try different offset locations
        // Common locations for voting power in VSR accounts
        const possibleOffsets = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
        
        for (const offset of possibleOffsets) {
            if (accountData.length >= offset + 8) {
                try {
                    const amount = accountData.readBigUInt64LE(offset);
                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                    
                    // Look for amounts that match expected governance deposits
                    if (tokenAmount > 1 && tokenAmount < 100000000) {
                        return tokenAmount;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return 0;
    } catch (error) {
        return 0;
    }
}

async function checkCitizenVSRGovernancePower() {
    try {
        console.log('Checking VSR governance power for citizens');
        
        const citizens = await db.getAllCitizens();
        console.log(`Checking ${citizens.length} citizens`);
        
        const results = [];
        
        for (const citizen of citizens) {
            try {
                // Try different registrar accounts that might be used
                const registrarOptions = [
                    ISLAND_DAO_REALM,
                    '1UdV7JFvAgtBiH2KYLUK2cVZZz2sZ1uoyeb8bojnWds',
                    // Add more potential registrar accounts if needed
                ];
                
                let governancePower = 0;
                let foundAccount = null;
                
                for (const registrar of registrarOptions) {
                    const voterPDA = getVSRVoterPDA(citizen.wallet_address, registrar);
                    if (!voterPDA) continue;
                    
                    try {
                        const accountInfo = await connection.getAccountInfo(voterPDA);
                        if (accountInfo && accountInfo.data) {
                            const power = parseVSRVoterAccount(accountInfo.data);
                            if (power > 0) {
                                governancePower = power;
                                foundAccount = voterPDA.toString();
                                break;
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                // Update database
                await db.updateGovernancePower(citizen.wallet_address, governancePower);
                
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name || 'Unknown',
                    governancePower: governancePower,
                    voterAccount: foundAccount
                });
                
                if (governancePower > 0) {
                    console.log(`  ${citizen.name || 'Unknown'}: ${governancePower.toLocaleString()} ISLAND (${foundAccount})`);
                }
                
            } catch (error) {
                console.log(`Error checking ${citizen.wallet_address}: ${error.message}`);
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name || 'Unknown',
                    governancePower: 0,
                    voterAccount: null
                });
            }
        }
        
        const citizensWithPower = results.filter(r => r.governancePower > 0);
        const totalPower = results.reduce((sum, r) => sum + r.governancePower, 0);
        
        console.log(`\nResults:`);
        console.log(`Citizens with governance power: ${citizensWithPower.length}/${results.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        // Check if we found the known wallet
        const knownWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
        const knownResult = results.find(r => r.wallet === knownWallet);
        
        if (knownResult && knownResult.governancePower > 0) {
            console.log(`\n🎯 Found known wallet: ${knownResult.governancePower.toLocaleString()} ISLAND`);
            
            if (Math.abs(knownResult.governancePower - 12625.580931) < 1) {
                console.log('✅ Amount close to expected 12,625.580931 ISLAND!');
            }
        }
        
        return results;
        
    } catch (error) {
        console.error('Error checking citizen VSR governance power:', error.message);
        return [];
    }
}

if (require.main === module) {
    checkCitizenVSRGovernancePower()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkCitizenVSRGovernancePower, getVSRVoterPDA, parseVSRVoterAccount };