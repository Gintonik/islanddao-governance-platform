/**
 * Governance Statistics Generator
 * Creates comprehensive statistics about governance participation for PERKS holders
 */

const db = require('./db');

/**
 * Generate governance statistics for all citizens
 */
async function generateGovernanceStatistics() {
    try {
        console.log('📊 Generating governance statistics for PERKS holders...');
        
        // Get all citizens with governance data
        const citizens = await db.getAllCitizens();
        
        if (citizens.length === 0) {
            console.log('No citizens found in database');
            return null;
        }
        
        // Calculate statistics
        const stats = {
            totalMembers: citizens.length,
            membersWithTokens: 0,
            totalGovernancePower: 0,
            averageTokens: 0,
            medianTokens: 0,
            topHolders: [],
            participationRate: 0,
            tokenDistribution: {
                whales: { count: 0, threshold: 50000, members: [] },      // 50K+ tokens
                dolphins: { count: 0, threshold: 10000, members: [] },    // 10K-50K tokens
                fish: { count: 0, threshold: 1000, members: [] },         // 1K-10K tokens
                plankton: { count: 0, threshold: 1, members: [] }         // 1-1K tokens
            },
            governanceEligible: 0,
            eligibilityThreshold: 1
        };
        
        const tokenBalances = [];
        
        // Process each citizen
        for (const citizen of citizens) {
            const governancePower = parseFloat(citizen.governance_power) || 0;
            
            if (governancePower > 0) {
                stats.membersWithTokens++;
                stats.totalGovernancePower += governancePower;
                tokenBalances.push(governancePower);
                
                // Check eligibility
                if (governancePower >= stats.eligibilityThreshold) {
                    stats.governanceEligible++;
                }
                
                // Categorize by token amount
                const memberData = {
                    wallet: citizen.wallet,
                    nickname: citizen.nickname || 'Anonymous',
                    tokens: governancePower
                };
                
                if (governancePower >= 50000) {
                    stats.tokenDistribution.whales.members.push(memberData);
                } else if (governancePower >= 10000) {
                    stats.tokenDistribution.dolphins.members.push(memberData);
                } else if (governancePower >= 1000) {
                    stats.tokenDistribution.fish.members.push(memberData);
                } else {
                    stats.tokenDistribution.plankton.members.push(memberData);
                }
            }
        }
        
        // Update distribution counts
        stats.tokenDistribution.whales.count = stats.tokenDistribution.whales.members.length;
        stats.tokenDistribution.dolphins.count = stats.tokenDistribution.dolphins.members.length;
        stats.tokenDistribution.fish.count = stats.tokenDistribution.fish.members.length;
        stats.tokenDistribution.plankton.count = stats.tokenDistribution.plankton.members.length;
        
        // Calculate derived statistics
        if (stats.membersWithTokens > 0) {
            stats.averageTokens = stats.totalGovernancePower / stats.membersWithTokens;
            
            // Calculate median
            tokenBalances.sort((a, b) => a - b);
            const mid = Math.floor(tokenBalances.length / 2);
            stats.medianTokens = tokenBalances.length % 2 === 0 
                ? (tokenBalances[mid - 1] + tokenBalances[mid]) / 2 
                : tokenBalances[mid];
        }
        
        stats.participationRate = (stats.membersWithTokens / stats.totalMembers) * 100;
        
        // Create top holders list (sorted by tokens)
        const allHolders = [
            ...stats.tokenDistribution.whales.members,
            ...stats.tokenDistribution.dolphins.members,
            ...stats.tokenDistribution.fish.members,
            ...stats.tokenDistribution.plankton.members
        ].sort((a, b) => b.tokens - a.tokens);
        
        stats.topHolders = allHolders.slice(0, 10);
        
        return stats;
        
    } catch (error) {
        console.error('Error generating governance statistics:', error);
        throw error;
    }
}

/**
 * Display governance statistics in a formatted way
 */
