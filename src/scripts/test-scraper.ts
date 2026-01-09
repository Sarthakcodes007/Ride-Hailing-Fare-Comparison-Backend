
import { UberAdapter } from '../adapters/uber.adapter';
import { OlaAdapter } from '../adapters/ola.adapter';
import { RapidoAdapter } from '../adapters/rapido.adapter';
import { BrowserService } from '../services/browser.service';
import fs from 'fs';
import path from 'path';

// Mock locations (Bangalore)
const pickup = { lat: 12.9716, lng: 77.5946 };
const drop = { lat: 12.9352, lng: 77.6245 };

// Delhi locations (from user screenshot)
const pickupDelhi = { lat: 28.7499, lng: 77.1175 };
const dropDelhi = { lat: 28.6304, lng: 77.2177 };

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

(async () => {
    console.log('Starting Scraper Test...');
    
    // Initialize BrowserService
    const browserService = BrowserService.getInstance();
    
    // Test Uber
    console.log('\n--- Testing Uber ---');
    const uber = new UberAdapter();
    try {
        const estimates = await uber.getFareEstimate(pickupDelhi, dropDelhi);
        console.log('Uber Estimates:', JSON.stringify(estimates, null, 2));
        if (estimates.length === 0) {
            console.log('Uber returned empty. Checking for error logs...');
        }
    } catch (e) {
        console.error('Uber Error:', e);
    }

    // Test Ola
    console.log('\n--- Testing Ola ---');
    const ola = new OlaAdapter();
    try {
        const estimates = await ola.getFareEstimate(pickupDelhi, dropDelhi);
        console.log('Ola Estimates:', JSON.stringify(estimates, null, 2));
    } catch (e) {
        console.error('Ola Error:', e);
    }

    // Cleanup
    await browserService.close();
    console.log('\nTest Complete.');
})();
