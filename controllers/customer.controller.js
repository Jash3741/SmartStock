const customerModel = require("../model/customer.model.js");
const UserModel = require("../model/user.model.js");
const SalesModel = require("../model/sales.model.js");
const mongoose = require("mongoose");
//Customer Dashboard
module.exports.dashboardRender = async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.redirect("/login");
    }

    const reqUser = await UserModel.findById(req.user.id);
    if (!reqUser) { 
        return res.redirect("/login");
    }
    const reqCust = await customerModel.find({userId:req.user.id});
    const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 10;
const skip = (page - 1) * limit;

// Selected month/year
const month = parseInt(req.query.month) || new Date().getMonth() + 1;
const year = parseInt(req.query.year) || new Date().getFullYear();

// Start and end of month
const startDate = new Date(year, month - 1, 1);
const endDate = new Date(year, month, 1);

// Get customers for logged-in user
const customers = await customerModel
  .find({
    userId: new mongoose.Types.ObjectId(req.user.id)
  })
  .skip(skip)
  .limit(limit)
  .lean();

const totalCustomers = await customerModel.countDocuments({
  userId: new mongoose.Types.ObjectId(req.user.id)
});

// Customer-wise sales aggregation
        const salesSummary = await SalesModel.aggregate([
        {
            $match: {
            createdBy: new mongoose.Types.ObjectId(req.user.id),
            customer: { $ne: null },
            saleDate: {
                $gte: startDate,
                $lt: endDate
            }
            }
        },

        {
            $group: {
            _id: "$customer",

            totalOrders: {
                $sum: 1
            },

            totalPurchase: {
                $sum: "$grandTotal"
            },

            totalPaid: {
                $sum: "$paidAmount"
            },

            totalRemaining: {
                $sum: "$remainingAmount"
            },

            lastPurchase: {
                $max: "$saleDate"
            }
            }
        }
        ]);

        // Convert aggregation result into a Map
        const salesMap = new Map(
        salesSummary.map(item => [
            item._id.toString(),
            item
        ])
        );

        // Add sales information to every customer
        const customerRows = customers.map(customer => {

        const sales = salesMap.get(customer._id.toString());

        return {
            ...customer,

            totalPurchases: sales?.totalPurchase || 0,
            totalPaid: sales?.totalPaid || 0,
            outstandingBalance: sales?.totalRemaining || 0,

            lastPurchaseDate: sales?.lastPurchase || null,

            paymentStatus:
            sales?.totalRemaining > 0
                ? "Pending"
                : "Paid"
        };
        });

        const totalPages = Math.ceil(totalCustomers / limit);
        const summary = await SalesModel.aggregate([
        {
            $match: {
            createdBy: new mongoose.Types.ObjectId(req.user.id)
            }
        },
        {
            $group: {
            _id: null,

            totalSales: {
                $sum: "$grandTotal"
            },

            totalPaid: {
                $sum: "$paidAmount"
            },

            totalPending: {
                $sum: "$remainingAmount"
            }
            }
        }
        ]);
res.render("./customer/customers.ejs", {
  reqUser, req, reqCust,
  customers: customerRows,
  totalCustomers,totalPages,currentPage: page,
  limit,
  month,year,
  summary
});

}
//GET ADD Customer Form RENDER
module.exports.AddCustRender = async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.redirect("/login");
    }

    const reqUser = await UserModel.findById(req.user.id);
    if (!reqUser) {
        return res.redirect("/login");
    }

    res.render("./customer/new.ejs", { reqUser, req });
};

//POST ADD CUSTOMER
module.exports.AddCust = async (req,res) =>{
    try{
        const reqUser = req.user && req.user.id ? await UserModel.findById(req.user.id) : null;
        if(reqUser===null)
                {
                     return res.status(400).render("./customer/new.ejs", { error: "User Not Found", reqUser: null, req });
                }
         const {customerName,phoneNumber,email,address,city,state,pincode,gstin,creditLimit,paymentTerms,notes}=req.body;
            const NewCustomer = new customerModel({
            userId: req.user.id,
            name:customerName,
            phone:phoneNumber,
            email:email,
            address:address,
            city:city,
            state:state,
            pincode:pincode,
            Cred_limit:creditLimit,
            Payment_term:paymentTerms,
            notes:notes,
            gstNumber:gstin,
            status:"active"
         });
         await NewCustomer.save();
         return res.redirect("/customer");
    }
    catch(err){
        return res.status(500).send("Internal Server Error :" + err.message);
    }
};

//EDIT FORM RENDER
module.exports.EditCustRender = async (req,res)=>{
    if (!req.user || !req.user.id) {
        return res.redirect("/login");
    }
    const reqUser = await UserModel.findById(req.user.id);
    if (!reqUser) {
        return res.redirect("/login");
    }
    const customerId = req.params.id;
    let customer = null;
    if (customerId) {
        customer = await customerModel.findOne({ _id: customerId, userId: req.user.id });
    } else {
        customer = await customerModel.findOne({ userId: req.user.id });
    }

    if (!customer) {
        return res.status(404).send("Customer not found");
    }
    res.render("./customer/edit.ejs", { reqUser, req, customer });
};

module.exports.UpdateCustomer = async (req,res) =>{
    if (!req.user || !req.user.id) {
        return res.redirect("/login");
    }
    const customerId = req.params.id;
    const customer = await customerModel.findOne({ _id: customerId, userId: req.user.id });

    if (!customer) {
        return res.status(404).send("Customer not found");
    }

    const { name, phone, email, address, city, state, pincode, gstin, creditLimit, paymentTerms, notes, status } = req.body;
    customer.name = name || customer.name;
    customer.phone = phone || customer.phone;
    customer.email = email || customer.email;
    customer.address = address || customer.address;
    customer.city = city || customer.city;
    customer.state = state || customer.state;
    customer.pincode = pincode || customer.pincode;
    customer.Cred_limit = creditLimit ?? customer.Cred_limit;
    customer.Payment_term = paymentTerms || customer.Payment_term;
    customer.notes = notes || customer.notes;
    customer.gstNumber = gstin || customer.gstNumber;
    customer.status = status || customer.status;

    await customer.save();
    return res.redirect("/customer");
};

//View Customer

module.exports.ViewCustomer = async (req,res) =>{
    const reqUser = await UserModel.findById(req.user.id);
    const Customer = await customerModel.findById(req.params.id);
    res.render("./customer/view.ejs",{reqUser , req , Customer});
};