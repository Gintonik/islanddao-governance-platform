/**
 * Targeted VSR search for our specific citizens
 * Instead of searching all VSR accounts, derive PDAs for our citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const db = require('./db');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

const VSR_REGISTRAR = 'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd';
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';

function deriveVoterPDA(walletAddress, registrarAddress) {
    const walletPubkey = new PublicKey(walletAddress);
    const registrarPubkey = new PublicKey(registrarAddress);
    const vsrProgramPubkey = new PublicKey(VSR_PROGRAM_ID);
    
    const [voterPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('voter'),
            registrarPubkey.toBuffer(),
            walletPubkey.toBuffer()
        ],
        vsrProgramPubkey
    );
    
    return voterPDA;
}

function parseVSRVoterData(accountData) {
    try {
        // VSR Voter account structure - search for deposit amounts
        let totalDeposit = 0;
        
        // Search through the data for amounts that could be deposits
        for (let offset = 0; offset <= accountData.length - 8; offset += 8) {
            try {
                const value = accountData.readBigUInt64LE(offset);
                const tokenAmount = Number(value) / Math.pow(10, 6);
                
                // Look for reasonable ISLAND amounts (1 to 100M tokens)
                if (tokenAmount >= 1 && tokenAmount <= 100000000) {
                    // For now, take the largest reasonable amount found
                    if (tokenAmount > totalDeposit) {
                        totalDeposit = tokenAmount;
                    }
                }
            } catch (error) {
                // Continue searching
            }
        }
        
        return totalDeposit;
    } catch (error) {
        return 0;
    }
}

async function checkCitizenVSRDeposits() {
    try {
        console.log('Checking VSR governance deposits for all citizens');
        
        const citizens = await db.getAllCitizens();
        console.log(`Processing ${citizens.length} citizens`);
        
        const results = [];
        
        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`\nChecking ${i + 1}/${citizens.length}: ${citizen.name || 'Unknown'} (${citizen.wallet_address})`);
            
            try {
                // Derive the VSR voter PDA for this wallet
                const voterPDA = deriveVoterPDA(citizen.wallet_address, VSR_REGISTRAR);
                console.log(`  Voter PDA: ${voterPDA.toString()}`);
                
                // Check if this account exists
                const accountInfo = await connection.getAccountInfo(voterPDA);
                
                if (accountInfo && accountInfo.owner.toString() === VSR_PROGRAM_ID) {
                    console.log(`  ✅ Found VSR voter account (${accountInfo.data.length} bytes)`);
                    
                    // Parse the voter data to find deposit amount
                    const depositAmount = parseVSRVoterData(accountInfo.data);
                    
                    if (depositAmount > 0) {
                        console.log(`  💰 Deposit amount: ${depositAmount.toLocaleString()} ISLAND`);
                    } else {
                        console.log(`  📊 No deposits found in voter account`);
                    }
                    
                    // Update database
                    await db.updateGovernancePower(citizen.wallet_address, depositAmount);
                    
                    results.push({
                        wallet: citizen.wallet_address,
                        name: citizen.name,
                        voterAccount: voterPDA.toString(),
                        depositAmount: depositAmount
                    });
                } else {
                    console.log(`  ❌ No VSR voter account found`);
                    
                    // Set to 0 in database
                    await db.updateGovernancePower(citizen.wallet_address, 0);
                    
                    results.push({
                        wallet: citizen.wallet_address,
                        name: citizen.name,
                        voterAccount: null,
                        depositAmount: 0
                    });
                }
                
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
                
                results.push({
                    wallet: citizen.wallet_address,
                    name: citizen.name,
                    voterAccount: null,
                    depositAmount: 0
                });
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Summary
        const citizensWithDeposits = results.filter(r => r.depositAmount > 0);
        const totalDeposits = results.reduce((sum, r) => sum + r.depositAmount, 0);
        
        console.log(`\n📊 Summary:`);
        console.log(`Citizens with governance deposits: ${citizensWithDeposits.length}/${results.length}`);
        console.log(`Total governance deposits: ${totalDeposits.toLocaleString()} ISLAND`);
        
        if (citizensWithDeposits.length > 0) {
            console.log('\nTop governance depositors:');
            citizensWithDeposits
                .sort((a, b) => b.depositAmount - a.depositAmount)
                .slice(0, 5)
                .forEach((citizen, index) => {
                    console.log(`  ${index + 1}. ${citizen.name || 'Unknown'}: ${citizen.depositAmount.toLocaleString()} ISLAND`);
                });
        }
        
        return results;
        
    } catch (error) {
        console.error('Error checking citizen VSR deposits:', error.message);
        return [];
    }
}

// Test with known wallet first
async function testKnownVSRWallet() {
    const testWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    
    console.log('Testing VSR voter PDA derivation for known wallet');
    console.log(`Wallet: ${testWallet}`);
    console.log('Expected deposit: 12,625.580931 ISLAND');
    
    try {
        const voterPDA = deriveVoterPDA(testWallet, VSR_REGISTRAR);
        console.log(`Derived Voter PDA: ${voterPDA.toString()}`);
        
        const accountInfo = await connection.getAccountInfo(voterPDA);
        
        if (accountInfo) {
            console.log(`✅ Account found (${accountInfo.data.length} bytes)`);
            console.log(`Owner: ${accountInfo.owner.toString()}`);
            
            const depositAmount = parseVSRVoterData(accountInfo.data);
            console.log(`Parsed deposit: ${depositAmount.toLocaleString()} ISLAND`);
            
            if (Math.abs(depositAmount - 12625.580931) < 0.000001) {
                console.log('🎯 SUCCESS! Found exact expected deposit amount!');
                return true;
            } else if (depositAmount > 0) {
                console.log('✅ Found deposit, but different amount');
                return false;
            } else {
                console.log('❌ No deposit found in account');
                return false;
            }
        } else {
            console.log('❌ Voter account not found');
            return false;
        }
        
    } catch (error) {
        console.error('Error testing known wallet:', error.message);
        return false;
    }
}

// Run test first, then process all citizens
if (require.main === module) {
    testKnownVSRWallet()
        .then((success) => {
            if (success) {
                console.log('\n✅ VSR pattern works! Processing all citizens...\n');
            } else {
                console.log('\n⚠️ VSR pattern may not be perfect, but proceeding...\n');
            }
            return checkCitizenVSRDeposits();
        })
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { checkCitizenVSRDeposits, testKnownVSRWallet, deriveVoterPDA, parseVSRVoterData };