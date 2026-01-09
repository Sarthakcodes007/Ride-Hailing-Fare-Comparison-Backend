export interface GeoLocation {
  lat: number;
  lng: number;
  address?: string; // Optional human readable address
}

export interface FareEstimate {
  platform: 'ola' | 'rapido' | 'uber';
  vehicleType: string;
  price: number;
  currency: string;
  eta?: string; // Estimated time of arrival (e.g., "5 mins")
  confidence: 'high' | 'medium' | 'low'; // Based on whether we got real data or fallback
  source: 'scraped' | 'api' | 'cached' | 'live' | 'estimate';
  timestamp: number;
}

export interface PlatformAdapter {
  platformName: string;
  getFareEstimate(pickup: GeoLocation, drop: GeoLocation): Promise<FareEstimate[]>;
}