async function displayGovernanceStatistics() {
    try {
        const stats = await generateGovernanceStatistics();
        
        if (!stats) {
            console.log('No statistics available');
            return;
        }
        
        console.log('\n🏛️  ISLANDDAO GOVERNANCE STATISTICS');
        console.log('═'.repeat(50));
        
        console.log('\n📈 OVERVIEW:');
        console.log(`   Total PERKS Members: ${stats.totalMembers}`);
        console.log(`   Members with ISLAND Tokens: ${stats.membersWithTokens}`);
        console.log(`   Participation Rate: ${stats.participationRate.toFixed(1)}%`);
        console.log(`   Governance Eligible: ${stats.governanceEligible}`);
        
        console.log('\n💰 TOKEN METRICS:');
        console.log(`   Total Governance Power: ${stats.totalGovernancePower.toLocaleString()} ISLAND`);
        console.log(`   Average Tokens per Holder: ${stats.averageTokens.toFixed(2)} ISLAND`);
        console.log(`   Median Token Balance: ${stats.medianTokens.toFixed(2)} ISLAND`);
        
        console.log('\n🐋 TOKEN DISTRIBUTION:');
        console.log(`   Whales (50K+ tokens): ${stats.tokenDistribution.whales.count} members`);
        console.log(`   Dolphins (10K-50K tokens): ${stats.tokenDistribution.dolphins.count} members`);
        console.log(`   Fish (1K-10K tokens): ${stats.tokenDistribution.fish.count} members`);
        console.log(`   Plankton (1-1K tokens): ${stats.tokenDistribution.plankton.count} members`);
        
        console.log('\n🏆 TOP GOVERNANCE HOLDERS:');
        stats.topHolders.forEach((holder, index) => {
            console.log(`   ${index + 1}. ${holder.nickname}: ${holder.tokens.toLocaleString()} ISLAND`);
        });
        
        // Show breakdown by category
        if (stats.tokenDistribution.whales.count > 0) {
            console.log('\n🐋 WHALE HOLDERS:');
            stats.tokenDistribution.whales.members.forEach(member => {
                console.log(`   ${member.nickname}: ${member.tokens.toLocaleString()} ISLAND`);
            });
        }
        
        if (stats.tokenDistribution.dolphins.count > 0) {
            console.log('\n🐬 DOLPHIN HOLDERS:');
            stats.tokenDistribution.dolphins.members.forEach(member => {
                console.log(`   ${member.nickname}: ${member.tokens.toLocaleString()} ISLAND`);
            });
        }
        
        console.log('\n' + '═'.repeat(50));
        
        return stats;
        
    } catch (error) {
        console.error('Error displaying governance statistics:', error);
        throw error;
    }
}

/**
 * Generate API endpoint data for frontend consumption
 */
async function getGovernanceStatsForAPI() {
    try {
        const stats = await generateGovernanceStatistics();
        
        if (!stats) {
            return {
                error: 'No governance data available'
            };
        }
        
        return {
            overview: {
                totalMembers: stats.totalMembers,
                membersWithTokens: stats.membersWithTokens,
                participationRate: parseFloat(stats.participationRate.toFixed(1)),
                governanceEligible: stats.governanceEligible
            },
            tokenMetrics: {
                totalGovernancePower: stats.totalGovernancePower,
                averageTokens: parseFloat(stats.averageTokens.toFixed(2)),
                medianTokens: parseFloat(stats.medianTokens.toFixed(2))
            },
            distribution: {
                whales: stats.tokenDistribution.whales.count,
                dolphins: stats.tokenDistribution.dolphins.count,
                fish: stats.tokenDistribution.fish.count,
                plankton: stats.tokenDistribution.plankton.count
            },
            topHolders: stats.topHolders.map(holder => ({
                nickname: holder.nickname,
                tokens: holder.tokens,
                formattedTokens: holder.tokens.toLocaleString()
            })),
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Error generating API stats:', error);
        return {
            error: 'Failed to generate governance statistics'
        };
    }
}

// Export functions
module.exports = {
    generateGovernanceStatistics,
    displayGovernanceStatistics,
    getGovernanceStatsForAPI
};

// Run display if called directly
if (require.main === module) {
    displayGovernanceStatistics()
        .then(() => {
            console.log('\n✅ Governance statistics generated successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Failed to generate statistics:', error);
            process.exit(1);
        });
}