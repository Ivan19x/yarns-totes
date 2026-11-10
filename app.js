const STORAGE_KEYS = {
  items: "loop-bloom-items-v1",
  inquiries: "loop-bloom-inquiries-v1",
  availability: "loop-bloom-availability-v1",
  theme: "loop-bloom-theme-v1"
};

const starterItems = [
  { id: "star-patch-beanie", title: "Star-Patch Beanie", category: "Wearables", description: "A deep green crochet beanie finished with a bold red star patch. Ask about sizing and color options for a custom make.", status: "Made to order", image: "images/Green%20and%20Red%20Star-Patch%20Beanie.png", published: true },
  { id: "bear-ear-beanie", title: "Bear-Ear Beanie", category: "Wearables", description: "A playful lavender-and-mint beanie with soft bear ears and a little crochet bow detail.", status: "Available to request", image: "images/Lavender%20and%20Mint%20Bear-Ear%20Beanie.png", published: true },
  { id: "cat-ear-beanie", title: "Striped Cat-Ear Beanie", category: "Wearables", description: "A bold red-and-black striped beanie with pointy cat ears. Share your favorite colors when you get in touch.", status: "Inspiration", image: "images/Striped%20Cat-Ear%20Beanie%20Display.png", published: true },
  { id: "striped-slouchy-beanie", title: "Striped Slouchy Beanie", category: "Wearables", description: "A relaxed slouchy beanie in charcoal and soft gray stripes, topped with a big crochet ear detail.", status: "Made to order", image: "images/Striped%20Slouchy%20Crochet%20Beanie%20Mannequin.png", published: true }
];

const readStored = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from local storage.`, error);
    return fallback;
  }
};

const previousStarterIds = new Set([
  "poppy-pouch", "sunday-scarf", "cloud-nine", "daisy-days",
  "little-sprout", "petal-top", "soft-sunday", "tiny-tulip"
]);
const storedItems = readStored(STORAGE_KEYS.items, null);
const shouldMigrateItems = Array.isArray(storedItems) && storedItems.some(item => previousStarterIds.has(item.id));
let items = Array.isArray(storedItems)
  ? shouldMigrateItems
    ? [...starterItems, ...storedItems.filter(item => !previousStarterIds.has(item.id))]
    : storedItems
  : starterItems;
let inquiries = readStored(STORAGE_KEYS.inquiries, []);
let availability = readStored(STORAGE_KEYS.availability, "available");
let activeFilter = "All";
let selectedFile = "";
let selectedItemImage = "";
let itemImageLoading = false;
let toastTimer;

const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save ${key} to local storage.`, error);
    showToast("Could not save. This browser may be out of storage space.");
    return false;
  }
};

if (shouldMigrateItems) save(STORAGE_KEYS.items, items);

const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 600'%3E%3Crect width='500' height='600' fill='%23eee7fb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='80' fill='%237651b5'%3E%E2%9C%BF%3C/text%3E%3C/svg%3E";
const productGrid = document.querySelector("#productGrid");
const requestModal = document.querySelector("#requestModal");
const detailModal = document.querySelector("#detailModal");
const adminModal = document.querySelector("#adminModal");
const itemModal = document.querySelector("#itemModal");

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function renderAvailability() {
  const isAvailable = availability === "available";
  document.querySelector("#availabilityText").textContent = isAvailable ? "Slots available" : "Currently fully booked";
  document.querySelector(".status-dot").style.background = isAvailable ? "" : "#ba7e88";
  document.querySelector("#adminAvailability").value = availability;
  document.querySelectorAll(".request-open").forEach(button => {
    button.disabled = !isAvailable;
    button.title = isAvailable ? "" : "Currently fully booked";
    button.classList.toggle("disabled-request", !isAvailable);
  });
}

function visibleItems() {
  return items.filter(item => item.published && (activeFilter === "All" || item.category === activeFilter));
}

