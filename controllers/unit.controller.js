const UnitModel = require("../model/unit.model.js");

// GET /units
module.exports.getAllUnits = async (req, res) => {
  try {
    const units = await UnitModel.find({ status: { $ne: "inactive" } }).sort({ name: 1 });
    return res.status(200).json({
      success: true,
      units,
    });
  } catch (err) {
    console.error("GET UNITS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch units",
      error: err.message,
    });
  }
};

// POST /units
module.exports.createUnit = async (req, res) => {
  try {
    const { name, symbol, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Unit name is required",
      });
    }

    if (!symbol || !symbol.trim()) {
      return res.status(400).json({
        success: false,
        message: "Unit symbol is required",
      });
    }

    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim();

    // Check duplicate by name or symbol
    const existing = await UnitModel.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
        { symbol: { $regex: new RegExp(`^${trimmedSymbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
      ],
    });

    if (existing) {
      const matchField = existing.name.toLowerCase() === trimmedName.toLowerCase() ? "name" : "symbol";
      return res.status(409).json({
        success: false,
        message: `Unit with this ${matchField} already exists`,
      });
    }

    const newUnit = await UnitModel.create({
      name: trimmedName,
      symbol: trimmedSymbol,
      status: status || "active",
    });

    return res.status(201).json({
      success: true,
      message: "Unit created successfully",
      unit: newUnit,
    });
  } catch (err) {
    console.error("CREATE UNIT ERROR:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Unit with this name or symbol already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create unit",
      error: err.message,
    });
  }
};

