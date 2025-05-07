import { EtsyMCPServer } from "./services/mcpServer.js";
import { OAuthServer } from "./services/oauthServer.js";
import { logger } from "./utils/logger.js";

// Initialize dependencies
const oauthServer = new OAuthServer();

// Create MCP server with OAuthServer injected
const server = new EtsyMCPServer(oauthServer);

// Handle errors using the logger
process.on('uncaughtException', (error) => {
  // Log to both the app logger and stderr for MCP client visibility
  logger.error('Uncaught Exception:', error);
  console.error('MCP Server Uncaught Exception:', error); // Detailed to stderr
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  // Log to both the app logger and stderr for MCP client visibility
  logger.error('Unhandled Rejection:', error);
  console.error('MCP Server Unhandled Rejection:', error); // Detailed to stderr
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.log('Received SIGINT. Shutting down gracefully...');
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Start server
server.start().catch(error => {
  logger.error('Failed to start MCP server:', error);
  process.exit(1);
}); 