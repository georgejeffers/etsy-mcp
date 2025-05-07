import express, { Request, Response } from 'express';
import { Server } from 'http';
import { TokenStorage } from './tokenStorage.js';
import * as dotenv from 'dotenv';
import { etsyApi } from './etsyApi.js'; // Use the singleton instance
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

dotenv.config();

interface StateData {
    codeVerifier: string;
    createdAt: number;
}

export class OAuthServer {
    private app: express.Application;
    private server: Server | null = null;
    private tokenStorage: TokenStorage;
    private port: number;
    private host: string;
    // Simple in-memory storage for state -> codeVerifier mapping
    // In production, use a more persistent store (e.g., Redis, DB)
    private stateStore: Map<string, StateData> = new Map();
    private stateTTL = 5 * 60 * 1000; // 5 minutes

    constructor(port: number = 3003) {
        this.app = express();
        this.port = port;
        this.host = process.env.ETSY_MCP_HOST || 'localhost';
        this.tokenStorage = TokenStorage.getInstance();
        this.setupRoutes();
        this.cleanupExpiredStates(); // Start cleanup interval
    }

    // Periodically clean up old states
    private cleanupExpiredStates() {
        setInterval(() => {
            const now = Date.now();
            this.stateStore.forEach((data, state) => {
                if (now - data.createdAt > this.stateTTL) {
                    this.stateStore.delete(state);
                    logger.log(`Expired state removed: ${state}`);
                }
            });
        }, 60 * 1000); // Check every minute
    }

