// Simple Card Slide Modal - Just slides the original card left
let modalState = 'closed';

// Simple X button functionality - attach to document
document.addEventListener('click', function(e) {
    // Handle X button clicks
    if (e.target.classList.contains('close-btn') || e.target.innerHTML === '×') {
        e.stopPropagation();
        console.log('X button clicked - closing card');
        const card = document.querySelector('.profile-card.open');
        if (card) {
            closeCardCompletely(card);
        }
        return;
    }
    
    // Handle outside clicks
    const card = document.querySelector('.profile-card.open');
    const backdrop = document.querySelector('.profile-backdrop');
    
    // Don't close if clicking on map markers or map elements or the card itself
    if (e.target.classList.contains('citizen-marker') || 
        e.target.closest('.citizen-marker') ||
        e.target.closest('.leaflet-marker-icon') ||
        e.target.closest('.profile-card')) {
        return;
    }
    
    // Close if clicking outside
    if (card) {
        console.log('Clicked outside card - closing');
        closeCardCompletely(card);
    }
});

// Global function for map markers to call
window.openEnhancedProfile = function(citizen) {
    console.log('openEnhancedProfile called with citizen:', citizen);
    
    const existingCard = document.querySelector('.profile-card');
    
    if (existingCard) {
        console.log('Found existing card:', existingCard);
        console.log('Card current width:', existingCard.style.width);
        console.log('Card current position:', existingCard.style.right);
        console.log('Modal state:', modalState);
        
        // If card is in STATE 2 (small), expand to STATE 3
        if (modalState === 'closed' && existingCard.classList.contains('open')) {
            expandToFullCard(existingCard, citizen);
        }
        // If card is in STATE 3 (expanded), collapse to STATE 2
        else if (modalState === 'expanded') {
            collapseToSmallCard(existingCard);
        }
        // If card is closed (STATE 1), open to STATE 2
        else {
            showSmallCard(citizen);
        }
    } else {
        // No existing card, create STATE 2 (small card)
        showSmallCard(citizen);
    }
};

