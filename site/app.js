const WHATSAPP_NUMBER = "972506476817";

const ACCESSORY_FILTER_FIELDS = [
  { key: "color", label: "צבע" },
  { key: "connectivity", label: "קישוריות" },
  { key: "warranty_years", label: "אחריות", format: (v) => `${v} שנים` },
];

function accessorySpecLine(p) {
  const parts = [];
  if (p.color) parts.push(`צבע: ${p.color}`);
  if (p.connectivity) parts.push(`קישוריות: ${p.connectivity}`);
  if (p.warranty_years) parts.push(`אחריות: ${p.warranty_years} שנים`);
  return parts.join(" | ");
}

function accessorySpecListForMessage(p) {
  const parts = [];
  if (p.color) parts.push(`צבע ${p.color}`);
  if (p.connectivity) parts.push(p.connectivity);
  if (p.warranty_years) parts.push(`אחריות ${p.warranty_years} שנים`);
  return parts.join(", ");
}

// סדר קבוע להצגת טאבים - מחלקה מוצגת רק אם יש בה מוצרים בפועל בנתונים
const CATEGORY_CONFIG = {
  chargers: { label: "מטענים" },
  speakers: { label: "רמקולים" },
  bags: { label: "תיקים" },
  headphones: { label: "אוזניות" },
  webcams: { label: "מצלמות" },
  mice: { label: "עכברים" },
  keyboards: { label: "מקלדות" },
  "keyboard-mouse-sets": { label: "סט מקלדת ועכבר" },
  "docking-stations": { label: "תחנות עגינה" },
};
for (const key of Object.keys(CATEGORY_CONFIG)) {
  CATEGORY_CONFIG[key].fields = ACCESSORY_FILTER_FIELDS;
  CATEGORY_CONFIG[key].specLine = accessorySpecLine;
  CATEGORY_CONFIG[key].specListForMessage = accessorySpecListForMessage;
}
const CATEGORY_ORDER = [
  "mice",
  "keyboards",
  "keyboard-mouse-sets",
  "headphones",
  "speakers",
  "webcams",
  "docking-stations",
  "chargers",
  "bags",
];

const state = {
  products: [],
  recommendedSkus: new Set(),
  selectedCategories: new Set(), // ריק = כל הקטגוריות
  activeFilters: {}, // key -> Set of selected values
  searchText: "",
};

function specLine(p) {
  const config = CATEGORY_CONFIG[p.category] || CATEGORY_CONFIG.mice;
  return config.specLine(p);
}

function specListForMessage(p) {
  const config = CATEGORY_CONFIG[p.category] || CATEGORY_CONFIG.mice;
  return config.specListForMessage(p);
}

function buildWhatsappUrl(text) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function singleProductMessage(p) {
  const specs = specListForMessage(p);
  const specsPart = specs ? `, עם המפרט: ${specs}` : "";
  return `שלום, אני מעוניין בהצעת מחיר עבור: ${p.name} (מק"ט ${p.sku})${specsPart}`;
}

async function loadData() {
  const [productsRes, recommendedRes] = await Promise.all([
    fetch("data/products.json"),
    fetch("data/recommended-skus.json"),
  ]);
  const products = await productsRes.json();
  let recommended = [];
  try {
    recommended = await recommendedRes.json();
  } catch {
    recommended = [];
  }
  state.products = products;
  state.recommendedSkus = new Set(recommended);
}

// מוצרים שאינם במלאי לא מוצגים באתר כלל - הלקוח לא אמור לראות ולבקש הצעת
// מחיר על משהו שממילא לא זמין אצל הספק כרגע. אם לא נבחרה אף קטגוריה בסינון,
// מוצגות כל הקטגוריות.
function visibleProducts() {
  return state.products.filter(
    (p) =>
      p.inStock &&
      (state.selectedCategories.size === 0 || state.selectedCategories.has(p.category || "mice"))
  );
}

