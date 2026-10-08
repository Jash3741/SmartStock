/**
 * SmartStock - Sales & Billing (POS) Vanilla JavaScript
 * Barcode scanning (html5-qrcode), product search, FEFO batch selection,
 * dynamic cart management, live GST/discount/grand-total calculations, and AJAX submission.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Cart state in memory
  let cart = [];

  // DOM Elements
  const cartTableBody = document.getElementById("cartTableBody");
  const emptyCartRow = document.getElementById("emptyCartRow");
  const barcodeInput = document.getElementById("barcodeInput");
  const productSearchInput = document.getElementById("productSearchInput");
  const searchDropdown = document.getElementById("searchDropdown");
  const overallDiscountInput = document.getElementById("overallDiscountInput");
  const paymentMethodSelect = document.getElementById("paymentMethodSelect");
  const paymentStatusSelect = document.getElementById("paymentStatusSelect");
  const paidAmountInput = document.getElementById("paidAmountInput");
  const partialPaymentGroup = document.getElementById("partialPaymentGroup");
  const remainingAmountDisplay = document.getElementById("remainingAmountDisplay");
  const customerSelect = document.getElementById("customerSelect");
  const isWalkInCheckbox = document.getElementById("isWalkInCheckbox");
  const customerNameInput = document.getElementById("customerNameInput");
  const completeSaleBtn = document.getElementById("completeSaleBtn");
  const alertBanner = document.getElementById("alertBanner");
  const alertMessage = document.getElementById("alertMessage");

  // Summary Elements
  const cartSubtotalDisplay = document.getElementById("cartSubtotalDisplay");
  const cartGstDisplay = document.getElementById("cartGstDisplay");
  const cartDiscountDisplay = document.getElementById("cartDiscountDisplay");
  const cartGrandTotalDisplay = document.getElementById("cartGrandTotalDisplay");
  const cartItemCountDisplay = document.getElementById("cartItemCountDisplay");

  // Modal elements: Barcode scanner
  const openScannerBtn = document.getElementById("openScannerBtn");
  const scannerModal = document.getElementById("scannerModal");
  const closeScannerModalBtn = document.getElementById("closeScannerModalBtn");
  let html5QrCodeScanner = null;

  // Modal elements: Customer
  const openCustomerModalBtn = document.getElementById("openCustomerModalBtn");
  const customerModal = document.getElementById("customerModal");
  const closeCustomerModalBtn = document.getElementById("closeCustomerModalBtn");
  const cancelCustomerModalBtn = document.getElementById("cancelCustomerModalBtn");
  const quickCustomerForm = document.getElementById("quickCustomerForm");

  // Helpers
  function showAlert(msg, isSuccess = false) {
    if (!alertBanner || !alertMessage) return;
    alertMessage.textContent = msg;
    alertBanner.className = `alert-banner ${isSuccess ? "alert-success" : "alert-danger"}`;
    alertBanner.style.display = "flex";
    alertBanner.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hideAlert() {
    if (!alertBanner) return;
    alertBanner.style.display = "none";
  }

  // ============================================
  // 1. PRODUCT SEARCH (MANUAL & REAL-TIME)
  // ============================================
  let searchTimeout = null;

  if (productSearchInput && searchDropdown) {
    productSearchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      const query = productSearchInput.value.trim();

      if (query.length < 2) {
        searchDropdown.style.display = "none";
        searchDropdown.innerHTML = "";
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/sales/api/products/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();

          if (data.success && data.products && data.products.length > 0) {
            renderSearchResults(data.products);
          } else {
            searchDropdown.innerHTML = `
              <div style="padding: 12px; color: var(--muted); text-align: center; font-size: 13px;">
                No products found matching "${escapeHtml(query)}"
              </div>
            `;
            searchDropdown.style.display = "block";
          }
        } catch (err) {
          console.error("Search error:", err);
        }
      }, 250);
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!productSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.style.display = "none";
      }
    });
  }

  function renderSearchResults(products) {
    searchDropdown.innerHTML = "";
    products.forEach((prod) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "search-item";

      const hasStock = prod.availableStock > 0 && prod.fefoBatch;
      const stockBadge = hasStock
        ? `<span class="stock-pill">${prod.availableStock} in stock</span>`
        : `<span class="badge badge-pending">Out of Stock</span>`;

      itemDiv.innerHTML = `
        <div>
          <strong>${escapeHtml(prod.productName)}</strong>
          <small>SKU: ${escapeHtml(prod.sku)} | Barcode: ${escapeHtml(prod.barcode || "N/A")} | ₹${Number(prod.sellingPrice).toFixed(2)}</small>
        </div>
        <div>${stockBadge}</div>
      `;

      if (hasStock) {
        itemDiv.addEventListener("click", () => {
          addProductToCart(prod);
          productSearchInput.value = "";
          searchDropdown.style.display = "none";
        });
      }

      searchDropdown.appendChild(itemDiv);
    });
    searchDropdown.style.display = "block";
  }

  // ============================================
  // 2. BARCODE INPUT & USB SCANNER HANDLING
  // ============================================
  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const barcode = barcodeInput.value.trim();
        if (!barcode) return;
        await handleBarcodeScan(barcode);
        barcodeInput.value = "";
      }
    });
  }

  async function handleBarcodeScan(barcode) {
    hideAlert();
    try {
      const res = await fetch(`/sales/api/products/barcode/${encodeURIComponent(barcode)}`);
      const data = await res.json();

      if (res.ok && data.success && data.product) {
        if (!data.fefoBatch || data.product.availableStock <= 0) {
          showAlert(`Product "${data.product.productName}" is out of stock or all batches are expired.`);
          return;
        }

        const productWithBatches = {
          ...data.product,
          batches: data.batches,
          fefoBatch: data.fefoBatch,
        };
        addProductToCart(productWithBatches);
        showAlert(`Added "${data.product.productName}" to cart!`, true);
      } else {
        showAlert(data.message || `No product found with barcode "${barcode}".`);
      }
    } catch (err) {
      console.error("Barcode lookup error:", err);
      showAlert("Network error during barcode lookup.");
    }
  }

  // ============================================
  // 3. BARCODE SCANNER VIA HTML5-QRCODE (CAMERA)
  // ============================================
  if (openScannerBtn && scannerModal) {
    openScannerBtn.addEventListener("click", () => {
      scannerModal.style.display = "flex";
      startCameraScanner();
    });
  }

  function stopCameraScanner() {
    if (html5QrCodeScanner) {
      try {
        html5QrCodeScanner.stop().then(() => {
          html5QrCodeScanner.clear();
        }).catch(() => {});
      } catch (e) {}
      html5QrCodeScanner = null;
    }
    if (scannerModal) scannerModal.style.display = "none";
  }

  if (closeScannerModalBtn) {
    closeScannerModalBtn.addEventListener("click", stopCameraScanner);
  }

  function startCameraScanner() {
    if (typeof Html5Qrcode === "undefined") {
      alert("Barcode scanner library is loading, please try again in a moment.");
      return;
    }

    const qrReaderDiv = document.getElementById("qr-reader");
    if (!qrReaderDiv) return;

    html5QrCodeScanner = new Html5Qrcode("qr-reader");

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 180 },
    };

    html5QrCodeScanner.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        // Barcode successfully decoded!
        stopCameraScanner();
        await handleBarcodeScan(decodedText);
      },
      () => {
        // Scanning frame in progress, ignore errors
      }
    ).catch((err) => {
      console.error("Camera access failed:", err);
      alert("Camera permission denied or camera not available: " + err);
      stopCameraScanner();
    });
  }

  // ============================================
  // 4. CART MANAGEMENT & FEFO BATCH ALLOCATION
  // ============================================
  function addProductToCart(product) {
    // Select default batch using FEFO (earliest expiry first)
    const selectedBatch = product.fefoBatch || (product.batches && product.batches[0]);

    if (!selectedBatch) {
      showAlert(`No active non-expired batches found for ${product.productName}.`);
      return;
    }

    // Check if same product + same batch is already in cart
    const existingIndex = cart.findIndex(
      (item) => item.productId === product._id && item.batchId === selectedBatch._id
    );

    if (existingIndex > -1) {
      const item = cart[existingIndex];
      if (item.quantity + 1 > item.maxQuantity) {
        showAlert(`Only ${item.maxQuantity} units are available in batch "${item.batchNumber}".`);
        return;
      }
      item.quantity += 1;
      updateCartItemTotal(item);
    } else {
      // Add new cart row
      const cartItem = {
        productId: product._id,
        productName: product.productName,
        sku: product.sku,
        barcode: product.barcode || "",
        batches: product.batches || [selectedBatch],
        batchId: selectedBatch._id,
        batchNumber: selectedBatch.batchNumber,
        expiryDate: selectedBatch.expiryDate,
        maxQuantity: selectedBatch.quantity,
        quantity: 1,
        sellingPrice: Number(selectedBatch.sellingPrice || product.sellingPrice || 0),
        gst: Number(product.gst || 0),
        discount: 0,
        total: 0,
      };
      updateCartItemTotal(cartItem);
      cart.push(cartItem);
    }

    renderCart();
  }

  function updateCartItemTotal(item) {
    const itemSubtotal = item.quantity * item.sellingPrice;
    const itemGst = itemSubtotal * (item.gst / 100);
    item.total = Math.max(0, Math.round((itemSubtotal + itemGst - item.discount) * 100) / 100);
  }

  function renderCart() {
    if (!cartTableBody) return;

    if (cart.length === 0) {
      if (emptyCartRow) emptyCartRow.style.display = "table-row";
      cartTableBody.innerHTML = `
        <tr id="emptyCartRow">
          <td colspan="10" style="text-align: center; padding: 36px 16px; color: var(--muted);">
            🛒 Cart is empty. Scan a barcode or search products above to start billing.
          </td>
        </tr>
      `;
      recalculateCartTotals();
      return;
    }

    cartTableBody.innerHTML = "";

    cart.forEach((item, index) => {
      const tr = document.createElement("tr");

      // Batch options dropdown HTML
      let batchOptions = "";
      item.batches.forEach((b) => {
        const isSelected = b._id === item.batchId ? "selected" : "";
        const expStr = b.expiryDate ? new Date(b.expiryDate).toLocaleDateString("en-IN") : "";
        batchOptions += `
          <option value="${b._id}" ${isSelected}>
            ${escapeHtml(b.batchNumber)} (Exp: ${expStr}, Avail: ${b.quantity})
          </option>
        `;
      });

      const expFormatted = item.expiryDate
        ? new Date(item.expiryDate).toLocaleDateString("en-IN")
        : "-";

      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(item.productName)}</strong>
          <small style="color: var(--muted); display: block; font-size: 11px;">SKU: ${escapeHtml(item.sku)}</small>
        </td>
        <td><code>${escapeHtml(item.barcode || "-")}</code></td>
        <td>
          <select class="batch-select" data-index="${index}">
            ${batchOptions}
          </select>
        </td>
        <td style="white-space: nowrap;">
          <span style="font-size: 12px; color: var(--navy); font-weight: 600;">${expFormatted}</span>
        </td>
        <td>
          <div class="qty-control">
            <button type="button" class="qty-btn btn-minus" data-index="${index}">-</button>
            <input 
              type="number" 
              class="qty-input item-qty" 
              data-index="${index}" 
              value="${item.quantity}" 
              min="1" 
              max="${item.maxQuantity}" 
            />
            <button type="button" class="qty-btn btn-plus" data-index="${index}">+</button>
          </div>
          <small style="color: var(--muted); font-size: 10px; display: block; margin-top: 2px;">
            Max: ${item.maxQuantity}
          </small>
        </td>
        <td style="white-space: nowrap;">
          ₹${item.sellingPrice.toFixed(2)}
        </td>
        <td>
          ${item.gst}%
        </td>
        <td>
          <input 
            type="number" 
            class="form-control item-discount" 
            style="width: 70px; padding: 4px 6px; font-size: 12px;" 
            data-index="${index}" 
            value="${item.discount}" 
            min="0" 
            step="0.01" 
          />
        </td>
        <td style="font-weight: 700; text-align: right; color: var(--text-dark); white-space: nowrap;">
          ₹${item.total.toFixed(2)}
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-remove-row btn-delete-item" data-index="${index}" title="Remove item">
            ✕
          </button>
        </td>
      `;

      cartTableBody.appendChild(tr);
    });

    attachCartEventListeners();
    recalculateCartTotals();
  }

  function attachCartEventListeners() {
    // Quantity Minus
    document.querySelectorAll(".btn-minus").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        if (cart[idx].quantity > 1) {
          cart[idx].quantity -= 1;
          updateCartItemTotal(cart[idx]);
          renderCart();
        }
      });
    });

    // Quantity Plus
    document.querySelectorAll(".btn-plus").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        const item = cart[idx];
        if (item.quantity + 1 > item.maxQuantity) {
          showAlert(`Only ${item.maxQuantity} units are available in batch "${item.batchNumber}".`);
          return;
        }
        item.quantity += 1;
        updateCartItemTotal(item);
        renderCart();
      });
    });

    // Quantity Direct Input
    document.querySelectorAll(".item-qty").forEach((input) => {
      input.addEventListener("change", () => {
        const idx = parseInt(input.getAttribute("data-index"), 10);
        const item = cart[idx];
        let val = parseInt(input.value, 10);

        if (isNaN(val) || val <= 0) val = 1;
        if (val > item.maxQuantity) {
          showAlert(`Only ${item.maxQuantity} units are available in this batch.`);
          val = item.maxQuantity;
        }

        item.quantity = val;
        updateCartItemTotal(item);
        renderCart();
      });
    });

    // Batch Change
    document.querySelectorAll(".batch-select").forEach((select) => {
      select.addEventListener("change", () => {
        const idx = parseInt(select.getAttribute("data-index"), 10);
        const newBatchId = select.value;
        const item = cart[idx];
        const chosenBatch = item.batches.find((b) => b._id === newBatchId);

        if (chosenBatch) {
          item.batchId = chosenBatch._id;
          item.batchNumber = chosenBatch.batchNumber;
          item.expiryDate = chosenBatch.expiryDate;
          item.maxQuantity = chosenBatch.quantity;
          item.sellingPrice = Number(chosenBatch.sellingPrice || item.sellingPrice);

          if (item.quantity > item.maxQuantity) {
            item.quantity = Math.max(1, item.maxQuantity);
          }
          updateCartItemTotal(item);
          renderCart();
        }
      });
    });

    // Item Discount change
    document.querySelectorAll(".item-discount").forEach((input) => {
      input.addEventListener("input", () => {
        const idx = parseInt(input.getAttribute("data-index"), 10);
        const val = Math.max(0, parseFloat(input.value) || 0);
        cart[idx].discount = val;
        updateCartItemTotal(cart[idx]);
        // Update row total cell without full re-render for smooth typing
        const row = input.closest("tr");
        if (row) {
          const totalCell = row.cells[8];
          totalCell.textContent = `₹${cart[idx].total.toFixed(2)}`;
        }
        recalculateCartTotals();
      });
    });

    // Delete Item
    document.querySelectorAll(".btn-delete-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        cart.splice(idx, 1);
        renderCart();
      });
    });
  }

  // ============================================
  // 5. AUTOMATIC REAL-TIME RECALCULATION
  // ============================================
  function recalculateCartTotals() {
    let subtotal = 0;
    let gstTotal = 0;
    let itemsDiscountTotal = 0;
    let totalItemsCount = 0;

    cart.forEach((item) => {
      const rowSubtotal = item.quantity * item.sellingPrice;
      const rowGst = rowSubtotal * (item.gst / 100);
      subtotal += rowSubtotal;
      gstTotal += rowGst;
      itemsDiscountTotal += item.discount;
      totalItemsCount += item.quantity;
    });

    const overallDiscount = Math.max(0, parseFloat(overallDiscountInput?.value) || 0);
    const totalDiscount = itemsDiscountTotal + overallDiscount;

    // Formula: Grand Total = Subtotal + GST Amount - Discount
    const grandTotal = Math.max(0, subtotal + gstTotal - totalDiscount);

    if (cartSubtotalDisplay) cartSubtotalDisplay.textContent = `₹${subtotal.toFixed(2)}`;
    if (cartGstDisplay) cartGstDisplay.textContent = `₹${gstTotal.toFixed(2)}`;
    if (cartDiscountDisplay) cartDiscountDisplay.textContent = `-₹${totalDiscount.toFixed(2)}`;
    if (cartGrandTotalDisplay) cartGrandTotalDisplay.textContent = `₹${grandTotal.toFixed(2)}`;
    if (cartItemCountDisplay) cartItemCountDisplay.textContent = totalItemsCount.toString();

    // Partial payment balance calculation
    updatePaymentAmounts(grandTotal);
  }

  function updatePaymentAmounts(grandTotal) {
    if (!paymentStatusSelect) return;

    const status = paymentStatusSelect.value;
    if (status === "Partial") {
      if (partialPaymentGroup) partialPaymentGroup.style.display = "block";
      const paid = Math.max(0, parseFloat(paidAmountInput?.value) || 0);
      const remaining = Math.max(0, grandTotal - paid);
      if (remainingAmountDisplay) remainingAmountDisplay.textContent = `₹${remaining.toFixed(2)}`;
    } else {
      if (partialPaymentGroup) partialPaymentGroup.style.display = "none";
      if (paidAmountInput) paidAmountInput.value = status === "Pending" ? "0" : grandTotal.toFixed(2);
      if (remainingAmountDisplay) remainingAmountDisplay.textContent = status === "Pending" ? `₹${grandTotal.toFixed(2)}` : "₹0.00";
    }
  }

  if (overallDiscountInput) {
    overallDiscountInput.addEventListener("input", recalculateCartTotals);
  }

  if (paymentStatusSelect) {
    paymentStatusSelect.addEventListener("change", () => {
      const grandTotalStr = cartGrandTotalDisplay?.textContent.replace("₹", "") || "0";
      updatePaymentAmounts(parseFloat(grandTotalStr) || 0);
    });
  }

  if (paidAmountInput) {
    paidAmountInput.addEventListener("input", () => {
      const grandTotalStr = cartGrandTotalDisplay?.textContent.replace("₹", "") || "0";
      updatePaymentAmounts(parseFloat(grandTotalStr) || 0);
    });
  }

  // ============================================
  // 6. CUSTOMER & WALK-IN SELECTION
  // ============================================
  if (isWalkInCheckbox && customerSelect) {
    isWalkInCheckbox.addEventListener("change", () => {
      if (isWalkInCheckbox.checked) {
        customerSelect.value = "";
        customerSelect.disabled = true;
        if (customerNameInput) {
          customerNameInput.value = "Walk-in Customer";
          customerNameInput.disabled = false;
        }
      } else {
        customerSelect.disabled = false;
        if (customerNameInput) {
          customerNameInput.value = "";
          customerNameInput.disabled = true;
        }
      }
    });

    customerSelect.addEventListener("change", () => {
      if (customerSelect.value) {
        isWalkInCheckbox.checked = false;
        if (customerNameInput) {
          const selectedText = customerSelect.options[customerSelect.selectedIndex].text;
          customerNameInput.value = selectedText.split(" (")[0];
          customerNameInput.disabled = true;
        }
      }
    });
  }

  // ============================================
  // 7. COMPLETE SALE SUBMISSION (AJAX)
  // ============================================
  if (completeSaleBtn) {
    completeSaleBtn.addEventListener("click", async () => {
      hideAlert();

      if (cart.length === 0) {
        showAlert("Your cart is empty. Please add at least one product.");
        return;
      }

      const invoiceNumber = document.getElementById("invoiceNumberInput")?.value.trim();
      const saleDate = document.getElementById("saleDateInput")?.value;
      const paymentMethod = paymentMethodSelect?.value || "Cash";
      const paymentStatus = paymentStatusSelect?.value || "Paid";
      const paidAmount = parseFloat(paidAmountInput?.value) || 0;
      const overallDiscount = parseFloat(overallDiscountInput?.value) || 0;
      const notes = document.getElementById("saleNotesInput")?.value.trim();

      const isWalkIn = isWalkInCheckbox?.checked;
      const customerId = !isWalkIn && customerSelect ? customerSelect.value : null;
      const customerName = isWalkIn ? (customerNameInput?.value.trim() || "Walk-in Customer") : "";

      if (!invoiceNumber) {
        showAlert("Invoice number is required.");
        return;
      }

      // Prepare payload
      const payload = {
        invoiceNumber,
        customer: customerId,
        customerName,
        saleDate,
        paymentMethod,
        paymentStatus,
        paidAmount,
        discount: overallDiscount,
        notes,
        items: cart.map((item) => ({
          product: item.productId,
          batch: item.batchId,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          gst: item.gst,
          discount: item.discount,
        })),
      };

      // Button loading state
      completeSaleBtn.disabled = true;
      const originalText = completeSaleBtn.innerHTML;
      completeSaleBtn.innerHTML = "<span>⏳</span> Completing Sale...";

      try {
        const response = await fetch("/sales", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showAlert("Sale completed successfully! Opening invoice...", true);
          setTimeout(() => {
            window.location.href = result.redirectUrl || `/sales/${result.saleId}`;
          }, 600);
        } else {
          showAlert(result.message || "Failed to complete sale.");
          completeSaleBtn.disabled = false;
          completeSaleBtn.innerHTML = originalText;
        }
      } catch (err) {
        console.error("Complete sale error:", err);
        showAlert("Network or server error while completing sale.");
        completeSaleBtn.disabled = false;
        completeSaleBtn.innerHTML = originalText;
      }
    });
  }

  // ============================================
  // 8. QUICK CUSTOMER MODAL HANDLER
  // ============================================
  if (openCustomerModalBtn && customerModal) {
    openCustomerModalBtn.addEventListener("click", () => {
      customerModal.style.display = "flex";
      document.getElementById("newCustName")?.focus();
    });
  }

  function closeCustomerModal() {
    if (customerModal) {
      customerModal.style.display = "none";
      if (quickCustomerForm) quickCustomerForm.reset();
    }
  }

  if (closeCustomerModalBtn) closeCustomerModalBtn.addEventListener("click", closeCustomerModal);
  if (cancelCustomerModalBtn) cancelCustomerModalBtn.addEventListener("click", closeCustomerModal);

  if (customerModal) {
    customerModal.addEventListener("click", (e) => {
      if (e.target === customerModal) closeCustomerModal();
    });
  }

  if (quickCustomerForm) {
    quickCustomerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("newCustName")?.value.trim();
      const phone = document.getElementById("newCustPhone")?.value.trim();
      const email = document.getElementById("newCustEmail")?.value.trim();
      const gstNumber = document.getElementById("newCustGst")?.value.trim();
      const address = document.getElementById("newCustAddress")?.value.trim();

      if (!name) {
        alert("Customer name is required.");
        return;
      }

      try {
        const res = await fetch("/sales/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone, email, gstNumber, address }),
        });
        const data = await res.json();

        if (res.ok && data.success && data.customer) {
          const opt = document.createElement("option");
          opt.value = data.customer._id;
          opt.textContent = `${data.customer.name} (${data.customer.phone || "No phone"})`;
          opt.selected = true;
          customerSelect.appendChild(opt);

          if (isWalkInCheckbox) isWalkInCheckbox.checked = false;
          customerSelect.disabled = false;
          if (customerNameInput) {
            customerNameInput.value = data.customer.name;
            customerNameInput.disabled = true;
          }

          closeCustomerModal();
          showAlert(`Customer "${data.customer.name}" created and selected!`, true);
        } else {
          alert(data.message || "Failed to create customer.");
        }
      } catch (err) {
        alert("Error creating customer: " + err.message);
      }
    });
  }

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
});

