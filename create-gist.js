/**
 * GitHub Gist Creator
 * Creates a gist with the SPL Governance & VSR tutorial
 */

const fs = require('fs');

async function createGistData() {
    try {
        // Read the tutorial content
        const tutorialContent = fs.readFileSync('spl-governance-vsr-tutorial.md', 'utf8');
        
        // Create gist data structure
        const gistData = {
            description: "SPL Governance & VSR Integration Tutorial - Complete Guide for DAO Developers",
            public: true,
            files: {
                "spl-governance-vsr-tutorial.md": {
                    content: tutorialContent
                }
            }
        };
        
        // Save gist data to file for manual upload
        fs.writeFileSync('gist-data.json', JSON.stringify(gistData, null, 2));
        
        console.log('Gist data created successfully!');
        console.log('\nTo create the gist:');
        console.log('1. Go to https://gist.github.com/');
        console.log('2. Copy the content from spl-governance-vsr-tutorial.md');
        console.log('3. Set filename to: spl-governance-vsr-tutorial.md');
        console.log('4. Set description to: "SPL Governance & VSR Integration Tutorial - Complete Guide for DAO Developers"');
        console.log('5. Make it public');
        console.log('6. Click "Create public gist"');
        
        console.log('\nAlternatively, if you have GitHub CLI installed:');
        console.log('gh gist create spl-governance-vsr-tutorial.md --desc "SPL Governance & VSR Integration Tutorial" --public');
        
        return gistData;
        
    } catch (error) {
        console.error('Error creating gist data:', error.message);
        return null;
    }
}

if (require.main === module) {
    createGistData();
}

module.exports = { createGistData };