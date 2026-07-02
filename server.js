require("dotenv").config();

const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const {
  AIRTABLE_TOKEN,
  AIRTABLE_BASE_ID,
  AIRTABLE_SKU_MASTER_TABLE = "SKU Master",
  AIRTABLE_SKU_FIELD = "SKU",
  AIRTABLE_PRODUCT_NAME_FIELD = "Product Name",
  PORT = 3000
} = process.env;

app.use(express.static("public"));

function airtableTableUrl() {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_SKU_MASTER_TABLE)}`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/[’']/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeBrand(productName) {
  return cleanText(productName)
    .replace(/^(adidas|nike|jordan|air jordan|new balance|asics|ugg)\s+/i, "")
    .replace(/^air jordan\s+/i, "Jordan ");
}

function normalizeAccents(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function generateKeywords(productName) {
  let name = normalizeAccents(cleanText(productName));
  if (!name) return "";

  name = name
    .replace(/^(adidas|nike|air jordan|jordan|new balance|asics|ugg)\s+/i, "")
    .replace(/\bWomen'?s\b/gi, "")
    .replace(/\bMens\b/gi, "")
    .replace(/\bMen'?s\b/gi, "")
    .replace(/\bGS\b/gi, "")
    .replace(/\bPS\b/gi, "")
    .replace(/\bTD\b/gi, "")
    .replace(/\bOG\b/gi, "")
    .replace(/\bRetro\b/gi, "")
    .replace(/\b202[0-9]\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  let keywords = name;

  if (/samba/i.test(name)) {
    keywords = name.replace(/samba/i, "samba");
  } else if (/gel[- ]?1130/i.test(name)) {
    keywords = name.replace(/gel[- ]?1130/i, "1130");
  } else if (/gel[- ]?kayano 14/i.test(name)) {
    keywords = name.replace(/gel[- ]?kayano 14/i, "kayano");
  } else if (/gel[- ]?nyc/i.test(name)) {
    keywords = name.replace(/gel[- ]?nyc/i, "nyc");
  } else if (/gel[- ]?cumulus 16/i.test(name)) {
    keywords = name.replace(/gel[- ]?cumulus 16/i, "cumulus");
  }

  return keywords
    .toLowerCase()
    .replace(/[^a-z0-9.\s/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
async function fetchSkuMasterMap() {
  const skuMap = new Map();
  let offset = null;

  do {
    const url = new URL(airtableTableUrl());
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", AIRTABLE_SKU_FIELD);
    url.searchParams.append("fields[]", AIRTABLE_PRODUCT_NAME_FIELD);
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable error ${res.status}: ${body}`);
    }

    const data = await res.json();

    for (const record of data.records || []) {
      const skuRaw = record.fields?.[AIRTABLE_SKU_FIELD];
      const productName = record.fields?.[AIRTABLE_PRODUCT_NAME_FIELD] || "";

      if (!skuRaw) continue;

      const skuValues = Array.isArray(skuRaw) ? skuRaw : [skuRaw];

      for (const sku of skuValues) {
        const cleanSku = String(sku).trim().toUpperCase();
        if (cleanSku && !skuMap.has(cleanSku)) {
          skuMap.set(cleanSku, String(productName).trim());
        }
      }
    }

    offset = data.offset;
  } while (offset);

  return skuMap;
}

function normalizeUploadedCsv(buffer) {
  const raw = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const delimiter = raw.includes("SKU;") ? ";" : ",";

  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter
  });

  return records.map((row) => {
    const normalized = { ...row };
    normalized.SKU = String(row.SKU || row.sku || "").trim();
    normalized.Size = String(row.Size || row.size || row.Maat || row.maat || "").trim();
    return normalized;
  }).filter(row => row.SKU);
}

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No CSV file uploaded.");

    const stockRows = normalizeUploadedCsv(req.file.buffer);
    const skuMap = await fetchSkuMasterMap();

    const enriched = stockRows.map((row) => {
      const key = row.SKU.trim().toUpperCase();
      const productName = skuMap.get(key) || "";
      const keywords = productName ? generateKeywords(productName) : "";

      return {
        SKU: row.SKU,
        "Product Name": productName,
        name: keywords,
        size: row.Size,
        "Match Status": productName ? "Matched" : "Not Found"
      };
    });

    const allColumns = [
      "SKU",
      "Product Name",
      "name",
      "size",
      "Match Status"
    ];

    const output = stringify(enriched, {
      header: true,
      columns: allColumns
    });

    const matched = enriched.filter(r => r["Match Status"] === "Matched").length;
    const notFound = enriched.length - matched;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stock_with_names_keywords_${matched}_matched_${notFound}_missing.csv"`
    );

    return res.send(output);
  } catch (err) {
    console.error(err);
    return res.status(500).send(`
      <h2>Error</h2>
      <pre>${String(err.message || err)}</pre>
      <p>Check Render env vars en Airtable field names.</p>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`SKU Product Name Keyword Bot running on port ${PORT}`);
});
