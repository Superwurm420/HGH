const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'icons');

async function convertSVG(svgFile, outputFile, size) {
  const svgPath = path.join(iconsDir, svgFile);
  const outputPath = path.join(iconsDir, outputFile);
  
  const svgBuffer = fs.readFileSync(svgPath);
  
  await sharp(svgBuffer)
    .png()
    .resize(size, size)
    .toFile(outputPath);
  
  console.log(`✓ Created ${outputFile} (${size}x${size})`);
}

async function main() {
  console.log('Generating HGH icons...\n');
  
  // Transparent icons
  await convertSVG('icon-transparent.svg', 'icon-192.png', 192);
  await convertSVG('icon-transparent.svg', 'icon-512.png', 512);
  
  // Maskable icon
  await convertSVG('icon-maskable.svg', 'icon-512-maskable.png', 512);
  
  // Also generate a favicon
  await convertSVG('icon-transparent.svg', 'favicon.png', 32);
  
  console.log('\n✅ All icons generated!');
}

main().catch(console.error);
