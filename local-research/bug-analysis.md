## Etsy MCP Bug Analysis and Fixes

Packing repository using repomix...
Querying Gemini AI using gemini-2.0-flash-thinking-exp-01-21...
## Codebase Analysis and Bug/Issue Report

After analyzing the provided codebase, focusing on potential issues and the EROFS error context, here is a detailed list of identified bugs and issues along with suggested fixes.

**Main Focus: EROFS (Read-only File System) Error**

The most likely cause of an EROFS error in this codebase is related to file system operations within the `TokenStorage` and `Logger` classes. In read-only environments (like some containerized deployments or restricted file systems), writing to the file system will fail.

**Identified Bugs and Issues:**

**1.  Token Storage File Operations in Read-only File System (Critical - EROFS Potential)**

*   **Issue:** `TokenStorage` attempts to create directories and files within the user's home directory (`~/.etsy-mcp`) to store OAuth tokens. In read-only file systems, these operations (`fs.mkdirSync`, `fs.writeFileSync`, `fs.unlinkSync`) will fail with EROFS errors.
*   **File:** `src/services/tokenStorage.ts`
*   **Code Snippets:**
    ```typescript
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const configDir = path.join(homeDir!, '.etsy-mcp');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { mode: 0o700 }); // Potential EROFS error
    }
    this.tokenFilePath = path.join(configDir, 'tokens.json');
    fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokens, null, 2), { mode: 0o600, encoding: 'utf8' }); // Potential EROFS error
    fs.unlinkSync(this.tokenFilePath); // Potential EROFS error
    ```
*   **Suggested Fix:**
    *   **Environment Variable for Token Storage Path:** Introduce an environment variable (e.g., `ETSY_MCP_TOKEN_DIR`) to allow users to configure the token storage directory. Default to a writable temporary directory if the home directory is read-only, or consider in-memory storage as a fallback for truly read-only systems.
    *   **Check for Writable Directory:** Before attempting to create directories or write files, check if the target directory is writable. If not, log a warning and potentially fallback to in-memory storage (for access token only, refresh token would be lost on server restart).
    *   **Error Handling:** Implement proper try-catch blocks around file system operations in `TokenStorage` to gracefully handle EROFS errors. Log informative error messages and potentially indicate to the user that token persistence is disabled due to file system restrictions.
    *   **Example Implementation (Conceptual):**

        ```typescript
        // src/services/tokenStorage.ts
        import * as os from 'os'; // Import os module

        constructor() {
            const homeDir = process.env.HOME || process.env.USERPROFILE || os.tmpdir(); // Fallback to tmpdir
            const configDirEnv = process.env.ETSY_MCP_TOKEN_DIR;
            let configDir = configDirEnv ? configDirEnv : path.join(homeDir!, '.etsy-mcp');

            if (!configDirEnv) { // Only create default dir if not overridden by env var
                try {
                    if (!fs.existsSync(configDir)) {
                        fs.mkdirSync(configDir, { mode: 0o700 });
                    }
                } catch (error: any) {
                    if (error.code === 'EROFS') {
                        console.warn('Warning: Token storage directory is read-only. Tokens will not be persisted to disk. Consider setting ETSY_MCP_TOKEN_DIR to a writable location.');
                        configDir = os.tmpdir(); // Fallback to temporary directory, still might be problematic
                    } else {
                        console.error('Error creating token storage directory:', error);
                        throw error; // Or handle differently based on needs
                    }
                }
            }
            this.tokenFilePath = path.join(configDir, 'tokens.json');
        }

        public saveTokens(tokens: TokenData): void {
            try {
                // ... (rest of saveTokens code)
                fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokens, null, 2), { mode: 0o600, encoding: 'utf8' });
            } catch (error: any) {
                if (error.code === 'EROFS') {
                    console.warn('Warning: File system is read-only. Failed to save tokens to disk. Tokens will be lost on server restart.');
                    // Handle in-memory storage as fallback if needed, but refresh token will be lost
                } else {
                    console.error('Error saving tokens:', error);
                    throw error;
                }
            }
        }

        public clearTokens(): void {
            try {
                if (fs.existsSync(this.tokenFilePath)) {
                    fs.unlinkSync(this.tokenFilePath);
                }
            } catch (error: any) {
                if (error.code === 'EROFS' && !fs.existsSync(this.tokenFilePath)) {
                    // Ignore EROFS if file doesn't exist (already effectively cleared)
                    return;
                } else if (error.code === 'EROFS') {
                    console.warn('Warning: File system is read-only. Failed to clear tokens from disk.');
                    // Handle in-memory storage cleanup if needed
                }
                else {
                    console.error('Error clearing tokens:', error);
                    throw error;
                }
            }
        }
        ```

