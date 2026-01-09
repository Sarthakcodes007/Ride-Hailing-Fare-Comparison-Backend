import { FareEstimate, PlatformAdapter, GeoLocation } from '../interfaces/types';
import { OlaAdapter } from '../adapters/ola.adapter';
import { RapidoAdapter } from '../adapters/rapido.adapter';
import { UberAdapter } from '../adapters/uber.adapter';

interface CacheEntry {
  data: FareEstimate[];
  timestamp: number;
}

export class FareService {
  private adapters: PlatformAdapter[] = [];
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.adapters.push(new OlaAdapter());
    this.adapters.push(new RapidoAdapter());
    this.adapters.push(new UberAdapter());
  }


  public async getFareEstimates(pickup: GeoLocation, drop: GeoLocation): Promise<FareEstimate[]> {
    const cacheKey = this.getCacheKey(pickup, drop);
    
    // Check Cache
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      console.log('[FareService] Returning cached results');
      return cached.data.map(item => ({ ...item, source: 'cached' })); // Mark as cached
    }

    // Fetch from all adapters in parallel
    console.log('[FareService] Fetching fresh estimates...');
    const promises = this.adapters.map(adapter => 
      adapter.getFareEstimate(pickup, drop).catch(err => {
        console.error(`[FareService] Error in ${adapter.platformName}:`, err);
        return [] as FareEstimate[]; // Return empty array on failure (partial failure support)
      })
    );

    const results = await Promise.all(promises);
    const flattenedResults = results.flat();

    // Update Cache
    if (flattenedResults.length > 0) {
      this.cache.set(cacheKey, {
        data: flattenedResults,
        timestamp: Date.now()
      });
    }

    return flattenedResults;
  }

  private getCacheKey(pickup: GeoLocation, drop: GeoLocation): string {
    // Rounding coordinates to 4 decimal places to group nearby requests (approx 11m precision)
    const pLat = pickup.lat.toFixed(4);
    const pLng = pickup.lng.toFixed(4);
    const dLat = drop.lat.toFixed(4);
    const dLng = drop.lng.toFixed(4);
    return `${pLat},${pLng}-${dLat},${dLng}`;
  }
}
