const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const server = http.createServer((req, res) => {
  const urlParts = require('url').parse(req.url, true);
  const url = urlParts.query.url || '';
  
  console.log('=== Request received ===');
  console.log('Full URL:', req.url);
  console.log('URL param:', url);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');
  
  if (!url) {
    res.end('<html><body><h1>No URL provided</h1></body></html>');
    return;
  }
  
  // Use the Python script with better error handling
  const python = spawn('python3', [
    '/Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template/src/template/scrape_one.py', 
    url
  ]);

  let output = '';
  let errorOutput = '';
  
  python.stdout.on('data', (d) => { 
    output += d; 
    console.log('Python stdout:', d.toString().substring(0, 100));
  });
  
  python.stderr.on('data', (d) => { 
    errorOutput += d; 
    console.log('Python stderr:', d.toString());
  });
  
  python.on('close', (code) => {
    console.log('Python exited with code:', code);
    console.log('Python output:', output.substring(0, 200));
    
    if (code !== 0 || !output.includes('title=')) {
      // Fallback response
      const html = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body{font-family:Inter,sans-serif;background:#0a0a0a;color:white;padding:40px;text-align:center}
</style></head>
<body>
<h1>Loading...</h1>
<p>URL: ${url}</p>
<p>Error: ${errorOutput || 'Scraping failed'}</p>
</body></html>`;
      res.end(html);
      return;
    }
    
    const data = { title: 'Property', location: 'Location', hero: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200' };
    output.trim().split('\n').forEach(line => {
      const [k, v] = line.split('=');
      if (k && v) data[k] = v;
    });
    
    console.log('Parsed data:', data);
    
    const html = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body{font-family:Inter,sans-serif;background:#0a0a0a;min-height:100vh;position:relative}
.p-bg{position:absolute;inset:0;background:url(${data.hero}) center/cover no-repeat}
.p-bg:after{content:"";position:absolute;inset:0;background:rgba(0,0,0,0.15)}
.p-nav{position:absolute;top:0;left:0;right:0;padding:12px 16px;display:flex;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.4),transparent)}
.p-title{font-size:1rem;text-transform:uppercase;color:#fff;margin-bottom:4px}
.p-location{font-size:0.65rem;color:rgba(255,255,255,0.65);margin-bottom:8px}
.p-price{font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:8px}
.p-detail{font-size:0.6rem;color:#fff;background:rgba(255,255,255,0.15);padding:3px 8px;border-radius:4px}
.p-banner{position:absolute;bottom:0;left:0;right:0;padding:16px 14px;background:#000;display:flex;justify-content:space-between;align-items:center}
.p-book-btn{padding:8px 20px;background:#ff5a5f;color:#fff;border-radius:6px;border:none;font-weight:600;cursor:pointer}
</style></head>
<body><div class="p-bg"></div>
<nav class="p-nav"><span style="font-size:0.75rem;font-weight:500;color:#fff">YourBrand.Pro</span><span style="padding:4px 10px;background:rgba(255,255,255,0.25);border-radius:4px;color:#fff;font-size:0.65rem">Sign up</span></nav>
<div style="position:absolute;bottom:52px;left:0;right:0;padding:16px 14px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)">
  <h1 class="p-title">${data.title}</h1>
  <p class="p-location">${data.location}</p>
  <div class="p-price">$350 <span>/ night</span></div>
  <div style="display:flex;gap:8px"><span class="p-detail">2 Guests</span><span class="p-detail">1 Bedroom</span><span class="p-detail">1 Bath</span></div>
</div>
<div class="p-banner"><span>128 reviews</span><button class="p-book-btn">Book Now</button></div>
</body></html>`;
    
    res.end(html);
  });
});

server.listen(6300, () => console.log('Server on 6200 with debugging'));
