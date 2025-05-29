/**
 * Broad search for any governance accounts referencing ISLAND token
 * Search anywhere in account data, not just specific offsets
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const ISLAND_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

async function broadSearchForIslandToken() {
    try {
        console.log(`🔍 Broad search for ISLAND token in SPL Governance`);
        console.log(`ISLAND Token: ${ISLAND_TOKEN_MINT.toString()}`);
        console.log('');

        // Search for any accounts that contain the ISLAND token address
        console.log('📊 Searching for accounts containing ISLAND token address...');
        
        const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 0,
                        bytes: ISLAND_TOKEN_MINT.toBase58()
                    }
                }
            ]
        });

        console.log(`Found ${accounts.length} accounts containing ISLAND token address`);
        
        if (accounts.length === 0) {
            // Try searching at different common offsets
            console.log('📊 Trying searches at different offsets...');
            
            const commonOffsets = [1, 33, 65, 97, 129];
            
            for (const offset of commonOffsets) {
                console.log(`  Searching at offset ${offset}...`);
                
                const offsetAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
                    filters: [
                        {
                            memcmp: {
                                offset: offset,
                                bytes: ISLAND_TOKEN_MINT.toBase58()
                            }
                        }
                    ]
                });
                
                console.log(`    Found ${offsetAccounts.length} accounts`);
                
                if (offsetAccounts.length > 0) {
                    console.log(`    ✅ Found accounts at offset ${offset}:`);
                    
                    for (let i = 0; i < Math.min(3, offsetAccounts.length); i++) {
                        const account = offsetAccounts[i];
                        console.log(`      ${i + 1}. ${account.pubkey.toString()}`);
                        console.log(`         Data length: ${account.account.data.length} bytes`);
                        
                        // Determine account type
                        const accountType = account.account.data.readUInt8(0);
                        let typeDescription = 'Unknown';
                        
                        switch (accountType) {
                            case 0: typeDescription = 'Uninitialized'; break;
                            case 1: typeDescription = 'Realm'; break;
                            case 2: typeDescription = 'Token Owner Record'; break;
                            case 3: typeDescription = 'Governance'; break;
                            case 4: typeDescription = 'Program Governance'; break;
                            case 5: typeDescription = 'Proposal'; break;
                            case 6: typeDescription = 'Signatory Record'; break;
                            case 7: typeDescription = 'Vote Record'; break;
                            case 8: typeDescription = 'Proposal Instruction'; break;
                            case 9: typeDescription = 'Mint Governance'; break;
                            case 10: typeDescription = 'Token Governance'; break;
                        }
                        
                        console.log(`         Account type: ${accountType} (${typeDescription})`);
                    }
                    
                    accounts.push(...offsetAccounts);
                }
            }
        }

        // If we found accounts, analyze them
        if (accounts.length > 0) {
            console.log(`\n🔍 Analyzing ${accounts.length} accounts that reference ISLAND token:`);
            
            const uniqueAccounts = accounts.filter((account, index, self) => 
                index === self.findIndex(a => a.pubkey.toString() === account.pubkey.toString())
            );
            
            console.log(`Found ${uniqueAccounts.length} unique accounts`);
            
            for (let i = 0; i < uniqueAccounts.length; i++) {
                const account = uniqueAccounts[i];
                const data = account.account.data;
                
                console.log(`\nAccount ${i + 1}: ${account.pubkey.toString()}`);
                console.log(`  Data length: ${data.length} bytes`);
                
                const accountType = data.readUInt8(0);
                console.log(`  Account type: ${accountType}`);
                
                // If this is a Realm account (type 1), extract detailed information
                if (accountType === 1) {
                    console.log(`  🏛️ This is a REALM account!`);
                    
                    try {
                        const authority = new PublicKey(data.subarray(1, 33));
                        const communityMint = new PublicKey(data.subarray(33, 65));
                        
                        console.log(`    Authority: ${authority.toString()}`);
                        console.log(`    Community mint: ${communityMint.toString()}`);
                        console.log(`    Is ISLAND token: ${communityMint.equals(ISLAND_TOKEN_MINT)}`);
                        
                        // This should be our IslandDAO realm
                        if (communityMint.equals(ISLAND_TOKEN_MINT)) {
                            console.log(`    🎯 FOUND ISLAND DAO REALM!`);
                            return account.pubkey.toString();
                        }
                    } catch (error) {
                        console.log(`    Error parsing realm: ${error.message}`);
                    }
                }
                
                // If this is a Token Owner Record (type 2), it might contain deposit info
                if (accountType === 2) {
                    console.log(`  💰 This is a TOKEN OWNER RECORD!`);
                    
                    // Try to find wallet and deposit amount
                    for (let offset = 1; offset <= data.length - 32; offset++) {
                        try {
                            // Look for 32-byte sequences that could be wallet addresses
                            const potentialWallet = data.subarray(offset, offset + 32);
                            
                            // Check if this looks like a valid public key
                            if (potentialWallet.every(byte => byte !== 0)) {
                                try {
                                    const walletPubkey = new PublicKey(potentialWallet);
                                    console.log(`    Potential wallet at offset ${offset}: ${walletPubkey.toString()}`);
                                } catch (error) {
                                    // Not a valid public key
                                }
                            }
                        } catch (error) {
                            // Continue
                        }
                    }
                }
            }
        }

        return accounts.map(account => account.pubkey.toString());

    } catch (error) {
        console.error('❌ Error in broad search:', error.message);
        return [];
    }
}

// Run the broad search
broadSearchForIslandToken().then((accounts) => {
    if (accounts.length > 0) {
        console.log(`\n✅ Found ${accounts.length} accounts referencing ISLAND token`);
    } else {
        console.log('\n❌ No accounts found referencing ISLAND token');
    }
    process.exit(0);
});