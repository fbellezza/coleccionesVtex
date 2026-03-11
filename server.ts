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
    // 0. Fetch Commercial Conditions to map IDs to Names
    // Hardcoded mapping based on user provided table for maximum reliability
    const hardcodedConditions: Record<string, string> = {
      "1": "DefaultPardo", "3": "Celulares 4G", "4": "Margen Minimo", "5": "Prueba conector bapro",
      "6": "HDC Internacional", "7": "3 cuotas sin interes", "8": "12 cuotas sin interes",
      "9": "6 cuotas sin interes", "10": "18 cuotas sin interes", "11": "Ahora 6",
      "12": "Ahora 12 .....", "13": "AMEX AHORA 18", "14": "WHIRLPOOL-IMPORTADOS",
      "15": "WHIRLPOOL-NACIONALES", "16": "AHORA 12 - 3 CSI - Celulares-TV-Informatica",
      "17": "AHORA 12 - EVENTOS 12 CUOTAS S/I", "18": "Limansky A", "19": "Limansky",
      "20": "Sin Control de fraude", "21": "Beauty24", "22": "AHORA 12 TV", "24": "Prueba Hipotecario",
      "25": "Ahora 30 + 6 CSI", "26": "Ahora 30 + 12 CSI", "27": "Celulares Ahora 30",
      "28": "Celulares Ahora 30 + 3 CSI", "29": "Celulares Ahora 30 + 6 CSI", "30": "Margen 14 C",
      "31": "Ahora 12 + AMEX 6 CSI", "32": "Borrar 01", "33": "Celulares Ahora 10", "34": "Bulonfer",
      "35": "GrupoSeni", "36": "WHIRLPOOL 6 CSI", "37": "Limansky B", "38": "FullConfort",
      "39": "SANTANDER 9 cuotas", "40": "SANTANDER 12 cuotas", "41": "Whirlpool 9 CSI",
      "43": "Limansky C", "44": "Emood", "45": "Margen 20", "46": "BULONFER - CON INTERES",
      "47": "BULONFER - 3 CSI", "48": "BULONFER - 6 CSI", "49": "BULONFER - 9 CSI",
      "50": "BULONFER - 12 CSI", "51": "Ahora 12 - 9 CUOTAS S/I", "52": "Macro 12 CSI",
      "53": "Margen 14", "54": "AHORA12 - MACRO 12 CSI", "55": "NARANJA 12 CSI",
      "56": "NARANJA 6 CSI", "57": "GALICIA 18 CSI", "58": "Margen 14 E", "59": "Margen 17",
      "60": "Visuar 12 cuotas", "61": "Visuar 2 cuotas", "62": "Visuar 3 cuotas",
      "63": "Visuar 6 cuotas", "64": "Visuar 9 cuotas", "65": "Visuar 1 cuota",
      "66": "FullConfort 6csi", "67": "Margen 14 B", "68": "Margen 14 D", "69": "Margen 17 B",
      "70": "Margen 17 C", "71": "Margen 17 D", "72": "Margen 17 E", "73": "Margen 20 B",
      "74": "Margen 20 C", "75": "Margen 17 F", "76": "Margen 14 F", "77": "Mosconi",
      "78": "Suenolar", "79": "Margen 20 D", "80": "Margen Minimo B", "81": "Margen Minimo C",
      "82": "Margen Minimo D", "83": "contado", "84": "Margen Prueba"
    };

    let conditionsMap: Record<string, string> = { ...hardcodedConditions };
    
    try {
      const conditionsUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/payment/pvt/conditions`;
      const conditionsResponse = await fetch(conditionsUrl, { headers: vtexHeaders });
      
      if (conditionsResponse.ok) {
        const conditionsData = await conditionsResponse.json();
        const conditionsArray = Array.isArray(conditionsData) ? conditionsData : [conditionsData];
        
        conditionsArray.forEach((c: any) => {
          if (c && c.id !== undefined && c.name) {
            conditionsMap[c.id.toString()] = c.name;
          }
        });
      }
    } catch (e) {
      console.error("Error fetching conditions from API, using hardcoded only");
    }

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

    // 2. Fetch SKU details for the products to get commercialConditionId
    // We limit to the first 100 products to avoid Vercel timeouts and VTEX rate limits
    const productsToDetail = allProducts.slice(0, 100);
    const skuDetails = await Promise.all(productsToDetail.map(async (product) => {
      const skuId = product.items?.[0]?.itemId;
      if (!skuId) return null;
      
      try {
        const skuUrl = `https://${VTEX_ACCOUNT}.vtexcommercestable.com.br/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`;
        const skuResponse = await fetch(skuUrl, { headers: vtexHeaders });
        if (skuResponse.ok) {
          return await skuResponse.json();
        }
      } catch (e) {
        return null;
      }
      return null;
    }));

    const skuDetailsMap: Record<string, any> = {};
    skuDetails.forEach(detail => {
      if (detail && detail.Id) {
        skuDetailsMap[detail.Id.toString()] = detail;
      }
    });

    // 3. Process products using data from Search API + SKU Details
    const auditedProducts = allProducts.map((product) => {
      const firstItem = product.items?.[0];
      if (!firstItem) return null;

      const skuId = firstItem.itemId;
      const seller = firstItem.sellers?.[0];
      const offer = seller?.commertialOffer;

      // Extract data from the search response
      const stockTotal = offer?.AvailableQuantity ?? 0;
      const listPrice = offer?.ListPrice ?? 0;
      const basePrice = offer?.Price ?? 0;
      
      // Get the Commercial Condition ID from the SKU details we fetched
      const skuDetail = skuDetailsMap[skuId];
      const commercialConditionId = skuDetail?.CommercialConditionId;
      
      const commercialConditionName = commercialConditionId 
        ? (conditionsMap[commercialConditionId.toString()] || `ID: ${commercialConditionId}`) 
        : (skuDetail ? "Sin Condición" : "N/A (Cargando...)");

      return {
        productName: product.productName,
        productId: product.productId,
        skuId: skuId,
        refId: firstItem.referenceId?.[0]?.Value || product.productReference || "N/A",
        isActive: product.linkText ? true : false,
        stockTotal: stockTotal,
        listPrice: listPrice,
        basePrice: basePrice,
        commercialCondition: commercialConditionName,
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
