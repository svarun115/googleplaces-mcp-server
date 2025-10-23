# Setup Guide: Google Places MCP Server

## Prerequisites

1. **Node.js**: Version 18 or higher
2. **Google Cloud Account**: For Places API access
3. **Google Places API Key**: With Places API (New) enabled

## Step 1: Get Google Places API Key

### Create Google Cloud Project

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name your project (e.g., "Journal Places Integration")
4. Click "Create"

### Enable Places API

1. In the Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Places API (New)"
3. Click on it and click "Enable"

### Create API Key

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy your API key (starts with `AIza...`)
4. Click "Restrict Key" (recommended)
   - Under "API restrictions", select "Restrict key"
   - Check "Places API (New)"
   - Click "Save"

## Step 2: Install the MCP Server

```bash
cd "c:\Users\vasashid\AI Projects\Assistant\googleplaces-mcp-server"
npm install
npm run build
npm install -g .
```

Verify installation:
```bash
googleplaces-mcp-server --version
```

Expected output: `googleplaces-mcp-server version 1.0.0`

## Step 3: Configure API Key

### Option A: Environment Variable (Recommended)

Add to your shell profile (`.bashrc`, `.zshrc`, etc.):
```bash
export GOOGLE_PLACES_API_KEY="AIza..."
```

Reload your shell:
```bash
source ~/.bashrc
```

### Option B: Claude Desktop Config

Edit `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "googleplaces": {
      "command": "googleplaces-mcp-server",
      "env": {
        "GOOGLE_PLACES_API_KEY": "AIza..."
      }
    }
  }
}
```

### Option C: VS Code Extension Settings

1. Install the Google Places MCP VS Code Extension
2. Open VS Code Settings (Ctrl+,)
3. Search for "Google Places API Key"
4. Enter your API key

## Step 4: Test the Server

### Test with Node.js

Create a test file `test.mjs`:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'googleplaces-mcp-server',
  env: { GOOGLE_PLACES_API_KEY: 'AIza...' }
});

const client = new Client({
  name: 'test-client',
  version: '1.0.0'
}, { capabilities: {} });

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Test search
const result = await client.callTool('search_places', {
  query: 'coffee shops',
  location: { lat: 47.6062, lng: -122.3321 },
  radius: 1000
});

console.log('Search results:', result);

await client.close();
```

Run:
```bash
node test.mjs
```

## Step 5: Integration with Journal

Once the MCP server is working, you can use it to link places to journal entries:

### Database Schema

The journal database should have a `locations` table with:
```sql
CREATE TABLE locations (
  id UUID PRIMARY KEY,
  name TEXT,
  place_id TEXT,  -- Google Place ID goes here
  latitude DECIMAL,
  longitude DECIMAL,
  address TEXT,
  ...
);
```

### Workflow

1. **User creates journal entry**: "Had coffee at Starbucks on Pine St"
2. **Search for place**:
   ```
   search_places({
     query: "Starbucks Pine St Seattle",
     location: {lat: 47.6101, lng: -122.3421}
   })
   ```
3. **Present results**: Show user list of matching Starbucks locations
4. **User selects**: User picks the correct location
5. **Store place_id**: Save the `place_id` to your locations table
6. **Retrieve details anytime**:
   ```
   get_place_details({ place_id: "ChIJ..." })
   ```

## Troubleshooting

### "API key not found" error

- Check that `GOOGLE_PLACES_API_KEY` environment variable is set
- Verify the key is correctly copied (no extra spaces)
- Make sure you've restarted your terminal/VS Code

### "Places API has not been used" error

- Go to Google Cloud Console
- Verify "Places API (New)" is enabled (not the old "Places API")
- Wait a few minutes for changes to propagate

### "This API project is not authorized" error

- Check API key restrictions
- Ensure the API key is allowed to use Places API
- Verify your billing is enabled (Google requires it even for free tier)

### Command not found: googleplaces-mcp-server

- Verify global install: `npm list -g googleplaces-mcp-server`
- Check npm global bin path: `npm config get prefix`
- Ensure that path is in your system PATH

## API Usage Limits

Google Places API (New) has a free tier with usage limits:
- **Free tier**: $200 credit per month
- **Place Search**: ~$0.032 per request
- **Place Details**: ~$0.017 per request

With the free tier, you can make approximately:
- 6,250 place searches per month
- 11,764 place details requests per month

Monitor usage in Google Cloud Console → "APIs & Services" → "Dashboard"

## Next Steps

1. Install the companion VS Code extension for easier access
2. Test integration with your journal database
3. Set up error logging for production use
4. Consider caching place results to reduce API calls

## Support

For issues related to:
- **MCP Server**: Check GitHub issues at blueewhitee/GooglePlaces-MCP
- **Google Places API**: See [official documentation](https://developers.google.com/maps/documentation/places/web-service/overview)
- **Journal Integration**: Refer to your journal database documentation
