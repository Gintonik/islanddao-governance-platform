// Simple Card Slide Modal - Just slides the original card left
let modalState = 'closed';

function openEnhancedProfile(citizen) {
    console.log('openEnhancedProfile called with citizen:', citizen);
    
    // Find the existing profile panel in the sidebar
    const existingCard = document.getElementById('citizenPanel');
    console.log('Found existing card:', existingCard);
    if (!existingCard || !existingCard.classList.contains('open')) {
        console.log('No existing card found or not open, cannot slide');
        return;
    }
    
    modalState = 'modal';
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'profile-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999998;
        background: rgba(0, 0, 0, 0.3);
        opacity: 0;
        transition: all 0.4s ease;
    `;
    
    // Add close button to existing card
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #FAFAFA;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 300;
        z-index: 10;
        transition: all 0.2s ease;
    `;
    
    existingCard.appendChild(closeBtn);
    
    // Event listeners
    backdrop.addEventListener('click', () => closeExistingCard(existingCard, backdrop));
    closeBtn.addEventListener('click', () => closeExistingCard(existingCard, backdrop));
    
    document.body.appendChild(backdrop);
    
    console.log('Setting up card expansion...');
    
    // First, wrap all existing content in a left container
    const existingContent = existingCard.innerHTML;
    console.log('Existing content captured');
    existingCard.innerHTML = '';
    
    // Create left side container for original content
    const leftContainer = document.createElement('div');
    leftContainer.className = 'left-content-area';
    leftContainer.style.cssText = `
        position: relative;
        float: left;
        width: 280px;
        height: 100%;
        overflow: hidden;
        padding: 20px;
        box-sizing: border-box;
    `;
    leftContainer.innerHTML = existingContent;
    
    // Create right side container for new content
    const rightContainer = document.createElement('div');
    rightContainer.className = 'right-content-area';
    rightContainer.style.cssText = `
        position: relative;
        float: right;
        width: 280px;
        height: 100%;
        padding: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-size: 14px;
        text-align: center;
        opacity: 0;
        transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        overflow: hidden;
        box-sizing: border-box;
    `;
    
    rightContainer.innerHTML = `
        Additional stats and<br>
        content will appear here
    `;
    
    // Add both containers to the card
    existingCard.appendChild(leftContainer);
    existingCard.appendChild(rightContainer);
    
    // Add clearfix div
    const clearfix = document.createElement('div');
    clearfix.style.cssText = 'clear: both;';
    existingCard.appendChild(clearfix);
    
    // Hide scrollbars on the main card and ensure it can contain floated elements
    existingCard.style.overflow = 'hidden';
    existingCard.style.position = 'relative';
    
    console.log('Card structure setup complete');
    
    // Animate backdrop and slide + expand the card
    setTimeout(() => {
        backdrop.style.opacity = '1';
        existingCard.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        existingCard.style.width = '580px';  // Expand card width
        existingCard.style.right = '320px';  // Slide card left
        existingCard.style.zIndex = '999999';
        rightContainer.style.opacity = '1'; // Show the right content area
    }, 50);
    
    // Load governance data
    loadGovernanceData(citizen, { querySelector: () => existingCard });
}

