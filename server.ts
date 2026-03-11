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
    // 1. Search products by cluster - Fetch all products (up to 500)
    let allProducts: any[] = [];
    let from = 0;
    let to = 49;
    let totalCount = 0;

    const firstSearchUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=productClusterIds:${clusterId}&_from=${from}&_to=${to}`;
    const firstResponse = await fetch(firstSearchUrl, { headers: vtexHeaders });
    
    if (!firstResponse.ok) {
      const errorText = await firstResponse.text();
      throw new Error(`VTEX Search API error: ${firstResponse.status} - ${errorText}`);
    }

    const firstBatch = await firstResponse.json() as any[];
    allProducts = [...firstBatch];

    const resourcesHeader = firstResponse.headers.get("resources") || "";
    totalCount = parseInt(resourcesHeader.split("/")[1]) || allProducts.length;

    // Fetch remaining products if any (limit to 500 total for performance)
    const maxProducts = 500;
    const effectiveTotal = Math.min(totalCount, maxProducts);

    while (allProducts.length < effectiveTotal) {
      from = allProducts.length;
      to = Math.min(from + 49, effectiveTotal - 1);
      
      const nextUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=productClusterIds:${clusterId}&_from=${from}&_to=${to}`;
      const nextResponse = await fetch(nextUrl, { headers: vtexHeaders });
      
      if (nextResponse.ok) {
        const nextBatch = await nextResponse.json() as any[];
        allProducts = [...allProducts, ...nextBatch];
      } else {
        break; // Stop if error
      }
    }

    // 2. For each product, fetch price and inventory for the first SKU
    // We'll process them in smaller chunks to avoid overwhelming the API and hitting timeouts
    const chunkArray = (arr: any[], size: number) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const productChunks = chunkArray(allProducts, 20); // Process 20 products at a time
    const auditedProducts: any[] = [];

    for (const chunk of productChunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (product) => {
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

          const stockTotal = invData?.balance?.reduce((acc: number, curr: any) => acc + (curr.totalQuantity || 0), 0) || 0;
          const isActive = skuData ? skuData.IsActive : (product.isActive ?? product.IsActive ?? false);
          const commercialCondition = skuData?.CommercialConditionId || "N/A";
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
            tradePolicyId: `Cond: ${commercialCondition}`,
          };
        })
      );
      auditedProducts.push(...chunkResults.filter(p => p !== null));
    }

    res.json({
      products: auditedProducts,
      total: totalCount,
      count: auditedProducts.length
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
