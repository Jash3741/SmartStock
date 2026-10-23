const mongoose = require("mongoose");
const Sale = require("../model/sales.model.js");
const SaleItem = require("../model/saleItem.model.js");
const Product = require("../model/product.model.js");
const Batch = require("../model/batch.model.js");
const Customer = require("../model/customer.model.js");
const InventoryLog = require("../model/inventoryLog.model.js");
const UserModel = require("../model/user.model.js");
const PDFDocument = require("pdfkit");

/**
 * Helper to resolve the authenticated user from session or route params
 */
async function resolveUser(req) {
  const id = req.params.id || (req.user && req.user.id);
  let user = null;
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    user = await UserModel.findById(id);
  }
  if (!user && req.user && req.user.id) {
    user = await UserModel.findById(req.user.id);
  }
  return user || { _id: id || "guest", username: "Admin" };
}

/**
 * Helper to generate a unique invoice number in format INV-YYYYMMDD-XXX
 */
async function generateUniqueInvoiceNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePrefix = `INV-${yyyy}${mm}${dd}`;

  // Find latest invoice with this date prefix
  const latestSale = await Sale.findOne({
    invoiceNumber: { $regex: `^${datePrefix}-` },
  }).sort({ invoiceNumber: -1 });

  let sequence = 1;
  if (latestSale && latestSale.invoiceNumber) {
    const parts = latestSale.invoiceNumber.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1;
    }
  }

  let candidate = `${datePrefix}-${String(sequence).padStart(3, "0")}`;
  // Ensure uniqueness in edge cases
  let exists = await Sale.findOne({ invoiceNumber: candidate });
  while (exists) {
    sequence += 1;
    candidate = `${datePrefix}-${String(sequence).padStart(3, "0")}`;
    exists = await Sale.findOne({ invoiceNumber: candidate });
  }

  return candidate;
}

/**
 * GET /sales
 * Sales History List Page with search, filters, KPIs, and sorting
 */
module.exports.renderSalesHistory = async (req, res) => {
  try {
    const user = await resolveUser(req);

    const search = (req.query.search || "").trim();
    const statusFilter = (req.query.status || "").trim();
    const startDate = (req.query.startDate || "").trim();
    const endDate = (req.query.endDate || "").trim();

    const query = {};

    // Payment status filter
    if (statusFilter && ["paid", "partial", "pending"].includes(statusFilter.toLowerCase())) {
      query.paymentStatus = { $regex: new RegExp(`^${statusFilter}$`, "i") };
    }

    // Date range filter
    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) {
        query.saleDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.saleDate.$lte = end;
      }
    }

    // Search filter (Invoice number or customer)
    if (search) {
      const matchingCustomers = await Customer.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const customerIds = matchingCustomers.map((c) => c._id);

      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { customer: { $in: customerIds } },
      ];
    }

    // Fetch sales sorted by latest first
    const sales = await Sale.find(query)
      .populate("customer", "name phone email")
      .populate("createdBy", "username email")
      .sort({ saleDate: -1, createdAt: -1 })
      .lean();

    // Attach item counts to sales
    const saleIds = sales.map((s) => s._id);
    const itemAgg = await SaleItem.aggregate([
      { $match: { sale: { $in: saleIds } } },
      {
        $group: {
          _id: "$sale",
          itemCount: { $sum: 1 },
          totalUnits: { $sum: "$quantity" },
          totalProfit: { $sum: "$profit" },
        },
      },
    ]);

    const itemMap = {};
    itemAgg.forEach((agg) => {
      itemMap[agg._id.toString()] = agg;
    });

    sales.forEach((s) => {
      const info = itemMap[s._id.toString()] || {
        itemCount: 0,
        totalUnits: 0,
        totalProfit: 0,
      };
      s.itemCount = info.itemCount;
      s.totalUnits = info.totalUnits;
      s.profit = info.totalProfit;
    });

    // Global KPIs
    const totalSalesCount = await Sale.countDocuments();
    const revenueAgg = await Sale.aggregate([
      { $group: { _id: null, total: { $sum: "$grandTotal" } } },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    const profitAgg = await SaleItem.aggregate([
      { $group: { _id: null, totalProfit: { $sum: "$profit" } } },
    ]);
    const totalProfit = profitAgg.length > 0 ? profitAgg[0].totalProfit : 0;

    const pendingCount = await Sale.countDocuments({
      paymentStatus: { $in: ["partial", "pending", "Partial", "Pending"] },
    });

    const stats = {
      totalSalesCount,
      totalRevenue,
      totalProfit,
      pendingCount,
    };

    res.render("sales/index.ejs", {
      sales,
      stats,
      search,
      statusFilter,
      startDate,
      req,
      endDate,
      user,
      User: user,
      reqUser: user,
    });
  } catch (err) {
    console.error("SALES HISTORY ERROR:", err);
    res.status(500).send("Error loading sales history: " + err.message);
  }
};

