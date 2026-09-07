// סקריפט סקרייפינג לקטלוג אביזרי וציוד Dell באתר cms.co.il
// מריצים ידנית עם: npm run scrape
// הפלט נכתב ל- site/data/products.json כדי שהאתר הסטטי יוכל לקרוא אותו ישירות.
//
// כל "מחלקה" (department) נסרקת מכתובת קטגוריית-משנה נפרדת באתר הספק, ומאומתת
// בנפרד - אם מחלקה אחת נכשלת בבדיקת התקינות, שאר המחלקות עדיין מתעדכנות כרגיל
// והנתונים הישנים של המחלקה שנכשלה נשארים כמו שהם.

import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "site", "data", "products.json");
const BACKUP_PATH = path.join(__dirname, "..", "site", "data", "products.rejected.json");

const CONTACT_EMAIL = "sariguy@gmail.com";
const USER_AGENT = `SmartDeal-CatalogBot/1.0 (+contact: ${CONTACT_EMAIL})`;

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 2000;
const MIN_ACCEPTABLE_RATIO = 0.9; // אם נאספו פחות מ-90% מהריצה הקודמת - לעצור ולהתריע (לכל מחלקה בנפרד)

// ============================================================
// מחלקות (departments) - קטגוריות המשנה של "אביזרי מחשב" מסוננות ל-Dell בלבד
// ============================================================

const KNOWN_COLORS = {
  "כסוף": "כסוף",
  "שחור": "שחור",
  "אפור": "אפור",
  "לבן": "לבן",
  "ורוד": "ורוד",
  "כחול": "כחול",
  silver: "כסוף",
  black: "שחור",
  grey: "אפור",
  gray: "אפור",
  white: "לבן",
  pink: "ורוד",
  blue: "כחול",
};

// שורת המפרט הקצרה של אביזרים הרבה יותר מינימלית מזו של מחשבים - ברוב המקרים
// זו רק תקופת האחריות (למשל "1Year" / "3Year"), ולפעמים אין בכלל ערך. שם
// המוצר עצמו הוא המקור העיקרי לצבע/קישוריות (Bluetooth/Wireless וכו'), ולכן
// גם מזהים אותם משם.
function parseAccessoryAttributes(rawText, name) {
  const tokens = rawText
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);

  const result = {
    warranty_years: null,
    color: null,
    connectivity: null,
  };

  for (const token of tokens) {
    const warrantyMatch = token.match(/^(\d+)\s*year/i);
    if (warrantyMatch) {
      result.warranty_years = parseInt(warrantyMatch[1], 10);
      continue;
    }
  }

  const nameLower = (name || "").toLowerCase();
  if (/bluetooth/.test(nameLower)) {
    result.connectivity = "Bluetooth";
  } else if (/wireless/.test(nameLower)) {
    result.connectivity = "Wireless";
  } else if (/\busb-c\b|\btype-c\b/.test(nameLower)) {
    result.connectivity = "USB-C";
  }

  for (const [key, value] of Object.entries(KNOWN_COLORS)) {
    const re = new RegExp(`(^|[\\s-])${key}([\\s-]|$)`, "i");
    if (re.test(name || "")) {
      result.color = value;
      break;
    }
  }

  return result;
}