function getProfileHTML(citizen) {
    const profileNftId = citizen.pfp_nft || citizen.primaryNft || citizen.primary_nft;
    let profileImage = 'https://via.placeholder.com/120x120?text=Profile';
    
    if (profileNftId && citizen.nftMetadata && citizen.nftMetadata[profileNftId]) {
        profileImage = citizen.nftMetadata[profileNftId].image;
    } else if (citizen.pfpImageUrl) {
        profileImage = citizen.pfpImageUrl;
    } else if (citizen.image_url) {
        profileImage = citizen.image_url;
    }
    
    const walletAddress = citizen.wallet_address || citizen.wallet;
    const nftCount = citizen.nfts ? citizen.nfts.length : 0;
    
    return `
        <div class="profile-card" style="
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
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        ">
            <button class="close-btn" style="
                position: absolute;
                top: 16px;
                right: 16px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: #FAFAFA;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 300;
                z-index: 10;
                transition: all 0.2s ease;
            ">&times;</button>
            
            <div style="position: absolute; top: 12px; left: 12px; opacity: 0.8;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L13.09 8.26L21 3L16 8H22V16H16L21 21L13.09 15.74L12 22L10.91 15.74L3 21L8 16H2V8H8L3 3L10.91 8.26L12 2Z" fill="#21E8A3"/>
                </svg>
            </div>
            
            <!-- Polaroid Style Profile -->
            <div style="
                background: white;
                padding: 8px;
                border-radius: 12px;
                width: fit-content;
                margin: 0 auto;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                transform: rotate(-2deg);
            ">
                <img src="${profileImage}" alt="Profile" style="
                    width: 80px;
                    height: 80px;
                    border-radius: 8px;
                    object-fit: cover;
                    display: block;
                ">
                <div style="
                    text-align: center;
                    font-size: 10px;
                    color: #333;
                    margin-top: 4px;
                    font-family: 'Courier New', monospace;
                ">PERK #${profileNftId || 'XXXX'}</div>
            </div>
            
            <!-- Tags -->
            <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                <span style="
                    background: rgba(33, 232, 163, 0.15);
                    color: #21E8A3;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    font-weight: 600;
                    border: 1px solid rgba(33, 232, 163, 0.3);
                ">ISLAND DAO</span>
                <span style="
                    background: rgba(33, 232, 163, 0.15);
                    color: #21E8A3;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 10px;
                    font-weight: 600;
                    border: 1px solid rgba(33, 232, 163, 0.3);
                ">PERKS</span>
            </div>
            
            <!-- Social Links -->
            <div style="display: flex; gap: 8px; justify-content: center;">
                <div style="
                    width: 24px;
                    height: 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                ">🐦</div>
                <div style="
                    width: 24px;
                    height: 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                ">🌐</div>
                <div style="
                    width: 24px;
                    height: 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                ">💬</div>
            </div>
            
            <!-- Collection Preview -->
            <div style="
                text-align: center;
                font-size: 11px;
                color: #AFAFAF;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding-top: 8px;
            ">
                PERKS Collection (${nftCount})
                <div style="display: flex; gap: 4px; justify-content: center; margin-top: 4px;">
                    <div style="width: 12px; height: 12px; background: #21E8A3; border-radius: 2px;"></div>
                    <div style="width: 12px; height: 12px; background: #888; border-radius: 2px;"></div>
                    <div style="width: 12px; height: 12px; background: #666; border-radius: 2px;"></div>
                </div>
            </div>
        </div>
    `;
}

function closeExistingCard(card, backdrop) {
    // Hide right content and slide card back to original position
    const rightContainer = card.querySelector('.right-content-area');
    if (rightContainer) {
        rightContainer.style.opacity = '0';
    }
    
    card.style.width = '280px';  // Shrink back to original width
    card.style.right = '20px';   // Slide back to original position
    backdrop.style.opacity = '0';
    
    setTimeout(() => {
        // Restore original content structure
        const leftContainer = card.querySelector('.left-content-area');
        if (leftContainer) {
            const originalContent = leftContainer.innerHTML;
            card.innerHTML = originalContent;
        }
        
        // Remove backdrop and close button
        backdrop.remove();
        const closeBtn = card.querySelector('.close-btn');
        if (closeBtn) closeBtn.remove();
        
        // Reset card styling
        card.style.zIndex = '';
        card.style.overflow = '';
        modalState = 'closed';
    }, 600);
}

async function loadGovernanceData(citizen, modal) {
    try {
        const walletAddress = citizen.wallet_address || citizen.wallet;
        const response = await fetch(`/api/governance/${walletAddress}`);
        if (response.ok) {
            const governanceData = await response.json();
            // Data loaded successfully
        }
    } catch (error) {
        console.error('Error loading governance data:', error);
    }
}