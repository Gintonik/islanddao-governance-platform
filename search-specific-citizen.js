/**
 * Search Specific Citizen Governance Power
 * Comprehensive search for kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TARGET_CITIZEN = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/**
 * Search VSR accounts for the specific citizen
 */
async function searchVSRForSpecificCitizen() {
    try {
        console.log(`Searching VSR accounts for: ${TARGET_CITIZEN}`);
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const targetPubkey = new PublicKey(TARGET_CITIZEN);
        
        const accounts = await connection.getProgramAccounts(vsrProgramId);
        console.log(`Examining ${accounts.length} VSR accounts`);
        
        const foundAmounts = [];
        
        for (const account of accounts) {
            const data = account.account.data;
            
            // Search for wallet reference
            for (let offset = 0; offset <= data.length - 32; offset++) {
                try {
                    const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                    
                    if (pubkey.equals(targetPubkey)) {
                        console.log(`Found ${TARGET_CITIZEN} in VSR account: ${account.pubkey.toString()}`);
                        console.log(`  Wallet found at offset: ${offset}`);
                        
                        // Search for governance amounts near this wallet
                        for (let amountOffset = Math.max(0, offset - 200); amountOffset < Math.min(data.length - 8, offset + 200); amountOffset += 8) {
                            try {
                                const amount = data.readBigUInt64LE(amountOffset);
                                const tokenAmount = Number(amount) / Math.pow(10, 6);
                                
                                if (tokenAmount > 1000 && tokenAmount < 50000000) {
                                    foundAmounts.push({
                                        account: account.pubkey.toString(),
                                        offset: amountOffset,
                                        amount: tokenAmount,
                                        type: 'VSR'
                                    });
                                    console.log(`    VSR amount at offset ${amountOffset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return foundAmounts;
        
    } catch (error) {
        console.error('Error searching VSR:', error.message);
        return [];
    }
}

/**
 * Search governance accounts for the specific citizen
 */
async function searchGovernanceForSpecificCitizen() {
    try {
        console.log(`Searching governance accounts for: ${TARGET_CITIZEN}`);
        
        const governanceProgramId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const targetPubkey = new PublicKey(TARGET_CITIZEN);
        
        const accounts = await connection.getProgramAccounts(governanceProgramId, {
            filters: [{ dataSize: 105 }]
        });
        
        console.log(`Examining ${accounts.length} governance accounts`);
        
        const foundAmounts = [];
        
        for (const account of accounts) {
            const data = account.account.data;
            
            if (data.length >= 105) {
                const accountType = data.readUInt8(0);
                
                if (accountType === 12) {
                    try {
                        const wallet = new PublicKey(data.subarray(33, 65));
                        
                        if (wallet.equals(targetPubkey)) {
                            console.log(`Found ${TARGET_CITIZEN} in governance account: ${account.pubkey.toString()}`);
                            
                            // Extract all potential amounts
                            const checkOffsets = [67, 71, 79, 85, 91];
                            
                            for (const offset of checkOffsets) {
                                if (data.length >= offset + 8) {
                                    try {
                                        const value = data.readBigUInt64LE(offset);
                                        const tokenAmount = Number(value) / Math.pow(10, 6);
                                        
                                        if (tokenAmount > 100 && tokenAmount < 100000) {
                                            foundAmounts.push({
                                                account: account.pubkey.toString(),
                                                offset: offset,
                                                amount: tokenAmount,
                                                type: 'Governance'
                                            });
                                            console.log(`    Governance amount at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        continue;
                    }
                }
            }
        }
        
        return foundAmounts;
        
    } catch (error) {
        console.error('Error searching governance:', error.message);
        return [];
    }
}

/**
 * Comprehensive search for the specific citizen
 */
async function comprehensiveSearchForCitizen() {
    try {
        console.log(`Conducting comprehensive search for: ${TARGET_CITIZEN}\n`);
        
        // Search both VSR and governance
        const vsrAmounts = await searchVSRForSpecificCitizen();
        const governanceAmounts = await searchGovernanceForSpecificCitizen();
        
        const allAmounts = [...vsrAmounts, ...governanceAmounts];
        
        console.log(`\nSummary for ${TARGET_CITIZEN}:`);
        console.log(`Found ${allAmounts.length} potential governance amounts`);
        
        if (allAmounts.length > 0) {
            console.log('\nAll amounts found:');
            allAmounts.forEach((amount, index) => {
                console.log(`  ${index + 1}. ${amount.type} account: ${amount.amount.toLocaleString()} ISLAND`);
                console.log(`     Account: ${amount.account}`);
                console.log(`     Offset: ${amount.offset}`);
            });
            
            // Calculate potential governance power
            const maxAmount = Math.max(...allAmounts.map(a => a.amount));
            const totalAmount = allAmounts.reduce((sum, a) => sum + a.amount, 0);
            
            console.log(`\nPotential governance power calculations:`);
            console.log(`  Maximum single amount: ${maxAmount.toLocaleString()} ISLAND`);
            console.log(`  Sum of all amounts: ${totalAmount.toLocaleString()} ISLAND`);
            
            // Use the governance calculation pattern we found for other citizens
            const vsrMax = vsrAmounts.length > 0 ? Math.max(...vsrAmounts.map(a => a.amount)) : 0;
            const govMax = governanceAmounts.length > 0 ? Math.max(...governanceAmounts.map(a => a.amount)) : 0;
            
            let finalGovernancePower = 0;
            
            if (vsrMax > 0 && govMax > 0) {
                // Both VSR and governance found - combine like we did for DeanMachine
                finalGovernancePower = vsrMax + govMax;
                console.log(`  Combined VSR + Governance: ${finalGovernancePower.toLocaleString()} ISLAND`);
            } else if (vsrMax > 0) {
                finalGovernancePower = vsrMax;
                console.log(`  VSR only: ${finalGovernancePower.toLocaleString()} ISLAND`);
            } else if (govMax > 0) {
                finalGovernancePower = govMax;
                console.log(`  Governance only: ${finalGovernancePower.toLocaleString()} ISLAND`);
            }
            
            if (finalGovernancePower > 0) {
                console.log(`\nFinal governance power: ${finalGovernancePower.toLocaleString()} ISLAND`);
                return finalGovernancePower;
            }
        } else {
            console.log('No governance amounts found for this citizen');
        }
        
        return 0;
        
    } catch (error) {
        console.error('Error in comprehensive search:', error.message);
        return 0;
    }
}

/**
 * Update the citizen with found governance power
 */
async function updateCitizenWithFoundGovernance() {
    try {
        const governancePower = await comprehensiveSearchForCitizen();
        
        if (governancePower > 0) {
            console.log(`\nUpdating ${TARGET_CITIZEN} with governance power: ${governancePower.toLocaleString()} ISLAND`);
            
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [governancePower, TARGET_CITIZEN]
            );
            
            console.log('✅ Database updated successfully');
        } else {
            console.log(`\n❌ No governance power found for ${TARGET_CITIZEN}`);
        }
        
        return governancePower;
        
    } catch (error) {
        console.error('Error updating citizen:', error.message);
        return 0;
    }
}

if (require.main === module) {
    updateCitizenWithFoundGovernance()
        .then((power) => {
            console.log(`\nSearch complete. Governance power: ${power.toLocaleString()} ISLAND`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizenWithFoundGovernance,
    comprehensiveSearchForCitizen
};