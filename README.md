# Etsy MCP Server

An MCP (Model Context Protocol) server for interacting with the Etsy API. This service handles authentication, API calls to Etsy for managing listings, shop details, shipping profiles, and image uploads.

## Overview

This service provides a set of tools accessible via the Model Context Protocol (MCP) to interact with the Etsy V3 API. It manages the OAuth 2.0 authentication flow (including PKCE token refresh), stores tokens securely, and exposes functionalities like creating listings, fetching shop data, managing shipping profiles, and uploading images. The goal is to simplify interactions with the Etsy API for MCP-compatible clients.

This MCP server is primarily designed for development and tool integration. Please ensure you comply with Etsy's API Terms of Use.

## Features

- 🔑 **OAuth2 Authentication**: Handles the complete Etsy OAuth2 flow with PKCE.
- 🛍️ **Listing Management**: Create, and retrieve Etsy listings.
- ℹ️ **Shop Information**: Fetch details for your Etsy shop.
- 📦 **Shipping Profiles**: List and create shipping profiles for your shop.
- 🖼️ **Image Uploads**: Upload images and associate them with your listings.
- 🔧 **Default Shop Management**: Set and get a default shop for easier multi-shop use.
- 🔒 **Secure Token Storage**: Persists OAuth tokens securely.

## Installation

### Prerequisites

- Node.js (version 18.0.0 or higher recommended - see `package.json` engines)
- npm (usually comes with Node.js) or yarn

### Manual Installation

1.  **Clone the repository** (replace with your repository URL if you host it on GitHub/GitLab etc.):
    ```bash
    git clone <your-repository-url>
    cd etsy-mcp
    ```
    (If you're working locally, you can skip the clone and just `cd` into the project directory.)

2.  **Install dependencies**:
    ```bash
    npm install
    ```
    Or if you use yarn:
    ```bash
    yarn install
    ```

3.  **Configure Environment Variables**:
    Copy the `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    Then, open `.env` and fill in your Etsy App credentials:
    ```
    ETSY_API_KEY=YOUR_ETSY_APP_API_KEY
    ETSY_CLIENT_SECRET=YOUR_ETSY_APP_CLIENT_SECRET
    # Optional: define a specific host and port for the OAuth callback redirect URI
    # ETSY_MCP_HOST=localhost
    # ETSY_MCP_OAUTH_PORT=3003
    # ETSY_MCP_REDIRECT_URI=http://localhost:3003/oauth/callback
    # Optional: define a custom path for token storage and logs
    # ETSY_MCP_TOKEN_PATH=/path/to/your/token_storage_directory
    # ETSY_MCP_LOG_PATH=/path/to/your/logs_directory
    ```
    **Note**: The `REDIRECT_URI` in your `.env` file (or the default `http://localhost:3003/oauth/callback`) **must** match one of the redirect URIs configured for your Etsy App.

## Usage

### Run the Service

-   **For production/built version**:
    ```bash
    npm run build
    npm start
    ```
-   **For development with auto-reload**:
    ```bash
    npm run dev
    ```
This will launch the server, which listens for MCP commands, typically via standard input/output.

### Use in Cursor IDE (or other MCP Clients)

To use this Etsy MCP server with an MCP client like Cursor IDE, you'll typically provide a JSON configuration.

In Cursor settings, navigate to the MCP tab, click "+ Add new global MCP server", and input:
```json
{
    "mcpServers": {
        "Etsy MCP": {
            "command": "npm",
            "args": ["run", "dev"],
            "env": {
                "ETSY_API_KEY": "YOUR_ETSY_API_KEY_HERE",
                "ETSY_CLIENT_SECRET": "YOUR_ETSY_CLIENT_SECRET_HERE"
                // Add other ENV VARS from your .env if needed, e.g., REDIRECT_URI
                // "REDIRECT_URI": "http://localhost:3003/oauth/callback"
            },
            "cwd": "/Users/name/Desktop/repos/ai gemini apps/etsy_api/etsy-mcp" // IMPORTANT: Update this to the correct absolute path of your project
        }
    }
}
```
**Key points for the client configuration**:
-   **`command` & `args`**: The example uses `npm run dev` for development. For a production setup, you might use `npm start` (which implies `npm run build` first if not already built).
-   **`env`**:
    -   Replace `YOUR_ETSY_API_KEY_HERE` and `YOUR_ETSY_CLIENT_SECRET_HERE` with your actual credentials if you don't want to rely on the `.env` file being picked up by the `npm run dev` script's environment. It's generally better to let the server pick up credentials from its `.env` file. The example above is for overriding or ensuring they are set for the client's execution context.
-   **`cwd`**: **Crucially, update this to the absolute path** where your `etsy-mcp` project is located on your machine.
-   The `tools` array can also be defined here, but the server itself reports its capabilities, so it's often not strictly needed in the client-side static configuration if the client can dynamically fetch them.

## API Reference

The service provides the following MCP tools. Parameters are based on Zod schemas defined in the server.

### `authenticate()`
Initiates the OAuth2 authentication flow with Etsy.
- **Description**: Starts the authentication process. The server will return a URL that you need to open in a browser to grant access to your Etsy account.
- **Parameters**: None.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Please visit this URL to authorize the application: https://www.etsy.com/oauth/connect?response_type=code&client_id=YOUR_API_KEY...\nComplete the process in your browser. You can then use other tools."
    }
  ]
}
```

### `set_default_shop()`
Fetches your Etsy shops and sets the first one found as the default for this session.
- **Description**: After successful authentication, use this tool to select a default shop. If you have multiple shops, it will automatically use the first one returned by Etsy. This default shop will be used by other tools unless a `shop_id` is explicitly provided to them.
- **Parameters**: None.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Default shop set to: YourShopName (ID: 12345678). Other tools will now use this shop unless a specific shop_id is provided."
    }
  ]
}
```
Or if no shops are found:
```json
{
  "content": [
    {
      "type": "text",
      "text": "No shops found for your Etsy account."
    }
  ]
}
```

