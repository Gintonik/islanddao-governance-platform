/**
 * Correct proposal vote counting for SPL Governance
 * Based on the structure: options[0] = Yes votes, denyVoteWeight = No votes
 * Vote weights need to be divided by 10^6 for token decimals
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getProposal } = require('@solana/spl-governance');

const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00', 'confirmed');

async function getProposalVotes(proposalAddress) {
    try {
        console.log('🔍 Fetching proposal vote data...');
        console.log(`Proposal: ${proposalAddress}`);
        
        const proposalPubkey = new PublicKey(proposalAddress);
        const proposal = await getProposal(connection, proposalPubkey);
        
        console.log('\n📊 Proposal Details:');
        console.log(`Name: ${proposal.account.name}`);
        console.log(`State: ${proposal.account.state}`);
        
        // Get Yes votes from options[0]
        let yesVotes = 0;
        if (proposal.account.options && proposal.account.options.length > 0) {
            const yesVoteWeight = proposal.account.options[0].voteWeight;
            yesVotes = Number(yesVoteWeight) / Math.pow(10, 6); // Divide by 10^6 for decimals
        }
        
        // Get No votes from denyVoteWeight
        let noVotes = 0;
        if (proposal.account.denyVoteWeight) {
            noVotes = Number(proposal.account.denyVoteWeight) / Math.pow(10, 6); // Divide by 10^6 for decimals
        }
        
        const totalVotes = yesVotes + noVotes;
        const yesPercentage = totalVotes > 0 ? (yesVotes / totalVotes * 100).toFixed(1) : 0;
        const noPercentage = totalVotes > 0 ? (noVotes / totalVotes * 100).toFixed(1) : 0;
        
        console.log('\n✅ Vote Results:');
        console.log(`Yes Votes: ${yesVotes.toLocaleString()} $ISLAND (${yesPercentage}%)`);
        console.log(`No Votes: ${noVotes.toLocaleString()} $ISLAND (${noPercentage}%)`);
        console.log(`Total Votes: ${totalVotes.toLocaleString()} $ISLAND`);
        
        return {
            yesVotes,
            noVotes,
            totalVotes,
            yesPercentage: parseFloat(yesPercentage),
            noPercentage: parseFloat(noPercentage)
        };
        
    } catch (error) {
        console.error('❌ Error fetching proposal votes:', error.message);
        return null;
    }
}

// Test with a known IslandDAO proposal
const testProposal = 'VM3521_ProposalCard.tsx:94'; // Replace with actual proposal address
console.log('Testing proposal vote counting...');
// getProposalVotes(testProposal);

module.exports = { getProposalVotes };