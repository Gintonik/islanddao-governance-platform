/**
 * Multi-Wallet Connector for Vanilla JavaScript
 * Provides Jupiter-style wallet selection with official logos and proper detection
 */

class WalletAdapter {
    constructor(config = {}) {
        this.wallets = new Map();
        this.connectedWallet = null;
        this.publicKey = null;
        this.listeners = new Map();
        this.autoConnect = config.autoConnect || false;
        
        this.initializeWallets(config.wallets || ['Phantom', 'Solflare', 'Backpack']);
        this.createModal();
        
        if (this.autoConnect) {
            this.attemptAutoConnect();
        }
    }

    initializeWallets(walletNames) {
        const walletConfigs = {
            'Phantom': {
                name: 'Phantom',
                icon: 'https://phantom.app/img/phantom-logo.svg',
                provider: () => window.solana,
                detect: () => window.solana?.isPhantom,
                website: 'https://phantom.app'
            },
            'Solflare': {
                name: 'Solflare',
                icon: 'https://solflare.com/images/logo.svg',
                provider: () => window.solflare,
                detect: () => window.solflare?.isSolflare,
                website: 'https://solflare.com'
            },
            'Backpack': {
                name: 'Backpack',
                icon: 'https://backpack.app/icon.png',
                provider: () => window.backpack,
                detect: () => window.backpack?.isBackpack,
                website: 'https://backpack.app'
            },
            'Coinbase': {
                name: 'Coinbase Wallet',
                icon: 'https://images.ctfassets.net/q5ulk4bp65r7/3VbZqohOorINNZM8tGEzJn/72d6e35936b7cef3a1f0a3ae7b123fa7/coinbase-wallet.png',
                provider: () => window.coinbaseSolana,
                detect: () => window.coinbaseSolana,
                website: 'https://wallet.coinbase.com'
            }
        };

        walletNames.forEach(name => {
            if (walletConfigs[name]) {
                this.wallets.set(name.toLowerCase(), walletConfigs[name]);
            }
        });
    }

