/**
 * Complete restoration for remaining citizens
 */
import { Client } from 'pg';
import axios from 'axios';

const remainingWallets = [
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', // legend
    '6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U', // nurtan
    'CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww', // scientistjoe
    'CJk9wS2Q64YXQg7HNq3VzzTzmwTftFLsXPCnZmdAScvd', // xhugosantos
    '2NZ9hwrGNitbGTjt4p4py2m6iwAjJ9Bzs8vXeWs1QpHT', // null
    'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh'  // null
];

async function completeRestoration() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('🔗 Connected to database');

        for (const wallet of remainingWallets) {
            console.log(`Processing ${wallet}`);
            
            try {
                const response = await axios.get(`http://localhost:5000/api/wallet-nfts?wallet=${wallet}`);
                const nfts = response.data?.nfts || [];
                
                if (nfts.length > 0) {
                    const imageUrl = nfts[0].image;
                    const nftMetadata = JSON.stringify(nfts);

                    await client.query(`
                        UPDATE citizens 
                        SET 
                            image_url = $1,
                            nft_metadata = $2
                        WHERE wallet = $3
                    `, [imageUrl, nftMetadata, wallet]);

                    console.log(`✅ Updated ${wallet} - ${nfts.length} PERKS NFTs`);
                } else {
                    console.log(`⚠️  No PERKS NFTs found for ${wallet}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`❌ Failed to process ${wallet}:`, error.message);
            }
        }

        console.log('\n✅ Restoration completed');

    } catch (error) {
        console.error('❌ Restoration failed:', error.message);
    } finally {
        await client.end();
    }
}

completeRestoration().catch(console.error);