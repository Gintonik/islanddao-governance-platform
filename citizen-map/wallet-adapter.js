/**
 * Universal Solana Wallet Adapter for Vanilla JavaScript
 * Framework-agnostic wallet connection library
 */

class SolanaWalletAdapter {
    constructor(options = {}) {
        this.wallets = new Map();
        this.connectedWallet = null;
        this.publicKey = null;
        this.autoConnect = options.autoConnect || false;
        this.listeners = new Map();
        
        // Initialize supported wallets
        this.initializeWallets();
        
        // Auto-detect and connect if enabled
        if (this.autoConnect) {
            this.autoConnectWallet();
        }
    }

    initializeWallets() {
        // Define wallet configurations
        const walletConfigs = [
            {
                name: 'Phantom',
                identifier: 'phantom',
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTA4IiBoZWlnaHQ9IjEwOCIgdmlld0JveD0iMCAwIDEwOCAxMDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDgiIGhlaWdodD0iMTA4IiByeD0iMjYiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl8xXzIpIi8+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNDYuNTQxNyAyNC4zMzMzQzUyLjgwODEgMjQuMzMzMyA1Ny44ODUgMjkuNDEwMiA1Ny44ODUgMzUuNjc2Nkw1Ny44ODUgNzIuMzIzNEM1Ny44ODUgNzguNTg5OCA2Mi45NjE5IDgzLjY2NjcgNjkuMjI4MyA4My42NjY3SDc4LjY2NjdWOTIuNzVINjkuMjI4M0M1Ny45NzU2IDkyLjc1IDQ4Ljc5MTcgODMuNTY2MSA0OC43OTE3IDcyLjMxMzRWMzUuNjc2NkM0OC43OTE3IDM0LjM5MzggNDcuOTI0NSAzMy41MjY2IDQ2LjU0MTcgMzMuNTI2NkwyOS4zMzMzIDMzLjUyNjZWMjQuNDMzM0g0Ni41NDE3WiIgZmlsbD0id2hpdGUiLz4KPGRlZnM+CjxsaW5lYXJHcmFkaWVudCBpZD0icGFpbnQwX2xpbmVhcl8xXzIiIHgxPSIwIiB5MT0iMCIgeDI9IjEwOCIgeTI9IjEwOCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjNTM0QkI4Ii8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzU1MUJGOSIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=',
                provider: () => window.solana,
                detect: () => window.solana && window.solana.isPhantom
            },
            {
                name: 'Solflare',
                identifier: 'solflare',
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9InVybCgjcGFpbnQwX2xpbmVhcl8xXzIpIi8+CjxwYXRoIGQ9Ik0yMC40IDI3LjJMNy4yIDEzSDMybDIuOCAxLjJWMjYuNGwtMTQuNCAwLjhaIiBmaWxsPSJ3aGl0ZSIvPgo8ZGVmcz4KPGxpbmVhckdyYWRpZW50IGlkPSJwYWludDBfbGluZWFyXzFfMiIgeDE9IjAiIHkxPSIwIiB4Mj0iNDAiIHkyPSI0MCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjRkZDMTBCIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI0ZCM0Y2QyIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+Cjwvc3ZnPgo=',
                provider: () => window.solflare,
                detect: () => window.solflare && window.solflare.isSolflare
            },
            {
                name: 'Backpack',
                identifier: 'backpack',
                icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMwMDAwMDAiLz4KPHBhdGggZD0iTTIwIDEwTDMwIDI1SDE5SDE1SDEwTDIwIDEwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',
                provider: () => window.backpack,
                detect: () => window.backpack && window.backpack.isBackpack
            }
        ];

        // Initialize wallet map
        walletConfigs.forEach(config => {
            this.wallets.set(config.identifier, config);
        });
    }

    async detectWallets() {
        const detected = [];
        for (const [identifier, wallet] of this.wallets) {
            if (wallet.detect()) {
                detected.push({
                    ...wallet,
                    detected: true
                });
            }
        }
        return detected;
    }

    async connect(walletIdentifier) {
        try {
            const walletConfig = this.wallets.get(walletIdentifier);
            if (!walletConfig) {
                throw new Error(`Wallet ${walletIdentifier} not supported`);
            }

            if (!walletConfig.detect()) {
                throw new Error(`${walletConfig.name} not detected. Please install the extension.`);
            }

            const provider = walletConfig.provider();
            if (!provider) {
                throw new Error(`${walletConfig.name} provider not available`);
            }

            // Connect based on wallet type
            let response;
            let publicKey;

            if (walletIdentifier === 'phantom') {
                response = await provider.connect({ onlyIfTrusted: false });
                if (!response || !response.publicKey) {
                    throw new Error('Failed to connect to Phantom');
                }
                publicKey = response.publicKey.toString();
            } else if (walletIdentifier === 'solflare') {
                await provider.connect();
                if (!provider.publicKey) {
                    throw new Error('Failed to connect to Solflare');
                }
                publicKey = provider.publicKey.toString();
            } else if (walletIdentifier === 'backpack') {
                response = await provider.connect();
                if (!response || !response.publicKey) {
                    throw new Error('Failed to connect to Backpack');
                }
                publicKey = response.publicKey.toString();
            }

            // Set connection state
            this.connectedWallet = walletIdentifier;
            this.publicKey = publicKey;

            // Emit connection event
            this.emit('connect', { publicKey, wallet: walletIdentifier });

            return { publicKey, wallet: walletIdentifier };
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.connectedWallet) {
                const walletConfig = this.wallets.get(this.connectedWallet);
                const provider = walletConfig.provider();
                
                if (provider && provider.disconnect) {
                    await provider.disconnect();
                }
            }

            this.connectedWallet = null;
            this.publicKey = null;

            this.emit('disconnect');
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async signMessage(message) {
        try {
            if (!this.connectedWallet) {
                throw new Error('No wallet connected');
            }

            const walletConfig = this.wallets.get(this.connectedWallet);
            const provider = walletConfig.provider();

            if (!provider || !provider.signMessage) {
                throw new Error('Wallet does not support message signing');
            }

            const encodedMessage = typeof message === 'string' 
                ? new TextEncoder().encode(message) 
                : message;

            let signature;
            if (this.connectedWallet === 'phantom' || this.connectedWallet === 'solflare') {
                signature = await provider.signMessage(encodedMessage, 'utf8');
            } else {
                signature = await provider.signMessage(encodedMessage);
            }

            return signature;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async autoConnectWallet() {
        try {
            const detected = await this.detectWallets();
            if (detected.length > 0) {
                // Try to connect to the first detected wallet
                await this.connect(detected[0].identifier);
            }
        } catch (error) {
            // Auto-connect failure is not critical
            console.warn('Auto-connect failed:', error);
        }
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    // Utility methods
    isConnected() {
        return !!this.connectedWallet && !!this.publicKey;
    }

    getConnectedWallet() {
        return this.connectedWallet;
    }

    getPublicKey() {
        return this.publicKey;
    }

    getSupportedWallets() {
        return Array.from(this.wallets.values());
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolanaWalletAdapter;
}

// Global window export for script tag usage
if (typeof window !== 'undefined') {
    window.SolanaWalletAdapter = SolanaWalletAdapter;
}