/**
 * GET /sales/new
 * New Sale / Billing POS page
 */
module.exports.renderNewSale = async (req, res) => {
  try {
    const user = await resolveUser(req);

    // Active customers
    const customers = await Customer.find({ status: { $ne: "inactive" } })
      .sort({ name: 1 })
      .lean();

    // Auto-generate invoice number
    const suggestedInvoiceNumber = await generateUniqueInvoiceNumber();

    // Today's date formatted: YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];

    // Preload in-stock active products for manual selection
    const inStockProducts = await Product.find({
      status: "active",
      quantity: { $gt: 0 },
    })
      .populate("category", "name")
      .sort({ productName: 1 })
      .lean();

    res.render("sales/new.ejs", {
      customers,
      suggestedInvoiceNumber,
      today,
      req,
      inStockProducts,
      user,
      User: user,
      reqUser: user,
    });
  } catch (err) {
    console.error("RENDER NEW SALE ERROR:", err);
    res.status(500).send("Error opening new sale page: " + err.message);
  }
};

/**
 * GET /sales/api/products/search
 * Search products by name, SKU, or barcode with FEFO batch details
 */
module.exports.searchProductsApi = async (req, res) => {
  try {
    const query = (req.query.q || "").trim();
    if (!query) {
      return res.json({ success: true, products: [] });
    }

    const regex = new RegExp(query, "i");
    const products = await Product.find({
      status: "active",
      $or: [{ productName: regex }, { sku: regex }, { barcode: regex }],
    })
      .limit(15)
      .lean();

    const now = new Date();
    const results = [];

    for (const prod of products) {
      // Find valid, non-expired batches with quantity > 0 sorted by FEFO (earliest expiry first)
      const batches = await Batch.find({
        product: prod._id,
        quantity: { $gt: 0 },
        expiryDate: { $gt: now },
        status: { $ne: "expired" },
      })
        .sort({ expiryDate: 1 })
        .lean();

      const totalBatchStock = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);

      results.push({
        _id: prod._id,
        productName: prod.productName,
        sku: prod.sku,
        barcode: prod.barcode || "",
        sellingPrice: prod.sellingPrice || 0,
        purchasePrice: prod.purchasePrice || 0,
        gst: prod.gst || 0,
        availableStock: Math.max(0, totalBatchStock),
        batches: batches.map((b) => ({
          _id: b._id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          quantity: b.quantity,
          sellingPrice: b.sellingPrice || prod.sellingPrice,
          purchasePrice: b.purchasePrice || prod.purchasePrice,
        })),
        fefoBatch: batches.length > 0 ? batches[0] : null,
      });
    }

    return res.json({ success: true, products: results });
  } catch (err) {
    console.error("SEARCH PRODUCTS API ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /sales/api/products/barcode/:barcode
 * Find product by barcode and attach FEFO batches
 */
module.exports.getProductByBarcodeApi = async (req, res) => {
  try {
    const barcode = (req.params.barcode || "").trim();
    if (!barcode) {
      return res.status(400).json({ success: false, message: "Barcode is required" });
    }

    const product = await Product.findOne({
      status: "active",
      $or: [{ barcode: barcode }, { sku: barcode }],
    })
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `No active product found with barcode / SKU "${barcode}"`,
      });
    }

    const now = new Date();
    // FEFO: sorted by earliest expiry date first
    const batches = await Batch.find({
      product: product._id,
      quantity: { $gt: 0 },
      expiryDate: { $gt: now },
      status: { $ne: "expired" },
    })
      .sort({ expiryDate: 1 })
      .lean();

    const totalBatchStock = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);

    return res.json({
      success: true,
      product: {
        _id: product._id,
        productName: product.productName,
        sku: product.sku,
        barcode: product.barcode || "",
        sellingPrice: product.sellingPrice || 0,
        purchasePrice: product.purchasePrice || 0,
        gst: product.gst || 0,
        availableStock: Math.max(0, totalBatchStock),
      },
      batches: batches.map((b) => ({
        _id: b._id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        sellingPrice: b.sellingPrice || product.sellingPrice,
        purchasePrice: b.purchasePrice || product.purchasePrice,
      })),
      fefoBatch: batches.length > 0 ? batches[0] : null,
    });
  } catch (err) {
    console.error("GET BARCODE PRODUCT API ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /sales/api/batches/:productId
 * Get available batches for a product sorted by FEFO
 */
module.exports.getProductBatchesApi = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const now = new Date();
    const batches = await Batch.find({
      product: productId,
      quantity: { $gt: 0 },
      expiryDate: { $gt: now },
      // status: { $ne: "expired" },
    })
      .sort({ expiryDate: 1 })
      .lean();

    return res.json({
      success: true,
      batches: batches.map((b) => ({
        _id: b._id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        sellingPrice: b.sellingPrice,
        purchasePrice: b.purchasePrice,
      })),
    });
  } catch (err) {
    console.error("GET BATCHES API ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /sales/api/customers
 * Quick create customer modal helper
 */
module.exports.createCustomerApi = async (req, res) => {
  let userId = req.user.id || req.user;
  try {
    const { name, phone, email, address, gstNumber } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Customer name is required" });
    }

    const newCustomer = await Customer.create({
      name: name.trim(),
      userId:userId,
      phone: phone ? phone.trim() : undefined,
      email: email ? email.trim().toLowerCase() : undefined,
      address: address ? address.trim() : undefined,
      gstNumber: gstNumber ? gstNumber.trim().toUpperCase() : undefined,
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: "Customer added successfully",
      customer: newCustomer,
    });
  } catch (err) {
    console.error("CREATE CUSTOMER API ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /sales
 * Complete Sale with Server-Side Validation, FEFO Batch Allocation,
 * Accurate Profit Tracking, Inventory Reduction, and Transaction Safety
 */
module.exports.createSale = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const userId = user._id && mongoose.Types.ObjectId.isValid(user._id) ? user._id : (req.user && req.user.id);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to create a sale bill.",
      });
    }

    const {
      invoiceNumber,
      customer: customerId,
      customerName,
      saleDate,
      paymentMethod,
      paymentStatus,
      paidAmount,
      discount: overallDiscount,
      notes,
      items,
    } = req.body;

    // --- Validation 1: Header Fields ---
    if (!invoiceNumber || typeof invoiceNumber !== "string" || !invoiceNumber.trim()) {
      return res.status(400).json({
        success: false,
        message: "Invoice number is required.",
      });
    }
    const cleanInvoiceNumber = invoiceNumber.trim();

    // Check duplicate invoice number
    const existingSale = await Sale.findOne({ invoiceNumber: cleanInvoiceNumber });
    if (existingSale) {
      return res.status(400).json({
        success: false,
        message: `Invoice number "${cleanInvoiceNumber}" already exists. Please generate a new one.`,
      });
    }

    // Customer resolution
    let resolvedCustomer = null;
    let resolvedCustomerName = "Walk-in Customer";

    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      resolvedCustomer = await Customer.findById(customerId);
      if (resolvedCustomer) {
        resolvedCustomerName = resolvedCustomer.name;
      }
    } else if (customerName && customerName.trim()) {
      resolvedCustomerName = customerName.trim();
    }

    // Date
    const cleanSaleDate = saleDate ? new Date(saleDate) : new Date();
    if (isNaN(cleanSaleDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid sale date." });
    }

    // Items array validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please add at least one product to the cart.",
      });
    }

    // Payment method & status normalization
    const cleanPaymentMethod = (paymentMethod || "cash").toLowerCase();
    const cleanPaymentStatus = (paymentStatus || "paid").toLowerCase();
    const parsedOverallDiscount = Math.max(0, parseFloat(overallDiscount) || 0);

    // --- Validation 2: Cart Items & FEFO Batch Allocation ---
    const now = new Date();
    const allocatedSaleItems = [];
    let serverSubtotal = 0;
    let serverGstAmount = 0;
    let serverItemDiscounts = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
        return res.status(400).json({
          success: false,
          message: `Item #${rowNum}: Invalid product selected.`,
        });
      }

      const productDoc = await Product.findById(item.product);
      if (!productDoc) {
        return res.status(400).json({
          success: false,
          message: `Item #${rowNum}: Product not found in database.`,
        });
      }

      const requestedQty = parseInt(item.quantity, 10);
      if (isNaN(requestedQty) || requestedQty <= 0) {
        return res.status(400).json({
          success: false,
          message: `Item #${rowNum} (${productDoc.productName}): Quantity must be at least 1.`,
        });
      }

      const sellingPrice = parseFloat(item.sellingPrice) >= 0
        ? parseFloat(item.sellingPrice)
        : (productDoc.sellingPrice || 0);

      const gstRate = parseFloat(item.gst) >= 0 ? parseFloat(item.gst) : (productDoc.gst || 0);
      const itemDiscount = Math.max(0, parseFloat(item.discount) || 0);

      // Check available non-expired batches for this product sorted by FEFO
      const availableBatches = await Batch.find({
        product: productDoc._id,
        quantity: { $gt: 0 },
        expiryDate: { $gt: now },
        status: { $ne: "expired" },
      }).sort({ expiryDate: 1 });

      if (availableBatches.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Product "${productDoc.productName}" has no available or non-expired stock.`,
        });
      }

      const totalProductAvailable = availableBatches.reduce((acc, b) => acc + b.quantity, 0);
      if (requestedQty > totalProductAvailable) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${productDoc.productName}". Requested: ${requestedQty}, Available: ${totalProductAvailable} units.`,
        });
      }

      // If user selected a specific batch
      let remainingToAllocate = requestedQty;
      const batchesToConsume = [];

      if (item.batch && mongoose.Types.ObjectId.isValid(item.batch)) {
        const specificBatch = availableBatches.find(
          (b) => b._id.toString() === item.batch.toString()
        );

        if (!specificBatch) {
          return res.status(400).json({
            success: false,
            message: `Selected batch for "${productDoc.productName}" is expired or out of stock.`,
          });
        }

        if (specificBatch.quantity >= requestedQty) {
          // Specific batch has full quantity
          batchesToConsume.push({
            batchDoc: specificBatch,
            qty: requestedQty,
          });
          remainingToAllocate = 0;
        } else {
          // Take available from specific batch, then consume remaining via FEFO
          batchesToConsume.push({
            batchDoc: specificBatch,
            qty: specificBatch.quantity,
          });
          remainingToAllocate -= specificBatch.quantity;
        }
      }

      // Allocate remaining quantity using FEFO from remaining available batches
      if (remainingToAllocate > 0) {
        for (const b of availableBatches) {
          if (batchesToConsume.some((bc) => bc.batchDoc._id.toString() === b._id.toString())) {
            continue; // already consumed
          }

          const canTake = Math.min(b.quantity, remainingToAllocate);
          batchesToConsume.push({
            batchDoc: b,
            qty: canTake,
          });
          remainingToAllocate -= canTake;

          if (remainingToAllocate <= 0) break;
        }
      }

      if (remainingToAllocate > 0) {
        return res.status(400).json({
          success: false,
          message: `Unable to allocate enough valid batches for "${productDoc.productName}".`,
        });
      }

      // Distribute itemDiscount proportionally if split across multiple batches
      const totalAllocatedQty = requestedQty;

      for (const bc of batchesToConsume) {
        const batchQty = bc.qty;
        const bDoc = bc.batchDoc;
        const batchDiscountPortion =
          totalAllocatedQty > 0
            ? Math.round(((itemDiscount * batchQty) / totalAllocatedQty) * 100) / 100
            : 0;

        const rowSubtotal = Math.round(batchQty * sellingPrice * 100) / 100;
        const rowGst = Math.round(rowSubtotal * (gstRate / 100) * 100) / 100;
        const rowTotal = Math.max(0, Math.round((rowSubtotal + rowGst - batchDiscountPortion) * 100) / 100);

        // Snapshot of purchasePrice from batch for accurate profit
        const batchCostPrice = bDoc.purchasePrice || 0;
        const salesValue = batchQty * sellingPrice;
        const purchaseCost = batchQty * batchCostPrice;
        // Formula: Profit = Sales Value - Purchase Cost - Discount
        const rowProfit = Math.round((salesValue - purchaseCost - batchDiscountPortion) * 100) / 100;

        serverSubtotal += rowSubtotal;
        serverGstAmount += rowGst;
        serverItemDiscounts += batchDiscountPortion;

        allocatedSaleItems.push({
          productDoc,
          productId: productDoc._id,
          batchDoc: bDoc,
          batchId: bDoc._id,
          quantity: batchQty,
          sellingPrice,
          purchasePrice: batchCostPrice, // SNAPSHOT of batch cost price
          gst: gstRate,
          discount: batchDiscountPortion,
          total: rowTotal,
          profit: rowProfit,
        });
      }
    }

    serverSubtotal = Math.round(serverSubtotal * 100) / 100;
    serverGstAmount = Math.round(serverGstAmount * 100) / 100;

    const totalDiscountApplied = Math.round((serverItemDiscounts + parsedOverallDiscount) * 100) / 100;
    const serverGrandTotal = Math.max(
      0,
      Math.round((serverSubtotal + serverGstAmount - totalDiscountApplied) * 100) / 100
    );

    // Paid amount calculation
    let serverPaidAmount = serverGrandTotal;
    let serverRemainingAmount = 0;

    if (cleanPaymentStatus === "partial") {
      serverPaidAmount = Math.max(0, Math.min(serverGrandTotal, parseFloat(paidAmount) || 0));
      serverRemainingAmount = Math.max(0, Math.round((serverGrandTotal - serverPaidAmount) * 100) / 100);
    } else if (cleanPaymentStatus === "pending") {
      serverPaidAmount = 0;
      serverRemainingAmount = serverGrandTotal;
    }

    // ========================================================
    // DATABASE FLOW WITH TRANSACTION SAFETY
    // ========================================================
    const topologyType = mongoose.connection.client?.topology?.description?.type;
    const isReplicaSet = topologyType === "ReplicaSetWithPrimary" || topologyType === "Sharded";

    let session = null;
    let useReplicaSetTransaction = false;

    if (isReplicaSet) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        useReplicaSetTransaction = true;
      } catch (sessionErr) {
        console.warn("Could not start replica set transaction for sale:", sessionErr.message);
        if (session) {
          try { session.endSession(); } catch (e) {}
          session = null;
        }
        useReplicaSetTransaction = false;
      }
    }

    // Rollback compensation tracking
    let createdSaleDoc = null;
    const createdSaleItemIds = [];
    const createdInventoryLogIds = [];
    const batchRollbackState = []; // Track deducted batches
    const productRollbackState = []; // Track deducted product stock

    try {
      const sessionOpt = useReplicaSetTransaction ? { session } : {};
      const paymentTermDays = parseInt(resolvedCustomer.Payment_term, 10);
      const duedate = new Date(cleanSaleDate);
     duedate.setDate(duedate.getDate() + paymentTermDays);
      // STEP 1 — Create Sale Document
      createdSaleDoc = new Sale({
        invoiceNumber: cleanInvoiceNumber,
        customer: resolvedCustomer ? resolvedCustomer._id : undefined,
        customerName: resolvedCustomerName,
        saleDate: cleanSaleDate,
        subtotal: serverSubtotal,
        gstAmount: serverGstAmount,
        discount: totalDiscountApplied,
        grandTotal: serverGrandTotal,
        paymentMethod: cleanPaymentMethod,
        paymentStatus: cleanPaymentStatus,
        paidAmount: serverPaidAmount,
        remainingAmount: serverRemainingAmount,
        notes: notes ? notes.trim() : "",
        createdBy: userId,
        duedate:duedate,
      });
      console.log(duedate);
      await createdSaleDoc.save(sessionOpt);

      // Group product deductions to update Product.quantity cleanly
      const productQtyDeductions = {};

      // STEP 2 — Create Sale Items & Reduce Batch Stock
      for (const item of allocatedSaleItems) {
        // Re-verify batch stock inside transaction to prevent race conditions
        const freshBatch = useReplicaSetTransaction
          ? await Batch.findById(item.batchId).session(session)
          : await Batch.findById(item.batchId);

        if (!freshBatch || freshBatch.quantity < item.quantity) {
          throw new Error(
            `Stock mismatch for batch "${item.batchDoc.batchNumber}". Requested ${item.quantity}, but only ${freshBatch ? freshBatch.quantity : 0} available.`
          );
        }

        // Deduct from batch
        freshBatch.quantity = Math.max(0, freshBatch.quantity - item.quantity);
        if (freshBatch.quantity === 0) {
          freshBatch.status = "depleted";
        }
        await freshBatch.save(sessionOpt);

        batchRollbackState.push({
          batchId: freshBatch._id,
          revertQty: item.quantity,
        });

        // Create SaleItem
        const saleItemDoc = new SaleItem({
          sale: createdSaleDoc._id,
          product: item.productId,
          batch: item.batchId,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          purchasePrice: item.purchasePrice, // SNAPSHOT
          gst: item.gst,
          discount: item.discount,
          total: item.total,
          profit: item.profit,
        });
        await saleItemDoc.save(sessionOpt);
        createdSaleItemIds.push(saleItemDoc._id);

        // Track product inventory deduction
        const pIdStr = item.productId.toString();
        productQtyDeductions[pIdStr] = (productQtyDeductions[pIdStr] || 0) + item.quantity;

        // Inventory Log for this batch movement
        const currentProd = useReplicaSetTransaction
          ? await Product.findById(item.productId).session(session)
          : await Product.findById(item.productId);

        const prevProdStock = currentProd ? currentProd.quantity : 0;

        const invLog = new InventoryLog({
          product: item.productId,
          batch: item.batchId,
          type: "SALE",
          quantity: item.quantity,
          previousStock: prevProdStock,
          newStock: Math.max(0, prevProdStock - item.quantity),
          referenceId: createdSaleDoc._id,
          note: `Sale Invoice #${cleanInvoiceNumber}`,
          createdBy: userId,
        });
        await invLog.save(sessionOpt);
        createdInventoryLogIds.push(invLog._id);
      }

      // STEP 3 — Reduce Product overall quantity
      for (const [prodIdStr, deductQty] of Object.entries(productQtyDeductions)) {
        const prod = useReplicaSetTransaction
          ? await Product.findById(prodIdStr).session(session)
          : await Product.findById(prodIdStr);

        if (prod) {
          const originalStock = prod.quantity || 0;
          productRollbackState.push({
            productId: prod._id,
            originalStock,
          });

          prod.quantity = Math.max(0, originalStock - deductQty);
          await prod.save(sessionOpt);
        }
      }

      // Commit native transaction if active
      if (useReplicaSetTransaction && session) {
        await session.commitTransaction();
        session.endSession();
      }

      return res.status(201).json({
        success: true,
        message: "Sale completed successfully. Inventory updated.",
        saleId: createdSaleDoc._id,
        invoiceNumber: createdSaleDoc.invoiceNumber,
        redirectUrl: `/sales/${createdSaleDoc._id}`,
      });
    } catch (saveError) {
      console.error("TRANSACTION / DB ERROR DURING SALE CREATION:", saveError);

      if (useReplicaSetTransaction && session) {
        try {
          await session.abortTransaction();
          session.endSession();
        } catch (abortErr) {
          console.error("Error aborting session:", abortErr);
        }
      } else {
        // Standalone manual rollback compensation
        try {
          if (createdSaleItemIds.length > 0) {
            await SaleItem.deleteMany({ _id: { $in: createdSaleItemIds } });
          }
          if (createdInventoryLogIds.length > 0) {
            await InventoryLog.deleteMany({ _id: { $in: createdInventoryLogIds } });
          }
          if (createdSaleDoc && createdSaleDoc._id) {
            await Sale.deleteOne({ _id: createdSaleDoc._id });
          }
          for (const br of batchRollbackState) {
            await Batch.updateOne({ _id: br.batchId }, { $inc: { quantity: br.revertQty }, status: "active" });
          }
          for (const pr of productRollbackState) {
            await Product.updateOne({ _id: pr.productId }, { quantity: pr.originalStock });
          }
          console.log("Manual rollback completed for failed sale creation.");
        } catch (rollbackErr) {
          console.error("Error during manual rollback compensation:", rollbackErr);
        }
      }

      if (saveError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Invoice number already exists. Please generate a unique invoice number.",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to complete sale: " + saveError.message,
      });
    }
  } catch (err) {
    console.error("CREATE SALE CONTROLLER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred: " + err.message,
    });
  }
};

