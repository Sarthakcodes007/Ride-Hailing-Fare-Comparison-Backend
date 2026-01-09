import { Page } from 'playwright';
import { PlatformAdapter, FareEstimate, GeoLocation } from '../interfaces/types';
import { BrowserService } from '../services/browser.service';
import { calculateDistance, calculateFare } from '../utils/fare-calculator';

export class UberAdapter implements PlatformAdapter {
  platformName = 'uber';

  async getFareEstimate(pickup: GeoLocation, drop: GeoLocation): Promise<FareEstimate[]> {
    const browserService = BrowserService.getInstance();
    let page: Page | null = null;
    let context = null;

    try {
      const instance = await browserService.getNewPage();
      page = instance.page;
      context = instance.context;

      console.log('[Uber] Starting scraping process...');

      // --- COOKIE INJECTION START ---
      let cookiesInjected = false;
      try {
        const fs = require('fs');
        const path = require('path');
        const cookiePath = path.join(process.cwd(), 'cookies', 'uber.json');
        
        if (fs.existsSync(cookiePath)) {
          const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
          if (Array.isArray(cookies) && cookies.length > 0) {
            console.log(`[Uber] Found ${cookies.length} cookies. Injecting...`);
            // Sanitize cookies for Playwright
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
            cookiesInjected = true;
            console.log('[Uber] Cookies injected successfully.');
          }
        } else {
            console.warn('[Uber] No cookies found at', cookiePath);
        }
      } catch (cookieErr) {
        console.warn('[Uber] Failed to inject cookies:', cookieErr);
      }
      // --- COOKIE INJECTION END ---

      // Construct Deep Link directly to avoid navigation issues
      const pickupStr = encodeURIComponent(JSON.stringify({latitude: pickup.lat, longitude: pickup.lng}));
      const dropStr = encodeURIComponent(JSON.stringify({latitude: drop.lat, longitude: drop.lng}));
      const deepLink = `https://m.uber.com/looking?pickup=${pickupStr}&drop=${dropStr}`;
      
      console.log(`[Uber] Navigating to deep link: ${deepLink}`);
      
      try {
        await page.goto(deepLink, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (e) {
        console.error('[Uber] Navigation failed:', e);
        return this.getMockData(pickup, drop);
      }

      console.log(`[Uber] Current URL: ${page.url()}`);

      // Check for Login Redirect or Home Page
      const isLoginPage = page.url().includes('login') || page.url().includes('auth') || page.url().includes('u/login');
      if (isLoginPage) {
         console.warn('[Uber] Redirected to login page. Cookies might be invalid or expired.');
         return this.getMockData(pickup, drop); 
      }

      const isHomePage = page.url().includes('go/home');
      if (isHomePage) {
          console.warn('[Uber] Redirected to Home Page. Attempting to trigger ride search...');
          
          // Try to find "Ride" or "Search" button
          // On mobile web, it might be a tile with text "Ride"
          try {
             const rideButton = page.locator('div:has-text("Ride"), span:has-text("Ride"), button:has-text("Ride")').first();
             if (await rideButton.isVisible()) {
                 console.log('[Uber] Found "Ride" button. Clicking...');
                 await rideButton.click();
             } else {
                 console.log('[Uber] "Ride" button not found. Checking for "Where to?"...');
                 const whereTo = page.locator('button:has-text("Where to?"), div:has-text("Where to?")').first();
                 if (await whereTo.isVisible()) {
                     await whereTo.click();
                 }
             }
             
             // Wait for navigation or modal
             await page.waitForTimeout(2000);
          } catch (e) {
             console.warn('[Uber] Failed to interact with Home Page elements:', e);
          }
      }

      // Wait for results
      console.log('[Uber] Waiting for vehicle rows...');
      
      try {
        // Wait for at least one known element or the container
        await Promise.race([
            page.waitForSelector('div[data-test="vehicle-view-row"]', { timeout: 15000 }),
            page.waitForSelector('div[data-testid="vehicle-view-row"]', { timeout: 15000 }),
            page.waitForSelector('div[data-testid="ride-option-content"]', { timeout: 15000 }), // New selector
            page.waitForSelector('div[role="button"] >> text=₹', { timeout: 15000 }), // Price fallback
            page.waitForSelector('ul li div', { timeout: 15000 })
        ]);
      } catch (e) {
        console.warn('[Uber] Timeout waiting for vehicle rows. Dumping page content for debug...');
        try {
            const fs = require('fs');
            const path = require('path');
            const logDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
            const content = await page.content();
            fs.writeFileSync(path.join(logDir, 'uber-failed.html'), content);
            console.log('[Uber] Page content saved to logs/uber-failed.html');
        } catch (err) {
            console.error('[Uber] Failed to save error log:', err);
        }
        return this.getMockData(pickup, drop);
      }

      // Scrape results
      // We try to find all potential rows
      const vehicleRows = page.locator('div[data-test="vehicle-view-row"], div[data-testid="vehicle-view-row"], div[data-testid="ride-option-content"], div[role="button"]:has-text("₹")');
      const count = await vehicleRows.count();
      console.log(`[Uber] Found ${count} vehicle rows.`);
      
      const estimates: FareEstimate[] = [];

      for (let i = 0; i < count; i++) {
        const row = vehicleRows.nth(i);
        
        // Try multiple selectors for name
        const nameLocator = row.locator('div[data-test="vehicle-view-title"], h3, div[class*="title"], p[class*="text-medium"], div[class*="content"] >> text=/^[a-zA-Z ]+$/');
        const name = await nameLocator.first().textContent().catch(() => 'Unknown') || 'Unknown';

        // Try multiple selectors for price
        const priceLocator = row.locator('div[data-test="vehicle-view-price"], span[class*="price"], p:has-text("₹"), div:has-text("₹")');
        let priceText = await priceLocator.first().textContent().catch(() => '0') || '0';
        
        // Clean price text (sometimes it includes "₹" twice or other chars)
        if (priceText) {
             const match = priceText.match(/₹\s*([\d,.]+)/);
             if (match) priceText = match[1];
        }

        const etaLocator = row.locator('div[data-test="vehicle-view-eta"], span[class*="eta"], p:has-text("min"), div:has-text("min")');
        const eta = await etaLocator.first().textContent().catch(() => '') || '';

        console.log(`[Uber] Row ${i}: ${name} - ${priceText} - ${eta}`);

        if (name && priceText) {
             const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
             if (!isNaN(price) && price > 0) {
                estimates.push({
                    platform: 'uber',
                    vehicleType: name.trim() || 'Standard',
                    price: price,
                    currency: 'INR',
                    eta: eta.trim() || 'N/A',
                    confidence: 'high',
                    source: 'live',
                    timestamp: Date.now()
                });
             }
        }
      }

      console.log(`[Uber] Extracted ${estimates.length} estimates.`);
      
      if (estimates.length === 0) {
          console.warn('[Uber] No estimates found via scraping. Falling back to mock data.');
          return this.getMockData(pickup, drop);
      }

      return estimates;

    } catch (error) {
      console.error('[Uber] Error fetching estimates:', error);
      return this.getMockData(pickup, drop);
    } finally {
      if (page) await page.close();
      if (context) await context.close();
    }
  }

  // Fallback implemented
  private getMockData(pickup: GeoLocation, drop: GeoLocation): FareEstimate[] {
    console.log('[Uber] Generating fallback estimates...');
    const distance = calculateDistance(pickup.lat, pickup.lng, drop.lat, drop.lng);
    
    return [
      {
        platform: 'uber',
        vehicleType: 'UberGo',
        price: calculateFare(distance, 'mini'),
        currency: 'INR',
        eta: '5 mins',
        confidence: 'medium',
        source: 'estimate',
        timestamp: Date.now()
      },
      {
        platform: 'uber',
        vehicleType: 'UberPremier',
        price: calculateFare(distance, 'sedan'),
        currency: 'INR',
        eta: '8 mins',
        confidence: 'medium',
        source: 'estimate',
        timestamp: Date.now()
      },
      {
        platform: 'uber',
        vehicleType: 'UberAuto',
        price: calculateFare(distance, 'auto'),
        currency: 'INR',
        eta: '3 mins',
        confidence: 'medium',
        source: 'estimate',
        timestamp: Date.now()
      }
    ];
  }
}
