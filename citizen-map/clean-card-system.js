/**
 * Clean Card System - Rebuilt from scratch
 * Three states: closed → small card → expanded card → small card (cycle)
 * Click polaroid to cycle, click X or outside to close completely
 */

let currentCard = null;
let cardState = 'closed'; // 'closed', 'small', 'expanded'

function showCitizenProfile(citizen) {
    console.log('Opening profile for citizen:', citizen.nickname || citizen.wallet_address);
    
    // Close any existing card first
    if (currentCard) {
        closeCard();
    }
    
    // Create new card in small state
    currentCard = createSmallCard(citizen);
    cardState = 'small';
    
    // Add to DOM
    document.body.appendChild(currentCard);
    
    console.log('Profile opened successfully in small state');
}

function createSmallCard(citizen) {
    const profileNftId = citizen.pfp_nft || citizen.primaryNft || citizen.primary_nft;
    let profileImage = 'https://via.placeholder.com/120x120?text=Profile';
    
    if (profileNftId && citizen.nftMetadata && citizen.nftMetadata[profileNftId]) {
        profileImage = citizen.nftMetadata[profileNftId].image;
    } else if (citizen.pfpImageUrl) {
        profileImage = citizen.pfpImageUrl;
    } else if (citizen.image_url) {
        profileImage = citizen.image_url;
    }
    
    const card = document.createElement('div');
    card.className = 'citizen-card';
    card.innerHTML = `
        <div class="card-content">
            <button class="close-btn">×</button>
            <div class="profile-section">
                <div class="polaroid-pfp">
                    <img src="${profileImage}" alt="Profile" class="profile-image">
                </div>
                <div class="profile-info">
                    <div class="citizen-name">${citizen.nickname || 'Anonymous Citizen'}</div>
                    <div class="nft-count">${citizen.nfts ? citizen.nfts.length : 0} NFTs</div>
                    <div class="wallet-short">${(citizen.wallet_address || citizen.wallet || '').substring(0, 6)}...</div>
                </div>
            </div>
        </div>
    `;
    
    // Add styles
    card.style.cssText = `
        position: fixed;
        top: 150px;
        right: 20px;
        width: 280px;
        height: 200px;
        background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
        border: 2px solid #21E8A3;
        border-radius: 20px;
        box-shadow: 
            0 0 0 1px rgba(33, 232, 163, 0.2), 
            0 32px 64px rgba(0, 0, 0, 0.8), 
            0 16px 32px rgba(0, 0, 0, 0.4);
        z-index: 999999;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    
    // Style the card content
    const cardContent = card.querySelector('.card-content');
    cardContent.style.cssText = `
        padding: 20px;
        height: 100%;
        position: relative;
    `;
    
    // Style close button
    const closeBtn = card.querySelector('.close-btn');
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        color: #fff;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        backdrop-filter: blur(10px);
    `;
    
    // Style profile section
    const profileSection = card.querySelector('.profile-section');
    profileSection.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        justify-content: center;
    `;
    
    // Style polaroid
    const polaroid = card.querySelector('.polaroid-pfp');
    polaroid.style.cssText = `
        width: 80px;
        height: 80px;
        border-radius: 50%;
        overflow: hidden;
        cursor: pointer;
        border: 2px solid #21E8A3;
        margin-bottom: 15px;
        transition: transform 0.2s ease;
    `;
    
    // Style profile image
    const profileImg = card.querySelector('.profile-image');
    profileImg.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
    `;
    
    // Style profile info
    const profileInfo = card.querySelector('.profile-info');
    profileInfo.style.cssText = `
        text-align: center;
        color: #fff;
    `;
    
    // Style citizen name
    const citizenName = card.querySelector('.citizen-name');
    citizenName.style.cssText = `
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
        color: #21E8A3;
    `;
    
    // Style NFT count
    const nftCount = card.querySelector('.nft-count');
    nftCount.style.cssText = `
        font-size: 12px;
        color: #888;
        margin-bottom: 5px;
    `;
    
    // Style wallet
    const walletShort = card.querySelector('.wallet-short');
    walletShort.style.cssText = `
        font-size: 10px;
        color: #666;
    `;
    
    // Add event handlers
    closeBtn.addEventListener('click', closeCard);
    polaroid.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('Polaroid clicked! Current state:', cardState);
        toggleCardState(citizen);
    });
    
    // Close on outside click
    document.addEventListener('click', handleOutsideClick);
    
    // Animate in
    setTimeout(() => {
        card.style.transform = 'translateX(0)';
    }, 10);
    
    return card;
}

