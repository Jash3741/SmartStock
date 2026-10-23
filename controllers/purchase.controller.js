const mongoose = require("mongoose");
const Purchase = require("../model/purchase.model.js");
const PurchaseItem = require("../model/purchaseItem.model.js");
const Batch = require("../model/batch.model.js");
const Product = require("../model/product.model.js");
const Supplier = require("../model/supplier.model.js");
const InventoryLog = require("../model/inventoryLog.model.js");
const UserModel = require("../model/user.model.js");

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
 * GET /purchases
 * Render Purchase History list with search, status filters, and metrics
 */
module.exports.renderPurchaseHistory = async (req, res) => {
  try {
    const user = await resolveUser(req);

    const search = (req.query.search || "").trim();
    const statusFilter = (req.query.status || "").trim();

    // Query builder
    const query = {};

    if (statusFilter && ["Paid", "Partial", "Pending"].includes(statusFilter)) {
      query.paymentStatus = statusFilter;
    }

    // If search term provided
    if (search) {
      // Find matching suppliers by name
      const matchingSuppliers = await Supplier.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");

      const supplierIds = matchingSuppliers.map((s) => s._id);

      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { supplier: { $in: supplierIds } },
      ];
    }

    // Fetch purchases
    const purchases = await Purchase.find(query)
      .populate("supplier", "name phone email gstNumber")
      .populate("createdBy", "username email")
      .sort({ purchaseDate: -1, createdAt: -1 })
      .lean();

    // Attach item counts to each purchase
    const purchaseIds = purchases.map((p) => p._id);
    const itemCounts = await PurchaseItem.aggregate([
      { $match: { purchase: { $in: purchaseIds } } },
      { $group: { _id: "$purchase", count: { $sum: 1 }, totalQty: { $sum: "$quantity" } } },
    ]);

    const countMap = {};
    itemCounts.forEach((item) => {
      countMap[item._id.toString()] = {
        count: item.count,
        totalQty: item.totalQty,
      };
    });

    purchases.forEach((p) => {
      const stats = countMap[p._id.toString()] || { count: 0, totalQty: 0 };
      p.itemCount = stats.count;
      p.totalQuantity = stats.totalQty;
    });

    // KPI metrics
    const totalPurchases = await Purchase.countDocuments();
    const totalSpentAgg = await Purchase.aggregate([
      { $group: { _id: null, total: { $sum: "$grandTotal" } } },
    ]);
    const totalSpent = totalSpentAgg.length > 0 ? totalSpentAgg[0].total : 0;

    const pendingPaymentCount = await Purchase.countDocuments({
      paymentStatus: { $in: ["Pending", "Partial"] },
    });

    const stats = {
      totalPurchases,
      totalSpent,
      pendingPaymentCount,
    };

    res.render("purchases/index.ejs", {
      purchases,
      stats,
      search,
      statusFilter,
      user,
      req,
      User: user,
      reqUser: user,
    });
  } catch (err) {
    console.error("PURCHASE HISTORY ERROR:", err);
    res.status(500).send("Internal Server Error while loading purchase history: " + err.message);
  }
};

/**
 * GET /purchases/new
 * Render New Purchase Entry form with active suppliers and products
 */
module.exports.renderNewPurchase = async (req, res) => {
  try {
    const user = await resolveUser(req);

    // Fetch active suppliers
    const suppliers = await Supplier.find({ status: { $ne: "inactive" } })
      .sort({ name: 1 })
      .lean();

    // Fetch active products
    const products = await Product.find({ status: { $ne: "inactive" } })
      .populate("category", "name")
      .sort({ productName: 1 })
      .lean();

    // Suggest a clean invoice number
    const suggestedInvoiceNumber = `PUR-${Date.now().toString().slice(-6)}`;

    // Today's date formatted for HTML date input: YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];

    res.render("purchases/new.ejs", {
      suppliers,
      products,
      suggestedInvoiceNumber,
      today,
      user,
      req,
      User: user,
      reqUser: user,
    });
  } catch (err) {
    console.error("RENDER NEW PURCHASE ERROR:", err);
    res.status(500).send("Internal Server Error while preparing purchase entry form: " + err.message);
  }
};

