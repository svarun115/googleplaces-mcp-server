#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

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

// Create the MCP server
const server = new Server(
  {
    name: 'googleplaces-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[DEBUG] ListTools request received');
  
  return {
    tools: [
      {
        name: 'search_places',
        description: 'Search for places using text query to get suggestions with Google Place IDs. Returns place name, address, place_id, and location coordinates. Use this to help users find and select places to link to journal entries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "Starbucks near Seattle", "restaurants in downtown")',
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
        description: 'Get detailed information about a specific place using its Google Place ID. Returns comprehensive details including name, address, coordinates, phone, website, rating, and opening hours.',
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
        description: 'Get current weather conditions and forecast for a location. Uses OpenWeatherMap API to provide temperature, conditions, humidity, wind speed, and forecast data.',
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
              description: 'Temperature units: "metric" (Celsius), "imperial" (Fahrenheit), or "standard" (Kelvin). Default: metric',
              enum: ['metric', 'imperial', 'standard'],
            },
          },
          required: ['location'],
        },
      },
      {
        name: 'get_elevation',
        description: 'Get elevation data for one or more locations using Google Elevation API. Returns elevation in meters above sea level.',
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
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'search_places') {
      return await handleSearchPlaces(args);
    } else if (name === 'get_place_details') {
      return await handleGetPlaceDetails(args);
    } else if (name === 'get_weather') {
      return await handleGetWeather(args);
    } else if (name === 'get_elevation') {
      return await handleGetElevation(args);
    } else {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('API_KEY')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Google Places API error: ${errorMessage}. Please check your API key.`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${errorMessage}`
    );
  }
});

async function handleSearchPlaces(args: any) {
  const { query, location, radius = 5000 } = args;

  console.error(`[DEBUG] Searching places for: "${query}"`);
  
  // Build request body for New Places API
  const requestBody: any = {
    textQuery: query,
  };

  // Add location bias if provided
  if (location?.lat && location?.lng) {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: location.lat,
          longitude: location.lng,
        },
        radius: Math.min(radius, 50000), // Max 50km
      },
    };
  }

  // Call New Places API (Text Search)
  const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': 'places.name,places.displayName,places.formattedAddress,places.id,places.location,places.types,places.rating,places.userRatingCount,places.businessStatus',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Places API error (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  
  // Log first result to debug
  if (data.places && data.places.length > 0) {
    console.error('[DEBUG] Sample place object keys:', Object.keys(data.places[0]));
    console.error('[DEBUG] Sample place.name:', data.places[0].name);
    console.error('[DEBUG] Sample place.id:', data.places[0].id);
  }
  
  const results = (data.places || []).slice(0, 10).map((place: any) => {
    // Use the name field (resource name) if available, otherwise construct from id
    const resourceName = place.name || `places/${place.id}`;
    
    return {
      name: place.displayName?.text || 'Unknown',
      address: place.formattedAddress || 'No address',
      place_id: place.id,
      resource_name: resourceName,  // Full resource name like "places/ChIJ..."
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
          message: `Found ${results.length} places for "${query}". Each result includes a place_id that can be stored in your journal database.`,
        }, null, 2),
      },
    ],
  };
}

async function handleGetPlaceDetails(args: any) {
  const { place_id } = args;

  console.error(`[DEBUG] Getting details for place_id: ${place_id}`);

  // The place_id could be:
  // 1. Just the ID: "ChIJ..."
  // 2. Full resource name: "places/ChIJ..."
  // For the API call, we need just the ID in the URL path
  const placeId = place_id.startsWith('places/') ? place_id.substring(7) : place_id;
  
  const fullUrl = `${PLACES_API_BASE}/places/${placeId}`;
  
  console.error(`[DEBUG] Place Details Request:`, {
    placeId,
    fullUrl,
    apiKeyPresent: !!GOOGLE_PLACES_API_KEY,
    apiKeyLength: GOOGLE_PLACES_API_KEY?.length,
  });
  
  // Call New Places API (Place Details) - exact same format as the working browser test
  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const errorDetails = {
      status: response.status,
      url: fullUrl,
      headers: Object.fromEntries(response.headers.entries()),
      error: errorText
    };
    console.error(`[DEBUG] Place Details API error:`, errorDetails);
    throw new Error(`Places API error (${response.status}) at ${fullUrl}: ${errorText.substring(0, 200)}`);
  }

  const place: any = await response.json();

  const details = {
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress || 'No address',
    place_id: place.id,
    location: {
      lat: place.location?.latitude,
      lng: place.location?.longitude,
    },
    phone: place.internationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    user_ratings_total: place.userRatingCount,
    price_level: place.priceLevel,
    types: place.types || [],
    opening_hours: place.regularOpeningHours
      ? {
          open_now: place.regularOpeningHours.openNow,
          weekday_text: place.regularOpeningHours.weekdayDescriptions,
        }
      : null,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          place_id: place_id,
          details: details,
        }, null, 2),
      },
    ],
  };
}

