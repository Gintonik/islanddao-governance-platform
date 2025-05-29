/**
 * Governance Power Calculation Analysis
 * Understand how the values in governance accounts combine to create the final governance power
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KNOWN_GOVERNANCE_ACCOUNT = 'FfaFsewkm3BFQi8pH1xYSoRyLpAMk62iTqYJQZVy6n88';
const KNOWN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
const EXPECTED_GOVERNANCE_POWER = 12625.580931;

/**
 * Analyze how governance power is calculated from account values
 */
async function analyzeGovernancePowerCalculation() {
    try {
        console.log('Analyzing governance power calculation...');
        console.log(`Expected result: ${EXPECTED_GOVERNANCE_POWER} ISLAND`);
        
        const accountPubkey = new PublicKey(KNOWN_GOVERNANCE_ACCOUNT);
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo || !accountInfo.data) {
            console.log('Account not found');
            return null;
        }
        
        const data = accountInfo.data;
        
        // Extract all significant values from the account
        const values = [];
        
        for (let offset = 0; offset <= data.length - 8; offset++) {
            try {
                const value = Number(data.readBigUInt64LE(offset));
                const tokenAmount = value / Math.pow(10, 6);
                
                if (tokenAmount > 100 && tokenAmount < 100000) {
                    values.push({
                        offset: offset,
                        amount: tokenAmount,
                        lamports: value
                    });
                }
            } catch (error) {
                continue;
            }
        }
        
        console.log('\nValues found in governance account:');
        values.forEach((v, i) => {
            console.log(`  ${i + 1}. Offset ${v.offset}: ${v.amount.toLocaleString()} ISLAND`);
        });
        
        // Try different calculation methods
        console.log('\nTesting calculation methods:');
        
        // Method 1: Simple differences
        for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
                const diff = Math.abs(values[i].amount - values[j].amount);
                console.log(`  ${values[i].amount.toLocaleString()} - ${values[j].amount.toLocaleString()} = ${diff.toLocaleString()}`);
                
                if (Math.abs(diff - EXPECTED_GOVERNANCE_POWER) < 1) {
                    console.log(`    🎯 MATCHES EXPECTED GOVERNANCE POWER!`);
                    return {
                        method: 'difference',
                        formula: `${values[i].amount} - ${values[j].amount}`,
                        result: diff,
                        value1: values[i],
                        value2: values[j]
                    };
                }
            }
        }
        
        // Method 2: Ratios and multipliers
        for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
                const ratio = values[i].amount / values[j].amount;
                const product = values[i].amount * values[j].amount / 100000; // Scale down
                
                console.log(`  ${values[i].amount.toLocaleString()} / ${values[j].amount.toLocaleString()} = ${ratio.toFixed(6)}`);
                console.log(`  ${values[i].amount.toLocaleString()} * ${values[j].amount.toLocaleString()} / 100000 = ${product.toLocaleString()}`);
                
                if (Math.abs(product - EXPECTED_GOVERNANCE_POWER) < 1) {
                    console.log(`    🎯 PRODUCT MATCHES EXPECTED GOVERNANCE POWER!`);
                    return {
                        method: 'scaled_product',
                        formula: `(${values[i].amount} * ${values[j].amount}) / 100000`,
                        result: product,
                        value1: values[i],
                        value2: values[j]
                    };
                }
            }
        }
        
        // Method 3: Weighted combinations
        if (values.length >= 2) {
            const v1 = values[0].amount;
            const v2 = values[1].amount;
            
            // Try different weights
            const weights = [0.1, 0.2, 0.25, 0.3, 0.33, 0.4, 0.5, 0.6, 0.66, 0.7, 0.75, 0.8, 0.9];
            
            for (const w of weights) {
                const weighted = v1 * w + v2 * (1 - w);
                console.log(`  ${v1.toLocaleString()} * ${w} + ${v2.toLocaleString()} * ${(1-w).toFixed(2)} = ${weighted.toLocaleString()}`);
                
                if (Math.abs(weighted - EXPECTED_GOVERNANCE_POWER) < 1) {
                    console.log(`    🎯 WEIGHTED COMBINATION MATCHES!`);
                    return {
                        method: 'weighted_combination',
                        formula: `${v1} * ${w} + ${v2} * ${(1-w).toFixed(2)}`,
                        result: weighted,
                        weight: w
                    };
                }
            }
        }
        
        // Method 4: Check if it's a percentage of any value
        for (const value of values) {
            const percentages = [0.1, 0.2, 0.25, 0.3, 0.33, 0.4, 0.5, 0.6, 0.66, 0.7, 0.75, 0.8, 0.9];
            
            for (const pct of percentages) {
                const result = value.amount * pct;
                console.log(`  ${value.amount.toLocaleString()} * ${pct} = ${result.toLocaleString()}`);
                
                if (Math.abs(result - EXPECTED_GOVERNANCE_POWER) < 1) {
                    console.log(`    🎯 PERCENTAGE MATCHES!`);
                    return {
                        method: 'percentage',
                        formula: `${value.amount} * ${pct}`,
                        result: result,
                        percentage: pct,
                        baseValue: value
                    };
                }
            }
        }
        
        console.log('❌ No calculation method found that produces the expected governance power');
        return null;
        
    } catch (error) {
        console.error('Error analyzing governance power calculation:', error.message);
        return null;
    }
}

