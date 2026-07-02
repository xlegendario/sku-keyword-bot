# SKU Product Name Bot

Upload een stock CSV en verrijk deze met `Product Name` uit je Airtable `SKU Master` table.

## CSV input

Je CSV moet minimaal deze kolommen hebben:

```csv
SKU,Size
GX3791,42
HQ7045,38 2/3
```

## Airtable env vars

Zet deze in Render bij **Environment**:

```bash
AIRTABLE_TOKEN=pat_xxxxxxxxxxxxxxxxx
AIRTABLE_BASE_ID=appxxxxxxxxxxxxxx
AIRTABLE_SKU_MASTER_TABLE=SKU Master
AIRTABLE_SKU_FIELD=SKU
AIRTABLE_PRODUCT_NAME_FIELD=Product Name
```

Als jouw Airtable velden anders heten, pas alleen deze aan:

```bash
AIRTABLE_SKU_FIELD=...
AIRTABLE_PRODUCT_NAME_FIELD=...
```

## Local run

```bash
npm install
cp .env.example .env
npm start
```

Open daarna:

```txt
http://localhost:3000
```

## Deploy op Render

1. Maak nieuwe GitHub repo.
2. Upload deze files.
3. Render → New → Web Service.
4. Connect GitHub repo.
5. Runtime: Node.
6. Build Command:

```bash
npm install
```

7. Start Command:

```bash
npm start
```

8. Zet de env vars in Render.
9. Deploy.
