# SmartStock 📦 — Modern Inventory Management System

**SmartStock** is a full-featured, responsive web application for managing retail, wholesale, and warehouse inventory. Built with **Node.js, Express.js, MongoDB, Mongoose, and EJS**, SmartStock helps businesses track stock levels, catalog products, manage categories and units of measurement, and maintain inventory health.

---

## 🌟 Key Features

### 1. 📊 Interactive Dashboard
- **Health Metrics**: Real-time overview of inventory status and activity.
- **Quick Links**: Access workspace sections including products, sales, reports, suppliers, and locations.
- **User Profile Integration**: Direct navigation to user profile and account configuration.

### 2. 📋 Comprehensive Inventory Management
- **Statistics Overview Cards**:
  - **Total Products**: Live count of active items in the database.
  - **Total Stock**: Total cumulative inventory quantity across all SKUs calculated via MongoDB aggregations.
  - **Low Stock Alerts**: Automatically highlights products with stock $\le 5$ units.
  - **Out of Stock Alerts**: Real-time identification of depleted products ($0$ units).
- **Search & Filter System**:
  - Real-time debounced search by **Product Name**, **Category**, or **Product ID**.
  - Dropdown filter by **Category**.
  - Dropdown filter by **Stock Status** (*All Stock*, *In Stock*, *Low Stock*, *Out of Stock*).
  - Multi-criteria **Sorting** (*Newest*, *Oldest*, *Name A–Z / Z–A*, *Price Low–High / High–Low*, *Quantity Low–High / High–Low*).
- **Server-Side Pagination**:
  - Dynamic page size selection ($10$, $25$, $50$, or $100$ items per page).
  - Preserves filter and search queries across page switches and browser refreshes (`/inventory?page=1&limit=10&search=...`).
- **Product Actions**:
  - **View Modal**: Full specifications (SKU, barcode, purchase price, selling price, quantity, tax, supplier, description).
  - **Edit Product**: Update any product fields with category and unit relationship support.
  - **Delete Product**: Safe deletion workflow with confirmation modal.

### 3. ➕ Smart Product Creation
- **Dynamic Category & Unit Selection**:
  - Dropdowns populated directly from MongoDB.
- **In-Page Modals**:
  - **+ Add Category**: Create a new category on the fly without losing form progress or reloading the page.
  - **+ Add Unit**: Create a unit with symbol (e.g. *Kilogram / kg*, *Litre / L*, *Piece / pcs*) with duplicate checks.
- **Automatic Barcode Generator**: Generates barcode numbers with a single click.
- **Relational Integrity**:
  - `Product` references `categoryId` and `unitId` via MongoDB ObjectIds instead of duplicating raw strings.

### 4. 🔐 Authentication & Session Security
- User registration and login with **bcrypt** password hashing.
- Token-based session management using **JWT** and secure **HTTP-only refresh cookies**.
- Session tracking with IP address, user agent, and automated expiration handling.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend Runtime** | Node.js |
| **Web Framework** | Express.js (v5) |
| **Database** | MongoDB |
| **ODM / Modeling** | Mongoose (v9) |
| **Templating Engine** | EJS + ejs-mate layouts |
| **Authentication** | JWT (`jsonwebtoken`) & `bcrypt` |
| **Styling** | Custom Responsive CSS (Inter typography, CSS Variables, Flexbox/Grid) |

---

## 📁 Project Architecture