const CATEGORIES = [
  {
    id: "chargers",
    label: "מטענים",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-מטענים-computer-acc/",
  },
  {
    id: "speakers",
    label: "רמקולים",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-רמקולים/",
  },
  {
    id: "bags",
    label: "תיקים",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-תיקים-computer-acc/",
  },
  {
    id: "headphones",
    label: "אוזניות",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-אוזניות/",
  },
  {
    id: "webcams",
    label: "מצלמות",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-מצלמות-computer-acc/",
  },
  {
    id: "mice",
    label: "עכברים",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-עכברים/",
  },
  {
    id: "keyboards",
    label: "מקלדות",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-מקלדות/",
  },
  {
    id: "keyboard-mouse-sets",
    label: "סט מקלדת ועכבר",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-סט-מקלדת-ועכבר/",
  },
  {
    id: "docking-stations",
    label: "תחנות עגינה",
    url: "https://cms.co.il/product-category/computer-acc/brand-dell/prodoct_cat-תחנות-עגינה-computer-acc/",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`בקשה נכשלה עבור ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

function parseProductCard($, el, category) {
  const $el = $(el);
  const classList = ($el.attr("class") || "").split(/\s+/);

  const nameLink = $el.find("h6.product-name a").first();
  const name = nameLink.text().trim();
  const url = nameLink.attr("href") || "";

  const img = $el.find(".thumb-wrapper img").first();
  const image = img.attr("data-lazy-src") || img.attr("src") || "";

  const skuText = $el.find(".electron-sku").first().text().trim();
  const sku = skuText || null;

  const attributesText = $el.find(".product-attributes").first().text().trim();
  const attributes = parseAccessoryAttributes(attributesText, name);

  const inStock = classList.includes("instock");

  if (!name || !url || !sku) {
    return null;
  }

  return {
    sku,
    name,
    category: category.id,
    url,
    image,
    inStock,
    rawSpec: attributesText,
    ...attributes,
  };
}

// מטבלת "מפרט יצרן" בעמוד המוצר עצמו - קיימת רק בחלק מהמוצרים (בעיקר אביזרים
// פשוטים כמו עכבר בסיסי לרוב לא כוללים טבלה כזו בכלל).
async function scrapeFullSpecs(productUrl) {
  const html = await fetchHtml(productUrl);
  const $ = cheerio.load(html);

  const specs = [];
  $(".woocommerce-product-attributes tr").each((_, row) => {
    const label = $(row).find(".woocommerce-product-attributes-item__label").text().trim();
    const value = $(row).find(".woocommerce-product-attributes-item__value").text().trim();
    if (label && value) specs.push({ label, value });
  });

  return specs;
}

async function scrapeListingPage(category, pageNumber) {
  const url = pageNumber === 1 ? category.url : `${category.url}page/${pageNumber}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  let maxPage = null;
  const filtersAttr = $(".shop-data-filters").attr("data-shop-filters");
  if (filtersAttr) {
    try {
      const parsed = JSON.parse(filtersAttr);
      if (parsed.max_page) maxPage = parseInt(parsed.max_page, 10);
    } catch {
      // מתעלמים - ניפול חזרה על זיהוי לפי מספר תוצאות ריק
    }
  }

  const products = [];
  $(".electron-loop-product").each((_, el) => {
    const product = parseProductCard($, el, category);
    if (product) products.push(product);
  });

  return { products, maxPage };
}

async function scrapeCategoryListing(category) {
  console.log(`\nמתחיל סקרייפינג "${category.label}" מ-${category.url} ...`);

  const { products: firstPageProducts, maxPage } = await scrapeListingPage(category, 1);
  const allProducts = [...firstPageProducts];
  const totalPages = maxPage || 1;

  console.log(`  עמוד 1/${totalPages}: נאספו ${firstPageProducts.length} מוצרים`);

  for (let page = 2; page <= totalPages; page++) {
    await sleep(randomDelay());
    const { products } = await scrapeListingPage(category, page);
    console.log(`  עמוד ${page}/${totalPages}: נאספו ${products.length} מוצרים`);
    allProducts.push(...products);
  }

  // הסרת כפילויות לפי מק"ט, ליתר ביטחון
  const bySku = new Map();
  for (const p of allProducts) {
    bySku.set(p.sku, p);
  }
  return Array.from(bySku.values());
}

async function scrapeFullSpecsForAll(products) {
  console.log(`\nאוסף מפרט מלא מעמוד המוצר עבור ${products.length} מוצרים...`);
  let failedSpecs = 0;
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    await sleep(randomDelay());
    try {
      product.fullSpecs = await scrapeFullSpecs(product.url);
    } catch (err) {
      failedSpecs++;
      product.fullSpecs = [];
      console.error(`  נכשל מפרט מלא עבור ${product.name} (${product.sku}): ${err.message}`);
    }
    if ((i + 1) % 10 === 0 || i === products.length - 1) {
      console.log(`  ${i + 1}/${products.length} מוצרים`);
    }
  }
  if (failedSpecs > 0) {
    console.warn(`\n⚠️  לא ניתן היה לאסוף מפרט מלא עבור ${failedSpecs} מוצרים (נשארו עם מפרט קצר בלבד).`);
  }
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function main() {
  const existing = (await loadExisting()) || [];
  const existingByCategory = new Map();
  for (const p of existing) {
    const catId = p.category || "mice";
    if (!existingByCategory.has(catId)) existingByCategory.set(catId, []);
    existingByCategory.get(catId).push(p);
  }

  const finalProducts = [];
  const rejected = [];
  let anyRejected = false;

  for (const category of CATEGORIES) {
    const scraped = await scrapeCategoryListing(category);
    const existingForCategory = existingByCategory.get(category.id) || [];

    console.log(`  סה"כ "${category.label}": נאספו ${scraped.length} מוצרים ייחודיים.`);

    if (existingForCategory.length > 0) {
      const ratio = scraped.length / existingForCategory.length;
      if (ratio < MIN_ACCEPTABLE_RATIO) {
        anyRejected = true;
        rejected.push({ category: category.id, label: category.label, products: scraped });
        console.error(
          `  ⚠️  אזהרה: נאספו רק ${scraped.length} מוצרים ב"${category.label}" לעומת ` +
            `${existingForCategory.length} בריצה הקודמת (${Math.round(ratio * 100)}%). ` +
            `ייתכן שמבנה ה-HTML של האתר השתנה - המחלקה הזו לא תעודכן הפעם.`
        );
        finalProducts.push(...existingForCategory);
        continue;
      }
    }

    finalProducts.push(...scraped);
  }

  await scrapeFullSpecsForAll(finalProducts.filter((p) => !p.fullSpecs));

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(finalProducts, null, 2), "utf-8");
  console.log(`\n✅ נשמר בהצלחה: ${OUTPUT_PATH} (${finalProducts.length} מוצרים סה"כ)`);

  if (anyRejected) {
    await fs.writeFile(BACKUP_PATH, JSON.stringify(rejected, null, 2), "utf-8");
    console.error(
      `\n⚠️  מחלקה אחת או יותר לא עודכנה (ר' אזהרות למעלה). התוצאה שנאספה בכל זאת ` +
        `נשמרה לבדיקה ידנית בקובץ:\n${BACKUP_PATH}`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("שגיאה בריצת הסקרייפר:", err);
  process.exitCode = 1;
});
