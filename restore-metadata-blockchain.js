/**
 * Restore NFT Metadata from Blockchain Data
 * Updates existing database fields without schema changes
 */

import { Client } from 'pg';
import axios from 'axios';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const PERKS_COLLECTION_ID = '5XSXoWkcmynUSiwoi7XByRDiV9eomTgZQywgWrpYzKZ8';

/**
 * Fetch NFTs for a wallet using the working internal API
 */
async function fetchWalletNFTs(walletAddress) {
    try {
        const response = await axios.get(`http://localhost:5000/api/wallet-nfts?wallet=${walletAddress}`);
        
        if (response.data && response.data.nfts) {
            return response.data.nfts;
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