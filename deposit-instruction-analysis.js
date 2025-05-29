/**
 * Analyze deposit_governing_tokens instruction pattern to understand governance structure
 * Based on the SPL Governance instruction that handles depositing tokens
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

// From the deposit transaction analysis
const DEPOSIT_TX = '53MtCkhPYRSWkniY9846yTXGKgkbuDpGoNiRCtp5Q3i4BVoKAGSrgc1mK8joYMvstUrvTW8FKqUzDoULqEuphW5Z';

async function analyzeDepositInstruction() {
    try {
        console.log('Analyzing deposit_governing_tokens instruction pattern');
        console.log(`Transaction: ${DEPOSIT_TX}`);
        
        const tx = await connection.getTransaction(DEPOSIT_TX, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (!tx) {
            console.log('Transaction not found');
            return;
        }

        console.log('\nAccounts in deposit transaction:');
        const accounts = tx.transaction.message.staticAccountKeys;
        accounts.forEach((account, index) => {
            console.log(`  ${index}: ${account.toString()}`);
        });

        // The deposit instruction is likely the VSR instruction (program vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ)
        console.log('\nInstructions:');
        tx.transaction.message.compiledInstructions.forEach((instruction, index) => {
            const programId = accounts[instruction.programIdIndex];
            console.log(`  ${index}: Program ${programId.toString()}`);
            
            if (programId.toString() === 'vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ') {
                console.log('    This is the VSR deposit instruction!');
                console.log(`    Instruction data: ${Buffer.from(instruction.data).toString('hex')}`);
                
                // Analyze the accounts used in this instruction
                console.log('    Accounts used:');
                instruction.accountKeyIndexes.forEach((accountIndex, i) => {
                    const account = accounts[accountIndex];
                    console.log(`      ${i}: ${account.toString()}`);
                });
            }
        });

        // Based on typical VSR deposit_governing_tokens instruction, the accounts are:
        // 0: Registrar (VSR config account)
        // 1: Voter (VSR voter account - where deposit amount is stored)
        // 2: Voter authority (wallet doing the deposit)
        // 3: Voter weight record (optional)
        // 4: Vault (token account where tokens are stored)
        // 5: Deposit token (source token account)
        // 6: Deposit authority (wallet)
        // 7: Token program

        console.log('\nBased on VSR pattern, key accounts should be:');
        if (accounts.length >= 8) {
            console.log(`  Registrar: ${accounts[9].toString()}`); // Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd
            console.log(`  Voter: ${accounts[10].toString()}`); // HFKzcc6QfYvdbYFhZJSX1xs7UDk6Yjru3Dja5HxaNwyp
            console.log(`  Voter Authority: ${accounts[0].toString()}`); // 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4
            console.log(`  Vault: ${accounts[1].toString()}`); // AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh
        }

        // Now let's examine the Voter account which should contain the deposit amount
        const voterAccount = accounts[10]; // HFKzcc6QfYvdbYFhZJSX1xs7UDk6Yjru3Dja5HxaNwyp
        console.log(`\nExamining Voter account: ${voterAccount.toString()}`);
        
        const voterAccountInfo = await connection.getAccountInfo(voterAccount);
        
        if (voterAccountInfo) {
            console.log(`  Owner: ${voterAccountInfo.owner.toString()}`);
            console.log(`  Data length: ${voterAccountInfo.data.length} bytes`);
            
            // Search for the 12,625.580931 amount in the voter account
            const targetAmount = BigInt(12625580931); // 12,625.580931 ISLAND in micro-tokens
            
            for (let offset = 0; offset <= voterAccountInfo.data.length - 8; offset++) {
                try {
                    const value = voterAccountInfo.data.readBigUInt64LE(offset);
                    if (value === targetAmount) {
                        console.log(`  ✅ Found deposit amount at offset ${offset}: ${Number(value) / 1000000} ISLAND`);
                        
                        // This offset tells us where the deposit amounts are stored in Voter accounts
                        return {
                            voterAccount: voterAccount.toString(),
                            depositOffset: offset,
                            depositAmount: Number(value) / 1000000
                        };
                    }
                } catch (error) {
                    // Continue searching
                }
            }
            
            console.log('  ❌ Deposit amount not found in voter account');
        } else {
            console.log('  ❌ Voter account not found');
        }

        return null;

    } catch (error) {
        console.error('Error analyzing deposit instruction:', error.message);
        return null;
    }
}

/**
 * Now that we understand the structure, create a function to get voter PDA
 */
function getVoterPDA(walletAddress, registrarAccount) {
    const walletPubkey = new PublicKey(walletAddress);
    const registrarPubkey = new PublicKey(registrarAccount);
    const vsrProgramId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
    
    const [voterPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('voter'),
            registrarPubkey.toBuffer(),
            walletPubkey.toBuffer()
        ],
        vsrProgramId
    );
    
    return voterPDA;
}

/**
 * Test getting voter PDA for our target wallet
 */
async function testVoterPDADerivation() {
    const walletAddress = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
    const registrarAccount = 'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd'; // From transaction
    
    console.log('\nTesting Voter PDA derivation:');
    console.log(`Wallet: ${walletAddress}`);
    console.log(`Registrar: ${registrarAccount}`);
    
    const voterPDA = getVoterPDA(walletAddress, registrarAccount);
    console.log(`Derived Voter PDA: ${voterPDA.toString()}`);
    
    // Check if this matches the actual voter account from the transaction
    const actualVoterFromTx = 'HFKzcc6QfYvdbYFhZJSX1xs7UDk6Yjru3Dja5HxaNwyp';
    console.log(`Actual Voter from TX: ${actualVoterFromTx}`);
    
    if (voterPDA.toString() === actualVoterFromTx) {
        console.log('✅ PDA derivation matches transaction voter account!');
        return true;
    } else {
        console.log('❌ PDA derivation does not match');
        return false;
    }
}

// Run the analysis
if (require.main === module) {
    Promise.resolve()
        .then(() => analyzeDepositInstruction())
        .then(() => testVoterPDADerivation())
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Analysis failed:', error.message);
            process.exit(1);
        });
}

module.exports = {
    analyzeDepositInstruction,
    getVoterPDA,
    testVoterPDADerivation
};