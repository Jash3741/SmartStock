const mongoose = require("mongoose");
const Customer = require("./model/customer.model.js");

async function seedCustomers() {
  try {
    await mongoose.connect("mongodb://127.0.0.1:27017/smartstock");
    console.log("Connected to MongoDB for customer seeding.");

    const existingCount = await Customer.countDocuments();
    if (existingCount > 0) {
      console.log(`Customers already exist (${existingCount} found).`);
      process.exit(0);
    }

    const sampleCustomers = [
      {
        name: "Rajesh Sharma",
        phone: "+91 98250 12345",
        email: "rajesh.sharma@example.com",
        address: "102 Silver Heights, Navrangpura, Ahmedabad",
        gstNumber: "24AABCS1429B1Z8",
        status: "active",
      },
      {
        name: "Priya Patel",
        phone: "+91 98980 67890",
        email: "priya.patel@example.com",
        address: "B-404 Green Valley, SG Highway, Ahmedabad",
        status: "active",
      },
      {
        name: "Amit Verma",
        phone: "+91 97240 55443",
        email: "amit.verma@example.com",
        address: "Shop 5, Sunrise Complex, Surat",
        gstNumber: "24AACCV9988C1Z1",
        status: "active",
      },
    ];

    await Customer.insertMany(sampleCustomers);
    console.log("Sample customers seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding customers:", err);
    process.exit(1);
  }
}

seedCustomers();

