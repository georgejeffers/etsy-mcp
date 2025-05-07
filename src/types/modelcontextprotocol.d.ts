declare module '@modelcontextprotocol/sdk' {
    export class MCPServer {
        constructor(options: {
            name: string;
            description: string;
            version: string;
            tools?: any;
        });

        start(): Promise<void>;
        stop(): Promise<void>;
    }

    export function tool(options: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: Record<string, any>;
            required?: string[];
        };
    }): MethodDecorator;
} 