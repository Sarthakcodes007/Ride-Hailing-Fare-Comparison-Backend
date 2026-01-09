import { Page } from 'playwright';
import { PlatformAdapter, FareEstimate, GeoLocation } from '../interfaces/types';
import { BrowserService } from '../services/browser.service';
import { calculateDistance, calculateFare } from '../utils/fare-calculator';

export class RapidoAdapter implements PlatformAdapter {
  platformName = 'rapido';

  async getFareEstimate(pickup: GeoLocation, drop: GeoLocation): Promise<FareEstimate[]> {
    const browserService = BrowserService.getInstance();
    let page: Page | null = null;
    let context = null;

    try {
      const instance = await browserService.getNewPage();
      page = instance.page;
      context = instance.context;

      // Rapido is primarily app-based. We will attempt to use a web interface if available.
      // If not, this serves as a template for where the PWA/Web interaction would go.
      // We'll try a common PWA endpoint or the main site.
      const targetUrl = 'https://rapido.bike/'; 
      console.log(`[Rapido] Navigating to ${targetUrl}...`);
      
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (e) {
        console.warn('[Rapido] Could not load web interface. Rapido might be app-only.');
        // Return mock data for demonstration if real scraping fails (optional, but helpful for testing the API)
        return this.getMockData(pickup, drop); 
      }

      // Check if there is a booking widget
      const hasBookingWidget = await page.isVisible('input[placeholder*="Pickup"]');
      
      if (!hasBookingWidget) {
         console.warn('[Rapido] No booking widget found. Returning mock data for demonstration.');
         return this.getMockData(pickup, drop);
      }

      // ... Implementation of interaction would go here similar to Ola ...
      // For now, we return mock data as Rapido is likely app-only
      return this.getMockData(pickup, drop);

    } catch (error) {
      console.error('[Rapido] Error fetching estimates:', error);
      return this.getMockData(pickup, drop);
    } finally {
      if (page) await page.close();
      if (context) await context.close();
    }
  }

  private getMockData(pickup: GeoLocation, drop: GeoLocation): FareEstimate[] {
     const distance = calculateDistance(pickup.lat, pickup.lng, drop.lat, drop.lng);
     
     return [
       {
          platform: 'rapido',
          vehicleType: 'bike',
          price: calculateFare(distance, 'bike'),
          currency: 'INR',
          eta: '3 mins',
          confidence: 'medium',
          source: 'estimate',
          timestamp: Date.now()
        },
        {
          platform: 'rapido',
          vehicleType: 'auto',
          price: calculateFare(distance, 'auto'),
          currency: 'INR',
          eta: '7 mins',
          confidence: 'medium',
          source: 'estimate',
          timestamp: Date.now()
        }
     ];
  }
}