/**
 * POST /purchases
 * Create a new purchase with transaction safety
 * 1. Create Purchase document
 * 2. Create PurchaseItem documents
 * 3. Create or update Batch documents
 * 4. Increase Product stock
 * 5. Create InventoryLog documents
 */
module.exports.createPurchase = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const userId = user._id && mongoose.Types.ObjectId.isValid(user._id) ? user._id : (req.user && req.user.id);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to create a purchase entry.",
      });
    }

    const {
      invoiceNumber,
      supplier,
      purchaseDate,
      paymentMethod,
      paymentStatus,
      discount,
      notes,
      items,
    } = req.body;

    // --- Validation 1: Header Fields ---
    if (!invoiceNumber || typeof invoiceNumber !== "string" || !invoiceNumber.trim()) {
      return res.status(400).json({
        success: false,
        message: "Purchase Invoice Number is required.",
      });
    }

    const cleanInvoiceNumber = invoiceNumber.trim();

    // Check duplicate invoice number
    const existingPurchase = await Purchase.findOne({
      invoiceNumber: cleanInvoiceNumber,
    });

    if (existingPurchase) {
      return res.status(400).json({
        success: false,
        message: `Invoice number "${cleanInvoiceNumber}" already exists. Please use a unique invoice number.`,
      });
    }

    if (!supplier || !mongoose.Types.ObjectId.isValid(supplier)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid supplier.",
      });
    }

    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) {
      return res.status(400).json({
        success: false,
        message: "The selected supplier does not exist.",
      });
    }

    // --- Validation 2: Items Array ---
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please add at least one product row to the purchase.",
      });
    }

    // Discount validation
    const parsedDiscount = parseFloat(discount) || 0;
    if (parsedDiscount < 0 || isNaN(parsedDiscount)) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a valid non-negative number.",
      });
    }

    // Validate payment method and status
    const validPaymentMethods = ["Cash", "UPI", "Card", "Bank", "Credit"];
    const validPaymentStatuses = ["Paid", "Partial", "Pending"];

    const cleanPaymentMethod = validPaymentMethods.includes(paymentMethod)
      ? paymentMethod
      : "Cash";
    const cleanPaymentStatus = validPaymentStatuses.includes(paymentStatus)
      ? paymentStatus
      : "Paid";

    // Date validation
    const cleanPurchaseDate = purchaseDate ? new Date(purchaseDate) : new Date();
    if (isNaN(cleanPurchaseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase date.",
      });
    }

    // --- Validation 3: Line Items & Server-Side Recalculation ---
    let serverSubtotal = 0;
    let serverGstAmount = 0;
    const validatedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      // Product validation
      if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Please select a valid product.`,
        });
      }

      const productDoc = await Product.findById(item.product);
      if (!productDoc) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Selected product was not found in the database.`,
        });
      }

      // Batch number validation
      if (!item.batchNumber || typeof item.batchNumber !== "string" || !item.batchNumber.trim()) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Batch Number is required for "${productDoc.productName}".`,
        });
      }
      const cleanBatchNumber = item.batchNumber.trim().toUpperCase();

      // Quantity validation
      const quantity = parseInt(item.quantity, 10);
      if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Quantity must be greater than 0 for "${productDoc.productName}".`,
        });
      }

      // Purchase price validation
      const purchasePrice = parseFloat(item.purchasePrice);
      if (isNaN(purchasePrice) || purchasePrice < 0) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Purchase price must be a valid non-negative number for "${productDoc.productName}".`,
        });
      }

      // Selling price validation
      const sellingPrice = parseFloat(item.sellingPrice);
      if (isNaN(sellingPrice) || sellingPrice < 0) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Selling price must be a valid non-negative number for "${productDoc.productName}".`,
        });
      }

      // Expiry date validation
      if (!item.expiryDate) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Expiry date is required for batch "${cleanBatchNumber}".`,
        });
      }

      const expiryDate = new Date(item.expiryDate);
      if (isNaN(expiryDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: Expiry date is invalid for batch "${cleanBatchNumber}".`,
        });
      }

      // Manufacturing date validation
      let manufacturingDate = null;
      if (item.manufacturingDate) {
        manufacturingDate = new Date(item.manufacturingDate);
        if (isNaN(manufacturingDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: `Row #${rowNum}: Manufacturing date is invalid for batch "${cleanBatchNumber}".`,
          });
        }

        if (expiryDate <= manufacturingDate) {
          return res.status(400).json({
            success: false,
            message: `Row #${rowNum}: Expiry date cannot be on or before Manufacturing date for batch "${cleanBatchNumber}".`,
          });
        }
      }

      // GST % validation
      const gst = parseFloat(item.gst) || 0;
      if (isNaN(gst) || gst < 0) {
        return res.status(400).json({
          success: false,
          message: `Row #${rowNum}: GST % must be a valid non-negative number.`,
        });
      }

      // Calculations:
      // Item Subtotal = Quantity × Purchase Price
      const itemSubtotal = Math.round(quantity * purchasePrice * 100) / 100;
      // Item GST Amount = Item Subtotal × (GST % / 100)
      const itemGstAmount = Math.round(itemSubtotal * (gst / 100) * 100) / 100;
      const itemTotal = Math.round((itemSubtotal + itemGstAmount) * 100) / 100;

      serverSubtotal += itemSubtotal;
      serverGstAmount += itemGstAmount;

      validatedItems.push({
        productDoc,
        productId: productDoc._id,
        batchNumber: cleanBatchNumber,
        manufacturingDate,
        expiryDate,
        quantity,
        purchasePrice,
        sellingPrice,
        gst,
        itemSubtotal,
        itemGstAmount,
        itemTotal,
      });
    }

    // Round financial numbers cleanly to 2 decimal places
    serverSubtotal = Math.round(serverSubtotal * 100) / 100;
    serverGstAmount = Math.round(serverGstAmount * 100) / 100;

    if (parsedDiscount > serverSubtotal + serverGstAmount) {
      return res.status(400).json({
        success: false,
        message: "Discount cannot exceed the total purchase amount (Subtotal + GST).",
      });
    }

    // Formula: Grand Total = Subtotal + GST Amount - Discount
    const serverGrandTotal = Math.max(
      0,
      Math.round((serverSubtotal + serverGstAmount - parsedDiscount) * 100) / 100
    );

    // ========================================================
    // DATABASE FLOW WITH TRANSACTION SAFETY
    // ========================================================
    // MongoDB transactions are only supported on Replica Sets or Sharded clusters.
    // We check the connection topology type to safely run native transactions on Replica Sets/Atlas
    // and provide atomic rollback compensation on standalone development servers.
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
        console.warn("Could not start replica set transaction:", sessionErr.message);
        if (session) {
          try { session.endSession(); } catch (e) {}
          session = null;
        }
        useReplicaSetTransaction = false;
      }
    }

    // Rollback tracking state in case of manual compensation
    let createdPurchaseDoc = null;
    const createdPurchaseItemIds = [];
    const createdInventoryLogIds = [];
    const batchRollbackState = []; // Track original batch quantities & creation
    const productRollbackState = []; // Track original product stocks

    try {
      const sessionOpt = useReplicaSetTransaction ? { session } : {};

      // STEP 1 — Create Purchase Document
      createdPurchaseDoc = new Purchase({
        invoiceNumber: cleanInvoiceNumber,
        supplier: supplierDoc._id,
        purchaseDate: cleanPurchaseDate,
        subtotal: serverSubtotal,
        gstAmount: serverGstAmount,
        discount: parsedDiscount,
        grandTotal: serverGrandTotal,
        paymentMethod: cleanPaymentMethod,
        paymentStatus: cleanPaymentStatus,
        notes: notes ? notes.trim() : "",
        createdBy: userId,
      });

      await createdPurchaseDoc.save(sessionOpt);

      // STEPS 2, 3, 4 — Process Line Items
      for (const vItem of validatedItems) {
        // Step 3 — Create or Update Batch
        let batchDoc = useReplicaSetTransaction
          ? await Batch.findOne({ product: vItem.productId, batchNumber: vItem.batchNumber }).session(session)
          : await Batch.findOne({ product: vItem.productId, batchNumber: vItem.batchNumber });

        if (batchDoc) {
          // Record state for rollback
          batchRollbackState.push({
            batchId: batchDoc._id,
            wasNew: false,
            addedQty: vItem.quantity,
          });

          // Increase quantity & update
          batchDoc.quantity = (batchDoc.quantity || 0) + vItem.quantity;
          batchDoc.expiryDate = vItem.expiryDate;
          if (vItem.manufacturingDate) {
            batchDoc.manufacturingDate = vItem.manufacturingDate;
          }
          batchDoc.purchasePrice = vItem.purchasePrice;
          batchDoc.sellingPrice = vItem.sellingPrice;
          batchDoc.supplier = supplierDoc._id;
          batchDoc.status = "active";
          await batchDoc.save(sessionOpt);
        } else {
          // Create new Batch document
          batchDoc = new Batch({
            product: vItem.productId,
            batchNumber: vItem.batchNumber,
            manufacturingDate: vItem.manufacturingDate || undefined,
            expiryDate: vItem.expiryDate,
            purchasePrice: vItem.purchasePrice,
            sellingPrice: vItem.sellingPrice,
            quantity: vItem.quantity,
            supplier: supplierDoc._id,
            purchase: createdPurchaseDoc._id,
            status: "active",
          });
          await batchDoc.save(sessionOpt);

          batchRollbackState.push({
            batchId: batchDoc._id,
            wasNew: true,
          });
        }

        // Step 2 — Create PurchaseItem Document
        const purchaseItemDoc = new PurchaseItem({
          purchase: createdPurchaseDoc._id,
          product: vItem.productId,
          batch: batchDoc._id,
          quantity: vItem.quantity,
          purchasePrice: vItem.purchasePrice,
          sellingPrice: vItem.sellingPrice,
          gst: vItem.gst,
          total: vItem.itemTotal,
        });
        await purchaseItemDoc.save(sessionOpt);
        createdPurchaseItemIds.push(purchaseItemDoc._id);

        // Step 4 — Increase Product Inventory & Create InventoryLog
        const currentProduct = useReplicaSetTransaction
          ? await Product.findById(vItem.productId).session(session)
          : await Product.findById(vItem.productId);

        const previousStock = currentProduct.quantity || 0;
        const newStock = previousStock + vItem.quantity;

        productRollbackState.push({
          productId: currentProduct._id,
          originalStock: previousStock,
        });

        currentProduct.quantity = newStock;
        currentProduct.purchasePrice = vItem.purchasePrice;
        currentProduct.sellingPrice = vItem.sellingPrice;
        await currentProduct.save(sessionOpt);

        // Create InventoryLog document
        const inventoryLogDoc = new InventoryLog({
          product: vItem.productId,
          batch: batchDoc._id,
          type: "PURCHASE",
          quantity: vItem.quantity,
          previousStock,
          newStock,
          referenceId: createdPurchaseDoc._id,
          note: `Purchase Invoice #${cleanInvoiceNumber}`,
          createdBy: userId,
        });
        await inventoryLogDoc.save(sessionOpt);
        createdInventoryLogIds.push(inventoryLogDoc._id);
      }

      // Commit native transaction if active
      if (useReplicaSetTransaction && session) {
        await session.commitTransaction();
        session.endSession();
      }

      // Success response
      return res.status(201).json({
        success: true,
        message: "Purchase saved successfully. Inventory updated successfully.",
        purchaseId: createdPurchaseDoc._id,
        redirectUrl: "/purchases",
      });
    } catch (saveError) {
      console.error("TRANSACTION / DB ERROR DURING PURCHASE SAVE:", saveError);

      // Rollback native transaction if active
      if (useReplicaSetTransaction && session) {
        try {
          await session.abortTransaction();
          session.endSession();
        } catch (abortErr) {
          console.error("Error aborting session:", abortErr);
        }
      } else {
        // Standalone manual rollback compensation to ensure NO partially saved data
        try {
          if (createdPurchaseItemIds.length > 0) {
            await PurchaseItem.deleteMany({ _id: { $in: createdPurchaseItemIds } });
          }
          if (createdInventoryLogIds.length > 0) {
            await InventoryLog.deleteMany({ _id: { $in: createdInventoryLogIds } });
          }
          if (createdPurchaseDoc && createdPurchaseDoc._id) {
            await Purchase.deleteOne({ _id: createdPurchaseDoc._id });
          }
          // Revert batches
          for (const br of batchRollbackState) {
            if (br.wasNew) {
              await Batch.deleteOne({ _id: br.batchId });
            } else {
              await Batch.updateOne({ _id: br.batchId }, { $inc: { quantity: -br.addedQty } });
            }
          }
          // Revert product stocks
          for (const pr of productRollbackState) {
            await Product.updateOne({ _id: pr.productId }, { quantity: pr.originalStock });
          }
          console.log("Manual rollback completed successfully. No partial records remaining.");
        } catch (rollbackErr) {
          console.error("Error during manual rollback compensation:", rollbackErr);
        }
      }

      if (saveError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Invoice number already exists. Please choose a different invoice number.",
        });
      }

      return res.status(500).json({
        success: false,
        message: "An error occurred while saving the purchase: " + saveError.message,
      });
    }
  } catch (err) {
    console.error("CREATE PURCHASE CONTROLLER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred: " + err.message,
    });
  }
};