**2. Logger File Operations in Read-only File System (Less Critical but Issue - EROFS Potential)**

*   **Issue:** The `Logger` class writes logs to files within the `logs` directory in the current working directory. Similar to `TokenStorage`, this will fail with EROFS errors in read-only file systems.
*   **File:** `src/utils/logger.ts`
*   **Code Snippets:**
    ```typescript
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir); // Potential EROFS error
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logsDir, `oauth-${timestamp}.log`);
    this.stream = fs.createWriteStream(this.logFile, { flags: 'a' }); // Potential EROFS error
    this.stream.write(JSON.stringify(logEntry) + '
'); // Potential EROFS error
    ```
*   **Suggested Fix:**
    *   **Environment Variable for Log Directory:** Introduce an environment variable (e.g., `ETSY_MCP_LOG_DIR`) to configure the log directory. If not set, default to writing logs to `stdout` or `stderr` instead of files in read-only environments.
    *   **Check for Writable Directory:** Before creating the log directory and file, check if the directory is writable. If not, disable file logging and log to console only.
    *   **Conditional Logging:** Implement logic to check if file logging is possible. If not, fallback to console logging.
    *   **Example Implementation (Conceptual):**

        ```typescript
        // src/utils/logger.ts
        constructor() {
            const logsDirEnv = process.env.ETSY_MCP_LOG_DIR;
            let logsDir = logsDirEnv ? logsDirEnv : path.join(process.cwd(), 'logs');
            let useFileLogging = true;

            if (!logsDirEnv) { // Only check default dir if not overridden by env var
                try {
                    if (!fs.existsSync(logsDir)) {
                        fs.mkdirSync(logsDir);
                    }
                    fs.accessSync(logsDir, fs.constants.W_OK); // Check for write access
                } catch (error: any) {
                    if (error.code === 'EROFS' || error.code === 'EACCES') {
                        console.warn('Warning: Log directory is read-only or not writable. File logging disabled. Logs will be output to console only. Consider setting ETSY_MCP_LOG_DIR to a writable location.');
                        useFileLogging = false;
                    } else {
                        console.error('Error setting up log directory:', error);
                        useFileLogging = false; // Disable file logging on setup error as well
                    }
                }
            }

            if (useFileLogging) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                this.logFile = path.join(logsDir, `oauth-${timestamp}.log`);
                this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
            } else {
                this.stream = process.stdout as any as fs.WriteStream; // Redirect to stdout (or stderr)
                this.logFile = 'stdout'; // Or some indicator
            }
        }

        log(message: string, data?: any) {
            const timestamp = new Date().toISOString();
            const logEntry = { timestamp, message, data };
            console.error(`[${timestamp}] ${message}`, data ? data : ''); // Always console log
            if (this.logFile !== 'stdout') { // Only write to file if file logging enabled
                this.stream.write(JSON.stringify(logEntry) + '
');
            }
        }
        // ... (error and close methods similar conditional logic if needed)
        ```

**3.  Hardcoded Redirect URI (Minor Issue - Configuration)**

