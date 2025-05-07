import { EtsyMCPServer } from '../mcpServer.js';
import { OAuthServer } from '../oauthServer.js';
import { TokenStorage } from '../tokenStorage.js';
import { etsyApi } from '../etsyApi.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

jest.mock('../oauthServer.js');
jest.mock('../tokenStorage.js');
jest.mock('../etsyApi.js');
jest.mock('@modelcontextprotocol/sdk/server/index.js');

describe('EtsyMCPServer', () => {
    let mcpServer: EtsyMCPServer;
    let mockOAuthServer: jest.Mocked<OAuthServer>;
    let mockTokenStorage: jest.Mocked<TokenStorage>;
    let mockEtsyApi: jest.Mocked<typeof etsyApi>;
    let mockServer: jest.Mocked<Server>;

    beforeEach(() => {
        mockOAuthServer = {
            start: jest.fn(),
            stop: jest.fn(),
            getAuthUrl: jest.fn()
        } as any;

        mockTokenStorage = {
            getTokens: jest.fn(),
            setTokens: jest.fn()
        } as any;

        mockEtsyApi = {
            getListings: jest.fn(),
            getShopDetails: jest.fn(),
            createListing: jest.fn()
        } as any;

        mockServer = {
            setRequestHandler: jest.fn(),
            connect: jest.fn(),
            close: jest.fn()
        } as any;

        (Server as jest.Mock).mockImplementation(() => mockServer);
        (OAuthServer as jest.Mock).mockImplementation(() => mockOAuthServer);
        (TokenStorage.getInstance as jest.Mock).mockReturnValue(mockTokenStorage);

        mcpServer = new EtsyMCPServer(mockOAuthServer);
    });

    describe('Server Initialization', () => {
        it('should initialize with correct name and version', () => {
            expect(Server).toHaveBeenCalledWith({
                name: 'Etsy API',
                version: '1.0.0',
                capabilities: expect.any(Object)
            });
        });
    });

    describe('Tool Capabilities', () => {
        it('should have correct authentication tool capabilities', () => {
            const capabilities = (Server as jest.Mock).mock.calls[0][0].capabilities.tools;
            expect(capabilities['mcp.authenticate']).toEqual({
                description: 'Authenticate with Etsy API. This will open a browser window for OAuth authentication.',
                parameters: {
                    type: 'object',
                    properties: {}
                }
            });
        });

        it('should have correct get listings tool capabilities', () => {
            const capabilities = (Server as jest.Mock).mock.calls[0][0].capabilities.tools;
            expect(capabilities['mcp.get_listings']).toEqual({
                description: 'Get all listings for a shop',
                parameters: {
                    type: 'object',
                    properties: {
                        shop_id: {
                            type: 'number',
                            description: 'The ID of the Etsy shop'
                        }
                    },
                    required: ['shop_id']
                }
            });
        });

        it('should have correct create listing tool capabilities', () => {
            const capabilities = (Server as jest.Mock).mock.calls[0][0].capabilities.tools;
            expect(capabilities['mcp.create_listing']).toEqual({
                description: 'Create a new Etsy listing',
                parameters: {
                    type: 'object',
                    properties: {
                        shop_id: {
                            type: 'number',
                            description: 'The ID of the Etsy shop'
                        },
                        listing_data: {
                            type: 'object',
                            properties: {
                                title: {
                                    type: 'string',
                                    description: 'Title of the listing'
                                },
                                description: {
                                    type: 'string',
                                    description: 'Description of the listing'
                                },
                                price: {
                                    type: 'number',
                                    description: 'Price of the listing'
                                },
                                quantity: {
                                    type: 'number',
                                    description: 'Quantity available'
                                },
                                who_made: {
                                    type: 'string',
                                    description: 'Who made the item (i_did, collective, someone_else)'
                                },
                                when_made: {
                                    type: 'string',
                                    description: 'When the item was made (made_to_order, 2020_2024, etc)'
                                },
                                taxonomy_id: {
                                    type: 'number',
                                    description: 'Etsy category ID'
                                },
                                type: {
                                    type: 'string',
                                    description: 'Type of listing (physical or digital)'
                                }
                            },
                            required: ['title', 'description', 'price', 'quantity', 'who_made', 'when_made', 'taxonomy_id', 'type']
                        }
                    },
                    required: ['shop_id', 'listing_data']
                }
            });
        });
    });

    describe('Request Handlers', () => {
        it('should handle authentication request', async () => {
            const authUrl = 'http://localhost:3003/auth';

            mockOAuthServer.start.mockResolvedValue(undefined);
            mockOAuthServer.getAuthInitiationUrl.mockReturnValue(authUrl);

            const request = {
                method: 'tools/call',
                params: {
                    name: 'mcp.authenticate',
                    arguments: {}
                }
            };
            const signal = new AbortController().signal;

            // Get the handler function that was registered
            const handler = mockServer.setRequestHandler.mock.calls[0][1];
            const result = await handler(request, { signal });

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Please complete the authentication in your browser. The window will close automatically when done.'
                }]
            });
        });

        it('should handle get listings request', async () => {
            const mockListings = [{ id: 1, title: 'Test Listing' }];
            mockTokenStorage.getTokens.mockReturnValue({ access_token: 'test-token' });
            mockEtsyApi.getListings.mockResolvedValue(mockListings);

            const request = {
                method: 'tools/call',
                params: {
                    name: 'mcp.get_listings',
                    arguments: {
                        shop_id: 123
                    }
                }
            };
            const signal = new AbortController().signal;

            // Get the handler function that was registered
            const handler = mockServer.setRequestHandler.mock.calls[1][1];
            const result = await handler(request, { signal });

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: JSON.stringify(mockListings, null, 2)
                }]
            });
        });

        it('should handle get shop details request', async () => {
            const mockShopDetails = { id: 123, name: 'Test Shop' };
            mockTokenStorage.getTokens.mockReturnValue({ access_token: 'test-token' });
            mockEtsyApi.getShopDetails.mockResolvedValue(mockShopDetails);

            const request = {
                method: 'tools/call',
                params: {
                    name: 'mcp.get_shop_details',
                    arguments: {
                        shop_id: 123
                    }
                }
            };
            const signal = new AbortController().signal;

            // Get the handler function that was registered
            const handler = mockServer.setRequestHandler.mock.calls[2][1];
            const result = await handler(request, { signal });

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: JSON.stringify(mockShopDetails, null, 2)
                }]
            });
        });

        it('should handle create listing request', async () => {
            const mockNewListing = { id: 1, title: 'New Listing' };
            mockTokenStorage.getTokens.mockReturnValue({ access_token: 'test-token' });
            mockEtsyApi.createListing.mockResolvedValue(mockNewListing);

            const request = {
                method: 'tools/call',
                params: {
                    name: 'mcp.create_listing',
                    arguments: {
                        shop_id: 123,
                        listing_data: {
                            title: 'Test Listing',
                            description: 'Test Description',
                            price: 10,
                            quantity: 1,
                            who_made: 'i_did',
                            when_made: '2020_2024',
                            taxonomy_id: 1,
                            type: 'physical'
                        }
                    }
                }
            };
            const signal = new AbortController().signal;

            // Get the handler function that was registered
            const handler = mockServer.setRequestHandler.mock.calls[3][1];
            const result = await handler(request, { signal });

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: JSON.stringify(mockNewListing, null, 2)
                }]
            });
        });

        it('should handle unauthenticated request', async () => {
            mockTokenStorage.getTokens.mockReturnValue(null);

            const request = {
                method: 'tools/call',
                params: {
                    name: 'mcp.get_listings',
                    arguments: {
                        shop_id: 123
                    }
                }
            };
            const signal = new AbortController().signal;

            // Get the handler function that was registered
            const handler = mockServer.setRequestHandler.mock.calls[1][1];
            const result = await handler(request, { signal });

            expect(result).toEqual({
                content: [{
                    type: 'text',
                    text: 'Not authenticated. Please authenticate first.'
                }],
                isError: true
            });
        });
    });
}); 