function categoryCounts() {
  const counts = {};
  for (const p of state.products) {
    if (!p.inStock) continue;
    const cat = p.category || "mice";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

function uniqueSortedValues(key, multi) {
  const values = new Set();
  for (const p of visibleProducts()) {
    const raw = p[key];
    if (multi) {
      if (Array.isArray(raw)) raw.forEach((v) => v && values.add(v));
      continue;
    }
    if (raw !== null && raw !== undefined && raw !== "") {
      values.add(raw);
    }
  }
  const arr = [...values];
  if (typeof arr[0] === "number") {
    return arr.sort((a, b) => a - b);
  }
  return arr.sort((a, b) => a.localeCompare(b, "he"));
}

function renderCategoryFilter() {
  const container = document.getElementById("categoryFilter");
  if (!container) return;
  container.innerHTML = "";

  const counts = categoryCounts();
  const presentCategories = CATEGORY_ORDER.filter((id) => counts[id] > 0);
  if (presentCategories.length <= 1) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const group = document.createElement("div");
  group.className = "filter-group";

  const label = document.createElement("label");
  label.textContent = "קטגוריות מוצרים";
  group.appendChild(label);

  const list = document.createElement("div");
  list.className = "checkbox-list";

  for (const catId of presentCategories) {
    const id = `f-category-${catId}`;
    const wrapper = document.createElement("label");
    wrapper.setAttribute("for", id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    checkbox.value = catId;
    checkbox.checked = state.selectedCategories.has(catId);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedCategories.add(catId);
      } else {
        state.selectedCategories.delete(catId);
      }
      renderFilters();
      renderProducts();
    });

    const text = document.createElement("span");
    text.textContent = `${CATEGORY_CONFIG[catId]?.label || catId} (${counts[catId]})`;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    list.appendChild(wrapper);
  }

  group.appendChild(list);
  container.appendChild(group);
}

function renderFilterFields() {
  const container = document.getElementById("filterFields");
  container.innerHTML = "";

  for (const field of ACCESSORY_FILTER_FIELDS) {
    const values = uniqueSortedValues(field.key, field.multi);
    if (values.length === 0) continue;

    const group = document.createElement("div");
    group.className = "filter-group";

    const label = document.createElement("label");
    label.textContent = field.label;
    group.appendChild(label);

    const list = document.createElement("div");
    list.className = "checkbox-list";

    for (const value of values) {
      const id = `f-${field.key}-${String(value).replace(/\W+/g, "_")}`;
      const wrapper = document.createElement("label");
      wrapper.setAttribute("for", id);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = String(value);
      checkbox.addEventListener("change", () => {
        toggleFilterValue(field.key, value, checkbox.checked);
      });

      const text = document.createElement("span");
      text.textContent = field.format ? field.format(value) : value;

      wrapper.appendChild(checkbox);
      wrapper.appendChild(text);
      list.appendChild(wrapper);
    }

    group.appendChild(list);
    container.appendChild(group);
  }
}

function renderFilters() {
  renderCategoryFilter();
  renderFilterFields();
}

function toggleFilterValue(key, value, checked) {
  if (!state.activeFilters[key]) state.activeFilters[key] = new Set();
  if (checked) {
    state.activeFilters[key].add(value);
  } else {
    state.activeFilters[key].delete(value);
  }
  renderProducts();
}

function matchesFilters(p) {
  if (!p.inStock) return false;
  if (state.selectedCategories.size > 0 && !state.selectedCategories.has(p.category || "mice")) {
    return false;
  }

  const fieldsByKey = Object.fromEntries(ACCESSORY_FILTER_FIELDS.map((f) => [f.key, f]));

  for (const [key, valueSet] of Object.entries(state.activeFilters)) {
    if (valueSet.size === 0) continue;
    const field = fieldsByKey[key];
    if (field && field.multi) {
      const productValues = Array.isArray(p[key]) ? p[key] : [];
      if (![...valueSet].some((v) => productValues.includes(v))) return false;
    } else {
      if (!valueSet.has(p[key])) return false;
    }
  }

  if (state.searchText) {
    const haystack = Object.values(p)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v) => typeof v === "string" || typeof v === "number")
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(state.searchText.toLowerCase())) return false;
  }

  return true;
}