    createModal() {
        // Remove existing modal if present
        const existingModal = document.getElementById('wallet-selector-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHTML = `
            <div id="wallet-selector-modal" class="wallet-selector-modal">
                <div class="wallet-selector-content">
                    <div class="wallet-header">
                        <h3>Connect Wallet</h3>
                        <button class="close-wallet-modal">&times;</button>
                    </div>
                    <div class="wallet-list" id="wallet-list">
                        <!-- Wallets will be populated here -->
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.addModalStyles();
        this.attachEventListeners();
    }

    addModalStyles() {
        if (document.getElementById('wallet-selector-styles')) return;

        const styles = `
            <style id="wallet-selector-styles">
                .wallet-selector-modal {
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

                .wallet-selector-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--bg-secondary, #1a1a1a);
                    border: 1px solid var(--border-subtle, rgba(33, 232, 163, 0.2));
                    border-radius: 16px;
                    width: 400px;
                    max-width: 90vw;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    animation: slideIn 0.3s ease-out;
                }

                .wallet-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 20px 16px;
                    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
                }

                .wallet-header h3 {
                    margin: 0;
                    color: var(--text-primary, #ffffff);
                    font-size: 18px;
                    font-weight: 600;
                }

                .close-wallet-modal {
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

                .close-wallet-modal:hover {
                    background: var(--bg-secondary, #333);
                    color: var(--text-primary, #fff);
                    border-color: var(--accent-primary, #21E8A3);
                }

                .wallet-list {
                    padding: 16px 20px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .wallet-item {
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

                .wallet-item:hover {
                    border-color: var(--accent-primary, #21E8A3);
                    background: var(--panel-hover, rgba(33, 232, 163, 0.1));
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(33, 232, 163, 0.2);
                }

                .wallet-item.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .wallet-item.disabled:hover {
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
                    object-fit: contain;
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

    attachEventListeners() {
        const modal = document.getElementById('wallet-selector-modal');
        const closeBtn = modal.querySelector('.close-wallet-modal');

        closeBtn.addEventListener('click', () => this.closeModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    async select() {
        const modal = document.getElementById('wallet-selector-modal');
        if (!modal) return;

        await this.populateWallets();
        modal.style.display = 'block';
    }

    closeModal() {
        const modal = document.getElementById('wallet-selector-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async populateWallets() {
        const walletList = document.getElementById('wallet-list');
        if (!walletList) return;

        walletList.innerHTML = '';

        for (const [key, wallet] of this.wallets) {
            const isDetected = wallet.detect();
            const status = isDetected ? 'Detected' : 'Not installed';
            const disabled = !isDetected ? 'disabled' : '';

            const walletItem = document.createElement('div');
            walletItem.className = `wallet-item ${disabled}`;
            walletItem.innerHTML = `
                <img src="${wallet.icon}" alt="${wallet.name}" class="wallet-icon" 
                     onerror="this.style.display='none'">
                <div class="wallet-info">
                    <div class="wallet-name">${wallet.name}</div>
                    <div class="wallet-status">${status}</div>
                </div>
            `;

            if (isDetected) {
                walletItem.addEventListener('click', () => this.connectWallet(key, wallet));
            } else {
                walletItem.addEventListener('click', () => {
                    window.open(wallet.website, '_blank');
                });
            }

            walletList.appendChild(walletItem);
        }
    }

    async connectWallet(key, wallet) {
        try {
            const provider = wallet.provider();
            if (!provider) throw new Error(`${wallet.name} not available`);

            const response = await provider.connect();
            this.publicKey = response.publicKey;
            this.connectedWallet = wallet;
            this.provider = provider;

            this.closeModal();
            this.emit('connect', { 
                publicKey: this.publicKey.toString(),
                wallet: wallet.name
            });

        } catch (error) {
            console.error('Connection failed:', error);
            this.emit('error', error);
        }
    }

    async disconnect() {
        try {
            if (this.provider && this.provider.disconnect) {
                await this.provider.disconnect();
            }
            
            this.publicKey = null;
            this.connectedWallet = null;
            this.provider = null;
            
            this.emit('disconnect');
        } catch (error) {
            console.error('Disconnect failed:', error);
        }
    }

    async signMessage(message) {
        if (!this.isConnected()) {
            throw new Error('Wallet not connected');
        }

        if (!this.provider || !this.provider.signMessage) {
            throw new Error('Wallet does not support message signing');
        }

        return await this.provider.signMessage(message, 'utf8');
    }

    async attemptAutoConnect() {
        // Try to auto-connect to previously connected wallet
        const savedWallet = localStorage.getItem('lastConnectedWallet');
        if (savedWallet && this.wallets.has(savedWallet)) {
            const wallet = this.wallets.get(savedWallet);
            if (wallet.detect()) {
                try {
                    await this.connectWallet(savedWallet, wallet);
                } catch (error) {
                    console.log('Auto-connect failed:', error);
                }
            }
        }
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

        // Save last connected wallet for auto-connect
        if (event === 'connect' && data.wallet) {
            localStorage.setItem('lastConnectedWallet', data.wallet.toLowerCase());
        } else if (event === 'disconnect') {
            localStorage.removeItem('lastConnectedWallet');
        }
    }

    // Getters
    get connected() {
        return !!this.publicKey;
    }

    isConnected() {
        return this.connected;
    }

    getPublicKey() {
        return this.publicKey?.toString();
    }

    getConnectedWallet() {
        return this.connectedWallet;
    }

    getWallets() {
        return Array.from(this.wallets.values());
    }
}

// Factory function similar to Jupiter's createWalletAdapter
function createWalletAdapter(config = {}) {
    const adapter = new WalletAdapter(config);
    
    return {
        select: () => adapter.select(),
        wallets: adapter.getWallets(),
        publicKey: adapter.publicKey,
        signMessage: (message) => adapter.signMessage(message),
        connected: adapter.connected,
        disconnect: () => adapter.disconnect(),
        on: (event, callback) => adapter.on(event, callback)
    };
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WalletAdapter, createWalletAdapter };
} else {
    window.WalletAdapter = WalletAdapter;
    window.createWalletAdapter = createWalletAdapter;
}