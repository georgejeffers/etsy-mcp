# Etsy MCP Server Documentation

## Overview

Etsy MCP Server is a Model Context Protocol (MCP) server. It provides tools to interact with the Etsy API. This server allows you to manage Etsy listings and shop details programmatically.

## Quick Start

### Installation

1.  Install Node.js and npm.
2.  Clone the repository.
3.  Navigate to the repository directory in your terminal.
4.  Install dependencies:

    ```bash
    npm install
    ```

### Configuration

1.  Create a `.env` file in the repository's root directory.
2.  Add your Etsy API credentials to `.env`. You can copy the `.env.example` file and modify it.

    ```
    ETSY_API_KEY=your_api_key
    ETSY_CLIENT_SECRET=your_client_secret
    ```
    Obtain your Etsy API key and client secret from the Etsy Developer portal.

### Running the Server

1.  Start the server:

    ```bash
    npm start
    ```
    For development with auto-reload:

    ```bash
    npm run dev
    ```

The server will now be running and accessible via MCP clients.

## Available Tools

The Etsy MCP Server exposes the following tools:

### `createListing`

Creates a new Etsy listing.

**Parameters:**

*   `shop_id` (number): The ID of the Etsy shop.
*   `access_token` (string): Etsy OAuth access token for authentication.
*   `listing_data` (object): Data for the new listing.
    *   `title` (string): Title of the listing.
    *   `description` (string): Description of the listing.
    *   `price` (number): Price of the listing.
    *   `quantity` (number): Quantity of items for sale.
    *   `who_made` (string): Who made the listing ('i\_did', 'someone\_else', 'collective').
    *   `when_made` (string): When it was made ('made\_to\_order', '2020\_2024', etc.).
    *   `taxonomy_id` (number): Etsy category ID.
    *   `type` (string): Listing type ('physical' or 'digital').

### `getListings`

Retrieves all listings for a given Etsy shop.

**Parameters:**

*   `shop_id` (number): The ID of the Etsy shop.
*   `access_token` (string): Etsy OAuth access token for authentication.

### `getShopDetails`

Retrieves details of a specific Etsy shop.

**Parameters:**

*   `shop_id` (number): The ID of the Etsy shop.
*   `access_token` (string): Etsy OAuth access token for authentication.

## Dependencies

*   `@modelcontextprotocol/sdk`: Model Context Protocol SDK for server implementation.
*   `axios`: HTTP client for making requests to the Etsy API.
*   `dotenv`: Loads environment variables from `.env` file.
*   `zod`: Schema validation library.

## Advanced Usage

This documentation covers the basic setup and usage. For advanced configurations or extending the server, refer to the code and the Model Context Protocol SDK documentation.

## Example Usage

### Creating a New Listing

```typescript
const listingData = {
  title: "Handmade Ceramic Mug",
  description: "Beautiful handcrafted ceramic mug with unique design",
  price: 25.00,
  quantity: 1,
  who_made: "i_did",
  when_made: "2020_2024",
  taxonomy_id: 1234, // Replace with actual Etsy category ID
  type: "physical"
};

const params = {
  shop_id: 123456789,
  access_token: "your_access_token",
  listing_data: listingData
};

// Call the createListing tool
const response = await mcpServer.callTool('createListing', params);
```

### Getting Shop Listings

```typescript
const params = {
  shop_id: 123456789,
  access_token: "your_access_token"
};

// Call the getListings tool
const listings = await mcpServer.callTool('getListings', params);
```

## Error Handling

The server implements standard error handling for all API calls:

- All errors are returned in JSON-RPC 2.0 format
- Error responses include:
  - `code`: Error code (-32000 for server errors)
  - `message`: Detailed error message
  - `isError`: Set to true for error responses

Example error response:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Invalid access token"
  }
}
```

## Troubleshooting

Common issues and solutions:

1. **Authentication Errors**
   - Ensure your access token is valid and not expired
   - Check that your API credentials are correctly set in the .env file

2. **Invalid Shop ID**
   - Verify that the shop_id exists and belongs to your account
   - Ensure you have the necessary permissions to access the shop

3. **Rate Limiting**
   - The Etsy API has rate limits
   - Implement appropriate delays between requests if making multiple calls

4. **Server Connection Issues**
   - Check your internet connection
   - Verify the server is running and accessible
   - Check the server logs for any error messages

## Support

For additional support:
- Refer to the [Etsy API Documentation](https://www.etsy.com/developers/documentation/getting_started/oauth)
- Check the [Model Context Protocol Documentation](https://github.com/modelcontextprotocol/sdk)
- Review the project's GitHub issues for known problems and solutions