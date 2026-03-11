import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const VTEX_ACCOUNT = process.env.VTEX_ACCOUNT;
const VTEX_APP_KEY = process.env.VTEX_APP_KEY;
const VTEX_APP_TOKEN = process.env.VTEX_APP_TOKEN;

const vtexHeaders = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "X-VTEX-API-AppKey": VTEX_APP_KEY || "",
  "X-VTEX-API-AppToken": VTEX_APP_TOKEN || "",
};

// API Routes
app.get("/api/inspect", async (req, res) => {
  const { clusterId, page = "1" } = req.query;

  if (!clusterId) {
    return res.status(400).json({ error: "Cluster ID is required" });
  }

  if (!VTEX_ACCOUNT || !VTEX_APP_KEY || !VTEX_APP_TOKEN) {
    return res.status(500).json({ error: "VTEX credentials not configured in server" });
  }

  try {
    const pageSize = 50;
    const from = (Number(page) - 1) * pageSize;
    const to = from + pageSize - 1;

    // 1. Search products by cluster
    const searchUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=productClusterIds:${clusterId}&_from=${from}&_to=${to}`;
    
    const searchResponse = await fetch(searchUrl, { headers: vtexHeaders });
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      throw new Error(`VTEX Search API error: ${searchResponse.status} - ${errorText}`);
    }

    const products = await searchResponse.json() as any[];
    
    // Get total count from headers if available
    const resourcesHeader = searchResponse.headers.get("resources") || "";
    const totalCount = parseInt(resourcesHeader.split("/")[1]) || products.length;

    // 2. For each product, fetch price and inventory for the first SKU
    const auditedProducts = await Promise.all(
      products.map(async (product) => {
        const firstItem = product.items[0];
        if (!firstItem) return null;

        const skuId = firstItem.itemId;

        // Fetch Price, Inventory AND SKU Details (Catalog PVT)
        const priceUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/pricing/prices/${skuId}`;
        const inventoryUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/logistics/pvt/inventory/skus/${skuId}`;
        const skuDetailsUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;

        const [priceRes, invRes, skuRes] = await Promise.all([
          fetch(priceUrl, { headers: vtexHeaders }),
          fetch(inventoryUrl, { headers: vtexHeaders }),
          fetch(skuDetailsUrl, { headers: vtexHeaders }),
        ]);

        let priceData: any = null;
        if (priceRes.ok) priceData = await priceRes.json();

        let invData: any = null;
        if (invRes.ok) invData = await invRes.json();

        let skuData: any = null;
        if (skuRes.ok) skuData = await skuRes.json();

        // Calculate total stock
        const stockTotal = invData?.balance?.reduce((acc: number, curr: any) => acc + (curr.totalQuantity || 0), 0) || 0;

        // VTEX source of truth for activation is the SKU/Product Catalog API
        // We prioritize skuData.IsActive, then fallback to search API
        const isActive = skuData ? skuData.IsActive : (product.isActive ?? product.IsActive ?? false);

        // Commercial Condition vs Trade Policy
        // Commercial Condition is usually a field in the SKU/Product
        const commercialCondition = skuData?.CommercialConditionId || "N/A";
        
        // Trade Policy comes from Pricing
        const listPrice = priceData?.listPrice || 0;
        const basePrice = priceData?.basePrice || 0;

        return {
          productName: product.productName,
          productId: product.productId,
          skuId: skuId,
          refId: skuData?.ReferenceId || firstItem.referenceId?.[0]?.Value || "N/A",
          isActive: isActive,
          stockTotal: stockTotal,
          listPrice: listPrice,
          basePrice: basePrice,
          tradePolicyId: `Cond: ${commercialCondition}`, // Showing Commercial Condition here as requested
        };
      })
    );

    res.json({
      products: auditedProducts.filter(p => p !== null),
      total: totalCount,
      page: Number(page),
      pageSize: pageSize
    });
  } catch (error: any) {
    console.error("Inspection error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
