import axios from 'axios';
import * as dotenv from 'dotenv';
import crypto from 'crypto';
import { config } from 'dotenv';
import FormData from 'form-data';
import { logger } from '../utils/logger.js';
import fs from 'fs';

dotenv.config();

interface ListingData {
    title: string;
    description: string;
    price: number;
    quantity: number;
    who_made: string;
    when_made: string;
    taxonomy_id: number;
    type: string;
}

interface OAuthTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    user_id?: number;
}

export class EtsyApiClient {
    private baseURL: string;
    private apiKey: string;
    private clientSecret: string;
    private redirectUri: string;
    private codeVerifier: string | null = null;
    private accessToken: string | null = null;

    constructor(port: number = 3003) {
        this.baseURL = 'https://api.etsy.com/v3';
        this.apiKey = process.env.ETSY_API_KEY || '';
        this.clientSecret = process.env.ETSY_CLIENT_SECRET || '';
        
        // Get host from environment or use localhost
        const host = process.env.ETSY_MCP_HOST || 'localhost';
        this.redirectUri = process.env.ETSY_MCP_REDIRECT_URI || `http://${host}:${port}/oauth/callback`;
        
        if (!this.apiKey || !this.clientSecret) {
            throw new Error('ETSY_API_KEY and ETSY_CLIENT_SECRET must be set in environment variables');
        }
    }

    // Generate PKCE code verifier and challenge
    public generatePKCE(): { codeVerifier: string; codeChallenge: string } {
        // Generate new PKCE codes each time this is called
        // Storing this.codeVerifier might lead to reuse issues if auth fails/retries
        const localCodeVerifier = crypto.randomBytes(32)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 128);

