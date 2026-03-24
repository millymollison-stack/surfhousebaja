const http = require('http');
const { spawn } = require('child_process');

const server = http.createServer((req, res) => {
  const url = require('url').parse(req.url, true).query.url || '';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');
  
  const python = spawn('python3', ['-c', `
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import time

url = '${url}'
opts = Options()
opts.add_argument('--headless')
opts.add_argument('--no-sandbox')
d = webdriver.Chrome(options=opts)

data = {'title': 'Property', 'location': 'Location', 'hero': 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200'}

try:
    d.get(url)
    time.sleep(5)
    data['title'] = d.find_element(By.CSS_SELECTOR, 'h1').text[:60]
    h2s = d.find_elements(By.CSS_SELECTOR, 'h2')
    if h2s: data['location'] = h2s[0].text
    imgs = d.find_elements(By.CSS_SELECTOR, 'img')
    for img in imgs:
        src = img.get_attribute('src') or ''
        if 'muscache.com' in src:
            # Fix: don't double-append
            if '?' in src:
                data['hero'] = src.split('?')[0] + '?im_w=1200'
            else:
                data['hero'] = src + '?im_w=1200'
            break
except: pass
finally:
    d.quit()

print('TITLE=' + data['title'])
print('LOCATION=' + data['location'])
print('HERO=' + data['hero'])
  `]);

  let output = '';
  python.stdout.on('data', (d) => { output += d; });
  
  python.on('close', () => {
    const data = { title: 'Property', location: 'Location', hero: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200' };
    output.split('\n').forEach(line => {
      const [k, v] = line.split('=');
      if (k && v) data[k] = v;
    });
    
    // Using simpler CSS - img tag instead of background
    const html = `<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body { margin: 0; padding: 0; font-family: Inter, sans-serif; background: #000; }
.hero-img { width: 100%; height: 100vh; object-fit: cover; position: absolute; inset: 0; }
.overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.8)); }
.info { position: absolute; bottom: 80px; left: 20px; right: 20px; color: white; }
.info h1 { font-size: 24px; text-transform: uppercase; margin: 0 0 8px 0; }
.info p { font-size: 14px; margin: 0 0 12px 0; opacity: 0.8; }
.price { font-size: 20px; font-weight: 600; }
.banner { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px; background: #000; display: flex; justify-content: space-between; align-items: center; }
.btn { background: #ff5a5f; color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
</style>
</head>
<body>
<img class="hero-img" src="${data.hero}" alt="Hero">
<div class="overlay"></div>
<div class="info">
  <h1>${data.title}</h1>
  <p>${data.location}</p>
  <div class="price">$350 / night</div>
</div>
<div class="banner">
  <span>128 reviews</span>
  <button class="btn">Book Now</button>
</div>
</body>
</html>`;
    
    res.end(html);
  });
});

server.listen(6500, () => console.log('Server on 6200'));
