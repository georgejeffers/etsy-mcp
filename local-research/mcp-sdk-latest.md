Querying Perplexity AI using sonar-pro for: Model Context Protocol SDK latest version and installation guide
The latest version of the Model Context Protocol (MCP) TypeScript SDK is 1.7.0, released 14 days ago[14].

To install the MCP TypeScript SDK, use the following npm command:

```
npm install @modelcontextprotocol/sdk
```

Here's a quick guide to get started with the SDK:

1. Create a simple MCP server:

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({ name: "Demo", version: "1.0.0" });

// Add an addition tool
server.tool("add", 
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] })
);

// Add a dynamic greeting resource
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({ contents: [{ uri: uri.href, text: `Hello, ${name}` }] })
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
```

2. Run your server:

To run your MCP server, save the code in a file (e.g., `server.js`) and execute it using Node.js:

```
node server.js
```

This will start your MCP server, which can now be connected to by MCP clients[14].

For more advanced usage and client implementation, refer to the SDK documentation and examples provided in the package.

citations:
1. https://modelcontextprotocol.io/sdk/java/mcp-overview
2. https://www.youtube.com/watch?v=MC2BwMGFRx4
3. https://docs.anthropic.com/en/docs/agents-and-tools/mcp
4. https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/
5. https://modelcontextprotocol.io/quickstart/client
6. https://modelcontextprotocol.io/development/updates
7. https://www.youtube.com/watch?v=KiNyvT02HJM
8. https://www.anthropic.com/news/model-context-protocol
9. https://modelcontextprotocol.io/quickstart/server
10. https://www.npmjs.com/package/@modelcontextprotocol/sdk/v/0.6.1
11. https://www.datacamp.com/tutorial/mcp-model-context-protocol
12. https://github.com/modelcontextprotocol
13. https://glama.ai/blog/2024-11-25-model-context-protocol-quickstart
14. https://www.npmjs.com/package/@modelcontextprotocol/sdk
15. https://github.com/modelcontextprotocol/typescript-sdk
16. https://spring.io/blog/2025/02/14/mcp-java-sdk-released-2/
17. https://www.speakeasy.com/docs/customize/typescript/model-context-protocol/model-context-protocol
18. https://www.speakeasy.com/post/release-model-context-protocol
19. https://github.com/modelcontextprotocol/python-sdk