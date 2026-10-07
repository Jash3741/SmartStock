const CategoryModel = require("../model/category.model.js");

// GET /categories
module.exports.getAllCategories = async (req, res) => {
  try {
    const categories = await CategoryModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 });
    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (err) {
    console.error("GET CATEGORIES ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: err.message,
    });
  }
};

// POST /categories
module.exports.createCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const trimmedName = name.trim();

    // Check duplicate (case-insensitive regex for robust duplicate prevention)
    const existing = await CategoryModel.findOne({
      name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    const newCategory = await CategoryModel.create({
      name: trimmedName,
      description: description ? description.trim() : undefined,
      status: status || "active",
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: newCategory,
    });
  } catch (err) {
    console.error("CREATE CATEGORY ERROR:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Category with this name already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: err.message,
    });
  }
};

