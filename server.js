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

function generateKeywords(productName) {
  const original = cleanText(productName);
  if (!original) return "";

  let name = removeBrand(original);

  // Remove gender/kids descriptors that are usually not needed in short keywords.
  name = name
    .replace(/\bWomen'?s\b/gi, "")
    .replace(/\bMens\b/gi, "")
    .replace(/\bMen'?s\b/gi, "")
    .replace(/\bGS\b/gi, "")
    .replace(/\bPS\b/gi, "")
    .replace(/\bTD\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const lower = name.toLowerCase();

  // Specific model simplifications.
  const rules = [
    {
      match: /samba og/i,
      build: () => {
        if (/core black/i.test(name)) return "samba core black";
        if (/cloud white/i.test(name)) return "samba cloud white";
        return "samba";
      }
    },
    {
      match: /samba jane/i,
      build: () => {
        if (/white black/i.test(name)) return "samba jane white black";
        return "samba jane";
      }
    },
    {
      match: /gel[- ]?1130/i,
      build: () => {
        if (/pure silver/i.test(name)) return "1130 pure silver";
        return "1130";
      }
    },
    {
      match: /dunk low/i,
      build: () => {
        let kw = "dunk low";
        if (/next nature/i.test(name)) kw += " next nature";
        if (/aster pink/i.test(name)) kw += " aster pink";
        return kw;
      }
    },
    {
      match: /jordan 1 retro high.*bred/i,
      build: () => "jordan 1 high bred"
    },
    {
      match: /jordan 4 retro.*navy/i,
      build: () => "jordan 4 sb navy"
    },
    {
      match: /new balance 740/i,
      build: () => "740 navy white"
    },
    {
      match: /new balance 1906a/i,
      build: () => "1906a tech explosion"
    },
    {
      match: /\b1906\b/i,
      build: () => {
        if (/tech explosion/i.test(name)) return "1906 tech explosion";
        return "1906";
      }
    },
    {
      match: /\b9060\b/i,
      build: () => {
        const words = lower.split(" ");
        const colorWords = words.filter(w => !["new","balance","9060"].includes(w));
        return ["9060", ...colorWords.slice(0, 3)].join(" ");
      }
    }
  ];

  let keywords = "";

  for (const rule of rules) {
    if (rule.match.test(name)) {
      keywords = rule.build();
      break;
    }
  }

  // Generic fallback: remove common filler words, keep strongest words short.
  if (!keywords) {
    const stopWords = new Set([
      "og", "retro", "high", "low", "mid", "shoe", "shoes",
      "white", "black", "grey", "gray", "blue", "red", "green",
      "core", "cloud", "pure"
    ]);

    const words = name
      .toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    // Keep model-like words and important color/style words.
    const keep = [];
    for (const word of words) {
      if (keep.length >= 5) break;
      if (/^[a-z]*\d+[a-z]*$/.test(word) || !stopWords.has(word)) {
        keep.push(word);
      }
    }

    keywords = keep.join(" ");
  }

  keywords = keywords
    .toLowerCase()
    .replace(/[^a-z0-9.\s/-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return keywords;
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
        ...row,
        "Product Name": productName,
        "Keywords": keywords,
        "Match Status": productName ? "Matched" : "Not Found"
      };
    });

    const allColumns = Array.from(new Set([
      ...Object.keys(stockRows[0] || {}),
      "Product Name",
      "Keywords",
      "Match Status"
    ]));

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
