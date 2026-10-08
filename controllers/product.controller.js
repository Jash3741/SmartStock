const ProductModel = require("../model/product.model");
const CategoryModel = require("../model/category.model");
const SupplierModel = require("../model/supplier.model");
const UserModel = require("../model/user.model");
const mongoose = require("mongoose");

// Helper to resolve current user
async function resolveUser(req) {
  const id = req.params.id || (req.user && req.user.id);
  let user = null;
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    user = await UserModel.findById(id);
  }
  if (!user && req.user && req.user.id) {
    user = await UserModel.findById(req.user.id);
  }
  return user || { _id: id || "guest", username: "User" };
}

// GET /inventory (also supports /products and /:id/products list)
module.exports.inventory = async (req, res) => {
  try {
    const user = await resolveUser(req);

    // Parse Query parameters
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search || "").trim();
    const categoryFilter = (req.query.category || "").trim();
    const stockFilter = (req.query.stock || "").trim();
    const sortOption = (req.query.sort || "newest").trim();

    // Calculate Global Statistics efficiently using MongoDB aggregation & count operations
    const totalProducts = await ProductModel.countDocuments();

    const totalStockAgg = await ProductModel.aggregate([
      { $group: { _id: null, totalStock: { $sum: "$quantity" } } }
    ]);
    const totalStock = totalStockAgg.length > 0 ? (totalStockAgg[0].totalStock || 0) : 0;

    const lowStock = await ProductModel.countDocuments({
      quantity: { $gt: 0, $lte: 5 }
    });

    const outOfStock = await ProductModel.countDocuments({
      quantity: { $lte: 0 }
    });

    const stats = {
      totalProducts,
      totalStock,
      lowStock,
      outOfStock
    };

    // Build Search & Filtering Query
    const queryConditions = [];

    // Search by product name, category name, or ObjectId if valid
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const orConditions = [
        { productName: searchRegex }
      ];

      // If valid ObjectId, match by ID
      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      // Also search by matching category names
      const matchingCats = await CategoryModel.find({ name: searchRegex }).select("_id");
      if (matchingCats.length > 0) {
        const catIds = matchingCats.map(c => c._id);
        orConditions.push({
          $or: [
            { categoryId: { $in: catIds } },
            { category: { $in: catIds } }
          ]
        });
      }

      queryConditions.push({ $or: orConditions });
    }

    // Category Filter
    if (categoryFilter && categoryFilter !== "all") {
      if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
        const cId = new mongoose.Types.ObjectId(categoryFilter);
        queryConditions.push({
          $or: [{ categoryId: cId }, { category: cId }]
        });
      } else {
        // Find category by name
        const foundCat = await CategoryModel.findOne({ name: categoryFilter });
        if (foundCat) {
          queryConditions.push({
            $or: [{ categoryId: foundCat._id }, { category: foundCat._id }]
          });
        }
      }
    }

    // Stock Filter: in-stock (> 5), low-stock (1..5), out-of-stock (<= 0)
    if (stockFilter && stockFilter !== "all") {
      if (stockFilter === "in_stock") {
        queryConditions.push({ quantity: { $gt: 5 } });
      } else if (stockFilter === "low_stock") {
        queryConditions.push({ quantity: { $gt: 0, $lte: 5 } });
      } else if (stockFilter === "out_of_stock") {
        queryConditions.push({ quantity: { $lte: 0 } });
      }
    }

    const finalQuery = queryConditions.length > 0 ? { $and: queryConditions } : {};

    // Determine Sort Order
    let sortQuery = { createdAt: -1 };
    switch (sortOption) {
      case "oldest":
        sortQuery = { createdAt: 1 };
        break;
      case "name_asc":
        sortQuery = { productName: 1 };
        break;
      case "name_desc":
        sortQuery = { productName: -1 };
        break;
      case "price_asc":
        sortQuery = { sellingPrice: 1 };
        break;
      case "price_desc":
        sortQuery = { sellingPrice: -1 };
        break;
      case "quantity_asc":
        sortQuery = { quantity: 1 };
        break;
      case "quantity_desc":
        sortQuery = { quantity: -1 };
        break;
      default:
        sortQuery = { createdAt: -1 };
    }

    // Pagination calculations
    const filteredCount = await ProductModel.countDocuments(finalQuery);
    const totalPages = Math.ceil(filteredCount / limit) || 1;
    const skip = (page - 1) * limit;

    // Fetch Products with populated category reference
    const products = await ProductModel.find(finalQuery)
      .populate("categoryId", "name")
      .populate("category", "name")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    // Fetch All Active Categories for the Filter Dropdown
    const categories = await CategoryModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 });

    res.render("./user/inventory.ejs", {
      User: user,
      reqUser: user,
      products,
      categories,
      stats,
      pagination: {
        page,
        limit,
        totalProducts: filteredCount,
        totalPages,
        startItem: filteredCount > 0 ? skip + 1 : 0,
        endItem: Math.min(skip + limit, filteredCount)
      },
      filters: {
        search,
        category: categoryFilter,
        stock: stockFilter,
        sort: sortOption
      }
    });
  } catch (err) {
    console.error("INVENTORY ERROR:", err);
    res.status(500).send("Unable to load inventory: " + err.message);
  }
};

