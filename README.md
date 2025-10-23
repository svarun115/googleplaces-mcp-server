# Google Places MCP Server

Model Context Protocol server for Google Places API integration. Designed to search for places and provide Google Place IDs for linking to journal entries.

## Features

- **Search Places**: Find places using natural language queries with location bias
- **Get Place Details**: Retrieve comprehensive information using Google Place ID
- **Get Weather**: Current weather conditions using Google Weather API (part of Google Maps Platform)
- **Get Elevation**: Elevation data for locations using Google Elevation API
- **Journal Integration**: Returns place_id field for storing in journal database

## Installation

```bash
npm install
npm run build
npm install -g .
```

## Configuration

Set your Google API key:

```bash
export GOOGLE_PLACES_API_KEY="your_google_api_key_here"
```

Or create a `.env` file:
```
GOOGLE_PLACES_API_KEY=your_google_api_key_here
```

**Note:** The same API key is used for Places, Weather, and Elevation APIs.

## Getting API Keys

### Google API Key (Required)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the following APIs:
   - **Places API (New)** - for place search and details
   - **Weather API** - for current weather conditions
   - **Elevation API** - for elevation data
4. Go to "Credentials" and create an API key
5. (Optional) Restrict the API key to these three APIs only

**All three APIs use the same Google API key!**

## Usage

### With Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "googleplaces": {
      "command": "googleplaces-mcp-server",
      "env": {
        "GOOGLE_PLACES_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### With VS Code Extension

Install the companion VS Code extension and configure your API key in settings.

## Available Tools

### 1. search_places

Search for places and get Google Place IDs.

**Parameters:**
- `query` (required): Search query (e.g., "Starbucks near me", "Italian restaurants")
- `location` (optional): `{lat: number, lng: number}` - Location bias
- `radius` (optional): Search radius in meters (default: 5000, max: 50000)

**Returns:**
- List of places with `place_id`, name, address, coordinates, rating

**Example:**
```json
{
  "query": "coffee shops in Seattle",
  "location": {"lat": 47.6062, "lng": -122.3321},
  "radius": 2000
}
```

### 2. get_place_details

Get full details about a place using its Google Place ID.

**Parameters:**
- `place_id` (required): Google Place ID from search results

**Returns:**
- Complete place information including phone, website, hours, ratings

### 3. get_weather

Get current weather conditions using Google Weather API.

**Parameters:**
- `location` (required): `{lat: number, lng: number}` - Location coordinates
- `units` (optional): "metric" (Celsius/km), "imperial" (Fahrenheit/miles). Default: metric

**Returns:**
- Current weather: temperature, feels like, dew point, heat index, wind chill
- Humidity, UV index, precipitation (probability, type, amount)
- Thunderstorm probability, air pressure
- Wind: direction (degrees & cardinal), speed, gust
- Visibility, cloud cover
- 24-hour history: temperature changes, min/max temps, precipitation

**Example:**
```json
{
  "location": {"lat": 47.6062, "lng": -122.3321},
  "units": "imperial"
}
```

**Note:** Uses the same Google API key as Places and Elevation APIs.

### 4. get_elevation

Get elevation data for one or more locations.

**Parameters:**
- `locations` (required): Array of `{lat: number, lng: number}` coordinates

**Returns:**
- Elevation in meters above sea level for each location
- Resolution (accuracy) of elevation data

**Example:**
```json
{
  "locations": [
    {"lat": 47.6062, "lng": -122.3321},
    {"lat": 47.6205, "lng": -122.3493}
  ]
}
```

## Use Case: Journal Integration

This server is designed to help link journal entries to real-world places:

1. **Search**: User mentions "went to Starbucks on 5th Ave"
2. **Get Suggestions**: Call `search_places` with query "Starbucks 5th Ave Seattle"
3. **User Selects**: Present results, user chooses the correct location
4. **Store**: Save the `place_id` in your journal database's locations table
5. **Details**: Use `get_place_details` anytime to fetch current info about that place

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Test
npm test
```

## License

MIT
