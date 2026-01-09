# Ride-Hailing Fare Comparison Backend

A robust Node.js + TypeScript backend that compares real-time fares from Ola and Rapido using Playwright for network interception.

## Features

- **Real-time Fare Comparison**: Fetches live prices from Ola and Rapido.
- **Headless Browser Automation**: Uses Playwright to interact with booking platforms programmatically.
- **Network Interception**: Captures internal API responses for precise data extraction.
- **Clean Architecture**: Modular adapter pattern for easy addition of new platforms (e.g., Uber).
- **Caching**: Short-TTL (30s) in-memory caching to reduce redundant requests.
- **Resilience**: Handles partial failures (e.g., if one platform is down, others still return).

## Prerequisites

- Node.js (v14 or higher)
- npm

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Build the Project**
   ```bash
   npx tsc
   ```

3. **Run the Server**
   ```bash
   node dist/server.js
   ```
   Or for development:
   ```bash
   npx ts-node src/server.ts
   ```

## API Usage

**Endpoint:** `POST /api/compare-fares`

**Request Body:**
```json
{
  "pickup": {
    "lat": 12.9716,
    "lng": 77.5946
  },
  "drop": {
    "lat": 12.9352,
    "lng": 77.6245
  }
}
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "estimates": [
    {
      "platform": "ola",
      "vehicleType": "Mini",
      "price": 250,
      "currency": "INR",
      "eta": "4 mins",
      "source": "scraped"
    },
    {
      "platform": "rapido",
      "vehicleType": "bike",
      "price": 95,
      "currency": "INR",
      "eta": "2 mins",
      "source": "scraped"
    }
  ]
}
```

## Legal Disclaimer

**IMPORTANT: FOR EDUCATIONAL AND RESEARCH PURPOSES ONLY.**

This software interacts with third-party platforms (Ola, Rapido) in an automated manner. 
- **Terms of Service**: Automated access (scraping) may violate the Terms of Service of these platforms.
- **Usage**: This tool is intended as a Proof of Concept (MVP) for demonstrating architectural patterns (Adapter, Interception). Do not use for high-volume production traffic without official authorization.
- **Liability**: The authors are not responsible for any misuse or legal consequences arising from the use of this software.
- **Recommendation**: For a production-grade application, please contact the respective platforms to request access to their official APIs.