/**
 * GET /sales/:id
 * Render Single Sale Invoice View (View & Browser Print Layout)
 */
module.exports.getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await resolveUser(req);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).send("Sale invoice not found");
    }

    const sale = await Sale.findById(id)
      .populate("customer")
      .populate("createdBy", "username email mobile")
      .lean();

    if (!sale) {
      return res.status(404).send("Sale record not found");
    }

    const items = await SaleItem.find({ sale: id })
      .populate({
        path: "product",
        populate: { path: "category" },
      })
      .populate("batch")
      .lean();

    const inventoryLogs = await InventoryLog.find({ referenceId: id })
      .populate("product", "productName sku")
      .populate("batch", "batchNumber")
      .sort({ createdAt: 1 })
      .lean();

    res.render("sales/view.ejs", {
      sale,
      items,
      inventoryLogs,
      req,
      user,
      User: user,
      reqUser: user,
    });
  } catch (err) {
    console.error("GET SALE DETAILS ERROR:", err);
    res.status(500).send("Error loading sale invoice: " + err.message);
  }
};

/**
 * GET /sales/:id/pdf
 * Generate and stream clean downloadable PDF invoice using pdfkit
 */
module.exports.generateInvoicePdf = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).send("Sale invoice not found");
    }

    const sale = await Sale.findById(id)
      .populate("customer")
      .populate("createdBy", "username email mobile")
      .lean();

    if (!sale) {
      return res.status(404).send("Sale record not found");
    }

    const items = await SaleItem.find({ sale: id })
      .populate("product")
      .populate("batch")
      .lean();

    // Initialize PDF Document
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Invoice-${sale.invoiceNumber}.pdf"`
    );

    doc.pipe(res);

    // Header: Shop details
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor("#071624")
      .text("SmartStock POS & Inventory", { align: "left" });

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#6f8198")
      .text("Retail, Wholesale & Inventory Management", { align: "left" })
      .text("101 Northline Commercial Plaza, Ring Road, Gujarat", { align: "left" })
      .text("GSTIN: 24AAACS9876K1Z9 | Phone: +91 98765 43210", { align: "left" });

    doc.moveDown(1);
    doc
      .strokeColor("#d7e1eb")
      .lineWidth(1)
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .stroke();
    doc.moveDown(1);

    // Invoice Meta Information (2 columns)
    const metaTop = doc.y;

    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#071624")
      .text("TAX INVOICE", 40, metaTop);

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#17243a")
      .text(`Invoice No: ${sale.invoiceNumber}`, 40, metaTop + 18)
      .text(`Date: ${new Date(sale.saleDate).toLocaleDateString("en-IN")}`, 40, metaTop + 32)
      .text(`Billed By: ${sale.createdBy ? sale.createdBy.username : "Cashier"}`, 40, metaTop + 46);

    // Customer details column
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#071624")
      .text("CUSTOMER DETAILS", 320, metaTop);

    const custName = sale.customer ? sale.customer.name : (sale.customerName || "Walk-in Customer");
    const custPhone = sale.customer && sale.customer.phone ? sale.customer.phone : "N/A";
    const custGst = sale.customer && sale.customer.gstNumber ? sale.customer.gstNumber : "Unregistered";

    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#17243a")
      .text(`Name: ${custName}`, 320, metaTop + 18)
      .text(`Phone: ${custPhone}`, 320, metaTop + 32)
      .text(`GSTIN: ${custGst}`, 320, metaTop + 46);

    doc.y = metaTop + 70;
    doc.moveDown(1);

    // Table Header
    const tableTop = doc.y;
    doc.rect(40, tableTop, 515, 22).fill("#0c2236");

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .text("#", 45, tableTop + 6)
      .text("Item / Description", 65, tableTop + 6)
      .text("Batch", 240, tableTop + 6)
      .text("Qty", 320, tableTop + 6, { width: 35, align: "right" })
      .text("Price", 365, tableTop + 6, { width: 50, align: "right" })
      .text("GST", 425, tableTop + 6, { width: 35, align: "right" })
      .text("Total", 470, tableTop + 6, { width: 80, align: "right" });

    let currentY = tableTop + 24;

    // Line items
    items.forEach((item, index) => {
      const prodName = item.product ? item.product.productName : "Product";
      const batchNo = item.batch ? item.batch.batchNumber : "N/A";

      // Alternate row backgrounds
      if (index % 2 === 1) {
        doc.rect(40, currentY, 515, 20).fill("#f8fafc");
      }

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#17243a")
        .text(String(index + 1), 45, currentY + 5)
        .text(prodName.length > 32 ? prodName.substring(0, 30) + ".." : prodName, 65, currentY + 5)
        .text(batchNo, 240, currentY + 5)
        .text(String(item.quantity), 320, currentY + 5, { width: 35, align: "right" })
        .text(Number(item.sellingPrice || 0).toFixed(2), 365, currentY + 5, { width: 50, align: "right" })
        .text(`${item.gst || 0}%`, 425, currentY + 5, { width: 35, align: "right" })
        .text(Number(item.total || 0).toFixed(2), 470, currentY + 5, { width: 80, align: "right" });

      currentY += 20;
    });

    doc.y = currentY + 10;
    doc
      .strokeColor("#d7e1eb")
      .lineWidth(1)
      .moveTo(40, doc.y)
      .lineTo(555, doc.y)
      .stroke();

    doc.moveDown(1);

    // Totals Box (Right aligned)
    const summaryX = 330;
    const summaryY = doc.y;

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#6f8198")
      .text("Subtotal:", summaryX, summaryY)
      .fillColor("#17243a")
      .text(`Rs ${Number(sale.subtotal || 0).toFixed(2)}`, 450, summaryY, { width: 100, align: "right" });

    doc
      .fillColor("#6f8198")
      .text("GST Total:", summaryX, summaryY + 15)
      .fillColor("#17243a")
      .text(`Rs ${Number(sale.gstAmount || 0).toFixed(2)}`, 450, summaryY + 15, { width: 100, align: "right" });

    doc
      .fillColor("#6f8198")
      .text("Discount:", summaryX, summaryY + 30)
      .fillColor("#17243a")
      .text(`- Rs ${Number(sale.discount || 0).toFixed(2)}`, 450, summaryY + 30, { width: 100, align: "right" });

    doc
      .strokeColor("#071624")
      .lineWidth(1)
      .moveTo(summaryX, summaryY + 48)
      .lineTo(555, summaryY + 48)
      .stroke();

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#071624")
      .text("Grand Total:", summaryX, summaryY + 54)
      .fillColor("#12b96b")
      .text(`Rs ${Number(sale.grandTotal || 0).toFixed(2)}`, 450, summaryY + 54, { width: 100, align: "right" });

    // Payment Info
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#17243a")
      .text(`Payment Method: ${(sale.paymentMethod || "Cash").toUpperCase()}`, 40, summaryY)
      .text(`Payment Status: ${(sale.paymentStatus || "Paid").toUpperCase()}`, 40, summaryY + 15)
      .text(`Paid: Rs ${Number(sale.paidAmount || sale.grandTotal).toFixed(2)}`, 40, summaryY + 30)
      .text(`Remaining: Rs ${Number(sale.remainingAmount || 0).toFixed(2)}`, 40, summaryY + 45);

    // Footer
    doc
      .fontSize(9)
      .font("Helvetica-Oblique")
      .fillColor("#6f8198")
      .text("Thank you for your business! Items once sold can be returned within 7 days with this invoice.", 40, 750, {
        align: "center",
        width: 515,
      });

    doc.end();
  } catch (err) {
    console.error("PDF GENERATION ERROR:", err);
    res.status(500).send("Error generating PDF invoice: " + err.message);
  }
};

