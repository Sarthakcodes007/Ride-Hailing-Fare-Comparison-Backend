import { chromium, Browser, BrowserContext, Page } from 'playwright';

export class BrowserService {
  private static instance: BrowserService;
  private browser: Browser | null = null;
  
  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  public async init(): Promise<void> {
    if (!this.browser) {
      console.log('Launching browser...');
      this.browser = await chromium.launch({
        headless: true, // Default to headless as requested
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  public async getNewPage(): Promise<{ page: Page; context: BrowserContext }> {
    if (!this.browser) {
      await this.init();
    }
    const context = await this.browser!.newContext({
      viewport: { width: 390, height: 844 }, // Mobile viewport
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      geolocation: { longitude: 77.5946, latitude: 12.9716 }, // Default to Bangalore
      permissions: ['geolocation'],
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata'
    });
    const page = await context.newPage();
    return { page, context };
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
