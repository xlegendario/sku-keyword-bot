# SKU Product Name + Keyword Bot

Upload een CSV met `SKU` en `Size`.

De app:
1. Zoekt SKU in Airtable `SKU Master`
2. Haalt `Product Name` op
3. Genereert korte keywords
4. Downloadt nieuwe CSV

## Input CSV

```csv
SKU,Size
GX3791,42
HQ7045,38 2/3
```

## Output CSV

```csv
SKU,Size,Product Name,Keywords,Match Status
GX3791,42,adidas Samba OG Cloud White Core Black,samba core black 42,Matched
```

## Render env vars

```env
AIRTABLE_TOKEN=pat_xxx
AIRTABLE_BASE_ID=appxxx
AIRTABLE_SKU_MASTER_TABLE=SKU Master
AIRTABLE_SKU_FIELD=SKU
AIRTABLE_PRODUCT_NAME_FIELD=Product Name
```

## Render settings

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```
