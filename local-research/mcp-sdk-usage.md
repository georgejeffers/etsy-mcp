Querying Perplexity AI using sonar-pro for: Model Context Protocol SDK import and usage example
To import and use the Model Context Protocol (MCP) SDK in TypeScript, you can follow this example:

```typescript
import { MCPServer } from '@modelcontextprotocol/typescript-sdk';

const server = new MCPServer('weather-server');

server.addTool({
  name: 'get-weather',
  description: 'Get the current weather for a given city',
  args: {
    city: {
      type: 'string',
      description: 'The name of the city'
    }
  },
  execute: async (args) => {
    const { city } = args;
    // Implement weather fetching logic here
    const weather = await fetchWeather(city);
    return { type: 'text', text: `The weather in ${city} is ${weather}` };
  }
});

server.start();
```

This example demonstrates:

1. Importing the MCPServer class from the SDK
2. Creating a new server instance
3. Adding a tool called 'get-weather' with a description and arguments
4. Implementing the execute function for the tool
5. Starting the server

The SDK allows you to easily create MCP servers that can expose data and functionality to LLM applications in a standardized way[8].

citations:
1. https://nshipster.com/model-context-protocol/
2. https://www.youtube.com/watch?v=MC2BwMGFRx4
3. https://www.youtube.com/watch?v=eD0uBLr-eP8
4. https://www.speakeasy.com/post/release-model-context-protocol
5. https://modelcontextprotocol.io/quickstart/server
6. https://www.datacamp.com/tutorial/mcp-model-context-protocol
7. https://github.com/modelcontextprotocol/python-sdk
8. https://github.com/modelcontextprotocol/typescript-sdk