const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  console.log("URL:", req.url); const url = require('url').parse(req.url, true).query.url || '';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');
  
  // Use the separate Python script
  const python = spawn('python3', ['/Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template/src/template/scrape_one.py', url]);

  let output = '';
  python.stdout.on('data', (d) => { output += d; });
  python.stderr.on('data', (d) => { console.log('PY ERR:', d.toString()); });
  
  python.on('close', (code) => {
    const lines = output.trim().split('\n');
    const data = { title: 'Property', location: 'Location', hero: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200' };
    lines.forEach(line => {
      const idx = line.indexOf('=');
      if (idx > -1) {
        const k = line.substring(0, idx);
        const v = line.substring(idx + 1);
        if (k && v) data[k] = v;
      }
    });
    
    const html = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body{font-family:Inter,sans-serif;background:#0a0a0a;min-height:100vh;position:relative}
.p-bg{position:absolute;inset:0;background:url(${data.hero}) center/cover no-repeat}
.p-bg:after{content:"";position:absolute;inset:0;background:rgba(0,0,0,0.15)}
.p-nav{position:absolute;top:0;left:0;right:0;padding:12px 16px;display:flex;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.4),transparent)}
.p-title{font-size:1rem;text-transform:uppercase;color:#fff;margin-bottom:0;width:70%;flex:0 0 70%}
.p-location{font-size:0.65rem;color:rgba(255,255,255,0.65);margin-bottom:8px}.p-description{font-size:0.5rem;color:rgba(255,255,255,0.7);margin-bottom:8px;line-height:1.3}
.p-price{font-size:1.1rem;font-weight:600;color:#fff;margin-bottom:8px}
.p-detail{background:rgba(255,255,255,0.25);padding:4px 8px;border-radius:8px;font-size:10px;color:#fff}
.p-banner{position:absolute;bottom:0;left:0;right:0;padding:16px 14px;background:#000;display:flex;justify-content:space-between;align-items:center}
.p-book-btn{padding:8px 20px;background:#ff5a5f;color:#fff;border-radius:6px;border:none;font-weight:600;cursor:pointer}
</style></head>
<body><div class="p-bg"></div>
        <img src="${data.hero}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0" alt="Hero">
<nav class="p-nav"><span style="font-size:0.75rem;font-weight:500;color:#fff">YourBrand.Pro</span><span style="padding:4px 10px;background:rgba(255,255,255,0.25);border-radius:4px;color:#fff;font-size:0.65rem">Sign up</span></nav>
<div style="position:absolute;bottom:52px;left:0;right:0;padding:16px 14px;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px)">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
    <h1 class="p-title">${data.title || 'Property'}</h1>
    <div class="p-price">$${data.price || '350'} <span style="font-size:0.55rem;font-weight:300">/ night</span></div>
  </div>
  <p class="p-location">${data.location || 'Location'}</p>
  <p class="p-description">${data.description || ""}</p>
  <div style="display:flex;gap:8px;margin-top:8px"><span class="p-detail">${data.guests || '2 Guests'}</span><span class="p-detail">${data.bedrooms || '1 Bedroom'}</span><span class="p-detail">${data.baths || '1 Bath'}</span></div>
</div>
<div class="p-banner"><span style="display:flex;align-items:center;gap:4px"><span style="color:#fff;font-size:10px">&#9733;&#9733;&#9733;&#9733;&#9733;</span><span style="font-size:0.6rem;color:rgba(255,255,255,0.7)">${data.reviews || '128 reviews'}</span></span><button class="p-book-btn">Book Now</button></div>
</body></html>`;
    
    res.end(html);
  });
});

server.listen(6900, () => console.log('Server on 6100'));