*   **Issue:** The redirect URI `http://localhost:3003/oauth/callback` is hardcoded in both `etsyApi.ts` and `oauthServer.ts`. This might be inflexible if users want to run the server on a different port or with a different hostname in certain deployment scenarios.
*   **Files:** `src/services/etsyApi.ts`, `src/services/oauthServer.ts`
*   **Code Snippets:**
    ```typescript
    // etsyApi.ts
    this.redirectUri = process.env.REDIRECT_URI || 'http://localhost:3003/oauth/callback';

    // oauthServer.ts
    constructor(port: number = 3003) {
        this.port = port;
        // ...
    }
    private generateAuthUrl(): string {
        // ...
        redirect_uri: `http://localhost:${this.port}/oauth/callback`,
        // ...
    }
    private async exchangeCodeForTokens(code: string) {
        // ...
        redirect_uri: `http://localhost:${this.port}/oauth/callback`,
        // ...
    }
    ```
*   **Suggested Fix:**
    *   **Environment Variable for Redirect URI:** Introduce an environment variable (e.g., `ETSY_MCP_REDIRECT_URI`) to configure the redirect URI. If not set, default to `http://localhost:3003/oauth/callback`.  Ensure the port in the redirect URI matches the `OAuthServer` port or is dynamically derived.
    *   **Configuration File:** For more complex configurations, consider using a configuration file (e.g., `config.json`) to manage settings like redirect URI, ports, API keys, etc.

**4.  Insecure Token Storage Permissions (Minor Security Issue)**

*   **Issue:** While the code attempts to set file permissions to `0o600` for the `tokens.json` file (read/write for owner only), the directory permission `0o700` (read/write/execute for owner only) for `.etsy-mcp` might not be sufficient to prevent other users on the same system from potentially listing the directory and inferring the existence of sensitive token files.
*   **File:** `src/services/tokenStorage.ts`
*   **Code Snippet:**
    ```typescript
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { mode: 0o700 });
    }
    fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokens, null, 2), { mode: 0o600, encoding: 'utf8' });
    ```
*   **Suggested Fix:**
    *   **Stricter Directory Permissions (Optional):** Consider setting directory permissions to `0o700` and ensuring that the parent directory also has restrictive permissions to limit access as much as possible. However, relying solely on file system permissions for security is generally not recommended for highly sensitive data.
    *   **Alternative Secure Storage (Recommended for Production):** For production deployments, consider using more secure storage mechanisms for OAuth tokens, such as:
        *   **Operating System's Credential Storage:** Use OS-level credential storage (like Keychain on macOS, Credential Manager on Windows, or Secret Service API on Linux) if available and suitable for the deployment environment.
        *   **Dedicated Secrets Management Service:** Integrate with a secrets management service (like HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Google Cloud Secret Manager) for more robust and centralized secret management, especially in cloud environments.
        *   **Encryption at Rest:** If storing tokens in files is unavoidable, encrypt the token file at rest using a strong encryption algorithm and a securely managed encryption key.

**5.  Missing Input Validation and Sanitization (Potential Vulnerability - Medium)**

*   **Issue:** The code, especially in `mcpServer.ts` and `etsyApi.ts`, receives input parameters (like `shop_id`, `listing_data`, etc.) from MCP requests and API calls. There's no explicit input validation or sanitization implemented to prevent potential injection attacks (e.g., command injection, cross-site scripting if responses are displayed in web UI in a client application, although less likely in this server context).
*   **Files:** `src/services/mcpServer.ts`, `src/services/etsyApi.ts`
*   **Code Example (mcpServer.ts - create_listing tool):**
    ```typescript
    this.server.tool(
        'create_listing',
        'Create a new Etsy listing',
        createListingSchema,
        async (args, extra) => {
            // ...
            const listingData = { // Potentially unsafe if args.listing_data contains malicious input
                ...args.listing_data,
                price: parseFloat(args.listing_data.price),
                quantity: parseInt(args.listing_data.quantity, 10),
                taxonomy_id: parseInt(args.listing_data.taxonomy_id, 10)
            };
            const newListing = await this.etsyApi.createListing(
                args.shop_id, // Potentially unsafe if args.shop_id is malicious
                listingData,
                tokens.access_token
            );
            // ...
        }
    );
    ```
