const { runActor } = require("./apify-tokopedia-mcp");

const ACTOR_ID = "themineworks/shopee-scraper";

function formatPrice(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
  }
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/(?:Rp\.?\s*|IDR\s*)(\d[\d.,]*)/i);
  if (match) return `Rp ${match[1].replace(/\s+/g, "")}`;
  if (/^\d[\d.,]*$/.test(text)) return `Rp ${text}`;
  return "";
}

function shopeeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "shopee.co.id" || host.endsWith(".shopee.co.id"))) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function normalizeProducts(items) {
  return (Array.isArray(items) ? items : []).filter(item => {
    return item && !item._type && item.title && formatPrice(item.price) && shopeeUrl(item.product_url || item.product_url_short);
  }).map(item => {
    const originalPrice = formatPrice(item.price_original);
    const discountPercent = Number(item.discount_percent);
    const promoLabels = Array.isArray(item.promo_labels) ? item.promo_labels.map(String).filter(Boolean).slice(0, 4) : [];
    const discountLabel = String(item.discount_label || "").trim();
    const details = [
      item.location ? `Lokasi ${String(item.location).slice(0, 100)}` : "",
      item.rating ? `Rating ${item.rating}` : item.shop_rating ? `Rating toko ${item.shop_rating}` : "",
      !(Number.isFinite(discountPercent) && discountPercent > 0) ? discountLabel : "",
      ...promoLabels
    ].filter(Boolean);
    return {
      title: String(item.title).slice(0, 240),
      price: formatPrice(item.price),
      originalPrice,
      discountPercent: Number.isFinite(discountPercent) && discountPercent > 0 ? discountPercent : null,
      discountLabel,
      url: shopeeUrl(item.product_url || item.product_url_short),
      productId: String(item.item_id || ""),
      shopId: String(item.shop_id || ""),
      rating: String(item.rating || item.shop_rating || ""),
      sold: "",
      location: String(item.location || ""),
      snippet: details.join(" · "),
      imageUrl: String(item.image_url || ""),
      query: String(item.keyword || "")
    };
  });
}

async function searchProducts(query) {
  const result = await runActor(ACTOR_ID, {
    keywords: [query],
    country: "ID",
    sort: "relevance"
  }, { waitSecs: 40 });
  const products = normalizeProducts(result.items);
  if (!products.length) {
    const errorRow = result.items.find(item => item && item._type === "error");
    if (errorRow) throw new Error(String(errorRow.reason || "Shopee tidak mengembalikan listing untuk kata kunci ini.").slice(0, 220));
  }
  return { products, text: result.text };
}

module.exports = { searchProducts };
