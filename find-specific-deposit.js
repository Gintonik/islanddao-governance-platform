/**
 * Find the specific governance deposit for wallet 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4
 * that shows 625.58 $ISLAND governance power on Realms
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const TARGET_WALLET = new PublicKey('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
const REALM_ADDRESS = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const COMMUNITY_MINT = new PublicKey('1119wEfde85KtGxVVW8BRjQrG8fLmN4WhdAEAaWcvWy');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function findSpecificGovernanceDeposit() {
    try {
        console.log('🎯 Searching for governance deposit for wallet with 625.58 $ISLAND power...');
        console.log(`Target wallet: ${TARGET_WALLET.toBase58()}`);
        
        // Search for all accounts owned by the governance program
        console.log('\n🔍 Getting all governance program accounts...');
        
        const programAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: '2' // TokenOwnerRecord discriminator
                    }
                }
            ]
        });
        
        console.log(`Found ${programAccounts.length} governance accounts`);
        
        // Look for accounts related to our target wallet
        for (const account of programAccounts) {
            const data = account.account.data;
            
            // Check if this account contains our target wallet address
            const walletBytes = TARGET_WALLET.toBuffer();
            let foundWallet = false;
            
            for (let i = 0; i <= data.length - 32; i++) {
                if (data.subarray(i, i + 32).equals(walletBytes)) {
                    foundWallet = true;
                    break;
                }
            }
            
            if (foundWallet) {
                console.log(`\n✅ Found potential account: ${account.pubkey.toBase58()}`);
                console.log(`Data length: ${data.length} bytes`);
                
                // Try to extract deposit amount (typically stored as u64 at specific offset)
                // TokenOwnerRecord structure has governingTokenDepositAmount around offset 64-72
                for (let offset = 40; offset < Math.min(data.length - 8, 120); offset += 8) {
                    const amount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                    
                    // Check if this matches our expected 625.58
                    if (tokenAmount > 625 && tokenAmount < 626) {
                        console.log(`🎯 FOUND IT! Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                        console.log(`Raw amount: ${amount.toString()}`);
                        return {
                            account: account.pubkey.toBase58(),
                            governancePower: tokenAmount,
                            rawAmount: amount.toString()
                        };
                    } else if (tokenAmount > 0 && tokenAmount < 100000000) {
                        console.log(`Offset ${offset}: ${tokenAmount.toLocaleString()} $ISLAND`);
                    }
                }
            }
        }
        
        console.log('\n❌ No matching governance deposit found');
        return null;
        
    } catch (error) {
        console.error('❌ Error finding governance deposit:', error.message);
        return null;
    }
}

// Also try a direct account lookup approach
async function tryDirectAccountLookup() {
    console.log('\n🔄 Trying direct account lookup approaches...');
    
    // Generate possible TokenOwnerRecord PDAs
    const possibleSeeds = [
        ['token-owner-record', REALM_ADDRESS.toBuffer(), COMMUNITY_MINT.toBuffer(), TARGET_WALLET.toBuffer()],
        ['governance', REALM_ADDRESS.toBuffer(), COMMUNITY_MINT.toBuffer(), TARGET_WALLET.toBuffer()],
        [REALM_ADDRESS.toBuffer(), COMMUNITY_MINT.toBuffer(), TARGET_WALLET.toBuffer()],
    ];
    
    for (let i = 0; i < possibleSeeds.length; i++) {
        try {
            const [pda] = PublicKey.findProgramAddressSync(possibleSeeds[i], GOVERNANCE_PROGRAM_ID);
            console.log(`PDA ${i + 1}: ${pda.toBase58()}`);
            
            const accountInfo = await connection.getAccountInfo(pda);
            if (accountInfo) {
                console.log(`✅ Found account ${i + 1}! Data length: ${accountInfo.data.length}`);
                
                // Try to extract governance power
                const data = accountInfo.data;
                for (let offset = 40; offset < Math.min(data.length - 8, 120); offset += 8) {
                    const amount = data.readBigUInt64LE(offset);
                    const tokenAmount = Number(amount) / Math.pow(10, 6);
                    
                    if (tokenAmount > 625 && tokenAmount < 626) {
                        console.log(`🎯 FOUND GOVERNANCE POWER! ${tokenAmount.toLocaleString()} $ISLAND`);
                        return tokenAmount;
                    }
                }
            }
        } catch (error) {
            // PDA generation failed, continue
        }
    }
    
    return null;
}

async function main() {
    const result1 = await findSpecificGovernanceDeposit();
    const result2 = await tryDirectAccountLookup();
    
    if (result1 || result2) {
        console.log('\n🎉 Successfully found governance data!');
    } else {
        console.log('\n❌ Could not locate the 625.58 $ISLAND governance deposit');
    }
}

main();