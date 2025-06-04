/**
 * Enhanced Wallet Connector with Hardware Support
 * Uses Jupiter's @jup-ag/solana-wallets with Ledger and hardware wallet integration
 */

class EnhancedWallet {
    constructor() {
        this.adapter = null;
        this.connectedWallet = null;
        this.publicKey = null;
        this.listeners = new Map();
        this.isConnecting = false;
        
        this.initializeAdapter();
        this.createModal();
    }

    async initializeAdapter() {
        try {
            // Import Jupiter's wallet adapter
            const { createWalletAdapter } = await import('https://unpkg.com/@jup-ag/solana-wallets@latest/dist/index.js');
            
            this.adapter = createWalletAdapter({
                wallets: ['Phantom', 'Solflare', 'Backpack', 'Coinbase', 'Ledger'],
                autoConnect: true,
                cluster: 'mainnet-beta'
            });

            // Listen for connection events
            this.adapter.on('connect', (publicKey) => {
                this.publicKey = publicKey;
                this.connectedWallet = this.adapter.wallet;
                this.emit('connect', { publicKey: publicKey.toString() });
            });

            this.adapter.on('disconnect', () => {
                this.publicKey = null;
                this.connectedWallet = null;
                this.emit('disconnect');
            });

            this.adapter.on('error', (error) => {
                console.error('Wallet adapter error:', error);
                this.emit('error', error);
            });

        } catch (error) {
            console.error('Failed to initialize wallet adapter:', error);
            // Fallback to basic wallet detection
            this.initializeFallbackWallets();
        }
    }

    initializeFallbackWallets() {
        this.wallets = [
            {
                name: 'Phantom',
                icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg',
                provider: () => window.solana,
                detect: () => window.solana?.isPhantom,
                type: 'browser'
            },
            {
                name: 'Solflare',
                icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg',
                provider: () => window.solflare,
                detect: () => window.solflare?.isSolflare,
                type: 'browser'
            },
            {
                name: 'Backpack',
                icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg',
                provider: () => window.backpack,
                detect: () => window.backpack?.isBackpack,
                type: 'browser'
            },
            {
                name: 'Ledger',
                icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/ledger.svg',
                provider: null,
                detect: () => false, // Hardware wallet requires special handling
                type: 'hardware'
            }
        ];
    }

    createModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('enhanced-wallet-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="enhanced-wallet-modal" class="enhanced-wallet-modal">
                <div class="enhanced-wallet-content">
                    <div class="wallet-header">
                        <h3>Connect Wallet</h3>
                        <button class="close-enhanced-modal">&times;</button>
                    </div>
                    <div class="wallet-options" id="enhanced-wallet-options">
                        <div class="loading-wallets">Detecting wallets...</div>
                    </div>
                    <div class="hardware-section">
                        <div class="section-divider">
                            <span>Hardware Wallets</span>
                        </div>
                        <div class="wallet-option hardware-wallet" data-wallet="ledger">
                            <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/ledger.svg" alt="Ledger" class="wallet-icon">
                            <div class="wallet-info">
                                <div class="wallet-name">Ledger</div>
                                <div class="wallet-status">Hardware wallet</div>
                            </div>
                            <div class="wallet-badge">HD</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add event listeners
        document.querySelector('.close-enhanced-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('enhanced-wallet-modal').addEventListener('click', (e) => {
            if (e.target.id === 'enhanced-wallet-modal') {
                this.closeModal();
            }
        });

