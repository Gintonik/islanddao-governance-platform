/**
 * Search for the 12,625.580931 ISLAND governance deposit in VSR account
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function findGovernanceDeposit() {
    try {
        const accountPubkey = new PublicKey('Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd');
        console.log('Searching for 12,625.580931 ISLAND governance deposit');
        
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        
        if (!accountInfo) {
            console.log('Account not found');
            return;
        }
        
        console.log(`Account owner: ${accountInfo.owner.toString()}`);
        console.log(`Data length: ${accountInfo.data.length} bytes`);
        
        // Search for 12,625.580931 ISLAND (12625580931 micro-tokens)
        const targetAmount = BigInt(12625580931);
        let found = false;
        
        for (let offset = 0; offset <= accountInfo.data.length - 8; offset++) {
            try {
                const value = accountInfo.data.readBigUInt64LE(offset);
                if (value === targetAmount) {
                    console.log(`Found governance deposit at offset: ${offset}`);
                    console.log(`Amount: ${Number(value) / 1000000} ISLAND`);
                    found = true;
                    
                    // Check surrounding data for context
                    console.log('Surrounding data:');
                    for (let i = Math.max(0, offset - 32); i < Math.min(accountInfo.data.length, offset + 40); i += 8) {
                        try {
                            const surroundingValue = accountInfo.data.readBigUInt64LE(i);
                            const tokenAmount = Number(surroundingValue) / 1000000;
                            console.log(`  Offset ${i}: ${Number(surroundingValue)} (${tokenAmount} tokens)`);
                        } catch (e) {
                            // Continue
                        }
                    }
                }
            } catch (error) {
                // Continue searching
            }
        }
        
        if (!found) {
            console.log('Governance deposit amount not found in account data');
        }
        
        // Search for wallet address
        const walletPubkey = new PublicKey('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
        const walletBuffer = walletPubkey.toBuffer();
        
        let walletFound = false;
        for (let offset = 0; offset <= accountInfo.data.length - 32; offset++) {
            if (accountInfo.data.subarray(offset, offset + 32).equals(walletBuffer)) {
                console.log(`Found wallet address at offset: ${offset}`);
                walletFound = true;
            }
        }
        
        if (!walletFound) {
            console.log('Wallet address not found in account data');
        }
        
    } catch (error) {
        console.error('Error searching for governance deposit:', error.message);
    }
}

findGovernanceDeposit();