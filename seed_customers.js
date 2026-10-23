const mongoose = require("mongoose");
const Customer = require("./model/customer.model.js");
require("dotenv").config();
async function seedCustomers() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB for customer seeding.");

    const existingCount = await Customer.countDocuments();
    await Customer.updateMany(
   {},
  {
    $set: {
      userId: new mongoose.Types.ObjectId("6ac9ebc4ca34ba86d9fbb7f1")
    }
  }
 );
    if (existingCount > 0) {
      console.log(`Customers already exist (${existingCount} found).`);
      process.exit(0);
    }

    const sampleCustomers = [
  {
    name: "Rajesh Patel",
    phone: "9876543210",
    email: "rajesh.patel@gmail.com",
    address: "12, Shastri Nagar",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380013,
    Cred_limit: "50000",
    Payment_term: "30 Days",
    gstNumber: "24ABCDE1234F1Z5",
    notes: "Regular wholesale customer",
    status: "active"
  },
  {
    name: "Amit Shah",
    phone: "9825012345",
    email: "amit.shah@gmail.com",
    address: "45, C G Road",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380009,
    Cred_limit: "25000",
    Payment_term: "15 Days",
    gstNumber: "24BCDEF2345G1Z6",
    notes: "Prefers digital payment",
    status: "active"
  },
  {
    name: "Neha Desai",
    phone: "9898123456",
    email: "neha.desai@gmail.com",
    address: "18, Satellite Road",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380015,
    Cred_limit: "30000",
    Payment_term: "7 Days",
    gstNumber: "24CDEFG3456H1Z7",
    notes: "Retail customer",
    status: "active"
  },
  {
    name: "Kiran Mehta",
    phone: "9725123456",
    email: "kiran.mehta@gmail.com",
    address: "22, Ring Road",
    city: "Surat",
    state: "Gujarat",
    pincode: 395002,
    Cred_limit: "75000",
    Payment_term: "30 Days",
    gstNumber: "24DEFGH4567J1Z8",
    notes: "Large monthly orders",
    status: "active"
  },
  {
    name: "Vivek Joshi",
    phone: "9819012345",
    email: "vivek.joshi@gmail.com",
    address: "10, Maninagar",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380008,
    Cred_limit: "20000",
    Payment_term: "Immediate",
    gstNumber: "24EFGHI5678K1Z9",
    notes: "Cash customer",
    status: "active"
  },
  {
    name: "Pooja Trivedi",
    phone: "9909123456",
    email: "pooja.trivedi@gmail.com",
    address: "34, Alkapuri",
    city: "Vadodara",
    state: "Gujarat",
    pincode: 390007,
    Cred_limit: "40000",
    Payment_term: "15 Days",
    gstNumber: "24FGHIJ6789L1ZA",
    notes: "Regular customer",
    status: "active"
  },
  {
    name: "Harshil Patel",
    phone: "9824123456",
    email: "harshil.patel@gmail.com",
    address: "8, Vastrapur",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380015,
    Cred_limit: "60000",
    Payment_term: "30 Days",
    gstNumber: "24GHIJK7890M1ZB",
    notes: "Wholesale customer",
    status: "active"
  },
  {
    name: "Riya Shah",
    phone: "9879012345",
    email: "riya.shah@gmail.com",
    address: "15, Adajan",
    city: "Surat",
    state: "Gujarat",
    pincode: 395009,
    Cred_limit: "15000",
    Payment_term: "7 Days",
    gstNumber: "24HIJKL8901N1ZC",
    notes: "Small business customer",
    status: "active"
  },
  {
    name: "Suresh Kumar",
    phone: "9912345678",
    email: "suresh.kumar@gmail.com",
    address: "27, Navrangpura",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380009,
    Cred_limit: "35000",
    Payment_term: "15 Days",
    gstNumber: "24IJKLM9012P1ZD",
    notes: "Payment usually on time",
    status: "active"
  },
  {
    name: "Dhruv Bhatt",
    phone: "9876543211",
    email: "dhruv.bhatt@gmail.com",
    address: "19, Gotri Road",
    city: "Vadodara",
    state: "Gujarat",
    pincode: 390021,
    Cred_limit: "45000",
    Payment_term: "30 Days",
    gstNumber: "24JKLMN0123Q1ZE",
    notes: "Wholesale electronics buyer",
    status: "active"
  },
  {
    name: "Anjali Modi",
    phone: "9825234567",
    email: "anjali.modi@gmail.com",
    address: "6, Paldi",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380007,
    Cred_limit: "10000",
    Payment_term: "Immediate",
    gstNumber: "24KLMNO1234R1ZF",
    notes: "Retail customer",
    status: "active"
  },
  {
    name: "Manish Agarwal",
    phone: "9909234567",
    email: "manish.agarwal@gmail.com",
    address: "41, Varachha Road",
    city: "Surat",
    state: "Gujarat",
    pincode: 395006,
    Cred_limit: "80000",
    Payment_term: "30 Days",
    gstNumber: "24LMNOP2345S1ZG",
    notes: "High volume customer",
    status: "active"
  },
  {
    name: "Nisha Patel",
    phone: "9812345670",
    email: "nisha.patel@gmail.com",
    address: "29, Bopal",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 380058,
    Cred_limit: "25000",
    Payment_term: "15 Days",
    gstNumber: "24MNOPQ3456T1ZH",
    notes: "Regular retail buyer",
    status: "active"
  },
  {
    name: "Yash Thakkar",
    phone: "9724345678",
    email: "yash.thakkar@gmail.com",
    address: "55, Waghodia Road",
    city: "Vadodara",
    state: "Gujarat",
    pincode: 390019,
    Cred_limit: "55000",
    Payment_term: "30 Days",
    gstNumber: "24NOPQR4567U1ZI",
    notes: "Wholesale customer",
    status: "active"
  },
  {
    name: "Mehul Joshi",
    phone: "9898456789",
    email: "mehul.joshi@gmail.com",
    address: "11, Chandkheda",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: 382424,
    Cred_limit: "20000",
    Payment_term: "7 Days",
    gstNumber: "24OPQRS5678V1ZJ",
    notes: "New customer",
    status: "inactive"
  }
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

