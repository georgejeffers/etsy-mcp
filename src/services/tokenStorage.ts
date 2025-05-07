import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

interface TokenData {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    user_id?: number;
    shop_id?: number;
    shop_name?: string;
}

export class TokenStorage {
    private static instance: TokenStorage;
    private tokenFilePath: string;
    private fileStorageEnabled: boolean = true;

    private constructor() {
        // Get storage path from environment variable or use default
        const storagePath = process.env.ETSY_MCP_TOKEN_PATH || path.join(process.env.HOME || process.env.USERPROFILE || '', '.etsy-mcp');
        
        try {
            // Create config directory if it doesn't exist
            if (!fs.existsSync(storagePath)) {
                fs.mkdirSync(storagePath, { mode: 0o700, recursive: true });
            }
            
            this.tokenFilePath = path.join(storagePath, 'tokens.json');
        } catch (error: any) {
            // Handle EROFS and other file system errors
            if (error.code === 'EROFS' || error.code === 'EACCES') {
                console.error(`[TokenStorage] File storage disabled: ${error.message}`);
                this.fileStorageEnabled = false;
                this.tokenFilePath = '';
            } else {
                throw error; // Re-throw other errors
            }
        }
    }

    public static getInstance(): TokenStorage {
        if (!TokenStorage.instance) {
            TokenStorage.instance = new TokenStorage();
        }
        return TokenStorage.instance;
    }

    public saveTokens(tokens: TokenData & { expires_in?: number }): void {
        if (!this.fileStorageEnabled) {
            console.warn('[TokenStorage] Token persistence is disabled due to file system restrictions. Tokens will not be saved between sessions.');
            return;
        }

        try {
            let newExpiresAt: number;
            if (tokens.expires_in) {
                newExpiresAt = Date.now() + (tokens.expires_in * 1000);
            } else if (tokens.expires_at) {
                newExpiresAt = tokens.expires_at; // Preserve existing expires_at if no expires_in
            } else {
                newExpiresAt = Date.now() + (60 * 60 * 1000); // Default to 1 hour
            }

            const tokensToSave: TokenData = {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                user_id: tokens.user_id,
                shop_id: tokens.shop_id,
                shop_name: tokens.shop_name,
                expires_at: newExpiresAt
            };

            // Write tokens to file with restricted permissions
            fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokensToSave, null, 2), {
                mode: 0o600,
                encoding: 'utf8'
            });
        } catch (error: any) {
            if (error.code === 'EROFS' || error.code === 'EACCES') {
                console.error('[TokenStorage] Failed to save tokens: File system is read-only');
                this.fileStorageEnabled = false;
            } else {
                console.error('Error saving tokens:', error);
                throw error;
            }
        }
    }

    public getTokens(): TokenData | null {
        if (!this.fileStorageEnabled) {
            return null;
        }

        try {
            if (!fs.existsSync(this.tokenFilePath)) {
                return null;
            }

            const data = fs.readFileSync(this.tokenFilePath, 'utf8');
            const tokens: TokenData = JSON.parse(data);

            // Check if token is expired
            if (tokens.expires_at && tokens.expires_at < Date.now()) {
                return null;
            }

            return tokens;
        } catch (error: any) {
            if (error.code === 'EROFS' || error.code === 'EACCES') {
                console.error('[TokenStorage] Failed to read tokens: File system is read-only');
                this.fileStorageEnabled = false;
            } else {
                console.error('Error reading tokens:', error);
            }
            return null;
        }
    }

    // Load tokens even if they might be expired (to get refresh_token)
    public loadPotentiallyExpiredTokens(): TokenData | null {
        if (!this.fileStorageEnabled) {
            return null;
        }

        try {
            if (!fs.existsSync(this.tokenFilePath)) {
                return null;
            }

            const data = fs.readFileSync(this.tokenFilePath, 'utf8');
            const tokens: TokenData = JSON.parse(data);

            // Return tokens even if expired
            return tokens;
        } catch (error: any) {
            if (error.code === 'EROFS' || error.code === 'EACCES') {
                console.error('[TokenStorage] Failed to read potentially expired tokens: File system is read-only');
                this.fileStorageEnabled = false;
            } else {
                console.error('Error reading potentially expired tokens:', error);
            }
            return null;
        }
    }

    public clearTokens(): void {
        if (!this.fileStorageEnabled) {
            return;
        }

        try {
            if (fs.existsSync(this.tokenFilePath)) {
                fs.unlinkSync(this.tokenFilePath);
            }
        } catch (error: any) {
            if (error.code === 'EROFS' || error.code === 'EACCES') {
                console.error('[TokenStorage] Failed to clear tokens: File system is read-only');
                this.fileStorageEnabled = false;
            } else {
                console.error('Error clearing tokens:', error);
                throw error;
            }
        }
    }

    public hasValidToken(): boolean {
        const tokens = this.getTokens();
        return tokens !== null && tokens.access_token !== undefined;
    }
} 