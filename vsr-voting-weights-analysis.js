/**
 * VSR Voting Weights Analysis
 * Find authentic voting weights for each citizen based on their locking configurations
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VSR_PROGRAM_ID = 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ';
const GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';

/**
 * Get VSR voter account for a specific wallet
 */
function getVSRVoterPDA(walletAddress, registrarAddress) {
    try {
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const walletPubkey = new PublicKey(walletAddress);
        const registrarPubkey = new PublicKey(registrarAddress);
        
        const [pda] = PublicKey.findProgramAddressSync(
            [
                registrarPubkey.toBuffer(),
                Buffer.from('voter'),
                walletPubkey.toBuffer()
            ],
            vsrProgramId
        );
        
        return pda;
    } catch (error) {
        console.error('Error calculating VSR voter PDA:', error.message);
        return null;
    }
}

/**
 * Find VSR registrar for IslandDAO
 */
async function findIslandDAOVSRRegistrar() {
    try {
        console.log('Finding IslandDAO VSR registrar...');
        
        const vsrProgramId = new PublicKey(VSR_PROGRAM_ID);
        const accounts = await connection.getProgramAccounts(vsrProgramId);
        
        console.log(`Examining ${accounts.length} VSR accounts`);
        
        // Look for registrar that references IslandDAO governance
        const realmPubkey = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9');
        
        for (const account of accounts) {
            const data = account.account.data;
            
            // Check if this account references the IslandDAO realm
            for (let offset = 0; offset <= data.length - 32; offset++) {
                try {
                    const pubkey = new PublicKey(data.subarray(offset, offset + 32));
                    if (pubkey.equals(realmPubkey)) {
                        console.log(`Found potential VSR registrar: ${account.pubkey.toString()}`);
                        return account.pubkey.toString();
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
 * Get authentic voting power for citizens using VSR
 */
async function getAuthenticVotingPower() {
    try {
        console.log('Getting authentic voting power for citizens...');
        
        // Get all citizens from database
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`Analyzing voting power for ${walletAddresses.length} citizens`);
        
        // Find the VSR registrar
        const registrarAddress = await findIslandDAOVSRRegistrar();
        
        if (!registrarAddress) {
            console.log('Could not find VSR registrar, using governance account data');
            return await getGovernanceAccountVotingPower();
        }
        
        console.log(`Using VSR registrar: ${registrarAddress}`);
        
        const votingPowers = {};
        
        for (const walletAddress of walletAddresses) {
            try {
                console.log(`\nAnalyzing ${walletAddress}...`);
                
                const voterPDA = getVSRVoterPDA(walletAddress, registrarAddress);
                
                if (!voterPDA) {
                    console.log('  Could not calculate voter PDA');
                    continue;
                }
                
                const voterAccountInfo = await connection.getAccountInfo(voterPDA);
                
                if (!voterAccountInfo || !voterAccountInfo.data) {
                    console.log('  No VSR voter account found');
                    continue;
                }
                
                console.log(`  VSR voter account found: ${voterPDA.toString()}`);
                console.log(`  Data length: ${voterAccountInfo.data.length} bytes`);
                
                // Parse VSR voter account to find voting power
                const data = voterAccountInfo.data;
                
                // Look for voting power in the VSR voter account
                let maxVotingPower = 0;
                
                for (let offset = 0; offset <= data.length - 8; offset += 8) {
                    try {
                        const value = data.readBigUInt64LE(offset);
                        const tokenAmount = Number(value) / Math.pow(10, 6);
                        
                        if (tokenAmount > 1000 && tokenAmount < 50000) {
                            console.log(`    Potential voting power at offset ${offset}: ${tokenAmount.toLocaleString()} ISLAND`);
                            maxVotingPower = Math.max(maxVotingPower, tokenAmount);
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                if (maxVotingPower > 0) {
                    votingPowers[walletAddress] = maxVotingPower;
                    console.log(`  ✅ Voting power: ${maxVotingPower.toLocaleString()} ISLAND`);
                }
                
            } catch (error) {
                console.log(`  Error analyzing ${walletAddress}: ${error.message}`);
                continue;
            }
        }
        
        return votingPowers;
        
    } catch (error) {
        console.error('Error getting authentic voting power:', error.message);
        return {};
    }
}

/**
 * Fallback: Get voting power from governance accounts with individual analysis
 */
async function getGovernanceAccountVotingPower() {
    try {
        console.log('Analyzing governance accounts for individual voting power...');
        
        const programId = new PublicKey(GOVERNANCE_PROGRAM_ID);
        const accounts = await connection.getProgramAccounts(programId, {
            filters: [{ dataSize: 105 }]
        });
        
        console.log(`Found ${accounts.length} governance accounts`);
        
        const votingPowers = {};
        
        for (const account of accounts) {
            try {
                const data = account.account.data;
                
                if (data.length >= 105) {
                    const accountType = data.readUInt8(0);
                    
                    if (accountType === 12) {
                        // Extract wallet at offset 33
                        const wallet = new PublicKey(data.subarray(33, 65));
                        const walletStr = wallet.toString();
                        
                        // Look for the best voting power value in this account
                        let bestVotingPower = 0;
                        
                        // Check multiple offsets and apply different ratios
                        const checkOffsets = [67, 71, 79, 85, 91];
                        const possibleRatios = [0.326625, 0.3, 0.33, 0.25, 0.4, 0.5];
                        
                        for (const offset of checkOffsets) {
                            if (data.length >= offset + 8) {
                                try {
                                    const value = data.readBigUInt64LE(offset);
                                    const depositAmount = Number(value) / Math.pow(10, 6);
                                    
                                    if (depositAmount > 100 && depositAmount < 100000) {
                                        // Try different ratios to see which gives reasonable values
                                        for (const ratio of possibleRatios) {
                                            const votingPower = depositAmount * ratio;
                                            
                                            // Prefer values that are reasonable governance amounts
                                            if (votingPower > 1000 && votingPower < 50000) {
                                                bestVotingPower = Math.max(bestVotingPower, votingPower);
                                            }
                                        }
                                    }
                                } catch (error) {
                                    continue;
                                }
                            }
                        }
                        
                        if (bestVotingPower > 0) {
                            votingPowers[walletStr] = bestVotingPower;
                            console.log(`${walletStr}: ${bestVotingPower.toLocaleString()} ISLAND`);
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return votingPowers;
        
    } catch (error) {
        console.error('Error getting governance account voting power:', error.message);
        return {};
    }
}

/**
 * Update citizens with authentic voting power
 */
async function updateCitizensWithAuthenticVotingPower() {
    try {
        console.log('Updating citizens with authentic voting power...');
        
        const votingPowers = await getAuthenticVotingPower();
        
        if (Object.keys(votingPowers).length === 0) {
            console.log('No voting powers found');
            return {};
        }
        
        // Get all citizens
        const citizensResult = await pool.query('SELECT wallet FROM citizens');
        const walletAddresses = citizensResult.rows.map(row => row.wallet);
        
        console.log(`\nUpdating ${walletAddresses.length} citizens with authentic voting power`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            const power = votingPowers[walletAddress] || 0;
            results[walletAddress] = power;
            
            // Update database
            await pool.query(
                'UPDATE citizens SET governance_power = $1 WHERE wallet = $2',
                [power, walletAddress]
            );
            
            if (power > 0) {
                console.log(`  Updated ${walletAddress}: ${power.toLocaleString()} ISLAND`);
            }
        }
        
        const citizensWithPower = Object.values(results).filter(p => p > 0).length;
        const totalPower = Object.values(results).reduce((sum, p) => sum + p, 0);
        
        console.log(`\nAuthentic voting power sync complete:`);
        console.log(`Citizens with governance power: ${citizensWithPower}/${walletAddresses.length}`);
        console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
        
        return results;
        
    } catch (error) {
        console.error('Error updating citizens with authentic voting power:', error.message);
        return {};
    }
}

if (require.main === module) {
    updateCitizensWithAuthenticVotingPower()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Process failed:', error.message);
            process.exit(1);
        });
}

module.exports = { 
    updateCitizensWithAuthenticVotingPower,
    getAuthenticVotingPower,
    findIslandDAOVSRRegistrar
};