*   **Suggested Fix:**
    *   **Schema Validation with Zod (Partially Implemented, Enhance):** You are already using Zod for schema definition in `mcpServer.ts`. Enhance the schemas to include more specific validation rules (e.g., string length limits, allowed character sets, number ranges, enum values) to ensure input data conforms to expected formats and constraints.
    *   **Input Sanitization:** Before using input data in API requests or responses, sanitize it to remove or escape potentially harmful characters. Libraries like `DOMPurify` (for HTML sanitization, if responses might be rendered in a browser) or general-purpose sanitization functions can be used. For simple cases, encoding or escaping special characters might suffice.
    *   **Error Handling for Invalid Input:** If input validation fails, return informative error messages to the MCP client indicating the invalid parameters.

**6.  Missing Refresh Token Handling and Token Expiration (Potential Functionality Issue - Medium)**

*   **Issue:** While the code includes a `refreshToken` function in `etsyApi.ts`, there isn't explicit logic to automatically refresh access tokens when they expire. The `TokenStorage` saves `expires_at`, but it's only checked when getting tokens, not actively used to refresh tokens before making API calls. If an access token expires, API calls will start failing until the user re-authenticates.
*   **Files:** `src/services/etsyApi.ts`, `src/services/tokenStorage.ts`, `src/services/mcpServer.ts`
*   **Code Snippets:**
    ```typescript
    // tokenStorage.ts
    public getTokens(): TokenData | null {
        // ...
        if (tokens.expires_at && tokens.expires_at < Date.now()) {
            return null; // Returns null if expired, but doesn't trigger refresh
        }
        return tokens;
    }

    // etsyApi.ts
    async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
        // ... (Refresh token logic exists)
    }
    ```
*   **Suggested Fix:**
    *   **Token Refresh Interceptor/Middleware:** Implement an interceptor or middleware in `etsyApi.ts` or within the MCP tool handlers in `mcpServer.ts`. Before making an authenticated API request, check if the access token is close to expiration (e.g., within a few minutes). If so, use the refresh token to obtain a new access token and refresh token pair. Update the tokens in `TokenStorage` and then proceed with the API request using the new access token.
    *   **Retry Mechanism:** If an API request fails due to an expired token (Etsy API might return a specific error code for this), catch the error, attempt to refresh the token, and retry the API request with the new token. Implement retry limits to prevent infinite loops if refresh token also fails.
    *   **Background Token Refresh (More Complex):** For a more robust solution, implement a background task or scheduler to proactively refresh tokens before they expire. This requires more complex state management and concurrency handling.

**7.  Lack of Comprehensive Error Handling in API Calls (Minor - Robustness)**

*   **Issue:** While `etsyApi.ts` has some basic error handling (checking `axios.isAxiosError`), it could be more comprehensive. It primarily throws generic errors like "API request failed". More specific error handling and logging would be beneficial for debugging and providing better error messages to clients.
*   **File:** `src/services/etsyApi.ts`
*   **Code Snippets:**
    ```typescript
    private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = null, accessToken?: string): Promise<T> {
        // ...
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`API request failed: ${error.response?.data?.error || error.message}`); // Generic error
            }
            throw error;
        }
    }
    ```