### `get_default_shop()`
Gets the currently configured default Etsy shop ID and name.
- **Description**: Use this to check which shop is currently set as the default.
- **Parameters**: None.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Current default shop: YourShopName (ID: 12345678)"
    }
  ]
}
```
Or if no default shop is set:
```json
{
  "content": [
    {
      "type": "text",
      "text": "No default shop is currently set. Please run the `set_default_shop` tool after authenticating."
    }
  ]
}
```

### `get_listings(shop_id?: number)`
Get all active listings for a shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"count\": 1,\n  \"results\": [\n    {\n      \"listing_id\": 123456789,\n      \"user_id\": 98765432,\n      \"shop_id\": 12345678,\n      \"title\": \"Handmade Ceramic Mug\",\n      \"description\": \"A beautiful handmade ceramic mug...\",\n      \"state\": \"active\",\n      \"price\": { \"amount\": 2500, \"divisor\": 100, \"currency_code\": \"USD\" },\n      \"quantity\": 5,\n      /* ... other listing fields ... */\n    }\n  ]\n}"
    }
  ]
}
```

### `get_shop_details(shop_id?: number)`
Get details for a specific shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"shop_id\": 12345678,\n  \"shop_name\": \"YourShopName\",\n  \"user_id\": 98765432,\n  \"title\": \"Unique Handmade Goods\",\n  \"status\": \"active\",\n  /* ... other shop fields ... */\n}"
    }
  ]
}
```

### `create_listing(shop_id?: number, listing_data: object)`
Creates a new Etsy listing.
- **Description**: For physical items, ensure you have a `shipping_profile_id`. To add images, create the listing first, then use the `upload_listing_image` tool with the returned `listing_id`.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
    - `listing_data` (object):
        - `title` (string): Listing title.
        - `description` (string): Listing description.
        - `price` (number): Listing price (e.g., 25.99).
        - `quantity` (number): Available quantity.
        - `who_made` (string): e.g., 'i_did', 'collective', 'someone_else'.
        - `when_made` (string): e.g., 'made_to_order', '2020_2024', '1950_1959'.
        - `taxonomy_id` (number): The numeric ID of the listing's category.
        - `shipping_profile_id` (number, optional): The numeric ID of the shipping profile. Required if `type` is 'physical'.
        - `type` (enum: "physical", "digital", "download"): Listing type.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"listing_id\": 123456790,\n  \"user_id\": 98765432,\n  \"shop_id\": 12345678,\n  \"title\": \"New Awesome Product\",\n  /* ... other fields of the newly created listing ... */\n}"
    }
  ]
}
```

