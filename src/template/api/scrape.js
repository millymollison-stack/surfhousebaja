const chromium = require('puppeteer');

module.exports = async (req, res) => {
  const url = req.query.url || '';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');
  
  if (!url) {
    res.status(400).send('Missing url parameter');
    return;
  }
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const data = {
    title: 'Property',
    location: 'Location',
    hero: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200'
  };
  
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en'
    });
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Get title
    const titleEl = await page.$('h1');
    if (titleEl) {
      data.title = (await titleEl.evaluate(el => el.textContent)).trim().substring(0, 60);
    }
    
    // Get location
    const h2s = await page.$$('h2');
    if (h2s.length > 0) {
      data.location = await h2s[0].evaluate(el => el.textContent);
    }
    
    // Get hero image
    const imgs = await page.$$('img');
    for (const img of imgs) {
      const src = await img.evaluate(el => el.src);
      if (src && src.includes('muscache.com')) {
        data.hero = src + '?im_w=1200';
        break;
      }
    }
    
  } catch (e) {
    console.error('Scraper error:', e.message);
  } finally {
    await browser.close();
  }
  
  const html = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body{font-family:Inter,sans-serif;background:#0a0a0a;min-height:100vh;position:relative}
.p-bg{position:absolute;inset:0;background:url(${data.hero}) center/cover no-repeat}
.p-bg:after{content:"";position:absolute;inset:0;background:rgba(0,0,0,0.15)}
.p-nav{position:absolute;top:0;left:0;right:0;padding:12px 16px;display:flex;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.4),transparent)}
.p-title{font-size:1rem;text-transform:uppercase;color:#fff;margin-bottom:0;width:70%;flex:0 0 70%}
.p-location{font-size:0.65rem;color:rgba(255,255,255,0.65);margin-bottom:8px}
.p-price{font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:8px}
.p-detail{font-size:0.6rem;color:#fff;background:rgba(255,255,255,0.15);padding:3px 8px;border-radius:4px}
.p-banner{position:absolute;bottom:0;left:0;right:0;padding:16px 14px;background:#000;display:flex;justify-content:space-between;align-items:center}
.p-book-btn{padding:8px 20px;background:#ff5a5f;color:#fff;border-radius:6px;border:none;font-weight:600;cursor:pointer}
</style></head>
<body><div class="p-bg"></div>
<nav class="p-nav"><span style="font-size:0.75rem;font-weight:500;color:#fff">YourBrand.Pro</span><span style="padding:4px 10px;background:rgba(255,255,255,0.25);border-radius:4px;color:#fff;font-size:0.65rem">Sign up</span></nav>
<div style="position:absolute;bottom:52px;left:0;right:0;padding:16px 14px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
    <h1 class="p-title">${data.title}</h1>
    <div class="p-price">$350 <span>/ night</span></div>
  </div>
  <p class="p-location">${data.location}</p>
  <div style="display:flex;gap:8px;margin-top:8px"><span class="p-detail">2 Guests</span><span class="p-detail">1 Bedroom</span><span class="p-detail">1 Bath</span></div>
</div>
<div class="p-banner"><span>128 reviews</span><button class="p-book-btn">Book Now</button></div>
</body></html>`;
  
  res.send(html);
};