/**
 * GET /purchases/:id
 * Render single purchase details (Invoice view)
 */
module.exports.getPurchaseDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await resolveUser(req);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).send("Purchase invoice not found");
    }

    const purchase = await Purchase.findById(id)
      .populate("supplier")
      .populate("createdBy", "username email mobile")
      .lean();

    if (!purchase) {
      return res.status(404).send("Purchase record not found");
    }

    // Fetch line items
    const items = await PurchaseItem.find({ purchase: id })
      .populate({
        path: "product",
        populate: { path: "category" },
      })
      .populate("batch")
      .lean();

    // Fetch associated inventory audit logs
    const inventoryLogs = await InventoryLog.find({ referenceId: id })
      .populate("product", "productName sku")
      .populate("batch", "batchNumber")
      .sort({ createdAt: 1 })
      .lean();

    res.render("purchases/view.ejs", {
      purchase,
      items,
      inventoryLogs,
      user,
      User: user,
      req,
      reqUser: user,
    });
  } catch (err) {
    console.error("GET PURCHASE DETAILS ERROR:", err);
    res.status(500).send("Internal Server Error while loading purchase invoice: " + err.message);
  }
};

/**
 * POST /purchases/api/supplier
 * Quick supplier creation modal helper
 */
module.exports.quickCreateSupplier = async (req, res) => {
  try {
    const { name, phone, email, address, gstNumber } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Supplier name is required." });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: "Supplier phone is required." });
    }

    const newSupplier = await Supplier.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      address: address ? address.trim() : undefined,
      gstNumber: gstNumber ? gstNumber.trim().toUpperCase() : undefined,
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: "Supplier created successfully.",
      supplier: newSupplier,
    });
  } catch (err) {
    console.error("QUICK CREATE SUPPLIER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create supplier: " + err.message,
    });
  }
};