// GET /products/new (also renders Add Product)
module.exports.renderAddProduct = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const [categories, suppliers] = await Promise.all([
      CategoryModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 }),
      SupplierModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 })
    ]);

    res.render("./user/add-product.ejs", {
      User: user,
      reqUser: user,
      categories,
      suppliers,
    });
  } catch (err) {
    console.error("RENDER ADD PRODUCT ERROR:", err);
    res.status(500).send("Internal Server Error");
  }
};

// POST /products (Add product)
module.exports.newProduct = async (req, res) => {
  try {
    const {
      name,
      productName,
      sku,
      barcode,
      categoryId,
      category,
      price,
      sellingPrice,
      purchasePrice,
      costPrice,
      supplier,
      description,
      tax,
      gst,
      minimumStock,
      reorderLevel,
      status,
    } = req.body;

    const finalProductName = (productName || name || "").trim();
    const finalCategoryId = categoryId || category;

    const finalSellingPrice = sellingPrice !== undefined && sellingPrice !== "" 
      ? Number(sellingPrice) 
      : (price !== undefined && price !== "" ? Number(price) : undefined);

    const finalPurchasePrice = purchasePrice !== undefined && purchasePrice !== "" 
      ? Number(purchasePrice) 
      : (costPrice !== undefined && costPrice !== "" ? Number(costPrice) : 0);

    // Initial stock is 0 (managed through purchases/inward entries)
    const finalQuantity = 0;
    const finalGst = gst !== undefined && gst !== "" ? Number(gst) : (tax !== undefined && tax !== "" ? Number(tax) : 0);
    const finalMinStock = minimumStock !== undefined && minimumStock !== "" 
      ? Number(minimumStock) 
      : (reorderLevel !== undefined && reorderLevel !== "" ? Number(reorderLevel) : 5);

    // Validation
    if (!finalProductName) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Product name is required" });
      }
      return res.status(400).send("Product name is required");
    }

    if (!finalCategoryId || !mongoose.Types.ObjectId.isValid(finalCategoryId)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Valid category is required" });
      }
      return res.status(400).send("Invalid category");
    }

    // Verify Category exists in database
    const categoryDoc = await CategoryModel.findById(finalCategoryId);
    if (!categoryDoc) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Category does not exist" });
      }
      return res.status(400).send("Invalid category");
    }

    if (finalSellingPrice === undefined || isNaN(finalSellingPrice) || finalSellingPrice < 0) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Valid selling price is required" });
      }
      return res.status(400).send("Valid selling price is required");
    }

    const finalSku = (sku && sku.trim()) || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    const newProduct = new ProductModel({
      productName: finalProductName,
      sku: finalSku,
      barcode: barcode ? barcode.trim() : undefined,
      category: categoryDoc._id,
      categoryId: categoryDoc._id,
      supplier: supplier ? supplier.trim() : undefined,
      description: description ? description.trim() : undefined,
      purchasePrice: finalPurchasePrice,
      sellingPrice: finalSellingPrice,
      price: finalSellingPrice,
      quantity: finalQuantity,
      gst: finalGst,
      minimumStock: finalMinStock,
      status: status || "active",
    });

    await newProduct.save();

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        product: newProduct,
      });
    }

    return res.redirect("/inventory");
  } catch (err) {
    console.error("CREATE PRODUCT ERROR:", err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "SKU/Barcode";
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(409).json({ success: false, message: `Product with this ${field} already exists` });
      }
      return res.status(409).send(`Product with this ${field} already exists`);
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
    }
    return res.status(500).send("Internal Server Error: " + err.message);
  }
};

// GET /products/:id (View details or JSON for modal)
module.exports.getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }
      return res.status(400).send("Invalid product ID");
    }

    const product = await ProductModel.findById(id)
      .populate("categoryId", "name")
      .populate("category", "name");

    if (!product) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
      return res.status(404).send("Product not found");
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(200).json({ success: true, product });
    }

    const user = await resolveUser(req);
    res.render("./user/edit-product.ejs", {
      User: user,
      reqUser: user,
      product,
      isViewOnly: true
    });
  } catch (err) {
    console.error("GET PRODUCT DETAILS ERROR:", err);
    res.status(500).send("Error fetching product details: " + err.message);
  }
};

