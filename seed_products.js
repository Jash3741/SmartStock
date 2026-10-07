const mongoose = require("mongoose");
const Category = require("./model/category.model.js");
const Unit = require("./model/unit.model.js");
const Product = require("./model/product.model.js");

async function seedTestData() {
  await mongoose.connect("mongodb://127.0.0.1:27017/smartstock");
  console.log("Connected to MongoDB.");

  // Categories to create if not present
  const categoryNames = [
    "Electronics",
    "Beverages",
    "Snacks & Biscuits",
    "Dairy",
    "Grains & Pulses",
    "Office Supplies"
  ];

  const categoryMap = {};
  for (const name of categoryNames) {
    let cat = await Category.findOne({ name });
    if (!cat) {
      cat = await Category.create({ name, status: "active" });
      console.log(`Created Category: ${name}`);
    }
    categoryMap[name] = cat._id;
  }

  // Also include existing Biscuit category if present
  const existingBiscuit = await Category.findOne({ name: "Biscuit" });
  if (existingBiscuit) {
    categoryMap["Biscuit"] = existingBiscuit._id;
  }

  // Units to create if not present
  const unitsData = [
    { name: "Piece", symbol: "pcs" },
    { name: "Kilogram", symbol: "kg" },
    { name: "Gram", symbol: "g" },
    { name: "Litre", symbol: "L" },
    { name: "Box", symbol: "box" },
    { name: "Packet", symbol: "pkt" }
  ];

  const unitMap = {};
  for (const u of unitsData) {
    let unitDoc = await Unit.findOne({ name: u.name });
    if (!unitDoc) {
      unitDoc = await Unit.create({ name: u.name, symbol: u.symbol, status: "active" });
      console.log(`Created Unit: ${u.name} (${u.symbol})`);
    }
    unitMap[u.name] = unitDoc._id;
  }

  // Also map existing Unit Piece with symbol 'pices'
  const existingPiece = await Unit.findOne({ name: "Piece" });
  if (existingPiece) {
    unitMap["Piece"] = existingPiece._id;
  }

  // Sample test products with diverse names, categories, prices, and stock statuses
  const testProducts = [
    {
      productName: "Wireless Bluetooth Headphones",
      sku: "SKU-ELEC-001",
      barcode: "890111222001",
      categoryName: "Electronics",
      unitName: "Piece",
      purchasePrice: 1200,
      sellingPrice: 1899,
      quantity: 45, // In Stock
      gst: 18,
      supplier: "TechSupply Co",
      description: "Noise cancelling wireless over-ear headphones with 40h battery."
    },
    {
      productName: "USB-C Fast Charging Cable 2M",
      sku: "SKU-ELEC-002",
      barcode: "890111222002",
      categoryName: "Electronics",
      unitName: "Piece",
      purchasePrice: 90,
      sellingPrice: 249,
      quantity: 3, // Low Stock (<= 5)
      gst: 18,
      supplier: "Volt Cables Ltd",
      description: "Braided nylon heavy duty Type-C 65W charging cable."
    },
    {
      productName: "Mechanical Gaming Keyboard RGB",
      sku: "SKU-ELEC-003",
      barcode: "890111222003",
      categoryName: "Electronics",
      unitName: "Piece",
      purchasePrice: 2100,
      sellingPrice: 3499,
      quantity: 0, // Out of Stock
      gst: 18,
      supplier: "Redragon Direct",
      description: "Tactile blue switches with programmable RGB backlighting."
    },
    {
      productName: "Tata Tea Gold 500g",
      sku: "SKU-BEV-001",
      barcode: "890111222004",
      categoryName: "Beverages",
      unitName: "Packet",
      purchasePrice: 220,
      sellingPrice: 275,
      quantity: 80, // In Stock
      gst: 5,
      supplier: "Tata Consumer Products",
      description: "Rich aroma tea with gently rolled aromatic long leaves."
    },
    {
      productName: "Nescafe Classic Instant Coffee Jar 100g",
      sku: "SKU-BEV-002",
      barcode: "890111222005",
      categoryName: "Beverages",
      unitName: "Piece",
      purchasePrice: 280,
      sellingPrice: 340,
      quantity: 4, // Low Stock
      gst: 5,
      supplier: "Nestle India",
      description: "100% pure natural coffee beans medium dark roasted."
    },
    {
      productName: "Oreo Original Chocolate Sandwich Biscuits",
      sku: "SKU-SNK-001",
      barcode: "890111222006",
      categoryName: "Snacks & Biscuits",
      unitName: "Packet",
      purchasePrice: 25,
      sellingPrice: 35,
      quantity: 120, // In Stock
      gst: 12,
      supplier: "Mondelez India",
      description: "Delicious rich vanilla creme between crunchy chocolate cookies."
    },
    {
      productName: "Britannia Good Day Butter Cookies",
      sku: "SKU-SNK-002",
      barcode: "890111222007",
      categoryName: "Snacks & Biscuits",
      unitName: "Packet",
      purchasePrice: 15,
      sellingPrice: 20,
      quantity: 2, // Low Stock
      gst: 12,
      supplier: "Britannia Industries",
      description: "Classic butter cookies rich in aroma and pleasant taste."
    },
    {
      productName: "Amul Taaza Homogenised Toned Milk 1L",
      sku: "SKU-DRY-001",
      barcode: "890111222008",
      categoryName: "Dairy",
      unitName: "Litre",
      purchasePrice: 62,
      sellingPrice: 72,
      quantity: 60, // In Stock
      gst: 0,
      supplier: "Amul Federation",
      description: "UHT treated long life toned milk with zero bacteria."
    },
    {
      productName: "Amul Salted Butter 500g",
      sku: "SKU-DRY-002",
      barcode: "890111222009",
      categoryName: "Dairy",
      unitName: "Packet",
      purchasePrice: 240,
      sellingPrice: 275,
      quantity: 0, // Out of Stock
      gst: 12,
      supplier: "Amul Federation",
      description: "Pasteurized salted butter made from pure milk fat."
    },
    {
      productName: "Fortune Sunlite Refined Sunflower Oil 1L",
      sku: "SKU-GRN-001",
      barcode: "890111222010",
      categoryName: "Grains & Pulses",
      unitName: "Litre",
      purchasePrice: 130,
      sellingPrice: 155,
      quantity: 40, // In Stock
      gst: 5,
      supplier: "Adani Wilmar",
      description: "Light and healthy refined sunflower oil enriched with vitamins."
    },
    {
      productName: "Daawat Rozana Super Basmati Rice 5kg",
      sku: "SKU-GRN-002",
      barcode: "890111222011",
      categoryName: "Grains & Pulses",
      unitName: "Kilogram",
      purchasePrice: 380,
      sellingPrice: 475,
      quantity: 25, // In Stock
      gst: 0,
      supplier: "LT Foods Ltd",
      description: "Fluffy and aromatic long grain aged Basmati rice."
    },
    {
      productName: "A4 Copier Paper Ream 500 Sheets 75GSM",
      sku: "SKU-OFF-001",
      barcode: "890111222012",
      categoryName: "Office Supplies",
      unitName: "Box",
      purchasePrice: 240,
      sellingPrice: 320,
      quantity: 18, // In Stock
      gst: 12,
      supplier: "JK Paper Mills",
      description: "High brightness multi-purpose printing and copying paper."
    }
  ];

  let addedCount = 0;
  for (const p of testProducts) {
    const existing = await Product.findOne({ sku: p.sku });
    if (!existing) {
      const catId = categoryMap[p.categoryName] || categoryMap["Biscuit"];
      const uId = unitMap[p.unitName] || unitMap["Piece"];

      await Product.create({
        productName: p.productName,
        sku: p.sku,
        barcode: p.barcode,
        category: catId,
        categoryId: catId,
        unit: uId,
        unitId: uId,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        price: p.sellingPrice,
        quantity: p.quantity,
        gst: p.gst,
        minimumStock: 5,
        supplier: p.supplier,
        description: p.description,
        status: "active"
      });
      console.log(`Added Product: "${p.productName}" (Qty: ${p.quantity}, Price: ₹${p.sellingPrice})`);
      addedCount++;
    } else {
      console.log(`Product already exists: "${p.productName}"`);
    }
  }

  const finalCount = await Product.countDocuments();
  console.log(`\nDone! Added ${addedCount} new products. Total products in database: ${finalCount}`);
  process.exit(0);
}

seedTestData().catch(err => {
  console.error("Error seeding data:", err);
  process.exit(1);
});