function toggleCardState(citizen) {
    if (!currentCard) return;
    
    if (cardState === 'small') {
        console.log('Expanding to large state');
        expandCard(citizen);
        cardState = 'expanded';
    } else if (cardState === 'expanded') {
        console.log('Shrinking to small state');
        shrinkCard();
        cardState = 'small';
    }
}

function expandCard(citizen) {
    if (!currentCard) return;
    
    // Expand the card
    currentCard.style.width = '700px';
    currentCard.style.height = '400px';
    
    // Add expanded content
    const cardContent = currentCard.querySelector('.card-content');
    
    // Create expanded layout
    cardContent.innerHTML = `
        <button class="close-btn">×</button>
        <div class="expanded-layout">
            <div class="left-section">
                <div class="polaroid-pfp">
                    <img src="${currentCard.querySelector('.profile-image').src}" alt="Profile" class="profile-image">
                </div>
                <div class="profile-info">
                    <div class="citizen-name">${citizen.nickname || 'Anonymous Citizen'}</div>
                    <div class="nft-count">${citizen.nfts ? citizen.nfts.length : 0} NFTs</div>
                    <div class="wallet-short">${(citizen.wallet_address || citizen.wallet || '').substring(0, 6)}...</div>
                </div>
            </div>
            <div class="right-section">
                <h3 style="color: #21E8A3; margin-bottom: 20px;">NFT Collection</h3>
                <div class="nft-grid">
                    ${generateNftGrid(citizen)}
                </div>
            </div>
        </div>
    `;
    
    // Re-style for expanded view
    styleExpandedCard();
    
    // Re-add event handlers
    const closeBtn = currentCard.querySelector('.close-btn');
    const polaroid = currentCard.querySelector('.polaroid-pfp');
    
    closeBtn.addEventListener('click', closeCard);
    polaroid.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('Polaroid clicked in expanded state');
        toggleCardState(citizen);
    });
    
    // Apply expanded styles
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        color: #fff;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        backdrop-filter: blur(10px);
    `;
}

function styleExpandedCard() {
    const expandedLayout = currentCard.querySelector('.expanded-layout');
    expandedLayout.style.cssText = `
        display: flex;
        height: 100%;
        gap: 30px;
        padding: 20px;
    `;
    
    const leftSection = currentCard.querySelector('.left-section');
    leftSection.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 280px;
    `;
    
    const rightSection = currentCard.querySelector('.right-section');
    rightSection.style.cssText = `
        flex: 1;
        color: #fff;
        overflow-y: auto;
    `;
    
    // Style polaroid in expanded view
    const polaroid = currentCard.querySelector('.polaroid-pfp');
    polaroid.style.cssText = `
        width: 120px;
        height: 120px;
        border-radius: 50%;
        overflow: hidden;
        cursor: pointer;
        border: 3px solid #21E8A3;
        margin-bottom: 20px;
        transition: transform 0.2s ease;
    `;
    
    // Style profile image
    const profileImg = currentCard.querySelector('.profile-image');
    profileImg.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
    `;
    
    // Style profile info
    const profileInfo = currentCard.querySelector('.profile-info');
    profileInfo.style.cssText = `
        text-align: center;
        color: #fff;
    `;
    
    // Style citizen name
    const citizenName = currentCard.querySelector('.citizen-name');
    citizenName.style.cssText = `
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 10px;
        color: #21E8A3;
    `;
    
    // Style NFT count
    const nftCount = currentCard.querySelector('.nft-count');
    nftCount.style.cssText = `
        font-size: 14px;
        color: #888;
        margin-bottom: 8px;
    `;
    
    // Style wallet
    const walletShort = currentCard.querySelector('.wallet-short');
    walletShort.style.cssText = `
        font-size: 12px;
        color: #666;
    `;
    
    // Style NFT grid
    const nftGrid = currentCard.querySelector('.nft-grid');
    if (nftGrid) {
        nftGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 10px;
            max-height: 280px;
            overflow-y: auto;
        `;
        
        // Style individual NFT items
        const nftItems = nftGrid.querySelectorAll('.nft-item');
        nftItems.forEach(item => {
            item.style.cssText = `
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                overflow: hidden;
                border: 1px solid rgba(33, 232, 163, 0.2);
            `;
            
            const img = item.querySelector('img');
            if (img) {
                img.style.cssText = `
                    width: 100%;
                    height: 80px;
                    object-fit: cover;
                `;
            }
        });
    }
}

