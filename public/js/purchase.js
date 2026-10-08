/**
 * SmartStock - Purchase Entry Vanilla JavaScript
 * Dynamic row addition/removal, real-time recalculations, validation, and AJAX submission.
 */

document.addEventListener("DOMContentLoaded", () => {
  const purchaseForm = document.getElementById("purchaseForm");
  const itemsTableBody = document.getElementById("itemsTableBody");
  const addRowBtn = document.getElementById("addRowBtn");
  const discountInput = document.getElementById("discountInput");
  const alertBanner = document.getElementById("alertBanner");
  const alertMessage = document.getElementById("alertMessage");
  const saveBtn = document.getElementById("savePurchaseBtn");

  // Summary display elements
  const subtotalDisplay = document.getElementById("subtotalDisplay");
  const gstDisplay = document.getElementById("gstDisplay");
  const grandTotalDisplay = document.getElementById("grandTotalDisplay");
  const totalItemsDisplay = document.getElementById("totalItemsDisplay");
  const totalQtyDisplay = document.getElementById("totalQtyDisplay");

  // Supplier modal elements
  const openSupplierModalBtn = document.getElementById("openSupplierModalBtn");
  const supplierModal = document.getElementById("supplierModal");
  const closeSupplierModalBtn = document.getElementById("closeSupplierModalBtn");
  const cancelSupplierModalBtn = document.getElementById("cancelSupplierModalBtn");
  const supplierForm = document.getElementById("supplierForm");
  const supplierSelect = document.getElementById("supplierSelect");

  // Products dataset passed from server (parsed from JSON script tag)
  let productsList = [];
  const productsDataTag = document.getElementById("productsData");
  if (productsDataTag) {
    try {
      productsList = JSON.parse(productsDataTag.textContent || "[]");
    } catch (e) {
      console.error("Failed to parse products dataset:", e);
    }
  }

  /**
   * Helper: Show alert banner
   */
  function showAlert(msg, isSuccess = false) {
    if (!alertBanner || !alertMessage) return;
    alertMessage.textContent = msg;
    alertBanner.className = `alert-banner ${isSuccess ? "alert-success" : "alert-danger"}`;
    alertBanner.style.display = "flex";
    alertBanner.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Helper: Hide alert banner
   */
  function hideAlert() {
    if (!alertBanner) return;
    alertBanner.style.display = "none";
  }

  /**
   * Helper: Generate a product dropdown options HTML string
   */
  function getProductOptionsHtml(selectedId = "") {
    let options = '<option value="">-- Choose Product --</option>';
    productsList.forEach((prod) => {
      const isSelected = prod._id === selectedId ? "selected" : "";
      const unitText = prod.unit ? ` (${prod.unit.symbol || prod.unit.name})` : "";
      options += `
        <option value="${prod._id}" 
                data-purchase-price="${prod.purchasePrice || 0}" 
                data-selling-price="${prod.sellingPrice || 0}" 
                data-gst="${prod.gst || 0}"
                data-sku="${prod.sku || ""}"
                ${isSelected}>
          ${escapeHtml(prod.productName)} - ${escapeHtml(prod.sku || "")}${unitText}
        </option>
      `;
    });
    return options;
  }

  /**
   * Helper: Escape HTML strings
   */
  function escapeHtml(text) {
    if (!text) return "";
    return text
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Helper: Generate a recommended batch number
   */
  function generateDefaultBatchNumber() {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yy = String(today.getFullYear()).slice(-2);
    const rand = Math.floor(100 + Math.random() * 900);
    return `B${yy}${mm}-${rand}`;
  }

  /**
   * Create and append a new product row
   */
  function addNewRow() {
    const tr = document.createElement("tr");
    tr.className = "item-row";

    const defaultBatch = generateDefaultBatchNumber();
    const todayIso = new Date().toISOString().split("T")[0];
    
    // Default 1 year from now for expiry date
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const nextYearIso = nextYear.toISOString().split("T")[0];

    tr.innerHTML = `
      <td style="min-width: 220px;">
        <select class="product-select" required>
          ${getProductOptionsHtml()}
        </select>
        <small class="sku-hint" style="color: var(--muted); font-size: 11px; display: block; margin-top: 3px;"></small>
      </td>
      <td style="width: 140px;">
        <input type="text" class="batch-number" value="${defaultBatch}" placeholder="e.g. B2608-101" required />
      </td>
      <td style="width: 140px;">
        <input type="date" class="mfg-date" value="${todayIso}" />
      </td>
      <td style="width: 140px;">
        <input type="date" class="exp-date" value="${nextYearIso}" required />
      </td>
      <td style="width: 100px;">
        <input type="number" class="qty-input" min="1" step="1" value="1" required />
      </td>
      <td style="width: 110px;">
        <input type="number" class="purchase-price-input" min="0" step="0.01" value="0.00" required />
      </td>
      <td style="width: 110px;">
        <input type="number" class="selling-price-input" min="0" step="0.01" value="0.00" required />
      </td>
      <td style="width: 90px;">
        <input type="number" class="gst-input" min="0" step="0.01" value="0" placeholder="0" />
      </td>
      <td class="row-total" style="width: 110px; font-weight: 700; text-align: right;">
        ₹0.00
      </td>
      <td style="width: 48px; text-align: center;">
        <button type="button" class="btn-remove-row" title="Remove Product Row">✕</button>
      </td>
    `;

    itemsTableBody.appendChild(tr);
    attachRowEventListeners(tr);
    recalculateTotals();
  }

  /**
   * Attach input change listeners to row elements
   */
  function attachRowEventListeners(row) {
    const productSelect = row.querySelector(".product-select");
    const qtyInput = row.querySelector(".qty-input");
    const purchasePriceInput = row.querySelector(".purchase-price-input");
    const sellingPriceInput = row.querySelector(".selling-price-input");
    const gstInput = row.querySelector(".gst-input");
    const removeBtn = row.querySelector(".btn-remove-row");
    const skuHint = row.querySelector(".sku-hint");

    // Product selection change
    productSelect.addEventListener("change", () => {
      const selectedOption = productSelect.options[productSelect.selectedIndex];
      if (selectedOption && selectedOption.value) {
        const defaultPurPrice = selectedOption.getAttribute("data-purchase-price") || "0";
        const defaultSellPrice = selectedOption.getAttribute("data-selling-price") || "0";
        const defaultGst = selectedOption.getAttribute("data-gst") || "0";
        const sku = selectedOption.getAttribute("data-sku") || "";

        purchasePriceInput.value = parseFloat(defaultPurPrice).toFixed(2);
        sellingPriceInput.value = parseFloat(defaultSellPrice).toFixed(2);
        gstInput.value = parseFloat(defaultGst);

        if (skuHint) {
          skuHint.textContent = sku ? `SKU: ${sku}` : "";
        }
      } else {
        if (skuHint) skuHint.textContent = "";
      }
      recalculateTotals();
    });

    // Inputs value change
    [qtyInput, purchasePriceInput, sellingPriceInput, gstInput].forEach((input) => {
      input.addEventListener("input", recalculateTotals);
      input.addEventListener("change", recalculateTotals);
    });

    // Remove button click
    removeBtn.addEventListener("click", () => {
      const allRows = itemsTableBody.querySelectorAll(".item-row");
      if (allRows.length <= 1) {
        showAlert("At least one product row is required in the purchase entry.");
        return;
      }
      row.remove();
      recalculateTotals();
    });
  }

  /**
   * Live Recalculate totals across all rows and summary cards
   */
  function recalculateTotals() {
    let subtotal = 0;
    let totalGst = 0;
    let totalItems = 0;
    let totalQuantity = 0;

    const rows = itemsTableBody.querySelectorAll(".item-row");

    rows.forEach((row) => {
      const qty = parseFloat(row.querySelector(".qty-input").value) || 0;
      const purPrice = parseFloat(row.querySelector(".purchase-price-input").value) || 0;
      const gstPercent = parseFloat(row.querySelector(".gst-input").value) || 0;
      const rowTotalCell = row.querySelector(".row-total");

      // Item Subtotal = Quantity × Purchase Price
      const itemSubtotal = qty * purPrice;

      // GST Amount for this item = Item Subtotal × (GST % / 100)
      const itemGst = itemSubtotal * (gstPercent / 100);

      // Total for row = Item Subtotal + GST Amount
      const itemTotal = itemSubtotal + itemGst;

      rowTotalCell.textContent = `₹${itemTotal.toFixed(2)}`;

      if (qty > 0) {
        totalItems += 1;
        totalQuantity += qty;
        subtotal += itemSubtotal;
        totalGst += itemGst;
      }
    });

    const discount = parseFloat(discountInput.value) || 0;

    // Formula: Grand Total = Subtotal + GST Amount - Discount
    const grandTotal = Math.max(0, subtotal + totalGst - discount);

    // Update summary UI
    if (subtotalDisplay) subtotalDisplay.textContent = `₹${subtotal.toFixed(2)}`;
    if (gstDisplay) gstDisplay.textContent = `₹${totalGst.toFixed(2)}`;
    if (grandTotalDisplay) grandTotalDisplay.textContent = `₹${grandTotal.toFixed(2)}`;
    if (totalItemsDisplay) totalItemsDisplay.textContent = totalItems.toString();
    if (totalQtyDisplay) totalQtyDisplay.textContent = totalQuantity.toString();
  }

  // Discount input change
  if (discountInput) {
    discountInput.addEventListener("input", recalculateTotals);
    discountInput.addEventListener("change", recalculateTotals);
  }

  // Add row button
  if (addRowBtn) {
    addRowBtn.addEventListener("click", () => {
      addNewRow();
    });
  }

  // Attach listeners to initial row(s)
  const initialRows = itemsTableBody.querySelectorAll(".item-row");
  if (initialRows.length === 0) {
    addNewRow();
  } else {
    initialRows.forEach((r) => attachRowEventListeners(r));
    recalculateTotals();
  }

  /**
   * Handle Purchase Form Submission
   */
  if (purchaseForm) {
    purchaseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();

      const supplierId = supplierSelect ? supplierSelect.value : "";
      const invoiceNumber = document.getElementById("invoiceNumber").value.trim();
      const purchaseDate = document.getElementById("purchaseDate").value;
      const paymentMethod = document.getElementById("paymentMethod").value;
      const paymentStatus = document.getElementById("paymentStatus").value;
      const discountVal = parseFloat(discountInput.value) || 0;
      const notes = document.getElementById("purchaseNotes") ? document.getElementById("purchaseNotes").value.trim() : "";

      // Client-side validations
      if (!supplierId) {
        showAlert("Please select a supplier.");
        return;
      }

      if (!invoiceNumber) {
        showAlert("Invoice number is required.");
        return;
      }

      const rows = itemsTableBody.querySelectorAll(".item-row");
      if (rows.length === 0) {
        showAlert("Please add at least one product row.");
        return;
      }

      const items = [];
      let validationError = null;

      rows.forEach((row, idx) => {
        if (validationError) return;

        const product = row.querySelector(".product-select").value;
        const batchNumber = row.querySelector(".batch-number").value.trim();
        const manufacturingDate = row.querySelector(".mfg-date").value;
        const expiryDate = row.querySelector(".exp-date").value;
        const quantity = parseInt(row.querySelector(".qty-input").value, 10);
        const purchasePrice = parseFloat(row.querySelector(".purchase-price-input").value);
        const sellingPrice = parseFloat(row.querySelector(".selling-price-input").value);
        const gst = parseFloat(row.querySelector(".gst-input").value) || 0;

        if (!product) {
          validationError = `Row #${idx + 1}: Please select a product.`;
          return;
        }

        if (!batchNumber) {
          validationError = `Row #${idx + 1}: Batch number is required.`;
          return;
        }

        if (isNaN(quantity) || quantity <= 0) {
          validationError = `Row #${idx + 1}: Quantity must be at least 1.`;
          return;
        }

        if (isNaN(purchasePrice) || purchasePrice < 0) {
          validationError = `Row #${idx + 1}: Purchase price must be 0 or higher.`;
          return;
        }

        if (isNaN(sellingPrice) || sellingPrice < 0) {
          validationError = `Row #${idx + 1}: Selling price must be 0 or higher.`;
          return;
        }

        if (!expiryDate) {
          validationError = `Row #${idx + 1}: Expiry date is required.`;
          return;
        }

        if (manufacturingDate && expiryDate) {
          if (new Date(expiryDate) <= new Date(manufacturingDate)) {
            validationError = `Row #${idx + 1}: Expiry date cannot be on or before Manufacturing date.`;
            return;
          }
        }

        items.push({
          product,
          batchNumber,
          manufacturingDate: manufacturingDate || null,
          expiryDate,
          quantity,
          purchasePrice,
          sellingPrice,
          gst,
        });
      });

      if (validationError) {
        showAlert(validationError);
        return;
      }

      const payload = {
        supplier: supplierId,
        invoiceNumber,
        purchaseDate,
        paymentMethod,
        paymentStatus,
        discount: discountVal,
        notes,
        items,
      };

      // Disable button and indicate saving
      saveBtn.disabled = true;
      const originalBtnText = saveBtn.innerHTML;
      saveBtn.innerHTML = "<span>⏳</span> Saving Purchase...";

      try {
        const response = await fetch("/purchases", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showAlert(result.message || "Purchase saved successfully. Inventory updated successfully.", true);
          // Redirect to /purchases
          setTimeout(() => {
            window.location.href = result.redirectUrl || "/purchases";
          }, 900);
        } else {
          showAlert(result.message || "Failed to save purchase. Please check your data.");
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalBtnText;
        }
      } catch (err) {
        console.error("Purchase save error:", err);
        showAlert("A network or server error occurred while saving the purchase. Please try again.");
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
      }
    });
  }

  // ============================================
  // QUICK SUPPLIER MODAL HANDLER
  // ============================================
  if (openSupplierModalBtn && supplierModal) {
    openSupplierModalBtn.addEventListener("click", () => {
      supplierModal.style.display = "flex";
      document.getElementById("newSupplierName")?.focus();
    });
  }

  function closeSupplierModal() {
    if (supplierModal) {
      supplierModal.style.display = "none";
      if (supplierForm) supplierForm.reset();
    }
  }

  if (closeSupplierModalBtn) closeSupplierModalBtn.addEventListener("click", closeSupplierModal);
  if (cancelSupplierModalBtn) cancelSupplierModalBtn.addEventListener("click", closeSupplierModal);

  if (supplierModal) {
    supplierModal.addEventListener("click", (e) => {
      if (e.target === supplierModal) closeSupplierModal();
    });
  }

  if (supplierForm) {
    supplierForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("newSupplierName").value.trim();
      const phone = document.getElementById("newSupplierPhone").value.trim();
      const email = document.getElementById("newSupplierEmail").value.trim();
      const gstNumber = document.getElementById("newSupplierGst").value.trim();
      const address = document.getElementById("newSupplierAddress").value.trim();

      if (!name || !phone) {
        alert("Supplier Name and Phone are required.");
        return;
      }

      try {
        const response = await fetch("/purchases/api/supplier", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ name, phone, email, gstNumber, address }),
        });

        const data = await response.json();

        if (response.ok && data.success && data.supplier) {
          // Add to supplier select dropdown and select it
          const opt = document.createElement("option");
          opt.value = data.supplier._id;
          opt.textContent = `${data.supplier.name} (${data.supplier.phone})`;
          opt.selected = true;
          supplierSelect.appendChild(opt);

          closeSupplierModal();
          showAlert(`Supplier "${data.supplier.name}" added and selected!`, true);
        } else {
          alert(data.message || "Failed to create supplier");
        }
      } catch (err) {
        console.error("Supplier creation error:", err);
        alert("Error creating supplier: " + err.message);
      }
    });
  }
});

