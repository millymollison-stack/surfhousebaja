// Browser-based AirBnB scraper endpoint
const http = require('http');
const { spawn } = require('child_process');

// Use playwright to scrape
const { chromium } = require('playwright');

const PORT = 6911;

async function scrapeAirbnb(url) {
  const data = {
    title: null,
    location: null,
    price: null,
    hero: null,
    description: null,
    details: null,
    images: []
  };
  
  let browser;
  try {
    // Launch browser
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewportSize({ width: 1280, height: 900 });
    
    // Navigate to URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Try multiple selectors for each field
    
    // TITLE
    const titleEl = await page.locator('h1').first();
    if (await titleEl.count() > 0) {
      data.title = (await titleEl.textContent()).trim().substring(0, 80);
    }
    
    // LOCATION
    const locationEl = await page.locator('[data-testid="book-it-default-header"] + div, h2:has-text("Entire"), h2:has-text("Private")').first();
    if (await locationEl.count() > 0) {
      data.location = (await locationEl.textContent()).trim().substring(0, 100);
    }
    
    // PRICE
    const priceEl = await page.locator('[data-testid="price-item-total"], [class*="price"] span').first();
    if (await priceEl.count() > 0) {
      const txt = await priceEl.textContent();
      const match = txt.match(/\$(\d+)/);
      if (match) data.price = match[1];
    }
    
    // DETAILS (Guests, beds, baths)
    const detailEls = await page.locator('[class*="detail"], .hitpo [class*="meta"]').all();
    if (detailEls.length > 0) {
      for (const el of detailEls.slice(0, 3)) {
        const txt = await el.textContent();
        if (txt && (txt.includes('guest') || txt.includes('bed') || txt.includes('bath'))) {
          data.details = (data.details || '') + txt + ' ';
        }
      }
    }
    
    // HERO IMAGE
    const heroEl = await page.locator('[data-testid="room-detail-carousel"] img, .hitpo img').first();
    if (await heroEl.count() > 0) {
      let src = await heroEl.getAttribute('src');
      if (src && src.includes('muscache')) {
        data.hero = src + (src.includes('?') ? '&' : '?') + 'im_w=1200';
      }
    }
    
    // IMAGES (Gallery)
    const galleryEls = await page.locator('[data-testid="room-detail-carousel"] img').all();
    for (const img of galleryEls.slice(0, 8)) {
      let src = await img.getAttribute('src');
      if (src && src.includes('muscache')) {
        data.images.push(src + (src.includes('?') ? '&' : '?') + 'im_w=720');
      }
    }
    
    // DESCRIPTION
    const descEl = await page.locator('[class*="description"], [class*="about"]').first();
    if (await descEl.count() > 0) {
      data.description = (await descEl.textContent()).trim().substring(0, 300);
    }
    
    console.log('Scraped:', JSON.stringify(data));
    
  } catch (e) {
    console.error('Scraper error:', e.message);
    data.error = e.message;
  } finally {
    if (browser) await browser.close();
  }
  
  return data;
}

// Simple HTTP server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url.startsWith('/scrape')) {
    const urlMatch = req.url.match(/url=([^&]+)/);
    let url = urlMatch ? decodeURIComponent(urlMatch[1]) : '';
    
    if (!url) {
      res.status(400).send(JSON.stringify({ error: 'Missing url' }));
      return;
    }
    
    // Normalize URL
    if (!url.startsWith('http')) {
      if (url.includes('airbnb.com')) {
        url = 'https://www.' + url;
      } else {
        url = 'https://www.airbnb.com/rooms/' + url;
      }
    }
    
    console.log('Scraping:', url);
    
    const data = await scrapeAirbnb(url);
    res.send(JSON.stringify({ data }, null, 2));
  } else {
    res.status(404).send('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Browser scraper running on port ${PORT}`);
});