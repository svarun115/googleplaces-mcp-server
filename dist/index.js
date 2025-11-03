#!/usr/bin/env node
import { ErrorCode, McpError, } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer } from 'ws';
// Handle --version flag
if (process.argv.includes('--version')) {
    console.log('googleplaces-mcp-server version 1.0.0');
    process.exit(0);
}
// Get API key from environment
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_PLACES_API_KEY) {
    console.error('[ERROR] GOOGLE_PLACES_API_KEY environment variable is required');
    process.exit(1);
}
// New Places API base URL
const PLACES_API_BASE = 'https://places.googleapis.com/v1';
// Tool definitions
const TOOLS = [
    {
        name: 'search_places',
        description: 'Search for places using text query to get suggestions with Google Place IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query (e.g., "Starbucks near Seattle")',
                },
                location: {
                    type: 'object',
                    description: 'Optional location bias {lat: number, lng: number}',
                    properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                    },
                },
                radius: {
                    type: 'number',
                    description: 'Search radius in meters (default: 5000, max: 50000)',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_place_details',
        description: 'Get detailed information about a specific place using its Google Place ID.',
        inputSchema: {
            type: 'object',
            properties: {
                place_id: {
                    type: 'string',
                    description: 'Google Place ID from search results',
                },
            },
            required: ['place_id'],
        },
    },
    {
        name: 'get_weather',
        description: 'Get current weather conditions for a location.',
        inputSchema: {
            type: 'object',
            properties: {
                location: {
                    type: 'object',
                    description: 'Location coordinates {lat: number, lng: number}',
                    properties: {
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                    },
                    required: ['lat', 'lng'],
                },
                units: {
                    type: 'string',
                    description: 'Temperature units: "metric", "imperial", or "standard". Default: metric',
                    enum: ['metric', 'imperial', 'standard'],
                },
            },
            required: ['location'],
        },
    },
    {
        name: 'get_elevation',
        description: 'Get elevation data for one or more locations.',
        inputSchema: {
            type: 'object',
            properties: {
                locations: {
                    type: 'array',
                    description: 'Array of location coordinates [{lat: number, lng: number}]',
                    items: {
                        type: 'object',
                        properties: {
                            lat: { type: 'number' },
                            lng: { type: 'number' },
                        },
                        required: ['lat', 'lng'],
                    },
                },
            },
            required: ['locations'],
        },
    },
];
async function handleSearchPlaces(args) {
    const { query, location, radius = 5000 } = args;
    console.error(`[DEBUG] Searching places for: "${query}"`);
    const requestBody = {
        textQuery: query,
    };
    if (location?.lat && location?.lng) {
        requestBody.locationBias = {
            circle: {
                center: {
                    latitude: location.lat,
                    longitude: location.lng,
                },
                radius: Math.min(radius, 50000),
            },
        };
    }
    const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'places.name,places.displayName,places.formattedAddress,places.id,places.location,places.types,places.rating,places.userRatingCount,places.businessStatus',
        },
        body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Places API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    const results = (data.places || []).slice(0, 10).map((place) => {
        const resourceName = place.name || `places/${place.id}`;
        return {
            name: place.displayName?.text || 'Unknown',
            address: place.formattedAddress || 'No address',
            place_id: place.id,
            resource_name: resourceName,
            location: {
                lat: place.location?.latitude,
                lng: place.location?.longitude,
            },
            types: place.types || [],
            rating: place.rating,
            user_ratings_total: place.userRatingCount,
            business_status: place.businessStatus,
        };
    });
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    query: query,
                    count: results.length,
                    results: results,
                }, null, 2),
            },
        ],
    };
}
async function handleGetPlaceDetails(args) {
    const { place_id } = args;
    console.error(`[DEBUG] Getting details for place_id: ${place_id}`);
    const placeId = place_id.startsWith('places/') ? place_id.substring(7) : place_id;
    const fullUrl = `${PLACES_API_BASE}/places/${placeId}`;
    const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress',
        },
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Places API error (${response.status}): ${errorText}`);
    }
    const place = await response.json();
    const details = {
        name: place.displayName?.text || 'Unknown',
        address: place.formattedAddress || 'No address',
        place_id: place.id,
        location: {
            lat: place.location?.latitude,
            lng: place.location?.longitude,
        },
    };
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    details: details,
                }, null, 2),
            },
        ],
    };
}
async function handleGetWeather(args) {
    const { location, units = 'metric' } = args;
    const { lat, lng } = location;
    console.error(`[DEBUG] Getting weather for location: ${lat}, ${lng}`);
    const unitsSystem = units === 'imperial' ? 'IMPERIAL' : 'METRIC';
    const weatherUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_PLACES_API_KEY}&location.latitude=${lat}&location.longitude=${lng}&unitsSystem=${unitsSystem}`;
    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) {
        const errorText = await weatherResponse.text();
        throw new Error(`Google Weather API error (${weatherResponse.status}): ${errorText}`);
    }
    const weatherData = await weatherResponse.json();
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    data: weatherData,
                }, null, 2),
            },
        ],
    };
}
async function handleGetElevation(args) {
    const { locations } = args;
    console.error(`[DEBUG] Getting elevation for ${locations.length} location(s)`);
    const locationsParam = locations.map((loc) => `${loc.lat},${loc.lng}`).join('|');
    const elevationUrl = `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(locationsParam)}&key=${GOOGLE_PLACES_API_KEY}`;
    const response = await fetch(elevationUrl);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Elevation API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    if (data.status !== 'OK') {
        throw new Error(`Elevation API error: ${data.status}`);
    }
    const results = data.results.map((result) => ({
        elevation: result.elevation,
        location: {
            lat: result.location.lat,
            lng: result.location.lng,
        },
    }));
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    success: true,
                    count: results.length,
                    results: results,
                }, null, 2),
            },
        ],
    };
}
// Start the server
async function main() {
    const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const app = express();
    app.use(express.json());
    // Health check endpoint
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', version: '1.0.0' });
    });
    // HTTP GET response for MCP client initial fetch/handshake
    app.get('/', (_req, res) => {
        res.status(200).json({ status: 'ok', type: 'mcp-server', version: '1.0.0' });
    });
    // HTTP POST response for MCP client requests (before WebSocket upgrade)
    app.post('/', (_req, res) => {
        res.status(200).json({ status: 'ok', type: 'mcp-server', version: '1.0.0' });
    });
    const httpServer = createHttpServer(app);
    // Create WebSocket server - accepts connections on any path
    const wss = new WebSocketServer({ noServer: true });
    // Handle HTTP upgrade requests for WebSocket
    httpServer.on('upgrade', (request, socket, head) => {
        console.error(`[DEBUG] Upgrade request for path: ${request.url}`);
        wss.handleUpgrade(request, socket, head, (ws) => {
            console.error('[DEBUG] WebSocket upgrade successful');
            wss.emit('connection', ws, request);
        });
    });
    // Handle WebSocket connections
    wss.on('connection', (ws) => {
        console.error('[DEBUG] WebSocket client connected');
        let isInitialized = false;
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.error('[DEBUG] Received message:', JSON.stringify(message));
                let result;
                let sendError = false;
                // Handle initialize - required first call
                if (message.method === 'initialize') {
                    console.error('[DEBUG] Processing initialize request');
                    isInitialized = true;
                    result = {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {},
                        },
                        serverInfo: {
                            name: 'googleplaces-mcp-server',
                            version: '1.0.0',
                        },
                    };
                }
                // Handle tools/list
                else if (message.method === 'tools/list') {
                    console.error('[DEBUG] Processing tools/list request');
                    result = { tools: TOOLS };
                }
                // Handle tools/call
                else if (message.method === 'tools/call') {
                    const { name, arguments: args } = message.params || {};
                    console.error(`[DEBUG] Processing tool call: ${name}`);
                    if (name === 'search_places') {
                        result = await handleSearchPlaces(args);
                    }
                    else if (name === 'get_place_details') {
                        result = await handleGetPlaceDetails(args);
                    }
                    else if (name === 'get_weather') {
                        result = await handleGetWeather(args);
                    }
                    else if (name === 'get_elevation') {
                        result = await handleGetElevation(args);
                    }
                    else {
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                    }
                }
                else {
                    throw new McpError(ErrorCode.MethodNotFound, `Unknown method: ${message.method}`);
                }
                // Send JSON-RPC 2.0 response
                const response = {
                    jsonrpc: '2.0',
                    id: message.id,
                };
                if (sendError) {
                    response.error = result;
                }
                else {
                    response.result = result;
                }
                console.error('[DEBUG] Sending response:', JSON.stringify(response));
                ws.send(JSON.stringify(response));
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorCode = error instanceof McpError ? error.code : -32603;
                console.error('[DEBUG] Error processing message:', errorMessage);
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: data.id || null,
                    error: {
                        code: errorCode,
                        message: errorMessage,
                    },
                };
                console.error('[DEBUG] Sending error response:', JSON.stringify(errorResponse));
                ws.send(JSON.stringify(errorResponse));
            }
        });
        ws.on('close', () => {
            console.error('[DEBUG] WebSocket client disconnected');
        });
        ws.on('error', (error) => {
            console.error('[DEBUG] WebSocket error:', error);
        });
    });
    httpServer.listen(PORT, () => {
        console.log(`Google Places MCP server listening on ws://localhost:${PORT}`);
        console.error(`[DEBUG] Server initialized on port ${PORT}`);
    });
    process.on('SIGINT', () => {
        console.error('[DEBUG] Shutting down...');
        httpServer.close(() => {
            console.error('[DEBUG] Server closed');
            process.exit(0);
        });
    });
}
main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
