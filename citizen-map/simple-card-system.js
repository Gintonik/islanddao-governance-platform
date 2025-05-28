// Simple Three-State Card System - Clean Implementation
let currentCard = null;
let cardState = 'closed'; // 'closed', 'small', 'expanded'

// Main function called by map markers
window.openEnhancedProfile = function(citizen) {
    console.log('Opening profile for:', citizen.nickname || citizen.wallet);
    
    if (cardState === 'closed') {
        openSmallCard(citizen);
    } else if (cardState === 'small') {
        expandCard(citizen);
    } else if (cardState === 'expanded') {
        collapseToSmall();
    }
};

function openSmallCard(citizen) {
    console.log('STATE 1 → STATE 2: Opening small card');
    cardState = 'small';
    
    // Remove any existing card
    closeCard();
    
    // Create new small card
    currentCard = document.createElement('div');
    currentCard.className = 'profile-card open';
    currentCard.style.cssText = `
        position: fixed;
        top: 150px;
        right: 20px;
        width: 280px;
        height: 200px;
        background: linear-gradient(145deg, #0F0F0F 0%, #1A1A1A 100%);
        border: 2px solid #21E8A3;
        border-radius: 20px;
        box-shadow: 0 0 0 1px rgba(33, 232, 163, 0.2);
        color: #FAFAFA;
        padding: 20px;
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    `;
    
    // Get profile image
    const profileNftId = citizen.pfp_nft || citizen.primaryNft || citizen.primary_nft;
    let profileImage = 'https://via.placeholder.com/80x80?text=Profile';
    
    if (profileNftId && citizen.nftMetadata && citizen.nftMetadata[profileNftId]) {
        profileImage = citizen.nftMetadata[profileNftId].image;
    }
    
    currentCard.innerHTML = `
        <button class="card-close-btn" style="
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: #FAFAFA;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        ">×</button>
        
        <div class="profile-content" style="height: 100%; display: flex; flex-direction: column;">
            <div class="profile-pfp" style="
                width: 80px;
                height: 80px;
                border-radius: 50%;
                margin: 0 auto 15px auto;
                overflow: hidden;
                cursor: pointer;
                border: 2px solid #21E8A3;
            ">
                <img src="${profileImage}" alt="Profile" style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                ">
            </div>
            
            <div class="profile-info" style="text-align: center; flex: 1;">
                <div class="citizen-name" style="
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: #21E8A3;
                ">${citizen.nickname || 'Anonymous Citizen'}</div>
                
                <div class="nft-count" style="
                    font-size: 12px;
                    color: #888;
                    margin-bottom: 5px;
                ">${citizen.nfts ? citizen.nfts.length : 0} NFTs</div>
                
                <div class="wallet-short" style="
                    font-size: 10px;
                    color: #666;
                    font-family: monospace;
                ">${citizen.wallet.substring(0, 8)}...${citizen.wallet.substring(citizen.wallet.length - 4)}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(currentCard);
    
    // Slide in
    setTimeout(() => {
        currentCard.style.transform = 'translateX(0)';
    }, 50);
    
    // Add event listeners
    addCardEventListeners(citizen);
}

function expandCard(citizen) {
    console.log('STATE 2 → STATE 3: Expanding card');
    cardState = 'expanded';
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'card-backdrop';
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 999;
        opacity: 0;
        transition: opacity 0.6s ease;
    `;
    
    document.body.appendChild(backdrop);
    
    // Expand card
    currentCard.style.width = '580px';
    currentCard.style.zIndex = '1001';
    
    // Add backdrop click listener
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            console.log('Clicked outside expanded card');
            closeCard();
        }
    });
    
    // Fade in backdrop
    setTimeout(() => {
        backdrop.style.opacity = '1';
    }, 50);
}

function collapseToSmall() {
    console.log('STATE 3 → STATE 2: Collapsing to small');
    cardState = 'small';
    
    // Remove backdrop
    const backdrop = document.querySelector('.card-backdrop');
    if (backdrop) {
        backdrop.style.opacity = '0';
        setTimeout(() => backdrop.remove(), 600);
    }
    
    // Collapse card
    currentCard.style.width = '280px';
    currentCard.style.zIndex = '1000';
}

function closeCard() {
    console.log('Closing card completely (Any STATE → STATE 1)');
    cardState = 'closed';
    
    // Remove backdrop
    const backdrop = document.querySelector('.card-backdrop');
    if (backdrop) {
        backdrop.remove();
    }
    
    // Remove card
    if (currentCard) {
        currentCard.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (currentCard) {
                currentCard.remove();
                currentCard = null;
            }
        }, 600);
    }
}

function addCardEventListeners(citizen) {
    if (!currentCard) return;
    
    // X button click - always close completely
    const closeBtn = currentCard.querySelector('.card-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('X button clicked');
            closeCard();
        });
    }
    
    // Polaroid image click - toggle between small and expanded
    const profileImg = currentCard.querySelector('.profile-pfp img');
    if (profileImg) {
        profileImg.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Polaroid clicked in state:', cardState);
            
            if (cardState === 'small') {
                expandCard(citizen);
            } else if (cardState === 'expanded') {
                collapseToSmall();
            }
        });
    }
}