### `list_shop_shipping_profiles(shop_id?: number)`
Lists all shipping profiles for a given shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"count\": 1,\n  \"results\": [\n    {\n      \"shipping_profile_id\": 7654321,\n      \"title\": \"Standard US Shipping\",\n      \"origin_country_iso\": \"US\",\n      /* ... other shipping profile fields ... */\n    }\n  ]\n}"
    }
  ]
}
```

### `create_shop_shipping_profile(shop_id?: number, title: string, origin_country_iso: string, primary_cost: number, secondary_cost: number, min_processing_time: number, max_processing_time: number, destination_country_iso?: string, destination_region?: string)`
Creates a new shipping profile for a shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
    - `title` (string): A title for the shipping profile (e.g., 'US Standard').
    - `origin_country_iso` (string, length 2): ISO code of the origin country (e.g., 'US').
    - `primary_cost` (number, min 0): Cost of shipping to this destination alone.
    - `secondary_cost` (number, min 0): Cost of shipping with another item.
    - `min_processing_time` (integer, min 1): Minimum days to process the order.
    - `max_processing_time` (integer, min 1): Maximum days to process the order.
    - `destination_country_iso` (string, length 2, optional): ISO code for a specific destination country.
    - `destination_region` (enum: "eu", "non_eu", "none", optional): A specific destination region.
    *(Note: Either `destination_country_iso` OR `destination_region` must be provided, but not both.)*
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"shipping_profile_id\": 7654322,\n  \"title\": \"New Express Profile\",\n  /* ... other fields of the newly created shipping profile ... */\n}"
    }
  ]
}
```

### `upload_listing_image(shop_id?: number, listing_id: number, file_name: string, image_name?: string)`
Uploads an image from a predefined local server directory and associates it with an Etsy listing.
- **Description**: After creating a listing, use this tool to upload images. Images must be placed in the `public/uploads/listing_images` directory on the server (relative to the project root).
- **Parameters**:
    - `shop_id` (number, optional): Shop ID. Uses default if not provided.
    - `listing_id` (integer): The ID of the listing to add the image to.
    - `file_name` (string): The name of the image file (e.g., 'my_image.jpg') located in the server's `public/uploads/listing_images` directory.
    - `image_name` (string, optional): The desired filename for the image on Etsy. Defaults to `file_name` if not provided.
- **Returns**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"listing_image_id\": 987654321,\n  \"listing_id\": 123456790,\n  \"hex_code\": \"f1e2d3\",\n  \"url_75x75\": \"https://.../75x75.jpg\",\n  /* ... other image details ... */\n}"
    }
  ]
}
```

## How It Works

1.  **Client Request**: An MCP client sends a tool call request to this server (e.g., via `stdio` when run locally).
2.  **Authentication Check**: For tools requiring authentication, the server checks for a valid OAuth token using `TokenStorage`.
3.  **OAuth Flow (if needed)**:
    a.  If no valid token exists, the `authenticate` tool is typically invoked by the client (or instructed by the server).
    b.  The `EtsyMCPServer` calls the `OAuthServer` to generate an Etsy authorization URL (using PKCE).
    c.  The user opens this URL in a browser and authorizes the application.
    d.  Etsy redirects to the `OAuthServer`'s callback endpoint with an authorization code.
    e.  The `OAuthServer` exchanges the code for an access token and refresh token using the PKCE code verifier.
    f.  Tokens (including `user_id` and potentially default `shop_id` and `shop_name`) are saved by `TokenStorage`.
4.  **API Call**: The `EtsyMCPServer` uses the `EtsyApiClient` (which holds the access token) to make the requested API call to the Etsy V3 API.
5.  **Token Refresh**: If an access token is expired, `getValidAccessToken()` in `EtsyMCPServer` attempts to use the refresh token to get a new access token.
6.  **Response**: The response from the Etsy API is processed and returned to the MCP client in the standard MCP format.

## Troubleshooting

-   **Authentication Errors / Invalid Grant**:
    -   Ensure your `ETSY_API_KEY`, `ETSY_CLIENT_SECRET` in `.env` are correct.
    -   Verify that the `REDIRECT_URI` used by the server (default `http://localhost:3003/oauth/callback` or as set in `.env`) exactly matches one of the "Callback URLs" configured in your Etsy App settings.
    -   Stale tokens: Try clearing `tokens.json` from your token storage path (see `TokenStorage.ts` or your `ETSY_MCP_TOKEN_PATH` env var) and re-authenticating.
-   **`EADDRINUSE` for OAuth Server**: This means the port (default 3003) for the OAuth callback server is already in use. Stop the other process or configure a different `ETSY_MCP_OAUTH_PORT` in your `.env` file and update your Etsy App's redirect URI accordingly.
-   **File Not Found for Image Upload**: Ensure the `file_name` provided to `upload_listing_image` exists within the `public/uploads/listing_images/` directory relative to your project root.
-   **Log Files**: Check the log files generated in the `logs` directory (or `ETSY_MCP_LOG_PATH`) for detailed error messages. Each run creates a timestamped log file.

## License

MIT License (Please create a LICENSE file with the MIT License text if you choose this license, or specify another.)

## Sponsors

We are grateful for the support of our sponsors:

- [Resold](https://resold.app/)
- [Vinta](https://vinta.app/)
- [House Illustrator](https://houseillustrator.com/)
- [GitClip](https://gitclip.io/#buy-now) 