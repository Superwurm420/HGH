const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// Configuration for the 2x2 H-I-G-H grid
const BLACK = '#000000';
const BLUE = '#0066FF';
const TILE_PADDING = 0.12; // 12% padding for safe area

async function createIcon(size, isMaskable = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Determine safe area based on maskable requirements
  // Maskable icons may be cropped into circles/squircles
  // Safe area is typically 40% of icon centered (20% padding on each side)
  const safeAreaRatio = isMaskable ? 0.66 : 0.92; // 66% or 92%
  const outerPadding = (1 - safeAreaRatio) / 2 * size;
  const gridSize = safeAreaRatio * size;
  
  const tileGap = gridSize * 0.05; // 5% gap between tiles
  const tileSize = (gridSize - tileGap) / 2;
  const startX = outerPadding + (gridSize - 2 * tileSize - tileGap) / 2;
  const startY = outerPadding + (gridSize - 2 * tileSize - tileGap) / 2;
  
  const cornerRadius = tileSize * 0.15; // rounded corners
  
  function drawTile(x, y, letter, color) {
    const rectX = startX + x * (tileSize + tileGap);
    const rectY = startY + y * (tileSize + tileGap);
    
    // Draw rounded rectangle
    ctx.beginPath();
    ctx.roundRect(rectX, rectY, tileSize, tileSize, cornerRadius);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Draw letter
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${tileSize * 0.6}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, rectX + tileSize / 2, rectY + tileSize * 0.52);
  }
  
  // 2x2 Grid layout:
  // H (Black) | I (Blue)
  // G (Black) | H (Black)
  drawTile(0, 0, 'H', BLACK);
  drawTile(1, 0, 'I', BLUE);
  drawTile(0, 1, 'G', BLACK);
  drawTile(1, 1, 'H', BLACK);
  
  return canvas.encode('png');
}

async function main() {
  const icons = [
    { size: 192, filename: 'icon-192.png', maskable: false },
    { size: 512, filename: 'icon-512.png', maskable: false },
    { size: 512, filename: 'icon-512-maskable.png', maskable: true },
    { size: 64, filename: 'favicon.png', maskable: false },
  ];
  
  for (const icon of icons) {
    console.log(`Generating ${icon.filename} (${icon.size}x${icon.size})...`);
    const pngData = await createIcon(icon.size, icon.maskable);
    fs.writeFileSync(path.join(__dirname, icon.filename), pngData);
    console.log(`✓ Created ${icon.filename}`);
  }
  
  console.log('\nAll icons generated successfully!');
}

main().catch(console.error);