function showSmallCard(citizen) {
    console.log('STATE 1 → STATE 2: Opening small card for citizen:', citizen);
    
    // Find the existing profile panel in the sidebar
    let existingCard = document.getElementById('citizenPanel');
    
    // If card is hidden, show it and reset styles
    if (existingCard && existingCard.style.display === 'none') {
        existingCard.style.display = '';
        existingCard.style.transform = '';
        existingCard.style.opacity = '';
        existingCard.style.width = '';
        existingCard.style.zIndex = '';
        existingCard.style.right = '';
    }
    
    console.log('Found existing card:', existingCard);
    console.log('Card current width:', existingCard.style.width);
    console.log('Card current position:', existingCard.style.right);
    console.log('Modal state:', modalState);
    
    if (!existingCard) {
        console.log('No existing card found, cannot slide');
        return;
    }
    
    // STATE LOGIC:
    // STATE 1 (CLOSED): Card not visible, no 'open' class
    // STATE 2 (SMALL): Card visible with 'open' class, 280px width
    // STATE 3 (EXPANDED): Card visible with backdrop, 580px width
    
    const isCardOpen = existingCard.classList.contains('open');
    const currentWidth = existingCard.style.width;
    
    // If card is not open (STATE 1), this function shouldn't be called
    // The polaroid click should only work in STATE 2 or STATE 3
    if (!isCardOpen) {
        console.log('Card is not open, polaroid click ignored');
        return;
    }
    
    // STATE 3 → STATE 2: If expanded, collapse to small card
    if (modalState === 'expanded' || currentWidth === '580px') {
        console.log('STATE 3 → STATE 2: Collapsing to small card');
        collapseToSmallCard(existingCard);
        return;
    }
    
    // STATE 2 → STATE 3: If small card, expand to full
    console.log('STATE 2 → STATE 3: Expanding to full card');
    modalState = 'expanded';
    
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
    const smallCardCloseBtn = document.createElement('button');
    smallCardCloseBtn.className = 'close-btn';
    smallCardCloseBtn.innerHTML = '×';
    smallCardCloseBtn.style.cssText = `
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
    
    existingCard.appendChild(smallCardCloseBtn);
    
    // Event listeners - X button always closes completely (STATE 2/3 → STATE 1)
    smallCardCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('X button clicked in STATE 2');
        closeCardCompletely(existingCard);
    });
    
    // Click outside to close completely - add event listener immediately
    setTimeout(() => {
        backdrop.addEventListener('click', (e) => {
            console.log('Backdrop clicked, target:', e.target);
            if (e.target === backdrop) {
                console.log('Clicked outside card - closing completely');
                closeCardCompletely(existingCard);
            }
        });
    }, 100);
    
    document.body.appendChild(backdrop);
    
    // Check if there's already a right container and remove it first
    const existingRightContainer = existingCard.querySelector('.right-content-area');
    if (existingRightContainer) {
        existingRightContainer.remove();
    }
    
    // Preserve the original content container by wrapping it
    const originalContent = existingCard.innerHTML;
    existingCard.innerHTML = '';
    
    // Create left container for original content
    const leftContainer = document.createElement('div');
    leftContainer.className = 'left-content-area';
    leftContainer.style.cssText = `
        position: relative;
        width: 280px;
        height: 100%;
        overflow: visible;
        box-sizing: border-box;
    `;
    
    // Keep the original content including the X button
    leftContainer.innerHTML = originalContent;
    
    // Create right container for additional content
    const rightContainer = document.createElement('div');
    rightContainer.className = 'right-content-area';
    rightContainer.style.cssText = `
        position: absolute;
        top: 0;
        right: -280px;
        width: 280px;
        height: 100%;
        padding: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-size: 14px;
        text-align: center;
        background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
        border-radius: 0 20px 20px 0;
        box-sizing: border-box;
        transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    `;
    
    rightContainer.innerHTML = `
        Additional stats and<br>
        content will appear here
    `;
    
    // Add both containers to the card
    existingCard.appendChild(leftContainer);
    existingCard.appendChild(rightContainer);
    
    // Animate backdrop and expand the card
    setTimeout(() => {
        backdrop.style.opacity = '1';
        existingCard.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        existingCard.style.width = '580px';  // Expand card width
        existingCard.style.right = '20px';   // Keep card in place
        existingCard.style.zIndex = '999999';
        rightContainer.style.right = '0px';  // Slide right container into view
    }, 50);
    
    // Re-attach X button event listener for STATE 3
    const expandedCloseBtn = existingCard.querySelector('.close-btn');
    if (expandedCloseBtn) {
        expandedCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('X button clicked in STATE 3');
            closeCardCompletely(existingCard);
        });
    } else {
        console.log('No X button found in expanded card');
    }
    
    // Re-attach polaroid click for STATE 3 → STATE 2
    const profileImg = existingCard.querySelector('.profile-pfp img');
    if (profileImg) {
        profileImg.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Polaroid clicked in STATE 3');
            collapseToSmallCard(existingCard);
        });
    }
    
    // Re-attach backdrop click for STATE 3 - use setTimeout to ensure DOM is ready
    setTimeout(() => {
        const currentBackdrop = document.querySelector('.profile-backdrop');
        if (currentBackdrop) {
            currentBackdrop.addEventListener('click', (e) => {
                console.log('Expanded backdrop clicked, target:', e.target);
                if (e.target === currentBackdrop) {
                    console.log('Clicked outside expanded card - closing completely');
                    closeCardCompletely(existingCard);
                }
            });
        }
    }, 100);
    
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

function collapseToSmallCard(card) {
    console.log('STATE 3 → STATE 2: Collapsing to small card');
    
    // Hide right content and shrink card back to original size
    const rightContainer = card.querySelector('.right-content-area');
    const backdrop = document.querySelector('.profile-backdrop');
    
    if (rightContainer) {
        rightContainer.style.right = '-280px';  // Slide right container out of view
    }
    
    card.style.width = '280px';  // Shrink back to original width
    if (backdrop) {
        backdrop.style.opacity = '0';
    }
    
    setTimeout(() => {
        // Restore original content structure
        const leftContainer = card.querySelector('.left-content-area');
        if (leftContainer) {
            const originalContent = leftContainer.innerHTML;
            card.innerHTML = originalContent;
        }
        
        // Remove backdrop
        if (backdrop) {
            backdrop.remove();
        }
        
        // Reset card styling but KEEP it in STATE 2 (small card open)
        card.style.zIndex = '';
        card.classList.add('open');  // Ensure it stays open
        modalState = 'closed';  // Modal state back to normal, but card stays open
    }, 600);
}

function closeCardCompletely(card) {
    console.log('STATE 2/3 → STATE 1: Closing card completely');
    
    const backdrop = document.querySelector('.profile-backdrop');
    
    // Remove backdrop immediately
    if (backdrop) {
        backdrop.remove();
    }
    
    // Close the card completely - STATE 1
    card.classList.remove('open');
    card.style.transform = 'translateX(100%)';
    card.style.opacity = '0';
    
    setTimeout(() => {
        // Hide the card but don't remove it - just reset it
        if (card && card.parentNode) {
            card.style.display = 'none';
            card.style.transform = '';
            card.style.opacity = '';
            card.style.width = '';
            card.style.zIndex = '';
            card.style.right = '';
        }
        modalState = 'closed';
    }, 600);
}

function closeExistingCard(card, backdrop) {
    // Hide right content and shrink card back to original size
    const rightContainer = card.querySelector('.right-content-area');
    if (rightContainer) {
        rightContainer.style.right = '-280px';  // Slide right container out of view
    }
    
    card.style.width = '280px';  // Shrink back to original width
    backdrop.style.opacity = '0';
    
    setTimeout(() => {
        // Restore original content structure
        const leftContainer = card.querySelector('.left-content-area');
        if (leftContainer) {
            const originalContent = leftContainer.innerHTML;
            card.innerHTML = originalContent;
        }
        
        // Remove backdrop
        backdrop.remove();
        
        // Reset card styling
        card.style.zIndex = '';
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