function createProductCard(p) {
  const card = document.createElement("div");
  card.className = "product-card";

  const top = document.createElement("div");
  top.className = "card-top";

  if (state.recommendedSkus.has(p.sku)) {
    const badge = document.createElement("span");
    badge.className = "recommended-badge";
    badge.textContent = "מומלץ";
    top.appendChild(badge);
  }

  card.appendChild(top);

  const imgWrap = document.createElement("div");
  imgWrap.className = "product-image-wrap clickable";
  imgWrap.setAttribute("role", "button");
  imgWrap.setAttribute("tabindex", "0");
  imgWrap.setAttribute("aria-label", `פרטים נוספים על ${p.name}`);
  const img = document.createElement("img");
  img.src = p.image;
  img.alt = p.name;
  img.loading = "lazy";
  imgWrap.appendChild(img);
  imgWrap.addEventListener("click", () => openProductModal(p));
  imgWrap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openProductModal(p);
    }
  });
  card.appendChild(imgWrap);

  const name = document.createElement("h3");
  name.className = "product-name";
  const nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.textContent = p.name;
  nameBtn.addEventListener("click", () => openProductModal(p));
  name.appendChild(nameBtn);
  card.appendChild(name);

  const sku = document.createElement("p");
  sku.className = "product-sku";
  sku.textContent = `מק"ט: ${p.sku}`;
  card.appendChild(sku);

  const spec = document.createElement("p");
  spec.className = "product-spec";
  const line = specLine(p);
  spec.textContent = line || p.rawSpec || "";
  card.appendChild(spec);

  const stockBadge = document.createElement("span");
  stockBadge.className = `stock-badge ${p.inStock ? "in" : "out"}`;
  stockBadge.textContent = p.inStock ? "במלאי" : "אינו במלאי";
  card.appendChild(stockBadge);

  const priceNote = document.createElement("p");
  priceNote.className = "price-note";
  priceNote.textContent = "מחיר בהתאמה אישית - בקשו הצעה";
  card.appendChild(priceNote);

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const waBtn = document.createElement("a");
  waBtn.className = "whatsapp-btn";
  waBtn.href = buildWhatsappUrl(singleProductMessage(p));
  waBtn.target = "_blank";
  waBtn.rel = "noopener";
  waBtn.textContent = "בקשו הצעת מחיר בוואטסאפ";
  footer.appendChild(waBtn);
  card.appendChild(footer);

  return card;
}

function openProductModal(p) {
  document.getElementById("modalImage").src = p.image;
  document.getElementById("modalImage").alt = p.name;
  document.getElementById("modalProductName").textContent = p.name;
  document.getElementById("modalSku").textContent = `מק"ט: ${p.sku}`;
  document.getElementById("modalSpec").textContent = specLine(p);

  const stockBadge = document.getElementById("modalStockBadge");
  stockBadge.className = `stock-badge ${p.inStock ? "in" : "out"}`;
  stockBadge.textContent = p.inStock ? "במלאי" : "אינו במלאי";

  document.getElementById("modalRecommendedBadge").hidden = !state.recommendedSkus.has(p.sku);

  const waBtn = document.getElementById("modalWhatsappBtn");
  waBtn.href = buildWhatsappUrl(singleProductMessage(p));

  const specsTable = document.getElementById("modalSpecsTable");
  specsTable.innerHTML = "";
  const specsTitle = document.querySelector(".modal-specs-title");
  const fullSpecs = Array.isArray(p.fullSpecs) ? p.fullSpecs : [];
  const showFullSpecs = fullSpecs.length > 0;
  specsTitle.hidden = !showFullSpecs;
  specsTable.hidden = !showFullSpecs;
  for (const { label, value } of fullSpecs) {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = label;
    const td = document.createElement("td");
    td.textContent = value;
    row.appendChild(th);
    row.appendChild(td);
    specsTable.appendChild(row);
  }

  document.getElementById("productModal").hidden = false;
}

function closeProductModal() {
  document.getElementById("productModal").hidden = true;
}

function setupModal() {
  document.getElementById("modalCloseBtn").addEventListener("click", closeProductModal);
  document.getElementById("productModal").addEventListener("click", (e) => {
    if (e.target.id === "productModal") closeProductModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeProductModal();
  });
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const emptyState = document.getElementById("emptyState");
  const resultsCount = document.getElementById("resultsCount");

  const filtered = state.products.filter(matchesFilters);
  const totalVisible = visibleProducts().length;

  grid.innerHTML = "";
  filtered.forEach((p) => grid.appendChild(createProductCard(p)));

  resultsCount.textContent = `${filtered.length} מוצרים מתוך ${totalVisible}`;
  emptyState.hidden = filtered.length !== 0;
  grid.hidden = filtered.length === 0;
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    state.searchText = input.value.trim();
    renderProducts();
  });
}

function setupClearFilters() {
  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    state.activeFilters = {};
    state.selectedCategories = new Set();
    state.searchText = "";
    document.getElementById("searchInput").value = "";
    renderFilters();
    renderProducts();
  });
}

function setupMobileFilters() {
  const panel = document.getElementById("filtersPanel");
  const overlay = document.getElementById("filtersOverlay");
  const toggleBtn = document.getElementById("toggleFiltersBtn");

  const open = () => {
    panel.classList.add("open");
    overlay.style.display = "block";
  };
  const close = () => {
    panel.classList.remove("open");
    overlay.style.display = "none";
  };

  toggleBtn.addEventListener("click", open);
  overlay.addEventListener("click", close);
}

async function init() {
  await loadData();
  renderFilters();
  renderProducts();
  setupSearch();
  setupClearFilters();
  setupMobileFilters();
  setupModal();
}

init();
