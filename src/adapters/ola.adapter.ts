import { Page } from 'playwright';
import { PlatformAdapter, FareEstimate, GeoLocation } from '../interfaces/types';
import { BrowserService } from '../services/browser.service';
import { calculateDistance, calculateFare } from '../utils/fare-calculator';

export class OlaAdapter implements PlatformAdapter {
  platformName = 'ola';

  async getFareEstimate(pickup: GeoLocation, drop: GeoLocation): Promise<FareEstimate[]> {
    const browserService = BrowserService.getInstance();
    let page: Page | null = null;
    let context = null;

    try {
      const instance = await browserService.getNewPage();
      page = instance.page;
      context = instance.context;

      console.log('[Ola] Starting scraping process...');

      // --- COOKIE INJECTION START ---
      try {
        const fs = require('fs');
        const path = require('path');
        const cookiePath = path.join(process.cwd(), 'cookies', 'ola.json');
        
        if (fs.existsSync(cookiePath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
          if (Array.isArray(cookies) && cookies.length > 0) {
            console.log(`[Ola] Injecting ${cookies.length} cookies...`);
            const validCookies = cookies.map((c: any) => {
              if (c.sameSite === 'unspecified' || c.sameSite === 'no_restriction') {
                c.sameSite = 'None';
              }
              if (c.sameSite === 'lax') c.sameSite = 'Lax';
              if (c.sameSite === 'strict') c.sameSite = 'Strict';
              if (c.sameSite === 'none') c.sameSite = 'None';
              return c;
            });
            await context.addCookies(validCookies);
          }
        }
      } catch (cookieErr) {
        console.warn('[Ola] Failed to inject cookies:', cookieErr);
      }
      // --- COOKIE INJECTION END ---

      // 1. Navigate to Ola's booking page
      console.log(`[Ola] Navigating to booking page...`);
      await page.goto('https://book.olacabs.com/', { waitUntil: 'networkidle' });

      // 2. Setup Network Interception
      const fareResponsePromise = page.waitForResponse(response => 
        response.url().includes('booking/estimate') && response.status() === 200
      , { timeout: 15000 }).catch(() => null);

      // 3. Setup Request Interception
      await page.route('**/booking/estimate**', async route => {
        const request = route.request();
        if (request.method() === 'POST') {
          const postData = request.postDataJSON();
          const newPayload = {
            ...postData,
            pickup_lat: pickup.lat,
            pickup_lng: pickup.lng,
            drop_lat: drop.lat,
            drop_lng: drop.lng
          };
          console.log('[Ola] Injecting coordinates into request:', JSON.stringify(newPayload));
          await route.continue({ postData: JSON.stringify(newPayload) });
        } else {
          await route.continue();
        }
      });

      // 4. Trigger the estimate flow
      // We assume cookies logged us in and we are on the booking screen.
      // If we are on the login screen, we can't proceed.
      const isLoginPage = page.url().includes('login');
      if (isLoginPage) {
          console.warn('[Ola] On login page. Cookies might be invalid. Falling back to estimates.');
          return this.getMockData(pickup, drop);
      }

      // Try to interact to trigger the API
      // If the map is visible, maybe we can just wait? 
      // Usually, we need to set pickup/drop in the UI to trigger the API if we rely on the app's logic.
      // BUT, since we are intercepting the request, we just need ANY request to 'booking/estimate' to happen.
      // Changing the location in the UI triggers it.
      
      // Check for Login Button explicitly
      const loginBtn = page.locator('div:has-text("Login"), a[href*="login"]');
      if (await loginBtn.count() > 0 && await loginBtn.first().isVisible()) {
          console.warn('[Ola] Login button found. Cookies might be invalid. Falling back to estimates.');
          return this.getMockData(pickup, drop);
      }

      console.log('[Ola] Attempting to trigger estimate API...');
      
      // Ola PWA often has a "Current Location" input pre-filled.
      // We need to simulate a change or click "Search Cabs".
      
      const searchCabsBtn = page.locator('button:has-text("Search Cabs"), div:has-text("Search Cabs")');
      if (await searchCabsBtn.count() > 0 && await searchCabsBtn.first().isVisible()) {
           console.log('[Ola] Clicking "Search Cabs"...');
           await searchCabsBtn.first().click();
      } else {
          // Try interacting with inputs
          const pickupInput = page.locator('input[placeholder*="Pickup"], div[data-testid="pickup-address"]');
          if (await pickupInput.isVisible()) {
              await pickupInput.click();
              await page.waitForTimeout(500);
              // Press Enter to confirm current location if needed
              await page.keyboard.press('Enter');
          }
      }

      // 5. Wait for the response
      const response = await fareResponsePromise;
      if (!response) {
        console.warn('[Ola] No fare estimate response captured within timeout. Dumping page content for debug and using estimates...');
        try {
            const fs = require('fs');
            const path = require('path');
            const logDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
            const content = await page.content();
            fs.writeFileSync(path.join(logDir, 'ola-failed.html'), content);
            console.log('[Ola] Page content saved to logs/ola-failed.html');
        } catch (err) {
            console.error('[Ola] Failed to save error log:', err);
        }
        return this.getMockData(pickup, drop); 
      }

      const data = await response.json();
      console.log('[Ola] Captured Data Success.');

      // 6. Normalize Data
      const results = this.normalizeResponse(data);
      if (results.length === 0) {
        console.warn('[Ola] Normalized data is empty. Using estimates.');
        return this.getMockData(pickup, drop);
      }
      return results;

    } catch (error) {
      console.error('[Ola] Error fetching estimates:', error);
      return this.getMockData(pickup, drop);
    } finally {
      if (page) await page.close();
      if (context) await context.close();
    }
  }

  private normalizeResponse(data: any): FareEstimate[] {
    const estimates: FareEstimate[] = [];
    let categories: any[] = [];
    
    if (data.categories && Array.isArray(data.categories)) {
        categories = data.categories;
    } else if (data.fares && Array.isArray(data.fares)) {
        categories = data.fares;
    } else if (data.data && data.data.categories) {
        categories = data.data.categories;
    }

    if (categories.length === 0) {
        console.warn('[Ola] No categories found in response data.');
        return [];
    }

    for (const cat of categories) {
        const name = cat.display_name || cat.name || cat.category || 'Unknown';
        const amount = cat.fare || cat.amount || cat.price || cat.estimated_fare;
        const eta = cat.eta || cat.duration || cat.time_to_pickup;
        
        let price = 0;
        if (typeof amount === 'number') {
            price = amount;
        } else if (typeof amount === 'string') {
            price = parseFloat(amount.replace(/[^0-9.]/g, ''));
        }

        if (price > 0) {
            estimates.push({
                platform: 'ola',
                vehicleType: name,
                price: price,
                currency: 'INR',
                eta: typeof eta === 'number' ? `${eta} mins` : (eta || 'N/A'),
                confidence: 'high',
                source: 'live',
                timestamp: Date.now()
            });
        }
    }
    
    return estimates;
  }

  private getMockData(pickup: GeoLocation, drop: GeoLocation): FareEstimate[] {
    console.log('[Ola] Generating fallback estimates...');
    const distance = calculateDistance(pickup.lat, pickup.lng, drop.lat, drop.lng);
    
    return [
      {
        platform: 'ola',
        vehicleType: 'mini',
        price: calculateFare(distance, 'mini'),
        currency: 'INR',
        eta: '4 mins',
        confidence: 'medium',
        source: 'estimate',
        timestamp: Date.now()
      },
      {
        platform: 'ola',
        vehicleType: 'prime_sedan',
        price: calculateFare(distance, 'sedan'),
        currency: 'INR',
        eta: '6 mins',
        confidence: 'medium',
        source: 'estimate',
        timestamp: Date.now()
      },
      {
        platform: 'ola',
        vehicleType: 'auto',
        price: calculateFare(distance, 'auto'),
        currency: 'INR',
        eta: '2 mins',
        confidence: 'medium',
        source: 'estimate',
        timestamp: Date.now()
      }
    ];
  }
}
