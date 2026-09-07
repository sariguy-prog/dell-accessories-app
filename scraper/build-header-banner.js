// בונה את site/images/header-banner.jpg מתוך תמונת פרסום רחבה (למשל באנר קמפיין
// של הספק), עם "וילון" (scrim) כהה ומרוכך מעל האזור שבו יושב הכותרת שלנו -
// כדי שהמלל המקורי שצרוב בתמונה לא יתנגש עם הכותרת של האתר.
//
// שימוש:
//   node scraper/build-header-banner.js "<נתיב לתמונת המקור>"
//
// אם יש קמפיין/באנר חדש בעתיד - פשוט מריצים שוב עם קובץ המקור החדש. יכול
// להיות שיהיה צריך לכוון את rectX/rectW בהתאם למיקום המלל בבאנר החדש (ר'
// README, סעיף "עדכון באנר הכותרת").

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "site", "images", "header-banner.jpg");

const SRC = process.argv[2];
if (!SRC) {
  console.error('שימוש: node scraper/build-header-banner.js "<נתיב לתמונת המקור>"');
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
const TARGET_W = 2400;
const SCALE = TARGET_W / meta.width;
const TARGET_H = Math.round(meta.height * SCALE);
const scaled = (v) => Math.round(v * SCALE);

// אזור הכיסוי - מותאם לבאנר "חברי מועדון יקרים" (6750x1350). בבאנר אחר יש
// לכוון את הערכים האלה (יחסית לרוחב/גובה תמונת המקור המקורית, לא ל-2400).
const rectX = scaled(2700);
const rectY = scaled(-450);
const rectW = scaled(2700);
const rectH = scaled(1450);
const blur = scaled(40);

const scrimSvg = `
<svg width="${TARGET_W}" height="${TARGET_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soften" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
  </defs>
  <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="#04213f" fill-opacity="1" filter="url(#soften)"/>
</svg>`;

await sharp(SRC)
  .resize({ width: TARGET_W })
  .composite([{ input: Buffer.from(scrimSvg), top: 0, left: 0 }])
  .jpeg({ quality: 78, mozjpeg: true })
  .toFile(OUT);

console.log(`נכתב: ${OUT} (${TARGET_W}x${TARGET_H})`);
