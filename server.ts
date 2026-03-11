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

    // 2. Process products using data already present in Search API
    // This is 100x faster than fetching SKU by SKU and avoids Vercel timeouts
    const auditedProducts = allProducts.map((product) => {
      const firstItem = product.items?.[0];
      if (!firstItem) return null;

      const skuId = firstItem.itemId;
      const seller = firstItem.sellers?.[0];
      const offer = seller?.commertialOffer;

      // Extract data from the search response (Public API)
      // This data is usually very accurate and much faster to retrieve
      const stockTotal = offer?.AvailableQuantity ?? 0;
      const listPrice = offer?.ListPrice ?? 0;
      const basePrice = offer?.Price ?? 0;
      
      // In the search API, we don't have the CommercialConditionId directly
      // but we can use the TradePolicy or a generic indicator
      const tradePolicyId = seller?.sellerId ? `Seller: ${seller.sellerId}` : "Cond: N/A";

      return {
        productName: product.productName,
        productId: product.productId,
        skuId: skuId,
        refId: firstItem.referenceId?.[0]?.Value || product.productReference || "N/A",
        isActive: product.linkText ? true : false, // Simple heuristic for search API
        stockTotal: stockTotal,
        listPrice: listPrice,
        basePrice: basePrice,
        tradePolicyId: tradePolicyId,
      };
    }).filter(p => p !== null);

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

// Export for Vercel
export default app;

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

  // Only listen if this file is run directly
  if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

// Check if we are in a serverless environment (Vercel)
if (process.env.VERCEL !== '1') {
  startServer();
}
