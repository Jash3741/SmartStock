const { Router } = require("express");
const salesRouter = Router({ mergeParams: true });
const saleController = require("../controllers/sale.controller.js");
const requireAuth = require("../utils/middelwares/auth.middelware.js");

// All sales routes are protected with authentication
salesRouter.use(requireAuth);

// GET /sales - Sales history list
salesRouter.get("/", saleController.renderSalesHistory);

// GET /sales/new - POS billing / create bill page
salesRouter.get("/new", saleController.renderNewSale);

// POST /sales - Complete sale transaction
salesRouter.post("/", saleController.createSale);

// API Routes for POS search, barcode, batches, quick customer
salesRouter.get("/api/products/search", saleController.searchProductsApi);
salesRouter.get("/api/products/barcode/:barcode", saleController.getProductByBarcodeApi);
salesRouter.get("/api/batches/:productId", saleController.getProductBatchesApi);
salesRouter.post("/api/customers", saleController.createCustomerApi);

// GET /sales/:id/pdf - Download/stream PDF invoice (must be registered before :id)
salesRouter.get("/:id/pdf", saleController.generateInvoicePdf);

// GET /sales/:id - View sale invoice details
salesRouter.get("/:id", saleController.getSaleDetails);

module.exports = salesRouter;

