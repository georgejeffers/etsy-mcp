# Etsy MCP Server

A Model Context Protocol (MCP) server that provides tools for interacting with the Etsy API.

## Features

- Create new Etsy listings
- Get all listings for a shop
- Get shop details

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Copy `.env.example` to `.env` and fill in your Etsy API credentials:
```
ETSY_API_KEY=your_api_key
ETSY_CLIENT_SECRET=your_client_secret
```

## Usage

Start the MCP server:
```bash
npm start
```
This will launch the server, which listens for MCP commands typically via standard input/output. The server handles authentication with Etsy and provides a suite of tools to interact with your Etsy shop.

For development with auto-reload:
```bash
npm run dev
```

## Authentication Flow

1.  **Initiate Authentication**: Use the `authenticate` tool. This will provide a URL.
2.  **Authorize in Browser**: Open the provided URL in your browser and complete the Etsy authorization process.
3.  **Set Default Shop**: After successful authentication, run the `set_default_shop` tool. This will fetch your Etsy shops and set the first one as the default for subsequent API calls. You can check the current default with `get_default_shop`.

Once authenticated and a default shop is set, you can use the other tools. Most tools will use the default shop ID automatically if not specified.

## Available Tools

The MCP server provides the following tools. Parameters are validated using Zod schemas.

### `authenticate`
Initiates the OAuth2 authentication flow with Etsy.
- **Description**: Starts the authentication process. The server will return a URL that you need to open in a browser to grant access to your Etsy account.
- **Parameters**: None.
- **Returns**: A URL to visit for authorization.

### `set_default_shop`
Fetches your Etsy shops and sets the first one found as the default for this session.
- **Description**: After authentication, use this tool to select a default shop. If you have multiple shops, it will use the first one returned by Etsy.
- **Parameters**: None.
- **Returns**: Confirmation of the default shop set.

### `get_default_shop`
Gets the currently configured default Etsy shop ID and name.
- **Description**: Use this to check which shop is currently set as the default.
- **Parameters**: None.
- **Returns**: The default shop's name and ID.

### `get_listings`
Get all active listings for a shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
- **Returns**: A list of active listings for the specified shop.

### `get_shop_details`
Get details for a specific shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
- **Returns**: Detailed information about the specified shop.

### `create_listing`
Creates a new Etsy listing.
- **Description**: Creates a new listing in your shop. For physical items, ensure you have a `shipping_profile_id`. To add images, create the listing first, then use the `upload_listing_image` tool with the returned `listing_id`.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
    - `listing_data` (object):
        - `title` (string): Listing title.
        - `description` (string): Listing description.
        - `price` (number): Listing price.
        - `quantity` (number): Available quantity.
        - `who_made` (string): e.g., 'i_did', 'collective', 'someone_else'.
        - `when_made` (string): e.g., 'made_to_order', '2020_2024', '1950_1959'.
        - `taxonomy_id` (number): The numeric ID of the listing's category.
        - `shipping_profile_id` (number, optional): The numeric ID of the shipping profile. Required if `type` is 'physical'.
        - `type` (enum: "physical", "digital", "download"): Listing type.
- **Returns**: The newly created listing's details.

### `list_shop_shipping_profiles`
Lists all shipping profiles for a given shop.
- **Parameters**:
    - `shop_id` (number, optional): The ID of the shop. If not provided, uses the default shop.
- **Returns**: A list of shipping profiles.

### `create_shop_shipping_profile`
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
- **Returns**: The newly created shipping profile's details.

### `upload_listing_image`
Uploads an image from a predefined local server directory and associates it with an Etsy listing.
- **Description**: After creating a listing, use this tool to upload images. Images must be placed in the `public/uploads/listing_images` directory on the server.
- **Parameters**:
    - `shop_id` (number, optional): Shop ID. Uses default if not provided.
    - `listing_id` (integer): The ID of the listing to add the image to.
    - `file_name` (string): The name of the image file (e.g., 'my_image.jpg') located in the server's `public/uploads/listing_images` directory.
    - `image_name` (string, optional): The desired filename for the image on Etsy. Defaults to `file_name` if not provided.
