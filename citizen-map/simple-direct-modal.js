// Ultra Simple Modal - Direct function calls only, no event listeners
let currentState = 'closed';

// Global close function that can be called directly from HTML
window.closeCard = function() {
    console.log('Closing card');
    const card = document.getElementById('citizenPanel');
    const backdrop = document.querySelector('.profile-backdrop');
    
    if (backdrop) backdrop.remove();
    if (card) {
        card.style.display = 'none';
        card.classList.remove('open');
        // Reset all styles
        card.style.width = '';
        card.style.transform = '';
        card.style.opacity = '';
        card.style.right = '';
        card.style.zIndex = '';
    }
    currentState = 'closed';
    console.log('Card closed successfully');
};

// Global toggle function for polaroid clicks
window.toggleCard = function() {
    console.log('Toggle card clicked, current state:', currentState);
    const card = document.getElementById('citizenPanel');
    if (!card) return;
    
    const currentWidth = window.getComputedStyle(card).width;
    console.log('Current card width:', currentWidth);
    
    if (currentWidth === '580px') {
        // STATE 3 → STATE 2: Collapse to small
        console.log('Collapsing to small card');
        collapseToSmall(card);
        currentState = 'small';
    } else {
        // STATE 2 → STATE 3: Expand to full
        console.log('Expanding to full card');
        expandToFull(card);
        currentState = 'expanded';
    }
};

function collapseToSmall(card) {
    // Remove backdrop
    const backdrop = document.querySelector('.profile-backdrop');
    if (backdrop) backdrop.remove();
    
    // Hide right content
    const rightContainer = card.querySelector('.right-content-area');
    if (rightContainer) {
        rightContainer.style.right = '-280px';
    }
    
    // Shrink card back to 280px
    card.style.width = '280px';
    card.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
}

function expandToFull(card) {
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
    document.body.appendChild(backdrop);
    
    // Show backdrop
    setTimeout(() => {
        backdrop.style.opacity = '1';
    }, 10);
    
    // Expand card to 580px
    card.style.width = '580px';
    card.style.transition = 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    
    // Show right content if it exists
    const rightContainer = card.querySelector('.right-content-area');
    if (rightContainer) {
        setTimeout(() => {
            rightContainer.style.right = '0px';
        }, 200);
    }
}

// Main function to open cards
window.openEnhancedProfile = function(citizen) {
    console.log('Opening profile for citizen:', citizen.nickname || 'Unknown');
    
    const card = document.getElementById('citizenPanel');
    if (!card) {
        console.log('No citizen panel found');
        return;
    }
    
    // Reset card completely
    card.style.display = '';
    card.style.width = '280px';
    card.style.opacity = '1';
    card.style.transform = '';
    card.classList.add('open');
    currentState = 'small';
    
    // Update card content with citizen data
    updateCardContent(card, citizen);
    
    console.log('Card opened in small state');
};

function updateCardContent(card, citizen) {
    // Remove ALL existing buttons completely
    const allBtns = card.querySelectorAll('button, .close-btn, .simple-close-btn');
    allBtns.forEach(btn => btn.remove());
    
    // Remove any existing onclick handlers
    const profileImg = card.querySelector('.profile-pfp img');
    if (profileImg) {
        profileImg.removeAttribute('onclick');
        profileImg.onclick = null;
    }
    
    // Add ONE X button using innerHTML instead of createElement
    card.insertAdjacentHTML('beforeend', `
        <button onclick="closeCard()" style="
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
            z-index: 100;
        ">×</button>
    `);
    
    // Add onclick to polaroid using setAttribute 
    if (profileImg) {
        profileImg.setAttribute('onclick', 'toggleCard()');
        profileImg.style.cursor = 'pointer';
        console.log('Added click handler to polaroid');
    }
}