*   **Suggested Fix:**
    *   **Specific Error Handling:** In `makeRequest` and other API functions, inspect `error.response` (if it's an `AxiosError`) to get more detailed error information from the Etsy API (status code, error codes, error messages).
    *   **Log API Error Details:** Log the full error response from the Etsy API (status code, headers, data) when API calls fail. This will provide valuable context for debugging.
    *   **Custom Error Types/Codes:** Consider defining custom error types or error codes to represent different categories of API errors (e.g., authentication errors, rate limit errors, resource not found errors, server errors). This will allow MCP clients to handle errors more specifically.
    *   **Example Improvement:**

        ```typescript
        // src/services/etsyApi.ts
        private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = null, accessToken?: string): Promise<T> {
            try {
                // ...
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const apiError = error.response?.data;
                    const errorMessage = apiError?.error_description || apiError?.error || error.message || 'API request failed';
                    const statusCode = error.response?.status;
                    logger.error(`Etsy API request failed for endpoint: ${endpoint}`, {
                        statusCode,
                        apiError,
                        fullError: error
                    });
                    throw new Error(`Etsy API error: ${errorMessage} (Status Code: ${statusCode})`); // More informative error
                }
                logger.error(`Generic error during Etsy API request for endpoint: ${endpoint}`, error);
                throw new Error(`API request failed: ${error.message}`); // Fallback generic error
            }
        }
        ```

**8.  Lack of Rate Limit Handling (Potential Service Disruption - Medium)**

*   **Issue:** The Etsy API has rate limits. The code doesn't explicitly handle rate limit responses (e.g., HTTP 429 Too Many Requests). If rate limits are exceeded, API calls will fail, potentially disrupting functionality.
*   **Files:** `src/services/etsyApi.ts`, `src/services/mcpServer.ts`
*   **Suggested Fix:**
    *   **Rate Limit Detection:** In `makeRequest` in `etsyApi.ts`, check for HTTP 429 status codes in the response.
    *   **Retry with Backoff:** When a 429 response is received, implement a retry mechanism with exponential backoff. Wait for a progressively longer duration before retrying the request. The `Retry-After` header in the 429 response (if provided by Etsy API) can be used to determine the wait time.
    *   **Rate Limit Exceeded Error:** If retries fail after a certain number of attempts or a timeout, return a specific error to the MCP client indicating that the rate limit has been exceeded.
    *   **Consider Rate Limiting Libraries:** Explore using libraries like `axios-rate-limit` or similar to simplify rate limit handling with Axios.

**9.  Missing Documentation for Environment Variables (Minor - Usability)**

*   **Issue:** The documentation (`docs.md` and `README.md`) doesn't explicitly mention the environment variables that can be used to configure the server (e.g., `ETSY_MCP_TOKEN_DIR`, `ETSY_MCP_LOG_DIR`, `ETSY_MCP_REDIRECT_URI` if you implement the suggested fixes).
*   **Files:** `docs.md`, `README.md`
*   **Suggested Fix:**
    *   **Update Documentation:** Update `docs.md` and `README.md` to include a section on "Environment Variables" and list all configurable environment variables with their descriptions and default values. This will make the server more user-friendly and configurable.

**10. Potential Vulnerability: Open Redirect in OAuth Flow (Low - Security Best Practice)**

*   **Issue:** While less likely to be directly exploited in this server-side context, the OAuth flow could potentially be vulnerable to open redirect attacks if not carefully handled in a client application that uses the authorization URL. The `state` parameter is used, which helps mitigate CSRF but doesn't fully prevent open redirects if the client application itself mishandles redirects after authentication.
*   **Files:** `src/services/oauthServer.ts`
*   **Code Snippets:**
    ```typescript
    private generateAuthUrl(): string {
        // ...
        state: Math.random().toString(36).substring(7),
        // ...
    }
    ```
*   **Suggested Fix (Best Practice):**
    *   **Strict Redirect URI Validation:** In a client application that initiates the OAuth flow using the generated authorization URL, strictly validate the `redirect_uri` parameter against a predefined whitelist of allowed redirect URIs. Do not blindly redirect to the `redirect_uri` provided in the authorization response.
    *   **In This Server Context (Less Critical):** Since this server primarily acts as an MCP server and doesn't directly handle user-facing redirects, the open redirect risk is lower. However, if you anticipate exposing the OAuth flow to client applications, consider documenting the importance of redirect URI validation for client developers.

**Summary of Critical Issues and Fixes for EROFS:**

The most critical issue is the potential for EROFS errors due to file system operations in read-only environments. The primary fixes revolve around:

1.  **Environment variables for file paths:**  Allow configuration of token and log directories.
2.  **Writable directory checks:** Detect read-only file systems and gracefully handle them (disable file persistence/logging or fallback to alternatives like in-memory storage/console logging).
3.  **Robust error handling:** Implement try-catch blocks and specific error handling for file system operations, especially for EROFS errors.

By addressing these issues, you can significantly improve the robustness and deployability of the Etsy MCP server, especially in containerized or restricted environments where read-only file systems are common. Remember to prioritize security best practices and thorough testing after implementing these fixes.