/**
 * Apply the discovered calculation to all governance accounts
 */
async function applyCalculationToAllAccounts() {
    try {
        console.log('Discovering calculation method...');
        
        const calculationMethod = await analyzeGovernancePowerCalculation();
        
        if (!calculationMethod) {
            console.log('Could not determine calculation method');
            return {};
        }
        
        console.log(`\nDiscovered calculation method: ${calculationMethod.method}`);
        console.log(`Formula: ${calculationMethod.formula}`);
        console.log(`Result: ${calculationMethod.result.toLocaleString()} ISLAND`);
        
        // Now apply this to all governance accounts
        console.log('\nApplying calculation to all governance accounts...');
        
        const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
        
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [
                { dataSize: 105 }
            ]
        });
        
        console.log(`Processing ${accounts.length} governance accounts`);
        
        const governancePowers = {};
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                if (data.length >= 105) {
                    const accountType = data.readUInt8(0);
                    
                    if (accountType === 12) {
                        // Extract wallet at offset 33
                        const wallet = new PublicKey(data.subarray(33, 65));
                        const walletStr = wallet.toString();
                        
                        // Extract values and apply the calculation method
                        const values = [];
                        
                        for (let offset = 65; offset <= data.length - 8; offset += 8) {
                            try {
                                const value = Number(data.readBigUInt64LE(offset));
                                const tokenAmount = value / Math.pow(10, 6);
                                
                                if (tokenAmount > 100 && tokenAmount < 100000) {
                                    values.push(tokenAmount);
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        if (values.length >= 2) {
                            let governancePower = 0;
                            
                            // Apply the discovered calculation method
                            switch (calculationMethod.method) {
                                case 'difference':
                                    governancePower = Math.abs(values[0] - values[1]);
                                    break;
                                case 'percentage':
                                    governancePower = values[0] * calculationMethod.percentage;
                                    break;
                                case 'weighted_combination':
                                    governancePower = values[0] * calculationMethod.weight + values[1] * (1 - calculationMethod.weight);
                                    break;
                                case 'scaled_product':
                                    governancePower = (values[0] * values[1]) / 100000;
                                    break;
                                default:
                                    governancePower = values[0]; // fallback
                            }
                            
                            if (governancePower > 0) {
                                governancePowers[walletStr] = governancePower;
                                
                                if (walletStr === KNOWN_WALLET) {
                                    console.log(`🎯 Known wallet result: ${governancePower.toLocaleString()} ISLAND`);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return governancePowers;
        
    } catch (error) {
        console.error('Error applying calculation to all accounts:', error.message);
        return {};
    }
}

if (require.main === module) {
    applyCalculationToAllAccounts()
        .then((powers) => {
            console.log(`\nCalculated governance powers for ${Object.keys(powers).length} wallets`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    analyzeGovernancePowerCalculation,
    applyCalculationToAllAccounts
};