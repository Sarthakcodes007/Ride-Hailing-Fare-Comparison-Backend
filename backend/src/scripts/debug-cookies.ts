
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  const platform = process.argv[2] || 'uber';
  console.log(`Debug: Testing cookies for ${platform}`);

  const cookiePath = path.join(process.cwd(), 'cookies', `${platform}.json`);
  if (!fs.existsSync(cookiePath)) {
    console.error(`Debug: No cookie file found at ${cookiePath}`);
    return;
  }

  const rawCookies = fs.readFileSync(cookiePath, 'utf-8');
  let cookies;
  try {
    cookies = JSON.parse(rawCookies);
  } catch (e) {
    console.error('Debug: Invalid JSON in cookie file');
    return;
  }

  console.log(`Debug: Found ${cookies.length} cookies`);

  const browser = await chromium.launch({ headless: true }); // Headless for speed, but capturing content
  const context = await browser.newContext();

  // Sanitize like adapter
  const validCookies = cookies.map((c: any) => {
    if (c.sameSite === 'unspecified' || c.sameSite === 'no_restriction') {
      c.sameSite = 'None';
    }
    if (c.sameSite === 'lax') c.sameSite = 'Lax';
    if (c.sameSite === 'strict') c.sameSite = 'Strict';
    if (c.sameSite === 'none') c.sameSite = 'None';
    return c;
  });

  try {
    await context.addCookies(validCookies);
    console.log('Debug: Cookies injected');
  } catch (e) {
    console.error('Debug: Failed to inject cookies', e);
  }

  const page = await context.newPage();

  let url = '';
  if (platform === 'uber') {
    // Deep link example
    const pickup = encodeURIComponent(JSON.stringify({latitude: 28.7041, longitude: 77.1025})); // Delhi
    const drop = encodeURIComponent(JSON.stringify({latitude: 28.5355, longitude: 77.3910})); // Noida
    url = `https://m.uber.com/looking?pickup=${pickup}&drop=${drop}`;
  } else {
    url = 'https://book.olacabs.com/';
  }

  console.log(`Debug: Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // Wait for redirects

  console.log(`Debug: Final URL: ${page.url()}`);
  
  if (page.url().includes('login') || page.url().includes('auth')) {
    console.error('Debug: Redirected to LOGIN page. Session invalid.');
  } else {
    console.log('Debug: Seem to be logged in (or at least not on login page).');
  }

  // Dump cookies after navigation
  const currentCookies = await context.cookies();
  const sessionCookie = currentCookies.find(c => c.name === 'sid' || c.name === 'jwt-session' || c.name === 'token');
  console.log('Debug: Session cookie present after nav:', !!sessionCookie);

  await browser.close();
})();
