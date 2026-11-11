#!/bin/bash
set -e

SIZES=(16 32 48 128)

for size in "${SIZES[@]}"; do
  # Calculate dimensions and font size
  FONT_SIZE=$((size * 55 / 100))
  Y_POS=$((size * 68 / 100))
  RX=$((size * 22 / 100))
  
  cat << SVG > "icons/icon${size}.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E11D48"/>
      <stop offset="100%" stop-color="#9F1239"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${RX}" fill="url(#grad)"/>
  <text x="$((size / 2))" y="${Y_POS}" 
        font-size="${FONT_SIZE}" 
        font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" 
        font-weight="bold" 
        fill="#FFFFFF" 
        text-anchor="middle">拼</text>
</svg>
SVG

  sips -s format png "icons/icon${size}.svg" --out "icons/icon${size}.png" >/dev/null
  echo "Generated icons/icon${size}.png (${size}x${size})"
done

echo "All icons generated successfully!"