    private setupRoutes() {
        // Route to initiate OAuth flow
        this.app.get('/auth', async (_req: Request, res: Response) => {
            try {
                logger.log('Starting OAuth flow...');
                
                // Generate state and PKCE codes
                const state = crypto.randomBytes(16).toString('hex');
                const { codeVerifier, codeChallenge } = etsyApi.generatePKCE(); // Use method from etsyApi instance

                // Store codeVerifier associated with state
                this.stateStore.set(state, { codeVerifier, createdAt: Date.now() });
                logger.log('Generated state and PKCE', { state });

                const authUrl = etsyApi.getAuthorizationUrl(state, codeChallenge);
                logger.log('Redirecting to Etsy OAuth page', { authUrl });
                res.redirect(authUrl);
            } catch (error) {
                logger.error('Error initializing OAuth flow', error);
                this.sendErrorResponse(res, 'Error initializing OAuth flow', error);
            }
        });

        // OAuth callback route
        this.app.get('/oauth/callback', async (req: Request, res: Response) => {
            const { code, state, error, error_description } = req.query;
            logger.log('Received OAuth callback', { 
                code: code ? 'present' : 'missing', 
                state: state ? 'present' : 'missing',
                error, 
                error_description 
            });

            if (error) {
                logger.error('OAuth error received', { error, error_description });
                this.sendErrorResponse(res, `OAuth Error: ${error}`, error_description);
                return;
            }

            if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
                const message = 'Missing authorization code or state in callback';
                logger.error(message, new Error(message));
                this.sendErrorResponse(res, message);
                return;
            }

            // Retrieve and validate state
            const storedStateData = this.stateStore.get(state);
            if (!storedStateData) {
                const message = 'Invalid or expired state parameter';
                logger.error(message, new Error(message));
                this.sendErrorResponse(res, message);
                return;
            }
            this.stateStore.delete(state); // State used, remove it
            const { codeVerifier } = storedStateData;

            logger.log('Processing OAuth callback', {
                code: `${code.substring(0, 10)}...`,
                state,
                codeVerifier: `${codeVerifier.substring(0, 10)}...`,
            });

            try {
                // Exchange code for tokens using the specific codeVerifier
                logger.log('Exchanging code for tokens...');
                const tokens = await etsyApi.getAccessTokenFromCode(code, codeVerifier);
                logger.log('Token exchange successful', {
                    accessToken: tokens.access_token ? 'present' : 'missing',
                    refreshToken: tokens.refresh_token ? 'present' : 'missing',
                    userId: tokens.user_id
                });

                let shopToSet: any = null; // Define a more specific type if shop structure is known
                if (tokens.user_id && tokens.access_token) {
                    try {
                        logger.log(`Fetching shops for user ID: ${tokens.user_id}`);
                        const userShopsResponse = await etsyApi.getUserShops(tokens.user_id, tokens.access_token);
                        
                        // Handle both possible response structures from Etsy API for user shops
                        if (userShopsResponse && userShopsResponse.results && userShopsResponse.count > 0) {
                            // Case 1: Etsy returns a list of shops
                            shopToSet = userShopsResponse.results[0]; 
                            logger.log(`Automatically selected shop (from list): ${shopToSet.shop_name} (ID: ${shopToSet.shop_id})`);
                        } else if (userShopsResponse && userShopsResponse.shop_id) {
                            // Case 2: Etsy returns a single shop object directly
                            shopToSet = userShopsResponse; 
                            logger.log(`Automatically selected shop (single object): ${shopToSet.shop_name} (ID: ${shopToSet.shop_id})`);
                        } else {
                            logger.log('No shops found for the user or unexpected response structure from getUserShops.');
                        }
                    } catch (shopError) {
                        logger.error('Failed to fetch user shops during OAuth callback:', shopError);
                        // Continue without setting a shop, user can use set_default_shop later
                    }
                }

                // Store tokens and user/shop info
                await this.tokenStorage.saveTokens({
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_in: tokens.expires_in, // Pass expires_in for TokenStorage to calculate expires_at
                    user_id: tokens.user_id,
                    shop_id: shopToSet?.shop_id,    // Use optional chaining in case no shops
                    shop_name: shopToSet?.shop_name // Use optional chaining
                });
                etsyApi.setAccessToken(tokens.access_token); // Update singleton instance

                // Send success response with auto-close, including user/shop info
                this.sendSuccessResponse(res, tokens.user_id, shopToSet);

                // Stop the server after successful authentication (optional)
                // Consider keeping it running if multiple authentications might happen
                // setTimeout(() => this.stop(), 2500);
            } catch (exchangeError: any) {
                logger.error('Token exchange failed', exchangeError);
                this.sendErrorResponse(res, 'Token exchange failed', exchangeError);
            }
        });
    }

    // Refactored methods from etsyApi.ts to be called on the singleton instance
    private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
        return etsyApi.generatePKCE();
    }

    private getAuthorizationUrl(state: string, codeChallenge: string): string {
        return etsyApi.getAuthorizationUrl(state, codeChallenge);
    }

    private sendSuccessResponse(res: Response, userId?: number, shop?: any) {
        let message = '<h1>Authentication Successful!</h1>';
        if (userId) {
            message += `<p>Your User ID: ${userId}</p>`;
        }
        if (shop?.shop_id) {
            message += `<p>Default Shop Set: ${shop.shop_name || 'N/A'} (ID: ${shop.shop_id})</p>`;
        } else {
            message += '<p>No default shop was automatically set. You can use the `set_default_shop` tool if needed.</p>';
        }
        message += '<p>You can close this window and return to the application.</p>';

        res.status(200).send(`
            <html>
                <body>
                    ${message}
                    <script>
                        console.log('Authentication successful');
                        setTimeout(() => window.close(), 3500); // Keep open slightly longer to read info
                    </script>
                </body>
            </html>
        `);
    }

    private sendErrorResponse(res: Response, message: string, errorDetails?: any) {
        const details = errorDetails instanceof Error ? errorDetails.message : String(errorDetails || '');
        res.status(500).send(`
            <html>
                <body>
                    <h1>Authentication Failed</h1>
                    <p>${message}</p>
                    ${details ? `<p>Details: ${details}</p>` : ''}
                    <script>
                        console.error('Authentication error:', ${JSON.stringify({ message, details })});
                        setTimeout(() => window.close(), 5000); // Keep open longer for errors
                    </script>
                </body>
            </html>
        `);
    }

    async start() {
        return new Promise<void>((resolve, reject) => {
            if (this.server) {
                logger.log('OAuth server already running.');
                resolve();
                return;
            }
            this.server = this.app.listen(this.port, this.host, () => {
                logger.log(`OAuth server listening at http://${this.host}:${this.port}`);
                this.server?.on('error', (error: NodeJS.ErrnoException) => { // Add error listener after listen
                    if (error.code === 'EADDRINUSE') {
                        logger.log(`[WARN] Port ${this.port} already in use. OAuth server likely already running elsewhere.`); // Use log
                        // Don't reject, as another instance might be serving. Or, decide to reject if this instance *must* own the port.
                        resolve(); // Resolve so the main app doesn't hang if another instance is fine
                    } else {
                        logger.error('OAuth server error after start:', error);
                        // this.server = null; // Consider nullifying server on other errors too
                        reject(error); // Reject for other errors
                    }
                });
                resolve();
            });
            // Initial listener for immediate errors like EADDRINUSE before 'listening' event
            this.server.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    logger.log(`[WARN] Port ${this.port} is already in use. OAuth server might be running in another process.`); // Use log
                    // Assuming another process is handling it, resolve to not block the app.
                    // If this server instance *must* own the port, then this should be a reject().
                    this.server = null; // Nullify as this instance didn't get the port
                    resolve(); 
                } else {
                    logger.error('Failed to start OAuth server (initial error listener):', error);
                    this.server = null;
                    reject(error);
                }
            });
        });
    }

    stop() {
        if (this.server) {
            this.server.close((err) => {
                if (err) {
                    logger.error('Error closing OAuth server:', err);
                } else {
                    logger.log('OAuth server stopped');
                }
                this.server = null; // Ensure server is nullified after close attempt
            });
        } else {
            logger.log('OAuth server was not running or already stopped.');
        }
    }

    public getAuthInitiationUrl(): string {
        // URL the MCP client should direct the user to
        return `http://${this.host}:${this.port}/auth`;
    }
} // Ensure class closes correctly