function renderProducts() {
  const products = visibleItems();
  if (!products.length) {
    productGrid.innerHTML = '<p class="empty-state">No pieces in this category just yet. Try another filter.</p>';
    return;
  }
  productGrid.innerHTML = products.map(item => `
    <article class="product-card" tabindex="0" role="button" aria-label="View ${esc(item.title)} details" data-id="${esc(item.id)}">
      <div class="product-image-wrap">
        <img src="${esc(item.image || fallbackImage)}" alt="${esc(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImage}'">
        <span class="product-badge">${esc(item.status)}</span>
      </div>
      <div class="product-info"><div><h3>${esc(item.title)}</h3><p>${esc(item.category === "Home" ? "Home & living" : item.category)}</p></div><span class="product-arrow" aria-hidden="true">↗</span></div>
    </article>`).join("");
}

function renderAdmin() {
  const productContainer = document.querySelector("#adminProducts");
  const inquiryContainer = document.querySelector("#inquiryList");
  productContainer.innerHTML = items.length ? items.map(item => `
    <div class="admin-row" data-id="${esc(item.id)}">
      <img src="${esc(item.image || fallbackImage)}" alt="" onerror="this.onerror=null;this.src='${fallbackImage}'">
      <div class="admin-row-main"><strong>${esc(item.title)}</strong><small>${esc(item.category)} · ${item.published ? "Published" : "Hidden"}</small></div>
      <div class="row-actions"><button class="small-action edit-item" type="button">Edit</button><button class="small-action toggle-item" type="button">${item.published ? "Hide" : "Publish"}</button><button class="small-action delete-item" type="button">Delete</button></div>
    </div>`).join("") : '<p class="empty-state">Your collection is waiting for its first piece.</p>';

  document.querySelector("#inquiryCount").textContent = inquiries.length;
  inquiryContainer.innerHTML = inquiries.length ? [...inquiries].reverse().map(inquiry => `
    <article class="inquiry-card" data-id="${esc(inquiry.id)}">
      <div class="inquiry-card-top"><div><strong>${esc(inquiry.name)}</strong><p>${esc(inquiry.contact)} · ${esc(new Date(inquiry.createdAt).toLocaleString())}</p></div>
        <select class="inquiry-status" aria-label="Inquiry status">
          ${["New", "In discussion", "Accepted", "Declined", "Completed"].map(status => `<option ${inquiry.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
      <p><strong>Request:</strong> ${esc(inquiry.description)}</p>
      ${inquiry.design ? `<p><strong>Design:</strong> ${esc(inquiry.design)}</p>` : ""}
      ${inquiry.image ? `<a href="${esc(inquiry.image)}" target="_blank" rel="noopener">View reference picture</a><br><img src="${esc(inquiry.image)}" alt="Customer reference picture">` : ""}
    </article>`).join("") : '<p class="empty-state">No inquiries yet. New requests will show up here.</p>';
}

function openRequest(design = "") {
  if (availability !== "available") {
    showToast("The maker is currently fully booked.");
    return;
  }
  const form = document.querySelector("#requestForm");
  form.reset();
  form.elements.design.value = design;
  selectedFile = "";
  document.querySelector("#uploadText").textContent = "Choose an image (PNG, JPG, WEBP · max 2 MB)";
  document.querySelector("#formError").textContent = "";
  form.hidden = false;
  document.querySelector("#requestSuccess").hidden = true;
  requestModal.showModal();
  document.body.classList.add("modal-open");
  requestModal.querySelector("[name=name]").focus();
}

function openDetails(id) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  document.querySelector("#detailImage").src = item.image || fallbackImage;
  document.querySelector("#detailImage").alt = item.title;
  document.querySelector("#detailCategory").textContent = item.category === "Home" ? "Home & living" : item.category;
  document.querySelector("#detailTitle").textContent = item.title;
  document.querySelector("#detailDescription").textContent = item.description;
  detailModal.querySelector(".detail-request").onclick = () => {
    detailModal.close();
    openRequest(item.title);
  };
  detailModal.showModal();
  document.body.classList.add("modal-open");
}

function openAdmin() {
  document.querySelector("#adminLogin").hidden = false;
  document.querySelector("#adminDashboard").hidden = true;
  document.querySelector("#loginError").textContent = "";
  document.querySelector("#loginForm").reset();
  adminModal.showModal();
  document.body.classList.add("modal-open");
}

document.querySelector("#year").textContent = new Date().getFullYear();
document.querySelectorAll(".filter-chip").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("active", chip === button));
    renderProducts();
  });
});
productGrid.addEventListener("click", event => {
  const card = event.target.closest(".product-card");
  if (card) openDetails(card.dataset.id);
});
productGrid.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".product-card")) {
    event.preventDefault();
    openDetails(event.target.dataset.id);
  }
});
document.querySelectorAll(".request-open").forEach(button => button.addEventListener("click", () => openRequest()));
document.querySelectorAll(".admin-open").forEach(button => button.addEventListener("click", openAdmin));
document.querySelectorAll(".modal-close").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("close", () => {
    if (![...document.querySelectorAll("dialog")].some(other => other.open)) document.body.classList.remove("modal-open");
  });
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
});
document.querySelector(".success-close").addEventListener("click", () => requestModal.close());
document.querySelector("#referenceImage").addEventListener("change", event => {
  const file = event.target.files[0];
  const error = document.querySelector("#formError");
  error.textContent = "";
  selectedFile = "";
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    error.textContent = "Please choose a PNG, JPG, or WEBP image.";
    event.target.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    error.textContent = "That image is larger than 2 MB. Please choose a smaller one.";
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedFile = typeof reader.result === "string" ? reader.result : "";
    document.querySelector("#uploadText").textContent = file.name;
  });
  reader.addEventListener("error", () => {
    error.textContent = "We couldn’t read that image. Please try another file.";
  });
  reader.readAsDataURL(file);
});
document.querySelector("#requestForm").addEventListener("submit", event => {
  event.preventDefault();
  if (availability !== "available") {
    document.querySelector("#formError").textContent = "The maker is currently fully booked and can’t accept new requests right now.";
    return;
  }
  const form = event.currentTarget;
  const formData = new FormData(form);
  const inquiry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: String(formData.get("name")).trim(),
    contact: String(formData.get("contact")).trim(),
    description: String(formData.get("description")).trim(),
    design: String(formData.get("design")).trim(),
    image: selectedFile,
    status: "New",
    createdAt: new Date().toISOString()
  };
  inquiries.push(inquiry);
  if (!save(STORAGE_KEYS.inquiries, inquiries)) {
    inquiries.pop();
    document.querySelector("#formError").textContent = "We couldn’t save your inquiry in this browser. Please try again.";
    return;
  }
  form.hidden = true;
  document.querySelector("#requestSuccess").hidden = false;
});

document.querySelector("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get("password");
  if (password !== "loop") {
    document.querySelector("#loginError").textContent = "That passphrase doesn’t match the local preview.";
    return;
  }
  document.querySelector("#adminLogin").hidden = true;
  document.querySelector("#adminDashboard").hidden = false;
  renderAdmin();
});
document.querySelector(".logout-button").addEventListener("click", () => {
  adminModal.close();
  document.querySelector("#adminLogin").hidden = false;
  document.querySelector("#adminDashboard").hidden = true;
});
document.querySelector("#adminAvailability").addEventListener("change", event => {
  const previousAvailability = availability;
  availability = event.target.value;
  if (save(STORAGE_KEYS.availability, availability)) {
    renderAvailability();
    showToast("Public order status updated.");
  } else {
    availability = previousAvailability;
    renderAvailability();
  }
});
document.querySelector(".add-item-button").addEventListener("click", () => {
  const form = document.querySelector("#itemForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.published.checked = true;
  selectedItemImage = "";
  itemImageLoading = false;
  document.querySelector("#itemModalTitle").innerHTML = 'Add a <em>piece.</em>';
  document.querySelector("#itemError").textContent = "";
  itemModal.showModal();
});
document.querySelector("#adminProducts").addEventListener("click", event => {
  const row = event.target.closest(".admin-row");
  if (!row) return;
  const item = items.find(entry => entry.id === row.dataset.id);
  if (!item) return;
  if (event.target.closest(".edit-item")) {
    const form = document.querySelector("#itemForm");
    selectedItemImage = "";
    itemImageLoading = false;
    form.elements.id.value = item.id;
    form.elements.title.value = item.title;
    form.elements.category.value = item.category;
    form.elements.image.value = item.image.startsWith("data:") ? "" : item.image;
    form.elements.description.value = item.description;
    form.elements.status.value = item.status;
    form.elements.published.checked = item.published;
    document.querySelector("#itemModalTitle").innerHTML = 'Edit a <em>piece.</em>';
    document.querySelector("#itemError").textContent = "";
    itemModal.showModal();
  } else if (event.target.closest(".toggle-item")) {
    const previousPublished = item.published;
    item.published = !item.published;
    if (save(STORAGE_KEYS.items, items)) {
      renderProducts();
      renderAdmin();
      showToast(item.published ? "Piece published." : "Piece hidden from the collection.");
    } else {
      item.published = previousPublished;
    }
  } else if (event.target.closest(".delete-item")) {
    if (confirm(`Remove "${item.title}" from the collection?`)) {
      const previous = items;
      items = items.filter(entry => entry.id !== item.id);
      if (save(STORAGE_KEYS.items, items)) {
        renderProducts();
        renderAdmin();
        showToast("Piece removed.");
      } else {
        items = previous;
      }
    }
  }
});
document.querySelector("#itemForm [name='photoUpload']").addEventListener("change", event => {
  const file = event.target.files[0];
  const error = document.querySelector("#itemError");
  error.textContent = "";
  selectedItemImage = "";
  itemImageLoading = false;
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    error.textContent = "Please choose a PNG, JPG, or WEBP image.";
    event.target.value = "";
    return;
  }
  if (file.size > 1024 * 1024) {
    error.textContent = "That image is larger than 1 MB. Please choose a smaller one.";
    event.target.value = "";
    return;
  }
  itemImageLoading = true;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedItemImage = typeof reader.result === "string" ? reader.result : "";
    itemImageLoading = false;
  });
  reader.addEventListener("error", () => {
    itemImageLoading = false;
    error.textContent = "We couldn’t read that image. Please try another file.";
  });
  reader.readAsDataURL(file);
});
document.querySelector("#itemForm").addEventListener("submit", event => {
  event.preventDefault();
  if (itemImageLoading) {
    document.querySelector("#itemError").textContent = "Please wait for the photo to finish loading.";
    return;
  }
  const form = event.currentTarget;
  const data = new FormData(form);
  const id = String(data.get("id"));
  const existing = items.find(item => item.id === id);
  const imageUrl = String(data.get("image")).trim();
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    document.querySelector("#itemError").textContent = "Please enter a valid image URL beginning with http:// or https://.";
    return;
  }
  const image = selectedItemImage || imageUrl;
  const previousItems = items.map(entry => ({ ...entry }));
  const item = {
    id: existing ? existing.id : `piece-${Date.now()}`,
    title: String(data.get("title")).trim(),
    category: String(data.get("category")),
    description: String(data.get("description")).trim(),
    status: String(data.get("status")),
    image: image || (existing ? existing.image : fallbackImage),
    published: form.elements.published.checked
  };
  if (existing) Object.assign(existing, item);
  else items.push(item);
  if (!save(STORAGE_KEYS.items, items)) {
    items = previousItems;
    return;
  }
  selectedItemImage = "";
  itemImageLoading = false;
  itemModal.close();
  renderProducts();
  renderAdmin();
  showToast(existing ? "Piece updated." : "Piece added to your collection.");
});
document.querySelector("#inquiryList").addEventListener("change", event => {
  if (!event.target.matches(".inquiry-status")) return;
  const card = event.target.closest(".inquiry-card");
  const inquiry = inquiries.find(entry => entry.id === card.dataset.id);
  if (!inquiry) return;
  const previousStatus = inquiry.status;
  inquiry.status = event.target.value;
  if (save(STORAGE_KEYS.inquiries, inquiries)) showToast("Inquiry status updated.");
  else {
    inquiry.status = previousStatus;
    event.target.value = previousStatus;
  }
});
document.querySelector(".theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
  const dark = document.body.classList.contains("dark-theme");
  save(STORAGE_KEYS.theme, dark ? "dark" : "light");
  document.querySelector(".theme-toggle span").textContent = dark ? "☀" : "☾";
  document.querySelector(".theme-toggle").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
});
const menuToggle = document.querySelector(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const nav = document.querySelector(".main-nav");
  const open = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".main-nav a").forEach(link => link.addEventListener("click", () => {
  document.querySelector(".main-nav").classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
}));

if (readStored(STORAGE_KEYS.theme, "light") === "dark") {
  document.body.classList.add("dark-theme");
  document.querySelector(".theme-toggle span").textContent = "☀";
  document.querySelector(".theme-toggle").setAttribute("aria-label", "Switch to light theme");
}
renderAvailability();
renderProducts();
