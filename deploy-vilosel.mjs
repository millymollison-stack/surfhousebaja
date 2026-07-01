import https from 'https';
import http from 'http';
import { writeFileSync } from 'fs';

function fetchTxt(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const req = mod.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Fetch template from GitHub
  console.log('Fetching template...');
  const html = await fetchTxt('https://raw.githubusercontent.com/millymollison-stack/surfhousebaja/main/src/public/template/template.html');
  console.log(`Template: ${html.length} chars`);

  const replacements = {
    '{{TITLE}}': 'Vilosel',
    '{{PROPERTY_TITLE}}': 'Vilosel',
    '{{ADDRESS}}': 'Rio de Janeiro, Brazil',
    '{{PRICE_PER_NIGHT}}': '$0',
    '{{PROPERTY_INTRO}}': 'Your summertime hideaway in Bohemian Botafogo!',
    '{{DESCRIPTION}}': 'Your summertime hideaway in Bohemian Botafogo!',
    '{{IMAGE_1}}': 'https://a0.muscache.com/im/pictures/fe7217ff-0b24-438d-880d-b94722c75bf5.jpg?im_w=1200',
    '{{IMAGE_2}}': 'https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6NDA1NTE4NjI%3D/original/2be254fc-5e53-4a78-a68c-1e18c26cd979.png?im_w=1200',
    '{{SUPABASE_URL}}': 'https://jtzagpbdrqfifdisxipr.supabase.co',
    '{{SUPABASE_ANON_KEY}}': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3MzUyODUsImV4cCI6MjA2MDMxMTI4NX0.uWqc82Hb-qnRq4H9kg5IPykUosm9VvU2s6e8mOalkR0',
  };

  let out = html;
  out = out.replace('<!--APP_JS-->', '<script type="module" crossorigin src="https://www.propbook.pro/scripts/react-assets/assets/index-CTzHXcen.js?v=10"></script>');
  for (const [token, val] of Object.entries(replacements)) {
    out = out.split(token).join(val);
  }

  // Also replace any remaining IMAGE tokens with placeholders
  out = out.split('{{IMAGE_3}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/cbcd139f-bcc6-4afb-93b1-1e904e9c95d7.jpg?im_w=1200');
  out = out.split('{{IMAGE_4}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/45372b00-622c-48d1-a622-2fad60b34528.jpg?im_w=1200');
  out = out.split('{{IMAGE_5}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/53fbbe23-9bf3-4934-9ff0-e9b6dd909ff4.jpg?im_w=1200');
  out = out.split('{{IMAGE_6}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/b4a39805-5521-4904-a73f-b27dd451d739.jpg?im_w=1200');
  out = out.split('{{IMAGE_SIDE_A}}').join('https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6NDA1NTE4NjI%3D/original/2be254fc-5e53-4a78-a68c-1e18c26cd979.png?im_w=1200');
  out = out.split('{{IMAGE_SIDE_B}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/cbcd139f-bcc6-4afb-93b1-1e904e9c95d7.jpg?im_w=1200');
  out = out.split('{{HERO_IMAGE}}').join('https://a0.muscache.com/im/pictures/fe7217ff-0b24-438d-880d-b94722c75bf5.jpg?im_w=1200');
  out = out.split('{{RATING}}').join('5');
  out = out.split('{{REVIEW_COUNT}}').join('193');
  out = out.split('{{GETTING_THERE}}').join('Botafogo is extremely walkable, and there\'s plenty of public transportation nearby. We are a 2 minute walk from the subway!');
  out = out.split('{{LOCAL_AREA}}').join('Lay back, relax, and enjoy! We hope you enjoy your stay with us!');
  out = out.split('{{CONTACT_EMAIL}}').join('davidmollison1+admin@gmail.com');
  out = out.split('{{CURRENT_URL}}').join('https://www.propbook.pro/props/vilosel');
  out = out.split('{{BRAND_HANDLE}}').join('@vilosel');
  out = out.split('{{LATITUDE}}').join('-22.9519');
  out = out.split('{{LONGITUDE}}').join('-43.1822');
  out = out.split('{{AMENITIES_BG_IMAGE}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/cbcd139f-bcc6-4afb-93b1-1e904e9c95d7.jpg?im_w=1200');
  out = out.split('{{REVIEWS_BG_IMAGE}}').join('https://a0.muscache.com/im/pictures/fe7217ff-0b24-438d-880d-b94722c75bf5.jpg?im_w=1200');
  out = out.split('{{DROPDOWNS_BG_IMAGE}}').join('https://a0.muscache.com/im/pictures/airflow/Hosting-40551862/original/45372b00-622c-48d1-a622-2fad60b34528.jpg?im_w=1200');

  writeFileSync('/tmp/vilosel-index.html', out);
  console.log(`Built: ${out.length} chars -> /tmp/vilosel-index.html`);

  // btoa for UTF-8 safe base64
  const b64 = Buffer.from(out).toString('base64');

  // Upload via upload.php
  const result = await postJson('https://www.propbook.pro/upload.php', {
    secret: 'propbook-deploy-2026',
    slug: 'vilosel',
    propertyId: '97e23450-dd97-407c-a7b0-499c8d5cb17d',
    files: { 'index.html': b64 }
  });
  console.log('Upload result:', result);
}

main().catch(console.error);