function shrinkCard() {
    if (!currentCard) return;
    
    // Get the current citizen data
    const profileImg = currentCard.querySelector('.profile-image');
    const citizenName = currentCard.querySelector('.citizen-name');
    const nftCount = currentCard.querySelector('.nft-count');
    const walletShort = currentCard.querySelector('.wallet-short');
    
    // Shrink dimensions
    currentCard.style.width = '280px';
    currentCard.style.height = '200px';
    
    // Restore small card content
    const cardContent = currentCard.querySelector('.card-content');
    cardContent.innerHTML = `
        <button class="close-btn">×</button>
        <div class="profile-section">
            <div class="polaroid-pfp">
                <img src="${profileImg.src}" alt="Profile" class="profile-image">
            </div>
            <div class="profile-info">
                <div class="citizen-name">${citizenName.textContent}</div>
                <div class="nft-count">${nftCount.textContent}</div>
                <div class="wallet-short">${walletShort.textContent}</div>
            </div>
        </div>
    `;
    
    // Re-apply small card styles
    cardContent.style.cssText = `
        padding: 20px;
        height: 100%;
        position: relative;
    `;
    
    // Re-style all elements for small card
    const closeBtn = currentCard.querySelector('.close-btn');
    const profileSection = currentCard.querySelector('.profile-section');
    const polaroid = currentCard.querySelector('.polaroid-pfp');
    const newProfileImg = currentCard.querySelector('.profile-image');
    const profileInfo = currentCard.querySelector('.profile-info');
    const newCitizenName = currentCard.querySelector('.citizen-name');
    const newNftCount = currentCard.querySelector('.nft-count');
    const newWalletShort = currentCard.querySelector('.wallet-short');
    
    // Apply all the small card styles
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        color: #fff;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        backdrop-filter: blur(10px);
    `;
    
    profileSection.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        justify-content: center;
    `;
    
    polaroid.style.cssText = `
        width: 80px;
        height: 80px;
        border-radius: 50%;
        overflow: hidden;
        cursor: pointer;
        border: 2px solid #21E8A3;
        margin-bottom: 15px;
        transition: transform 0.2s ease;
    `;
    
    newProfileImg.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
    `;
    
    profileInfo.style.cssText = `
        text-align: center;
        color: #fff;
    `;
    
    newCitizenName.style.cssText = `
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
        color: #21E8A3;
    `;
    
    newNftCount.style.cssText = `
        font-size: 12px;
        color: #888;
        margin-bottom: 5px;
    `;
    
    newWalletShort.style.cssText = `
        font-size: 10px;
        color: #666;
    `;
    
    // Re-add event handlers
    closeBtn.addEventListener('click', closeCard);
    polaroid.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log('Polaroid clicked in small state');
        // We need to pass the citizen data, but we'll need to store it
        // For now, just expand without the citizen data for NFT grid
        expandCard({ nickname: citizenName.textContent, nfts: [] });
    });
}

function generateNftGrid(citizen) {
    if (!citizen.nfts || citizen.nfts.length === 0) {
        return '<div style="color: #888; text-align: center;">No NFTs found</div>';
    }
    
    return citizen.nfts.slice(0, 12).map(nft => {
        const nftData = citizen.nftMetadata && citizen.nftMetadata[nft] 
            ? citizen.nftMetadata[nft] 
            : { name: nft, image: 'https://via.placeholder.com/80x80?text=NFT' };
            
        return `
            <div class="nft-item">
                <img src="${nftData.image}" alt="${nftData.name}" onerror="this.src='https://via.placeholder.com/80x80?text=NFT'">
            </div>
        `;
    }).join('');
}

function closeCard() {
    if (!currentCard) return;
    
    console.log('Closing card');
    
    // Animate out
    currentCard.style.transform = 'translateX(100%)';
    
    // Remove after animation
    setTimeout(() => {
        if (currentCard && currentCard.parentNode) {
            currentCard.parentNode.removeChild(currentCard);
        }
        currentCard = null;
        cardState = 'closed';
        
        // Remove outside click listener
        document.removeEventListener('click', handleOutsideClick);
        
        console.log('Card closed successfully');
    }, 300);
}

function handleOutsideClick(e) {
    if (currentCard && !currentCard.contains(e.target)) {
        closeCard();
    }
}

// Export for global access
window.showCitizenProfile = showCitizenProfile;