```text
SmartStock/
├── controllers/              # Route handlers & business logic
│   ├── auth.controller.js        # Authentication & JWT session logic
│   ├── category.controller.js    # Category management & validation
│   ├── product.controller.js     # Inventory, product CRUD, stats & filters
│   └── unit.controller.js        # Unit creation & validation
├── model/                    # Mongoose database schemas
│   ├── batch.model.js            # Batch tracking & expiry dates
│   ├── category.model.js         # Category collection
│   ├── inventoryLog.model.js     # Audit trail for stock changes
│   ├── product.model.js          # Core product schema with references
│   ├── purchaseItem.model.js     # Purchase orders & incoming stock
│   ├── saleItem.model.js         # Sale line items
│   ├── sales.model.js            # Sales & invoices
│   ├── session.model.js          # User refresh token sessions
│   ├── supplier.model.js         # Supplier directory
│   ├── unit.model.js             # Unit of measurement schema
│   └── user.model.js             # User accounts
├── public/                   # Static assets
│   └── CSS/                      # Modular stylesheets
│       ├── add-product.css
│       ├── dashboard.css
│       ├── inventory.css
│       ├── login.css
│       ├── profile.css
│       └── signup.css
├── routes/                   # Express routes
│   ├── auth.routes.js            # /api/auth endpoints
│   ├── category.routes.js        # /categories endpoints
│   ├── product.routes.js         # /products & /inventory endpoints
│   └── unit.routes.js            # /units endpoints
├── utils/                    # Middleware & helper utilities
│   └── middelwares/
│       └── sessions.middelware.js # JWT & cookie session verification
├── views/                    # EJS views
│   └── user/
│       ├── add-product.ejs       # Add Product page with inline modals
│       ├── dashboard.ejs         # User dashboard overview
│       ├── edit-product.ejs      # Edit product & specifications
│       ├── inventory.ejs         # Inventory table, filters & stats
│       ├── login.ejs             # Login view
│       ├── profile.ejs           # User profile view
│       └── signup.ejs            # Sign-up view
├── .env                      # Environment variables
├── app.js                    # Application entry point & server setup
├── package.json              # Project dependencies & configuration
└── README.md                 # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) running locally on port `27017` (or an active MongoDB Atlas URI)

### Installation

1. **Clone or open the repository**:
   ```bash
   cd SmartStock
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create or verify your `.env` file in the root directory:
   ```env
   JWT_SECRET=your_secret_jwt_key_here
   PORT=4000
   ```

4. **Start MongoDB**:
   Ensure your local MongoDB daemon is running:
   ```bash
   mongod
   ```

5. **Run the Application**:
   - Using nodemon (development):
     ```bash
     npx nodemon app.js
     ```
   - Using standard node:
     ```bash
     node app.js
     ```

6. **Open in Browser**:
   Visit [http://localhost:4000/login](http://localhost:4000/login) or [http://localhost:4000/inventory](http://localhost:4000/inventory).

---

## 🧭 Main Routes & Navigation

| Method | Route | Description |
|---|---|---|
| `GET` | `/signup` | User registration page |
| `GET` | `/login` | User login page |
| `GET` | `/:id/dashboard` | Main user dashboard |
| `GET` | `/inventory` | Inventory table with statistics, search, and filters |
| `GET` | `/products/add` *(or `/products/new`)* | Add Product form with Category/Unit modals |
| `POST` | `/products` *(or `/products/new`)* | Create a new product |
| `GET` | `/products/:id` | View product details (HTML or JSON for modal) |
| `GET` | `/products/:id/edit` | Edit product page |
| `POST` | `/products/:id/edit` *(or `PUT /products/:id`)* | Update existing product |
| `DELETE`| `/products/:id` | Delete product |
| `POST` | `/categories` | Create new category (AJAX supported) |
| `GET` | `/categories` | List active categories |
| `POST` | `/units` | Create new unit of measure (AJAX supported) |
| `GET` | `/units` | List active units |

---

## 🛡️ Data Integrity & Security Highlights

- **Field Whitelisting**: Strict extraction of allowed fields during product creation to prevent mass-assignment attacks.
- **Reference Validation**: Validates existence of both `categoryId` and `unitId` documents in MongoDB before product insertion.
- **Duplicate Prevention**: Unique constraints and case-insensitive regex checks prevent duplicate category names and unit names/symbols.
- **Aggregated Statistics**: Employs MongoDB `countDocuments()` and `$group` aggregation instead of client-side loops for high-volume inventory scalability.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE) (or as designated in `package.json`).