        // Add styles
        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('enhanced-wallet-styles')) return;

        const styles = `
            <style id="enhanced-wallet-styles">
                .enhanced-wallet-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    z-index: 10000;
                    backdrop-filter: blur(5px);
                    animation: fadeIn 0.2s ease-out;
                }

                .enhanced-wallet-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--bg-secondary, #1a1a1a);
                    border: 1px solid var(--border-subtle, rgba(33, 232, 163, 0.2));
                    border-radius: 16px;
                    min-width: 450px;
                    max-width: 90vw;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    animation: slideIn 0.3s ease-out;
                }

                .wallet-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 24px 24px 16px;
                    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
                }

                .wallet-header h3 {
                    margin: 0;
                    color: var(--text-primary, #ffffff);
                    font-size: 18px;
                    font-weight: 600;
                }

                .close-enhanced-modal {
                    background: var(--panel-hover, rgba(255, 255, 255, 0.1));
                    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
                    border-radius: 8px;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    cursor: pointer;
                    color: var(--text-secondary, #aaa);
                    transition: all 0.2s ease;
                }

                .close-enhanced-modal:hover {
                    background: var(--bg-secondary, #333);
                    color: var(--text-primary, #fff);
                    border-color: var(--accent-primary, #21E8A3);
                }

                .wallet-options {
                    padding: 16px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .wallet-option {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: var(--bg-primary, rgba(255, 255, 255, 0.05));
                }

                .wallet-option:hover {
                    border-color: var(--accent-primary, #21E8A3);
                    background: var(--panel-hover, rgba(33, 232, 163, 0.1));
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(33, 232, 163, 0.2);
                }

                .wallet-option.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .wallet-option.disabled:hover {
                    border-color: var(--border-subtle, rgba(255, 255, 255, 0.1));
                    background: var(--bg-primary, rgba(255, 255, 255, 0.05));
                    transform: none;
                    box-shadow: none;
                }

                .wallet-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    background: white;
                    padding: 4px;
                }

                .wallet-info {
                    flex: 1;
                }

                .wallet-name {
                    font-weight: 600;
                    color: var(--text-primary, #fff);
                    margin-bottom: 2px;
                }

                .wallet-status {
                    font-size: 14px;
                    color: var(--text-secondary, #aaa);
                }

                .wallet-badge {
                    background: var(--accent-primary, #21E8A3);
                    color: #000;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .hardware-section {
                    border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
                    padding: 16px 24px 24px;
                }

                .section-divider {
                    text-align: center;
                    margin-bottom: 16px;
                    position: relative;
                }

                .section-divider span {
                    background: var(--bg-secondary, #1a1a1a);
                    padding: 0 12px;
                    color: var(--text-secondary, #aaa);
                    font-size: 14px;
                }

                .section-divider::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 0;
                    right: 0;
                    height: 1px;
                    background: var(--border-subtle, rgba(255, 255, 255, 0.1));
                    z-index: -1;
                }

                .hardware-wallet {
                    border-color: var(--accent-secondary, #4FACFE);
                }

                .hardware-wallet:hover {
                    border-color: var(--accent-secondary, #4FACFE);
                    background: rgba(79, 172, 254, 0.1);
                    box-shadow: 0 4px 12px rgba(79, 172, 254, 0.2);
                }

                .loading-wallets {
                    text-align: center;
                    color: var(--text-secondary, #aaa);
                    padding: 20px;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideIn {
                    from { 
                        opacity: 0;
                        transform: translate(-50%, -60%);
                    }
                    to { 
                        opacity: 1;
                        transform: translate(-50%, -50%);
                    }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    async showModal() {
        const modal = document.getElementById('enhanced-wallet-modal');
        if (!modal) return;

        modal.style.display = 'block';
        
        // Detect and populate wallets
        await this.populateWallets();
    }

    closeModal() {
        const modal = document.getElementById('enhanced-wallet-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async populateWallets() {
        const container = document.getElementById('enhanced-wallet-options');
        if (!container) return;

        let walletOptions = '';

        if (this.adapter) {
            // Use Jupiter adapter wallets
            try {
                const availableWallets = await this.adapter.getWallets();
                
                for (const wallet of availableWallets) {
                    if (wallet.name === 'Ledger') continue; // Handle separately in hardware section
                    
                    const isInstalled = await wallet.adapter.detect?.() || false;
                    const status = isInstalled ? 'Detected' : 'Not installed';
                    const disabled = !isInstalled ? 'disabled' : '';
                    
                    walletOptions += `
                        <div class="wallet-option ${disabled}" data-wallet="${wallet.name.toLowerCase()}">
                            <img src="${wallet.icon}" alt="${wallet.name}" class="wallet-icon">
                            <div class="wallet-info">
                                <div class="wallet-name">${wallet.name}</div>
                                <div class="wallet-status">${status}</div>
                            </div>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Error getting wallets from adapter:', error);
                walletOptions = this.getFallbackWallets();
            }
        } else {
            walletOptions = this.getFallbackWallets();
        }

        container.innerHTML = walletOptions;

        // Add click listeners
        container.querySelectorAll('.wallet-option:not(.disabled)').forEach(option => {
            option.addEventListener('click', (e) => {
                const walletName = e.currentTarget.dataset.wallet;
                this.connect(walletName);
            });
        });
    }

    getFallbackWallets() {
        let walletOptions = '';
        
        const wallets = [
            { name: 'Phantom', icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg', detect: () => window.solana?.isPhantom },
            { name: 'Solflare', icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg', detect: () => window.solflare?.isSolflare },
            { name: 'Backpack', icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg', detect: () => window.backpack?.isBackpack }
        ];

        for (const wallet of wallets) {
            const isInstalled = wallet.detect();
            const status = isInstalled ? 'Detected' : 'Not installed';
            const disabled = !isInstalled ? 'disabled' : '';
            
            walletOptions += `
                <div class="wallet-option ${disabled}" data-wallet="${wallet.name.toLowerCase()}">
                    <img src="${wallet.icon}" alt="${wallet.name}" class="wallet-icon">
                    <div class="wallet-info">
                        <div class="wallet-name">${wallet.name}</div>
                        <div class="wallet-status">${status}</div>
                    </div>
                </div>
            `;
        }

        return walletOptions;
    }

    async connect(walletName) {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            if (walletName === 'ledger') {
                await this.connectLedger();
            } else if (this.adapter) {
                await this.adapter.connect(walletName);
            } else {
                await this.connectFallback(walletName);
            }
            
            this.closeModal();
        } catch (error) {
            console.error('Connection failed:', error);
            this.emit('error', error);
        } finally {
            this.isConnecting = false;
        }
    }

    async connectLedger() {
        // Placeholder for Ledger connection
        // In a real implementation, this would use @solana/wallet-adapter-ledger
        throw new Error('Ledger support requires additional setup. Please use a browser wallet for now.');
    }

    async connectFallback(walletName) {
        let provider;
        
        switch (walletName) {
            case 'phantom':
                provider = window.solana;
                break;
            case 'solflare':
                provider = window.solflare;
                break;
            case 'backpack':
                provider = window.backpack;
                break;
            default:
                throw new Error(`Unknown wallet: ${walletName}`);
        }

        if (!provider) {
            throw new Error(`${walletName} not detected`);
        }

        const response = await provider.connect();
        this.publicKey = response.publicKey;
        this.connectedWallet = walletName;
        this.provider = provider;
        
        this.emit('connect', { publicKey: response.publicKey.toString() });
    }

    async disconnect() {
        try {
            if (this.adapter) {
                await this.adapter.disconnect();
            } else if (this.provider) {
                await this.provider.disconnect();
                this.provider = null;
            }
            
            this.publicKey = null;
            this.connectedWallet = null;
        } catch (error) {
            console.error('Disconnect failed:', error);
        }
    }

    async signMessage(message) {
        if (!this.isConnected()) {
            throw new Error('Wallet not connected');
        }

        if (this.adapter) {
            return await this.adapter.signMessage(message);
        } else if (this.provider) {
            return await this.provider.signMessage(message, 'utf8');
        }
        
        throw new Error('No signing method available');
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    isConnected() {
        return !!this.publicKey;
    }

    getPublicKey() {
        return this.publicKey?.toString();
    }

    getConnectedWallet() {
        return this.connectedWallet;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedWallet;
} else {
    window.EnhancedWallet = EnhancedWallet;
}