- **Returns**: Details of the uploaded image.

## Usage with an MCP Client (e.g., LClaude)

If you want to use this Etsy MCP server with a client application that supports the Model Context Protocol (such as LClaude), you will typically need to provide a configuration that tells the client how to start and communicate with this server.

Below is an example JSON configuration. You'll need to adjust paths and potentially other details based on your specific setup.

**Important Security Note:** The example below includes placeholder API keys (`ETSY_API_KEY` and `ETSY_CLIENT_SECRET`). **NEVER commit your actual API keys or secrets to version control.** You should replace these placeholders with your actual credentials or use a secure method for providing them to your client environment (e.g., environment variables that the client application can read).

```json
{
    "mcpServers": {
        "etsy": {
            "command": "npx",
            "args": ["tsx", "/Users/george/Desktop/repos/ai gemini apps/etsy_api/etsy-mcp/src/mcp.ts"],
            "env": {
                "ETSY_API_KEY": "YOUR_ETSY_API_KEY_HERE",
                "ETSY_CLIENT_SECRET": "YOUR_ETSY_CLIENT_SECRET_HERE",
                "NODE_ENV": "development",
                "REDIRECT_URI": "http://localhost:3003/oauth/callback"
            },
            "cwd": "/Users/george/Desktop/repos/ai gemini apps/etsy_api/etsy-mcp",
            "tools": [
                {
                    "name": "mcp.authenticate",
                    "description": "Authenticate with Etsy API. This will open a browser window for OAuth authentication.",
                    "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                },
                {
                    "name": "mcp.set_default_shop",
                    "description": "Fetches your Etsy shops and sets the first one found as default.",
                     "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                },
                 {
                    "name": "mcp.get_default_shop",
                    "description": "Gets the currently configured default Etsy shop ID and name.",
                     "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                },
                {
                    "name": "mcp.get_listings",
                    "description": "Get all listings for a shop",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shop_id": {
                                "type": "number",
                                "description": "The ID of the shop. If not provided, uses the default shop."
                            }
                        }
                    }
                },
                {
                    "name": "mcp.get_shop_details",
                    "description": "Get details for a specific shop",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shop_id": {
                                "type": "number",
                                "description": "The ID of the shop. If not provided, uses the default shop."
                            }
                        }
                    }
                },
                {
                    "name": "mcp.create_listing",
                    "description": "Creates a new Etsy listing. For physical items, ensure you have a shipping_profile_id. To add images, create the listing first, then use the `upload_listing_image` tool with the returned listing_id.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shop_id": {
                                "type": "number",
                                "optional": true,
                                "description": "The ID of the shop. If not provided, uses the default shop."
                            },
                            "listing_data": {
                                "type": "object",
                                "properties": {
                                    "title": { "type": "string" },
                                    "description": { "type": "string" },
                                    "price": { "type": "number" },
                                    "quantity": { "type": "number" },
                                    "who_made": { "type": "string", "description": "e.g., 'i_did', 'collective', 'someone_else'" },
                                    "when_made": { "type": "string", "description": "e.g., 'made_to_order', '2020_2024', '1950_1959'" },
                                    "taxonomy_id": { "type": "number", "description": "The numeric ID of the listing's category." },
                                    "shipping_profile_id": { "type": "number", "optional": true, "description": "The numeric ID of the shipping profile. Required if type is 'physical'." },
                                    "type": { "type": "string", "enum": ["physical", "digital", "download"], "description": "Listing type: 'physical', 'digital', or 'download'." }
                                },
                                "required": ["title", "description", "price", "quantity", "who_made", "when_made", "taxonomy_id", "type"]
                            }
                        },
                        "required": ["listing_data"]
                    }
                },
                {
                    "name": "mcp.list_shop_shipping_profiles",
                    "description": "Lists all shipping profiles for a given shop (or the default shop).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shop_id": {
                                "type": "number",
                                "optional": true,
                                "description": "The ID of the shop. If not provided, uses the default shop."
                            }
                        }
                    }
                },
                {
                    "name": "mcp.create_shop_shipping_profile",
                    "description": "Creates a new shipping profile for a shop.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shop_id": {"type": "number", "optional": true, "description": "The ID of the shop. If not provided, uses the default shop."},
                            "title": {"type": "string", "description": "A title for the shipping profile (e.g., 'US Standard', 'EU Express')."},
                            "origin_country_iso": {"type": "string", "pattern": "^[A-Z]{2}$", "description": "The ISO code of the country from which the listing ships (e.g., 'US', 'GB')."},
                            "primary_cost": {"type": "number", "minimum": 0, "description": "The cost of shipping to this destination alone."},
                            "secondary_cost": {"type": "number", "minimum": 0, "description": "The cost of shipping to this destination with another item."},
                            "min_processing_time": {"type": "integer", "minimum": 1, "description": "Minimum time (in days) to process the order."},
                            "max_processing_time": {"type": "integer", "minimum": 1, "description": "Maximum time (in days) to process the order."},
                            "destination_country_iso": {"type": "string", "pattern": "^[A-Z]{2}$", "optional": true, "description": "ISO code for a specific destination country (e.g., 'US', 'CA'). Use either this or destination_region."},
                            "destination_region": {"type": "string", "enum": ["eu", "non_eu", "none"], "optional": true, "description": "A specific destination region ('eu', 'non_eu', 'none'). Use either this or destination_country_iso."}
                        },
                        "required": ["title", "origin_country_iso", "primary_cost", "secondary_cost", "min_processing_time", "max_processing_time"]
                    }
                },
                {
                    "name": "mcp.upload_listing_image",
                    "description": "Uploads an image from a predefined local server directory and associates it with an Etsy listing.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "shop_id": {"type": "number", "optional": true, "description": "Shop ID. Uses default if not provided."},
                            "listing_id": {"type": "integer", "description": "The ID of the listing to add the image to."},
                            "file_name": {"type": "string", "description": "The name of the image file (e.g., 'my_image.jpg') located in the server's predefined upload directory."},
                            "image_name": {"type": "string", "optional": true, "description": "The desired filename for the image on Etsy (e.g., 'etsy_image_name.jpg'). Defaults to file_name if not provided."}
                        },
                        "required": ["listing_id", "file_name"]
                    }
                }
            ]
        }
    }
}
```

