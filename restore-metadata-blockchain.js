/**
 * Restore NFT Metadata from Blockchain Data
 * Updates existing database fields without schema changes
 */

import { Client } from 'pg';
import axios from 'axios';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const PERKS_COLLECTION_ID = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Fetch NFTs for a wallet from Helius API
 */
async function fetchWalletNFTs(walletAddress) {
    try {
        const response = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            jsonrpc: "2.0",
            id: "get-assets",
            method: "getAssetsByOwner",
            params: {
                ownerAddress: walletAddress,
                page: 1,
                limit: 1000
            }
        });

        if (response.data && response.data.result && response.data.result.items) {
            // Filter for PERKS collection NFTs only
            const perksNfts = response.data.result.items.filter(nft => {
                return nft.grouping && nft.grouping.some(group => 
                    group.group_key === 'collection' && 
                    group.group_value === PERKS_COLLECTION_ID
                );
            });

            return perksNfts.map(nft => {
                // Fix Irys gateway URLs for reliable image loading
                let imageUrl = nft.content?.links?.image || nft.content?.files?.[0]?.uri || '';
                if (imageUrl.includes('gateway.irys.xyz')) {
                    imageUrl = imageUrl.replace('gateway.irys.xyz', 'uploader.irys.xyz');
                }
                
                return {
                    mint: nft.id,
                    name: nft.content?.metadata?.name || 'PERKS NFT',
                    image: imageUrl,
                    metadata: {
                        name: nft.content?.metadata?.name,
                        symbol: nft.content?.metadata?.symbol,
                        description: nft.content?.metadata?.description,
                        image: imageUrl,
                        attributes: nft.content?.metadata?.attributes || []
                    }
                };
            });
        }
        return [];
    } catch (error) {
        console.error(`Error fetching NFTs for ${walletAddress}:`, error.message);
        return [];
    }
}

/**
 * Update citizen with NFT metadata in existing database fields
 */
async function updateCitizenMetadata(client, wallet, nfts) {
    if (!nfts || nfts.length === 0) {
        console.log(`No PERKS NFTs found for ${wallet}`);
        return;
    }

    // Use first NFT as primary
    const primaryNFT = nfts[0];
    const imageUrl = primaryNFT.image;
    const nftMetadata = JSON.stringify(nfts);

    try {
        await client.query(`
            UPDATE citizens 
            SET 
                image_url = $1,
                nft_metadata = $2
            WHERE wallet = $3
        `, [imageUrl, nftMetadata, wallet]);

        console.log(`✅ Updated metadata for ${wallet} - ${nfts.length} PERKS NFTs`);
    } catch (error) {
        console.error(`❌ Failed to update ${wallet}:`, error.message);
    }
}

/**
 * Restore all citizen NFT metadata from blockchain
 */
async function restoreAllMetadata() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('🔗 Connected to database');

        // Get all citizens
        const result = await client.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
        const citizens = result.rows;

        console.log(`📋 Found ${citizens.length} citizens to restore`);

        for (let i = 0; i < citizens.length; i++) {
            const citizen = citizens[i];
            console.log(`\n[${i + 1}/${citizens.length}] Processing ${citizen.nickname} (${citizen.wallet})`);

            const nfts = await fetchWalletNFTs(citizen.wallet);
            await updateCitizenMetadata(client, citizen.wallet, nfts);

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('\n✅ All citizen metadata restored from blockchain');

    } catch (error) {
        console.error('❌ Restoration failed:', error.message);
    } finally {
        await client.end();
    }
}

// Run restoration
restoreAllMetadata().catch(console.error);