
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const platform = process.argv[2]; // 'ola' or 'uber'

if (!platform || (platform !== 'ola' && platform !== 'uber')) {
  console.error('Please provide platform: "ola" or "uber"');
  process.exit(1);
}

const COOKIE_DIR = path.join(process.cwd(), 'cookies');
if (!fs.existsSync(COOKIE_DIR)) {
  fs.mkdirSync(COOKIE_DIR);
}

const COOKIE_PATH = path.join(COOKIE_DIR, `${platform}.json`);

(async () => {
  console.log(`[${platform}] Launching browser for authentication...`);
  console.log(`[${platform}] Please log in to your account in the browser window.`);
  
  const browser = await chromium.launch({
    headless: false, // Show the browser
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  // Load existing cookies if any
  if (fs.existsSync(COOKIE_PATH)) {
    try {
      const existingCookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
      await context.addCookies(existingCookies);
      console.log(`[${platform}] Loaded existing cookies.`);
    } catch (e) {
      console.warn(`[${platform}] Failed to load existing cookies.`);
    }
  }

  const url = platform === 'ola' ? 'https://book.olacabs.com/' : 'https://m.uber.com/';
  await page.goto(url);

  console.log(`[${platform}] Waiting for you to log in... (Timeout: 3 minutes)`);

  // Wait for a sign of successful login
  // Ola: URL usually stays on book.olacabs.com but we look for a specific element that appears when logged in
  // Uber: URL might change or we look for 'sid' cookie
  
  try {
      if (platform === 'ola') {
          // For Ola, we wait until we see a profile element or similar, or just wait for time
          // Ola's logged in state usually shows a map with pickup location set
          await page.waitForSelector('div[data-testid="profile-icon"], div.user-profile, div[class*="profile"]', { timeout: 180000 });
      } else {
          // For Uber, wait for the ride request screen
          await page.waitForSelector('div[data-test="ride-request-screen"], div[data-testid="home-header"]', { timeout: 180000 });
      }
      console.log(`[${platform}] Login detected! Saving cookies...`);
  } catch (e) {
      console.log(`[${platform}] Timeout reached or manual close. Saving cookies anyway...`);
  }

  const cookies = await context.cookies();
  fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  console.log(`[${platform}] Cookies saved to ${COOKIE_PATH}`);
  console.log(`[${platform}] You can now close the browser.`);

  await browser.close();
})();