Key things to note and potentially adjust in this configuration:
- `"command"` and `"args"`: These specify how to run your MCP server. The example uses `npx tsx` to run your TypeScript source file directly. You might adjust this if you have a build step and run from JavaScript in a `dist` folder (e.g., `node dist/mcp.js`).
- `"args"` path: The path `/Users/george/Desktop/repos/ai gemini apps/etsy_api/etsy-mcp/src/mcp.ts` is an **absolute path**. For portability, it's often better if the client or your setup can resolve this to a relative path or if the MCP server is globally accessible in the PATH.
- `"env"`:
    - `ETSY_API_KEY` and `ETSY_CLIENT_SECRET`: **Crucially, replace the placeholder values with your actual Etsy API credentials.**
    - `REDIRECT_URI`: Ensure this matches what you configured in your Etsy app settings and what the `OAuthServer` in your code expects (default is `http://localhost:3003/oauth/callback`).
- `"cwd"`: The current working directory for the server process. The example uses an absolute path. This should be the root of your project where `node_modules` and `.env` files are accessible.
- `"tools"`: This section lists the tools the server exposes. The client uses this to understand what functions are available. I have updated this list to be more comprehensive based on your `mcpServer.ts` file, including descriptions and basic parameter types. The parameter definitions should ideally match the Zod schemas you've defined for true type safety and validation message consistency, but this JSON format is a common way for clients to get a general idea.

Make sure the tool names and parameters in this JSON configuration align with what your `EtsyMCPServer` actually registers. I've taken the liberty to update the tool list to be more comprehensive based on my understanding of your `mcpServer.ts` file. 