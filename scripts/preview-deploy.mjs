/**
 * Preview deploy — pushes Surf House Baja property to a preview URL
 * so David can see the React template without signing up.
 * 
 * Usage: node scripts/preview-deploy.mjs
 */

import { execSync } from 'child_process';

const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0MTcwMDAsImV4cCI6MjA2NTk5MzAwMH0.XrEO和个人信息和 scoutCSF0B-gjDI94YGe2tkwTfbkMUaY2KGR7Y';
const PROPERTY_ID = 'efa8d280-e97c-4bc4-b4bf-1398fb676b1a';
const SLUG = 'surfhousebaja-preview';
const HOSTINGER_DIR = `/home/u805830916/domains/propbook.pro/public_html/props/${SLUG}`;
const SITE_URL = `https://www.propbook.pro/props/${SLUG}`;

async function fetchProperty() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?id=eq.${PROPERTY_ID}&select=*&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  const data = await res.json();
  return data?.[0] || null;
}

function ssh(cmd) {
  return execSync(`sshpass -p 'Clawbot12!' ssh -o StrictHostKeyChecking=no -p 65002 u805830916@82.29.86.252 "${cmd}"`, { encoding: 'utf8' });
}

function sftpWrite(filename, content) {
  const cmd = `sshpass -p 'Clawbot12!' sftp -o StrictHostKeyChecking=no -P 65002 u805830916@82.29.86.252 <<'SFTP_EOF'
put /dev/stdin "${HOSTINGER_DIR}/${filename}"
bye
SFTP_EOF`;
  const p = execSync(cmd, { input: content, encoding: 'utf8' });
}

async function main() {
  console.log('Fetching Surf House Baja property from Supabase...');
  const property = await fetchProperty();
  
  if (!property) {
    console.error('❌ Property not found');
    return;
  }
  
  console.log(`✅ Got property: ${property.title}`);
  console.log(`   Address: ${property.address}`);
  console.log(`   Price: $${property.price_per_night}/night`);
  console.log(`   Hero: ${property.hero_image?.slice(0, 60)}...`);

  // Fetch template files from GitHub
  const githubBase = 'https://raw.githubusercontent.com/millymollison-stack/surfhousebaja/main/src/public/template';
  
  console.log('\nFetching template files from GitHub...');
  const [indexHtml, appJs, stylesCss] = await Promise.all([
    fetch(`${githubBase}/index.html`).then(r => r.text()),
    fetch(`${githubBase}/app.js`).then(r => r.text()),
    fetch(`${githubBase}/styles.css`).then(r => r.text()),
  ]);
  console.log('✅ Template files loaded');

  // Inject config into index.html
  const configuredHtml = indexHtml
    .replace('{{SUPABASE_URL}}', SUPABASE_URL)
    .replace('{{SUPABASE_ANON_KEY}}', SUPABASE_ANON_KEY)
    .replace('{{PROPERTY_SLUG}}', SLUG);

  // Create directory on Hostinger
  console.log('\nCreating directory on Hostinger...');
  ssh(`mkdir -p '${HOSTINGER_DIR}' && echo DIR_OK`);

  // Write files
  console.log('Writing index.html...');
  sftpWrite('index.html', configuredHtml);
  console.log('Writing app.js...');
  sftpWrite('app.js', appJs);
  console.log('Writing styles.css...');
  sftpWrite('styles.css', stylesCss);

  console.log(`\n✅ Preview deployed!`);
  console.log(`   🔗 ${SITE_URL}`);
  console.log(`\n   The React template will load property data from Supabase`);
  console.log(`   at runtime. Edit the property in Supabase dashboard and`);
  console.log(`   refresh to see changes instantly.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});