import express from "express";
import dotenv from "dotenv";

// Boot error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

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
  "User-Agent": "VTEX-Cluster-Auditor",
  "X-VTEX-API-AppKey": VTEX_APP_KEY || "",
  "X-VTEX-API-AppToken": VTEX_APP_TOKEN || "",
};

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    env: {
      account: !!VTEX_ACCOUNT,
      key: !!VTEX_APP_KEY,
      token: !!VTEX_APP_TOKEN
    }
  });
});

// API Routes
app.get("/api/inspect", async (req, res, next) => {
  const { clusterId, page = "1" } = req.query;

  if (!clusterId) {
    return res.status(400).json({ error: "Cluster ID is required" });
  }

  if (!VTEX_ACCOUNT || !VTEX_APP_KEY || !VTEX_APP_TOKEN) {
    const missing = [];
    if (!VTEX_ACCOUNT) missing.push("VTEX_ACCOUNT");
    if (!VTEX_APP_KEY) missing.push("VTEX_APP_KEY");
    if (!VTEX_APP_TOKEN) missing.push("VTEX_APP_TOKEN");
    return res.status(500).json({ 
      error: `Faltan variables de entorno en el servidor: ${missing.join(", ")}. Asegúrate de configurarlas en el panel de Vercel.` 
    });
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
    if (resourcesHeader.includes("/")) {
      totalCount = parseInt(resourcesHeader.split("/")[1]) || allProducts.length;
    } else {
      totalCount = allProducts.length;
    }

    // Fetch remaining products if any (limit to 500 total for performance)
    const maxProducts = 500;
    const effectiveTotal = Math.min(totalCount, maxProducts);

    // Safety check to avoid infinite loops
    let iterations = 0;
    while (allProducts.length < effectiveTotal && iterations < 10) {
      iterations++;
      from = allProducts.length;
      to = Math.min(from + 49, effectiveTotal - 1);
      
      if (from >= to) break;

      const nextUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pub/products/search?fq=productClusterIds:${clusterId}&_from=${from}&_to=${to}`;
      const nextResponse = await fetch(nextUrl, { headers: vtexHeaders });
      
      if (nextResponse.ok) {
        const nextBatch = await nextResponse.json() as any[];
        if (!nextBatch || nextBatch.length === 0) break;
        allProducts = [...allProducts, ...nextBatch];
      } else {
        break; 
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
      
      // Get the Commercial Condition ID from the SKU item
      const commercialConditionId = firstItem.commercialConditionId || "N/A";

      return {
        productName: product.productName,
        productId: product.productId,
        skuId: skuId,
        refId: firstItem.referenceId?.[0]?.Value || product.productReference || "N/A",
        isActive: product.linkText ? true : false, // Simple heuristic for search API
        stockTotal: stockTotal,
        listPrice: listPrice,
        basePrice: basePrice,
        commercialCondition: commercialConditionId,
      };
    }).filter(p => p !== null);

    res.json({
      products: auditedProducts,
      total: totalCount,
      count: auditedProducts.length
    });
  } catch (error: any) {
    next(error);
  }
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Global error handler:", err);
  res.status(500).json({ 
    error: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

// Export for Vercel
export default app;

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