        const codeChallenge = crypto
            .createHash('sha256')
            .update(localCodeVerifier)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        return { codeVerifier: localCodeVerifier, codeChallenge };
    }

    // Get the OAuth authorization URL - takes state and challenge as args
    getAuthorizationUrl(state: string, codeChallenge: string): string {
        const scopes = 'listings_r listings_w shops_r shops_w'; // Consider making scopes configurable
        
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.apiKey,
            redirect_uri: this.redirectUri,
            scope: scopes,
            state: state, // Use provided state
            code_challenge: codeChallenge, // Use provided challenge
            code_challenge_method: 'S256'
        });

        return `https://www.etsy.com/oauth/connect?${params.toString()}`;
    }

    // Exchange authorization code for access token using PKCE
    async getAccessTokenFromCode(code: string, codeVerifier: string): Promise<OAuthTokenResponse> {
        const tokenEndpoint = `${this.baseURL}/public/oauth/token`;

        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.apiKey,
            redirect_uri: this.redirectUri,
            code: code,
            code_verifier: codeVerifier
        });

        try {
            // Remove this console.log as it interferes with MCP stdio communication
            /*
            console.log('Exchanging code for token with params:', {
                grant_type: 'authorization_code',
                client_id: this.apiKey,
                redirect_uri: this.redirectUri,
                code_length: code.length,
                code_verifier_length: codeVerifier.length
            });
            */

            const response = await axios.post(
                tokenEndpoint,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            // Store the received access token internally
            this.accessToken = response.data.access_token;

            // Parse user_id from the access_token string (e.g., "12345.actualtoken")
            let userIdFromToken: number | undefined = undefined;
            if (response.data.access_token) {
                const parts = response.data.access_token.split('.');
                if (parts.length > 0 && !isNaN(parseInt(parts[0], 10))) {
                    userIdFromToken = parseInt(parts[0], 10);
                }
            }
            
            return {
                ...response.data,
                user_id: userIdFromToken // Add parsed user_id to the response object
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Token exchange error response:', error.response?.data);
                throw new Error(`Failed to get access token from code: ${error.response?.data?.error_description || error.response?.data?.error || error.message}`);
            }
            console.error('Token exchange unexpected error:', error);
            throw error;
        }
    }

    // Refresh access token
    async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.apiKey,
            refresh_token: refreshToken
        });

        try {
            const response = await axios.post(
                'https://api.etsy.com/v3/public/oauth/token',
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            return response.data;
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || error.message;
            console.error('Error refreshing token:', {
                status: error.response?.status,
                data: error.response?.data,
                message: errorMessage
            });
            throw new Error(`Failed to refresh token: ${errorMessage}`);
        }
    }

    // Make authenticated API request
    private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = null, accessToken?: string): Promise<T> {
        const headers = this.getHeaders(accessToken);
        
        try {
            const response = await axios({
                method,
                url: `${this.baseURL}${endpoint}`,
                headers,
                data
            });
            
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`API request failed: ${error.response?.data?.error || error.message}`);
            }
            throw error;
        }
    }

    // Shop endpoints
    async getShopDetails(shopId: string, accessToken: string) {
        return this.makeRequest(`/application/shops/${shopId}`, 'GET', null, accessToken);
    }

    // Listing endpoints
    async getListings(shopId: string, accessToken: string) {
        return this.makeRequest(`/application/shops/${shopId}/listings/active`, 'GET', null, accessToken);
    }

    async createListing(shopId: string, listingData: any, accessToken: string) {
        return this.makeRequest(`/application/shops/${shopId}/listings`, 'POST', listingData, accessToken);
    }

    setAccessToken(token: string) {
        this.accessToken = token;
    }

    private getHeaders(accessToken?: string): Record<string, string> {
        const headers: Record<string, string> = {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };

        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        return headers;
    }

    // Get shops for a user
    async getUserShops(userId: number, accessToken: string): Promise<any> { // Define a more specific type if shop structure is known
        if (!userId) {
            throw new Error('User ID is required to fetch shops.');
        }
        const endpoint = `/application/users/${userId}/shops`;
        console.error(`[EtsyApiClient] Calling getUserShops. Endpoint: ${this.baseURL}${endpoint}`); // Log endpoint
        try {
            const response = await this.makeRequest(endpoint, 'GET', null, accessToken);
            console.error('[EtsyApiClient] Raw response from getUserShops:', JSON.stringify(response, null, 2)); // Log raw response
            return response;
        } catch (error) {
            console.error('[EtsyApiClient] Error in getUserShops:', error);
            throw error;
        }
    }

    // Get shipping profiles for a shop
    async getShopShippingProfiles(shopId: string, accessToken: string): Promise<any> {
        return this.makeRequest(`/application/shops/${shopId}/shipping-profiles`, 'GET', null, accessToken);
    }

    // Create a shipping profile for a shop
    async createShopShippingProfile(shopId: string, profileData: any, accessToken: string): Promise<any> {
        return this.makeRequest(`/application/shops/${shopId}/shipping-profiles`, 'POST', profileData, accessToken);
    }

    // Upload a listing image from a local file path
    async uploadListingImageFromFilePath(shopId: string, listingId: string, localImageFilePath: string, imageName: string, accessToken: string): Promise<any> {
        const endpoint = `/application/shops/${shopId}/listings/${listingId}/images`;
        logger.log(`[EtsyApiClient] Attempting to upload image from local path: "${localImageFilePath}" to endpoint: ${this.baseURL}${endpoint}`);

        try {
            // 1. Read the image from the local file path
            logger.log(`[EtsyApiClient] Reading image from ${localImageFilePath}`);
            if (!fs.existsSync(localImageFilePath)) {
                const notFoundError = new Error(`Image file not found at path: ${localImageFilePath}`);
                logger.error(`[EtsyApiClient] Image file not found at path: ${localImageFilePath}`, notFoundError);
                throw notFoundError;
            }
            const imageBuffer = fs.readFileSync(localImageFilePath);
            logger.log(`[EtsyApiClient] Image read, size: ${imageBuffer.length} bytes`);

            // 2. Create FormData and append the image
            const formData = new FormData();
            formData.append('image', imageBuffer, imageName);

            // 3. Make the POST request
            const headers: Record<string, string> = {
                'x-api-key': this.apiKey,
                'Authorization': `Bearer ${accessToken}`,
                ...formData.getHeaders(),
            };
            
            logger.log(`[EtsyApiClient] Uploading image to Etsy...`);
            const etsyResponse = await axios.post(`${this.baseURL}${endpoint}`, formData, { headers });
            logger.log('[EtsyApiClient] Image uploaded successfully from local path.', etsyResponse.data);
            return etsyResponse.data;

        } catch (error: any) { 
            const baseErrorMessage = `[EtsyApiClient] Error in uploadListingImageFromFilePath for file "${localImageFilePath}"`;
            const specificErrorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message || String(error);
            const fullMessage = `${baseErrorMessage}: ${specificErrorMessage}`;
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - Linter struggles with this specific logger.error call arguments
            logger.error(fullMessage, error); 
            throw new Error(`Failed to upload image from file "${localImageFilePath}": ${specificErrorMessage}`);
        }
    }
}

// Export a singleton instance
export const etsyApi = new EtsyApiClient();

config();

const ETSY_API_BASE_URL = 'https://api.etsy.com/v3';

export const etsyApiLegacy = {
  async getListings(shopId: string, accessToken: string) {
    try {
      const response = await axios.get(`${ETSY_API_BASE_URL}/application/shops/${shopId}/listings/active`, {
        headers: {
          'x-api-key': process.env.ETSY_API_KEY,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching listings:', error);
      throw error;
    }
  },

  async getShopDetails(shopId: string, accessToken: string) {
    try {
      const response = await axios.get(`${ETSY_API_BASE_URL}/application/shops/${shopId}`, {
        headers: {
          'x-api-key': process.env.ETSY_API_KEY,
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching shop details:', error);
      throw error;
    }
  },

  async createListing(shopId: string, listingData: any, accessToken: string) {
    try {
      const response = await axios.post(`${ETSY_API_BASE_URL}/application/shops/${shopId}/listings`, listingData, {
        headers: {
          'x-api-key': process.env.ETSY_API_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error creating listing:', error);
      throw error;
    }
  }
}; 