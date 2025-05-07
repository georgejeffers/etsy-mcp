import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Protocol } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { OAuthServer } from './oauthServer.js';
import { etsyApi } from './etsyApi.js';
import { TokenStorage } from './tokenStorage.js';
import { z } from 'zod';
import open from 'open';
import { logger } from '../utils/logger.js';
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // Import fileURLToPath

export class EtsyMCPServer {
  private server: McpServer;
  private oauthServer: OAuthServer;
  private tokenStorage: TokenStorage;

  constructor(oauthServer: OAuthServer) {
    this.oauthServer = oauthServer;
    this.tokenStorage = TokenStorage.getInstance();
    this.server = new McpServer({
      name: 'Etsy API',
      version: '1.0.0',
      capabilities: {
        toolCalling: true,
        fileHandling: false,
      }
    });

    this.setupTools();
  }

  private setupTools() {
    // Define schemas
    const authenticateSchema = z.object({});
    const getListingsSchema = z.object({ shop_id: z.number() });
    const getShopDetailsSchema = z.object({ shop_id: z.number() });
    const createListingSchema = z.object({
      shop_id: z.number().optional().describe("The ID of the shop. If not provided, uses the default shop."),
      listing_data: z.object({
        title: z.string(),
        description: z.string(),
        price: z.number(),
        quantity: z.number(),
        who_made: z.string().describe("e.g., 'i_did', 'collective', 'someone_else'"),
        when_made: z.string().describe("e.g., 'made_to_order', '2020_2024', '1950_1959'"),
        taxonomy_id: z.number().describe("The numeric ID of the listing's category."),
        shipping_profile_id: z.number().int().optional().describe("The numeric ID of the shipping profile. Required if type is 'physical'."),
        type: z.enum(["physical", "digital", "download"]).describe("Listing type: 'physical', 'digital', or 'download'. 'physical' requires a shipping_profile_id.")
        // Add other relevant fields like materials, tags, image_ids as needed for a complete listing
      }).refine(data => {
        if (data.type === "physical" && data.shipping_profile_id === undefined) {
          return false;
        }
        return true;
      }, {
        message: "shipping_profile_id is required when listing type is 'physical'. Use list_shop_shipping_profiles or create_shop_shipping_profile.",
        path: ["shipping_profile_id"],
      })
    });

    // Authenticate Tool - Initiates the OAuth flow
    this.server.tool(
      'authenticate',
      'Initiate authentication with Etsy via browser.',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      authenticateSchema.shape,
      async (args: z.infer<typeof authenticateSchema>, extra: unknown) => {
        try {
          // Ensure OAuth server is running
          await this.oauthServer.start(); 
          const authUrl = this.oauthServer.getAuthInitiationUrl();
          logger.log(`Generated auth initiation URL: ${authUrl}`);

          // The MCP client should handle opening this URL.
          // We return the URL and instructions.
          return {
            content: [{
              type: 'text' as const,
              text: `Please visit this URL to authorize the application: ${authUrl}\nComplete the process in your browser. You can then use other tools.`
            }]
          };
        } catch (error) {
          logger.error('Authentication initiation error:', error);
          return this.handleError(error, 'Failed to initiate authentication');
        }
      }
    );

    // Tool to set/discover the default Etsy shop for the authenticated user
    const setDefaultShopSchema = z.object({}); // No input args for now, could add shop_id later for explicit setting
    this.server.tool(
      'set_default_shop',
      'Fetches your Etsy shops and sets the first one found as default. If you have multiple shops, it will use the first one returned by Etsy.',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      setDefaultShopSchema.shape,
      async (args: z.infer<typeof setDefaultShopSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required. Please run authenticate first.'));
          }

          const tokens = this.tokenStorage.getTokens(); // Get full token data including potential user_id
          if (!tokens?.user_id) {
            // This might happen if user_id wasn't parsed/stored correctly during token exchange.
            // Or if old tokens exist without user_id.
            // Attempt to re-fetch tokens by a pseudo-refresh if refresh_token exists, or re-auth.
            return this.handleError(new Error('User ID not found. Please try to re-authenticate.'));
          }

          const userShopsResponse = await etsyApi.getUserShops(tokens.user_id, accessToken);
          
          // Handle both possible response structures from Etsy API for user shops
          let shopToSet: any = null;
          if (userShopsResponse && userShopsResponse.results && userShopsResponse.count > 0) {
              // Case 1: Etsy returns a list of shops
              shopToSet = userShopsResponse.results[0]; 
              logger.log(`[set_default_shop] Automatically selected shop (from list): ${shopToSet.shop_name} (ID: ${shopToSet.shop_id})`);
          } else if (userShopsResponse && userShopsResponse.shop_id) {
              // Case 2: Etsy returns a single shop object directly
              shopToSet = userShopsResponse; 
              logger.log(`[set_default_shop] Automatically selected shop (single object): ${shopToSet.shop_name} (ID: ${shopToSet.shop_id})`);
          } 

          if (!shopToSet) {
            logger.log('[set_default_shop] No shops found for the user or unexpected response structure from getUserShops.');
            return {
              content: [{ type: 'text' as const, text: 'No shops found for your Etsy account.' }]
            };
          }

          // If userShopsResponse.count > 1 (and we got a list), could add logic here to prompt user.
          // For now, we just proceed with shopToSet which is results[0] or the single object.

          const shopId = shopToSet.shop_id;
          const shopName = shopToSet.shop_name;

          // Save to token storage
          await this.tokenStorage.saveTokens({
            ...tokens, // Preserve existing tokens (access, refresh, expiry)
            user_id: tokens.user_id,
            shop_id: shopId,
            shop_name: shopName
          });

          return {
            content: [{
              type: 'text' as const,
              text: `Default shop set to: ${shopName} (ID: ${shopId}). Other tools will now use this shop unless a specific shop_id is provided.`
            }]
          };

        } catch (error) {
          logger.error('Error in set_default_shop:', error);
          return this.handleError(error, 'Failed to set default shop.');
        }
      }
    );

    // Tool to get the currently set default Etsy shop
    const getDefaultShopSchema = z.object({});
    this.server.tool(
      'get_default_shop',
      'Gets the currently configured default Etsy shop ID and name.',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      getDefaultShopSchema.shape,
      async (args: z.infer<typeof getDefaultShopSchema>, extra: unknown) => {
        try {
          const tokens = this.tokenStorage.getTokens();
          if (!tokens?.shop_id) {
            return {
              content: [{ type: 'text' as const, text: 'No default shop is currently set. Please run the `set_default_shop` tool after authenticating.' }]
            };
          }
          return {
            content: [{
              type: 'text' as const,
              text: `Current default shop: ${tokens.shop_name || 'N/A'} (ID: ${tokens.shop_id})`
            }]
          };
        } catch (error) {
          logger.error('Error in get_default_shop:', error);
          return this.handleError(error, 'Failed to get default shop.');
        }
      }
    );

    // Get Listings Tool
    this.server.tool(
      'get_listings',
      'Get all active listings for a shop',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      getListingsSchema.shape,
      async (args: z.infer<typeof getListingsSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required. Please run the authenticate tool.'));
          }

          let shopIdToUse = args.shop_id;
          if (!shopIdToUse) {
            const storedTokens = this.tokenStorage.getTokens();
            if (storedTokens?.shop_id) {
              shopIdToUse = storedTokens.shop_id;
              logger.log(`Using default shop ID: ${shopIdToUse} for get_listings`);
            } else {
              return this.handleError(new Error('Shop ID is required. Provide a shop_id or run `set_default_shop` first.'));
            }
          }

          const listings = await etsyApi.getListings(shopIdToUse.toString(), accessToken);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(listings, null, 2) }]
          };
        } catch (error) {
          return this.handleError(error);
        }
      }
    );

    // Get Shop Details Tool
    this.server.tool(
      'get_shop_details',
      'Get details for a specific shop',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      getShopDetailsSchema.shape,
      async (args: z.infer<typeof getShopDetailsSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required. Please run the authenticate tool.'));
          }

          let shopIdToUse = args.shop_id;
          if (!shopIdToUse) {
            const storedTokens = this.tokenStorage.getTokens();
            if (storedTokens?.shop_id) {
              shopIdToUse = storedTokens.shop_id;
              logger.log(`Using default shop ID: ${shopIdToUse} for get_shop_details`);
            } else {
              return this.handleError(new Error('Shop ID is required. Provide a shop_id or run `set_default_shop` first.'));
            }
          }

          const shopDetails = await etsyApi.getShopDetails(shopIdToUse.toString(), accessToken);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(shopDetails, null, 2) }]
          };
        } catch (error) {
          return this.handleError(error);
        }
      }
    );

    // Create Listing Tool
    this.server.tool(
      'create_listing',
      'Creates a new Etsy listing. For physical items, ensure you have a shipping_profile_id. To add images, create the listing first, then use the `upload_listing_image` tool with the returned listing_id.',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      createListingSchema.shape,
      async (args: z.infer<typeof createListingSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required. Please run the authenticate tool.'));
          }

          let shopIdToUse = args.shop_id;
          if (!shopIdToUse) {
            const storedTokens = this.tokenStorage.getTokens();
            if (storedTokens?.shop_id) {
              shopIdToUse = storedTokens.shop_id;
              logger.log(`Using default shop ID: ${shopIdToUse} for create_listing`);
            } else {
              return this.handleError(new Error('Shop ID is required. Provide a shop_id or run `set_default_shop` first.'));
            }
          }

          // Ensure listing_data structure matches API expectations if needed
          const listingData = {
            title: args.listing_data.title,
            description: args.listing_data.description,
            price: args.listing_data.price, 
            quantity: args.listing_data.quantity,
            who_made: args.listing_data.who_made,
            when_made: args.listing_data.when_made,
            taxonomy_id: args.listing_data.taxonomy_id,
            shipping_profile_id: args.listing_data.shipping_profile_id, // Pass it through
            type: args.listing_data.type
            // image_ids: args.listing_data.image_ids, // Example if you add image handling
            // materials: args.listing_data.materials // Example
          };
          
          type ListingDataKeys = keyof typeof listingData;
          // Remove undefined optional fields so they are not sent as null, esp. shipping_profile_id if not physical
          (Object.keys(listingData) as Array<ListingDataKeys>).forEach(key => {
            if (listingData[key] === undefined) {
              delete listingData[key];
            }
          });

          const newListing = await etsyApi.createListing(
            shopIdToUse.toString(),
            listingData,
            accessToken
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(newListing, null, 2) }]
          };
        } catch (error) {
          return this.handleError(error);
        }
      }
    );

    // --- Shipping Profile Tools ---

    // List Shop Shipping Profiles Tool
    const listShopShippingProfilesSchema = z.object({
      shop_id: z.number().optional().describe("The ID of the shop. If not provided, uses the default shop.")
    });
    this.server.tool(
      'list_shop_shipping_profiles',
      'Lists all shipping profiles for a given shop (or the default shop).',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      listShopShippingProfilesSchema.shape,
      async (args: z.infer<typeof listShopShippingProfilesSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required.'));
          }

          let shopIdToUse = args.shop_id;
          if (!shopIdToUse) {
            const storedTokens = this.tokenStorage.getTokens();
            if (storedTokens?.shop_id) {
              shopIdToUse = storedTokens.shop_id;
            } else {
              return this.handleError(new Error('Shop ID is required. Provide a shop_id or run `set_default_shop` first.'));
            }
          }

          const profiles = await etsyApi.getShopShippingProfiles(shopIdToUse.toString(), accessToken);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(profiles, null, 2) }]
          };
        } catch (error) {
          return this.handleError(error, 'Failed to list shipping profiles.');
        }
      }
    );

    // Create Shop Shipping Profile Tool
    const createShopShippingProfileSchema = z.object({
      shop_id: z.number().optional().describe("The ID of the shop. If not provided, uses the default shop."),
      title: z.string().describe("A title for the shipping profile (e.g., 'US Standard', 'EU Express')."),
      origin_country_iso: z.string().length(2).describe("The ISO code of the country from which the listing ships (e.g., 'US', 'GB')."),
      primary_cost: z.number().min(0).describe("The cost of shipping to this destination alone."),
      secondary_cost: z.number().min(0).describe("The cost of shipping to this destination with another item."),
      min_processing_time: z.number().int().min(1).describe("Minimum time (in days) to process the order."),
      max_processing_time: z.number().int().min(1).describe("Maximum time (in days) to process the order."),
      destination_country_iso: z.string().length(2).optional().describe("ISO code for a specific destination country (e.g., 'US', 'CA'). Use either this or destination_region."),
      destination_region: z.enum(["eu", "non_eu", "none"]).optional().describe("A specific destination region ('eu', 'non_eu', 'none'). Use either this or destination_country_iso.")
      // Note: Etsy API might have more fields like currency, handling fees etc. This is a basic set.
    }).refine(data => !!data.destination_country_iso !== !!data.destination_region, {
      message: "Either destination_country_iso OR destination_region must be provided, but not both.",
      path: ["destination_country_iso"], // Or path: ["destination_region"]
    });

    this.server.tool(
      'create_shop_shipping_profile',
      'Creates a new shipping profile for a shop.',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      createShopShippingProfileSchema.shape,
      async (args: z.infer<typeof createShopShippingProfileSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required.'));
          }

          let shopIdToUse = args.shop_id;
          if (!shopIdToUse) {
            const storedTokens = this.tokenStorage.getTokens();
            if (storedTokens?.shop_id) {
              shopIdToUse = storedTokens.shop_id;
            } else {
              return this.handleError(new Error('Shop ID is required. Provide a shop_id or run `set_default_shop` first.'));
            }
          }
          
          type ProfileDataKeys = 'title' | 'origin_country_iso' | 'primary_cost' | 'secondary_cost' | 'min_processing_time' | 'max_processing_time' | 'destination_country_iso' | 'destination_region';
          const profileData: Record<ProfileDataKeys, string | number | undefined> = {
            title: args.title,
            origin_country_iso: args.origin_country_iso,
            primary_cost: args.primary_cost.toString(), // Etsy API expects costs as strings
            secondary_cost: args.secondary_cost.toString(), // Etsy API expects costs as strings
            min_processing_time: args.min_processing_time,
            max_processing_time: args.max_processing_time,
            destination_country_iso: args.destination_country_iso,
            destination_region: args.destination_region
          };

          // Remove undefined optional fields so they are not sent as null
          (Object.keys(profileData) as Array<ProfileDataKeys>).forEach(key => {
            if (profileData[key] === undefined) {
              delete profileData[key];
            }
          });

          const newProfile = await etsyApi.createShopShippingProfile(shopIdToUse.toString(), profileData, accessToken);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(newProfile, null, 2) }]
          };
        } catch (error) {
          return this.handleError(error, 'Failed to create shipping profile.');
        }
      }
    );

    // --- Image Upload Tool ---
    const uploadListingImageSchema = z.object({
      shop_id: z.number().optional().describe("Shop ID. Uses default if not provided."),
      listing_id: z.number().int().describe("The ID of the listing to add the image to."),
      file_name: z.string().describe("The name of the image file (e.g., 'my_image.jpg') to be sourced based on server configuration."),
      image_name: z.string().optional().describe("The desired filename for the image on Etsy (e.g., 'etsy_image_name.jpg'). Defaults to file_name if not provided.")
    });

    this.server.tool(
      'upload_listing_image',
      'Uploads an image from a configured server directory and associates it with an Etsy listing.',
      // @ts-ignore - SDK types seem incompatible with Zod schema/shape
      uploadListingImageSchema.shape,
      async (args: z.infer<typeof uploadListingImageSchema>, extra: unknown) => {
        try {
          const accessToken = await this.getValidAccessToken();
          if (!accessToken) {
            return this.handleError(new Error('Authentication required.'));
          }

          let shopIdToUse = args.shop_id;
          if (!shopIdToUse) {
            const storedTokens = this.tokenStorage.getTokens();
            if (storedTokens?.shop_id) {
              shopIdToUse = storedTokens.shop_id;
            } else {
              return this.handleError(new Error('Shop ID is required. Provide a shop_id or run `set_default_shop` first.'));
            }
          }

          // Construct the full path to the local image file
          // Get the directory of the current module (mcpServer.ts)
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          // Navigate up to the project root (assuming mcpServer.ts is in src/services/)
          // and then to the public/uploads/listing_images directory.
          // const projectRootDir = path.resolve(__dirname, '..', '..'); 
          // const localImageDir = path.join(projectRootDir, 'public', 'uploads', 'listing_images');
          // const localImageFilePath = path.join(localImageDir, args.file_name);

          const imageSourceDir = process.env.ETSY_IMAGE_SOURCE_DIR;
          if (!imageSourceDir) {
            logger.error('[upload_listing_image] ETSY_IMAGE_SOURCE_DIR environment variable is not set.', new Error('ETSY_IMAGE_SOURCE_DIR not set'));
            return this.handleError(new Error('Image source directory is not configured in the server environment.'), 'Failed to upload listing image.');
          }
          const localImageFilePath = path.join(imageSourceDir, args.file_name);

          logger.log(`[upload_listing_image] Constructed image path: ${localImageFilePath}`);

          const imageNameOnEtsy = args.image_name || args.file_name; // Use provided name or fallback to original filename

          // ... rest of the function ...
        } catch (error) {
          return this.handleError(error);
        }
      }
    );
  }

  private async getValidAccessToken(): Promise<string | null> {
    let tokens = this.tokenStorage.getTokens();

    // If TokenStorage.getTokens() returns a token, it's considered valid (non-expired)
    // based on its internal logic (which might check expires_at).
    if (tokens?.access_token) {
        return tokens.access_token;
    }

    // If no valid token from getTokens(), try to load even if potentially expired to use refresh_token
    const potentiallyExpiredTokens = this.tokenStorage.loadPotentiallyExpiredTokens();
    if (potentiallyExpiredTokens?.refresh_token) {
        logger.log('Access token expired or missing, attempting refresh...');
        try {
            const refreshedTokensResponse = await etsyApi.refreshToken(potentiallyExpiredTokens.refresh_token);
            
            // Preserve user_id, shop_id, and shop_name from the old tokens
            const user_id = potentiallyExpiredTokens.user_id;
            const shop_id = potentiallyExpiredTokens.shop_id;
            const shop_name = potentiallyExpiredTokens.shop_name;

            await this.tokenStorage.saveTokens({
                access_token: refreshedTokensResponse.access_token,
                refresh_token: refreshedTokensResponse.refresh_token, // Etsy usually sends back a new refresh token
                expires_at: Date.now() + (refreshedTokensResponse.expires_in * 1000),
                user_id: user_id, // Preserve
                shop_id: shop_id, // Preserve
                shop_name: shop_name // Preserve
            });
            etsyApi.setAccessToken(refreshedTokensResponse.access_token);
            logger.log('Token refresh successful.');
            return refreshedTokensResponse.access_token;
        } catch (refreshError) {
            logger.error('Token refresh failed:', refreshError);
            this.tokenStorage.clearTokens(); // Clear invalid tokens
            return null; // Refresh failed
        }
    }
    
    // No valid token and no refresh token available
    return null;
  }

  private handleError(error: unknown, customMessage?: string) {
    const errorMessage = customMessage || (error instanceof Error ? error.message : String(error));
    // Ensure the second argument to logger.error is an Error object or undefined/similar
    const errorForLogging = error instanceof Error ? error : new Error(String(error));
    logger.error(`MCP Tool Error: ${errorMessage}`, errorForLogging);
    return {
      content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
      isError: true
    };
  }

  async start() {
    // ... existing code ...
  }
}