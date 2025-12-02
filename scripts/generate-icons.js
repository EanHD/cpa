// Run: node scripts/generate-icons.js
// For actual PNG generation, install sharp: npm install sharp
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];

sizes.forEach(size => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${Math.floor(size/6)}" fill="#0a0a1a"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size/3}" fill="#1a1a2e"/>
    <text x="${size/2}" y="${size/2 + size/8}" font-size="${size/2}" text-anchor="middle" fill="#4ade80" font-family="system-ui">$</text>
  </svg>`;
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'public', 'icons', `icon-${size}x${size}.svg`),
    svg
  );
  console.log(\`Created icon-\${size}x\${size}.svg\`);
});

console.log('Icons created as SVG. For PNG, use online converter or sharp library.');
