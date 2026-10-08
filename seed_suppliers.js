const mongoose = require("mongoose");
const Supplier = require("./model/supplier.model.js");

async function seedSuppliers() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/smartstock");
    console.log("Connected to MongoDB for supplier seeding.");

    const existingCount = await Supplier.countDocuments();
    if (existingCount > 0) {
      console.log(`Suppliers already exist (${existingCount} found).`);
      process.exit(0);
    }

    const sampleSuppliers = [
      {
        name: "Apex Global Distributors",
        phone: "+91 98765 43210",
        email: "orders@apexdistributors.com",
        address: "Plot 42, Industrial Area, Phase II, Ahmedabad, Gujarat",
        gstNumber: "24AAACA1234A1Z5",
        status: "active",
      },
      {
        name: "Prime FMCG Wholesale",
        phone: "+91 91234 56789",
        email: "sales@primefmcg.in",
        address: "Shop 12, APMC Market, Surat, Gujarat",
        gstNumber: "24BBBCB5678B1Z2",
        status: "active",
      },
      {
        name: "Sunrise Logistics & Supplies",
        phone: "+91 99887 76655",
        email: "contact@sunrisesupplies.com",
        address: "Ring Road Logistics Hub, Vadodara, Gujarat",
        gstNumber: "24CCCC9012C1Z8",
        status: "active",
      },
    ];

    await Supplier.insertMany(sampleSuppliers);
    console.log("Sample suppliers seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding suppliers:", err);
    process.exit(1);
  }
}

seedSuppliers();