// GET /products/:id/edit (Render Edit Product Page)
module.exports.renderEditProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send("Invalid product ID");
    }

    const product = await ProductModel.findById(id);
    if (!product) {
      return res.status(404).send("Product not found");
    }

    const user = await resolveUser(req);
    const [categories, suppliers] = await Promise.all([
      CategoryModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 }),
      SupplierModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 })
    ]);

    res.render("./user/edit-product.ejs", {
      User: user,
      reqUser: user,
      product,
      categories,
      suppliers,
      isViewOnly: false
    });
  } catch (err) {
    console.error("RENDER EDIT PRODUCT ERROR:", err);
    res.status(500).send("Error loading edit page: " + err.message);
  }
};

// POST /products/:id/edit or PUT /products/:id (Update Product)
module.exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }
      return res.status(400).send("Invalid product ID");
    }

    const existingProduct = await ProductModel.findById(id);
    if (!existingProduct) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
      return res.status(404).send("Product not found");
    }

    const {
      name,
      productName,
      sku,
      barcode,
      categoryId,
      category,
      price,
      sellingPrice,
      purchasePrice,
      costPrice,
      quantity,
      supplier,
      description,
      tax,
      gst,
      minimumStock,
      reorderLevel,
      status
    } = req.body;

    const finalProductName = productName !== undefined ? productName.trim() : (name !== undefined ? name.trim() : existingProduct.productName);
    const finalCategoryId = categoryId || category || existingProduct.categoryId || existingProduct.category;

    if (!finalProductName) {
      return res.status(400).send("Product name cannot be empty");
    }

    if (!mongoose.Types.ObjectId.isValid(finalCategoryId)) {
      return res.status(400).send("Invalid category");
    }

    const categoryDoc = await CategoryModel.findById(finalCategoryId);
    if (!categoryDoc) {
      return res.status(400).send("Selected category does not exist");
    }

    const finalSellingPrice = sellingPrice !== undefined && sellingPrice !== "" 
      ? Number(sellingPrice) 
      : (price !== undefined && price !== "" ? Number(price) : existingProduct.sellingPrice);

    const finalPurchasePrice = purchasePrice !== undefined && purchasePrice !== "" 
      ? Number(purchasePrice) 
      : (costPrice !== undefined && costPrice !== "" ? Number(costPrice) : existingProduct.purchasePrice);

    const finalQuantity = quantity !== undefined && quantity !== "" ? Number(quantity) : existingProduct.quantity;
    const finalGst = gst !== undefined && gst !== "" ? Number(gst) : (tax !== undefined && tax !== "" ? Number(tax) : existingProduct.gst);
    const finalMinStock = minimumStock !== undefined && minimumStock !== "" 
      ? Number(minimumStock) 
      : (reorderLevel !== undefined && reorderLevel !== "" ? Number(reorderLevel) : existingProduct.minimumStock);

    existingProduct.productName = finalProductName;
    if (sku && sku.trim()) existingProduct.sku = sku.trim();
    if (barcode !== undefined) existingProduct.barcode = barcode ? barcode.trim() : undefined;
    existingProduct.category = categoryDoc._id;
    existingProduct.categoryId = categoryDoc._id;
    if (supplier !== undefined) existingProduct.supplier = supplier ? supplier.trim() : undefined;
    if (description !== undefined) existingProduct.description = description ? description.trim() : undefined;
    existingProduct.purchasePrice = finalPurchasePrice;
    existingProduct.sellingPrice = finalSellingPrice;
    existingProduct.price = finalSellingPrice;
    existingProduct.quantity = finalQuantity;
    existingProduct.gst = finalGst;
    existingProduct.minimumStock = finalMinStock;
    if (status) existingProduct.status = status;

    await existingProduct.save();

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product: existingProduct
      });
    }

    return res.redirect("/inventory");
  } catch (err) {
    console.error("UPDATE PRODUCT ERROR:", err);
    if (err.code === 11000) {
      return res.status(409).send("Duplicate SKU or barcode value");
    }
    res.status(500).send("Error updating product: " + err.message);
  }
};

// DELETE /products/:id (Delete Product)
module.exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }
      return res.status(400).send("Invalid product ID");
    }

    const deleted = await ProductModel.findByIdAndDelete(id);
    if (!deleted) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
      return res.status(404).send("Product not found");
    }

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(200).json({
        success: true,
        message: "Product deleted successfully"
      });
    }

    return res.redirect("/inventory");
  } catch (err) {
    console.error("DELETE PRODUCT ERROR:", err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({
        success: false,
        message: "Error deleting product",
        error: err.message
      });
    }
    res.status(500).send("Error deleting product: " + err.message);
  }
};