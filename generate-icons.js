// Generate simple SVG icons and save as files
const fs = require('fs');

function createSvgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size*0.15}" fill="#1b5e20"/>
  <rect x="${size*0.05}" y="${size*0.05}" width="${size*0.9}" height="${size*0.9}" rx="${size*0.1}" fill="none" stroke="#f9a825" stroke-width="${size*0.02}"/>
  <text x="50%" y="38%" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="${size*0.18}" font-weight="bold">Stock</text>
  <text x="50%" y="58%" text-anchor="middle" fill="#f9a825" font-family="Arial" font-size="${size*0.18}" font-weight="bold">Cheque</text>
  <text x="50%" y="78%" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="${size*0.1}">SF</text>
</svg>`;
}

fs.writeFileSync('public/icon-192.svg', createSvgIcon(192));
fs.writeFileSync('public/icon-512.svg', createSvgIcon(512));
console.log('SVG icons created');