async function handleGetWeather(args: any) {
  const { location, units = 'metric' } = args;
  const { lat, lng } = location;

  console.error(`[DEBUG] Getting weather for location: ${lat}, ${lng}`);

  // Use Google Weather API (part of Google Maps Platform)
  const unitsSystem = units === 'imperial' ? 'IMPERIAL' : 'METRIC';
  
  // Call Google Weather API - Current Conditions
  const weatherUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_PLACES_API_KEY}&location.latitude=${lat}&location.longitude=${lng}&unitsSystem=${unitsSystem}`;
  
  const weatherResponse = await fetch(weatherUrl);

  if (!weatherResponse.ok) {
    const errorText = await weatherResponse.text();
    throw new Error(`Google Weather API error (${weatherResponse.status}): ${errorText}`);
  }

  const weatherData: any = await weatherResponse.json();

  const unitSymbol = unitsSystem === 'IMPERIAL' ? '°F' : '°C';
  const speedUnit = unitsSystem === 'IMPERIAL' ? 'mph' : 'km/h';
  const distanceUnit = unitsSystem === 'IMPERIAL' ? 'miles' : 'km';

  const result = {
    current: {
      time: weatherData.currentTime,
      timezone: weatherData.timeZone?.id,
      is_daytime: weatherData.isDaytime,
      weather: weatherData.weatherCondition?.type,
      description: weatherData.weatherCondition?.description?.text,
      icon_url: weatherData.weatherCondition?.iconBaseUri,
      temperature: weatherData.temperature?.degrees,
      feels_like: weatherData.feelsLikeTemperature?.degrees,
      dew_point: weatherData.dewPoint?.degrees,
      heat_index: weatherData.heatIndex?.degrees,
      wind_chill: weatherData.windChill?.degrees,
      humidity: weatherData.relativeHumidity,
      uv_index: weatherData.uvIndex,
      precipitation: {
        probability: weatherData.precipitation?.probability?.percent,
        type: weatherData.precipitation?.probability?.type,
        amount: weatherData.precipitation?.qpf?.quantity,
      },
      thunderstorm_probability: weatherData.thunderstormProbability,
      air_pressure: weatherData.airPressure?.meanSeaLevelMillibars,
      wind: {
        direction_degrees: weatherData.wind?.direction?.degrees,
        direction_cardinal: weatherData.wind?.direction?.cardinal,
        speed: weatherData.wind?.speed?.value,
        gust: weatherData.wind?.gust?.value,
      },
      visibility: weatherData.visibility?.distance,
      cloud_cover: weatherData.cloudCover,
      history_24h: {
        temperature_change: weatherData.currentConditionsHistory?.temperatureChange?.degrees,
        max_temperature: weatherData.currentConditionsHistory?.maxTemperature?.degrees,
        min_temperature: weatherData.currentConditionsHistory?.minTemperature?.degrees,
        precipitation: weatherData.currentConditionsHistory?.qpf?.quantity,
      },
      units: { 
        temperature: unitSymbol, 
        speed: speedUnit,
        distance: distanceUnit,
        pressure: 'mb',
      },
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          location: { lat, lng },
          data: result,
        }, null, 2),
      },
    ],
  };
}

async function handleGetElevation(args: any) {
  const { locations } = args;

  console.error(`[DEBUG] Getting elevation for ${locations.length} location(s)`);

  // Build locations parameter for Elevation API
  const locationsParam = locations.map((loc: any) => `${loc.lat},${loc.lng}`).join('|');

  // Call Google Elevation API
  const elevationUrl = `https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(locationsParam)}&key=${GOOGLE_PLACES_API_KEY}`;
  const response = await fetch(elevationUrl);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Elevation API error (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();

  if (data.status !== 'OK') {
    throw new Error(`Elevation API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  const results = data.results.map((result: any) => ({
    elevation: result.elevation,
    resolution: result.resolution,
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
  // Handle --version flag
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log('googleplaces-mcp-server version 1.0.0');
    process.exit(0);
  }

  console.error('[DEBUG] Initializing Google Places MCP server...');
  const transport = new StdioServerTransport();
  console.error('[DEBUG] Connecting transport...');
  await server.connect(transport);
  console.error('Google Places MCP server running on stdio');
  console.error('[DEBUG] Server connected and ready');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
