const STORAGE_KEYS = {
  theme: "yarns-totes-theme-v1"
};
const IMAGE_BUCKET = "gallery-images";
const REFERENCE_BUCKET = "order-references";
const INQUIRY_STATUSES = ["New", "In discussion", "Accepted", "Declined", "Completed"];
const CATEGORIES = ["Accessories", "Wearables", "Home", "Playful"];
const STARTER_ITEMS = [
  { id: "star-patch-beanie", title: "Star-Patch Beanie", category: "Wearables", description: "A deep green crochet beanie finished with a bold red star patch. Ask about sizing and color options for a custom make.", status: "Made to order", image_path: "site:images/Green%20and%20Red%20Star-Patch%20Beanie.png", published: true },
  { id: "bear-ear-beanie", title: "Bear-Ear Beanie", category: "Wearables", description: "A playful lavender-and-mint beanie with soft bear ears and a little crochet bow detail.", status: "Available to request", image_path: "site:images/Lavender%20and%20Mint%20Bear-Ear%20Beanie.png", published: true },
  { id: "cat-ear-beanie", title: "Striped Cat-Ear Beanie", category: "Wearables", description: "A bold red-and-black striped beanie with pointy cat ears. Share your favorite colors when you get in touch.", status: "Inspiration", image_path: "site:images/Striped%20Cat-Ear%20Beanie%20Display.png", published: true },
  { id: "striped-slouchy-beanie", title: "Striped Slouchy Beanie", category: "Wearables", description: "A relaxed slouchy beanie in charcoal and soft gray stripes, topped with a big crochet ear detail.", status: "Made to order", image_path: "site:images/Striped%20Slouchy%20Crochet%20Beanie%20Mannequin.png", published: true }
];

const config = window.YT_SUPABASE_CONFIG;
const supabaseClient = config?.url && config?.anonKey && window.supabase?.createClient
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;

let items = [...STARTER_ITEMS];
let inquiries = [];
let availability = null;
let activeFilter = "All";
let referenceFile = null;
let itemPhotoFile = null;
let toastTimer;

const productGrid = document.querySelector("#productGrid");
const requestModal = document.querySelector("#requestModal");
const detailModal = document.querySelector("#detailModal");
const adminModal = document.querySelector("#adminModal");
const itemModal = document.querySelector("#itemModal");
const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 600'%3E%3Crect width='500' height='600' fill='%23eee7fb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='80' fill='%237651b5'%3E%E2%9C%BF%3C/text%3E%3C/svg%3E";

const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}

function errorMessage(error) {
  return error?.message || "An unexpected error occurred. Please try again.";
}

async function studioApi(action, data = {}) {
  const options = action
    ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data })
    }
    : { method: "GET" };
  const response = await fetch("/api/studio", options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Studio request failed (${response.status}).`);
  return result;
}

async function exchangeStudioLink(token) {
  const response = await fetch("/api/studio-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Could not open private studio (${response.status}).`);
}

function isStoragePath(path) {
  return Boolean(path) && !path.startsWith("site:") && !/^https?:\/\//i.test(path);
}

function imageUrl(path) {
  if (!path) return fallbackImage;
  if (path.startsWith("site:")) return path.slice(5);
  if (/^https?:\/\//i.test(path)) return path;
  if (!supabaseClient) return fallbackImage;
  return supabaseClient.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function renderAvailability() {
  const text = document.querySelector("#availabilityText");
  const dot = document.querySelector(".status-dot");
  const requestButtons = document.querySelectorAll(".request-open");

  if (!supabaseClient) {
    text.textContent = "Order requests are temporarily unavailable";
    dot.style.background = "#ba7e88";
  } else if (availability === "available") {
    text.textContent = "Slots available";
    dot.style.background = "";
  } else if (availability === "full") {
    text.textContent = "Currently fully booked";
    dot.style.background = "#ba7e88";
  } else {
    text.textContent = "Checking order availability";
    dot.style.background = "#ba7e88";
  }

  requestButtons.forEach(button => {
    const enabled = Boolean(supabaseClient && availability === "available");
    button.disabled = !enabled;
    button.title = enabled ? "" : availability === "full" ? "Currently fully booked" : "Order requests are temporarily unavailable";
  });
  const adminAvailability = document.querySelector("#adminAvailability");
  if (availability) adminAvailability.value = availability;
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
        <img src="${esc(imageUrl(item.image_path))}" alt="${esc(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImage}'">
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
      <img src="${esc(item.image_url || imageUrl(item.image_path))}" alt="" onerror="this.onerror=null;this.src='${fallbackImage}'">
      <div class="admin-row-main"><strong>${esc(item.title)}</strong><small>${esc(item.category)} · ${item.published ? "Published" : "Hidden"}</small></div>
      <div class="row-actions"><button class="small-action edit-item" type="button">Edit</button><button class="small-action toggle-item" type="button">${item.published ? "Hide" : "Publish"}</button><button class="small-action delete-item" type="button">Delete</button></div>
    </div>`).join("") : '<p class="empty-state">Your collection is waiting for its first piece.</p>';

  document.querySelector("#inquiryCount").textContent = inquiries.length;
  inquiryContainer.innerHTML = inquiries.length
    ? inquiries.map(inquiry => `
      <article class="inquiry-card" data-id="${esc(inquiry.id)}">
        <div class="inquiry-card-top"><div><strong>${esc(inquiry.name)}</strong><p>${esc(inquiry.contact)} · ${esc(new Date(inquiry.created_at).toLocaleString())}</p></div>
          <select class="inquiry-status" aria-label="Inquiry status">
            ${INQUIRY_STATUSES.map(status => `<option value="${esc(status)}" ${inquiry.status === status ? "selected" : ""}>${esc(status)}</option>`).join("")}
          </select>
        </div>
        <p><strong>Request:</strong> ${esc(inquiry.description)}</p>
        ${inquiry.design_title ? `<p><strong>Design:</strong> ${esc(inquiry.design_title)}</p>` : ""}
        ${inquiry.reference_url ? `<a href="${esc(inquiry.reference_url)}" target="_blank" rel="noopener">View private reference picture</a><br><img src="${esc(inquiry.reference_url)}" alt="Customer reference picture">` : ""}
      </article>`).join("")
    : '<p class="empty-state">No inquiries yet. New requests will show up here.</p>';
}

function setModalOpen(dialog, open) {
  if (open) {
    dialog.showModal();
    document.body.classList.add("modal-open");
  } else if (dialog.open) {
    dialog.close();
  }
}

function openRequest(design = "") {
  if (!supabaseClient) {
    showToast("Order requests are not connected yet. Please try again later.");
    return;
  }
  if (availability !== "available") {
    showToast(availability === "full" ? "The maker is currently fully booked." : "Order availability is being checked. Please try again shortly.");
    return;
  }

  const form = document.querySelector("#requestForm");
  form.reset();
  form.elements.design.value = design;
  referenceFile = null;
  document.querySelector("#uploadText").textContent = "Choose an image (PNG, JPG, WEBP · max 2 MB)";
  document.querySelector("#formError").textContent = "";
  document.querySelector("#requestSuccessMessage").textContent = "Thanks for sharing your idea. This is an inquiry, not a confirmed order. The maker will follow up to discuss what’s possible.";
  form.hidden = false;
  document.querySelector("#requestSuccess").hidden = true;
  setModalOpen(requestModal, true);
  form.querySelector("[name=name]").focus();
}

function openDetails(id) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  document.querySelector("#detailImage").src = imageUrl(item.image_path);
  document.querySelector("#detailImage").alt = item.title;
  document.querySelector("#detailCategory").textContent = item.category === "Home" ? "Home & living" : item.category;
  document.querySelector("#detailTitle").textContent = item.title;
  document.querySelector("#detailDescription").textContent = item.description;
  detailModal.querySelector(".detail-request").onclick = () => {
    detailModal.close();
    openRequest(item.title);
  };
  setModalOpen(detailModal, true);
}

async function openAdmin() {
  document.querySelector("#adminLogin").hidden = false;
  document.querySelector("#adminDashboard").hidden = true;
  document.querySelector("#loginError").textContent = "";
  setModalOpen(adminModal, true);

  const linkToken = window.YT_STUDIO_LINK_TOKEN;
  if (linkToken) {
    window.YT_STUDIO_LINK_TOKEN = "";
    try {
      await exchangeStudioLink(linkToken);
      await showDashboard();
    } catch (error) {
      document.querySelector("#loginError").textContent = errorMessage(error);
    }
  } else {
    try {
      await showDashboard();
    } catch (error) {
      if (!/open the private studio link/i.test(errorMessage(error))) {
        document.querySelector("#loginError").textContent = errorMessage(error);
      }
    }
  }
}

async function loadPublicData() {
  renderAvailability();
  renderProducts();
  if (!supabaseClient) return;

  let itemsResult;
  let settingResult;
  try {
    [itemsResult, settingResult] = await Promise.all([
      supabaseClient.from("crochet_items")
        .select("id,title,category,description,status,image_path,published,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false }),
      supabaseClient.from("site_settings")
        .select("value")
        .eq("key", "availability")
        .maybeSingle()
    ]);
  } catch (error) {
    availability = null;
    renderAvailability();
    console.error("Could not connect to Supabase.", error);
    showToast(`Could not connect to the website database: ${errorMessage(error)}`);
    return;
  }

  if (itemsResult.error) {
    console.error("Could not load the public crochet collection.", itemsResult.error);
    showToast(`Could not load the collection: ${errorMessage(itemsResult.error)}`);
  } else {
    items = itemsResult.data || [];
    renderProducts();
  }

  if (settingResult.error) {
    availability = null;
    console.error("Could not load order availability.", settingResult.error);
    showToast(`Could not load order availability: ${errorMessage(settingResult.error)}`);
  } else {
    availability = settingResult.data?.value === "available" || settingResult.data?.value === "full"
      ? settingResult.data.value
      : null;
  }
  renderAvailability();
}

async function showDashboard() {
  await loadAdminData();
  document.querySelector("#adminLogin").hidden = true;
  document.querySelector("#adminDashboard").hidden = false;
}

async function loadAdminData() {
  const data = await studioApi();
  items = data.items || [];
  inquiries = data.inquiries || [];
  availability = data.availability;
  renderProducts();
  renderAvailability();
  renderAdmin();
}

function clearErrors(dialog) {
  dialog.querySelectorAll(".form-error").forEach(element => {
    element.textContent = "";
  });
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
  referenceFile = null;
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
  referenceFile = file;
  document.querySelector("#uploadText").textContent = file.name;
});

document.querySelector("#requestForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = document.querySelector("#formError");
  const submitButton = form.querySelector('[type="submit"]');
  errorNode.textContent = "";

  if (!supabaseClient) {
    errorNode.textContent = "Order requests are not connected yet. Please try again later.";
    return;
  }
  if (availability !== "available") {
    errorNode.textContent = availability === "full"
      ? "The maker is currently fully booked and can’t accept new requests right now."
      : "Order availability could not be confirmed. Please try again shortly.";
    return;
  }

  const data = new FormData(form);
  const inquiryId = crypto.randomUUID();
  submitButton.disabled = true;
  submitButton.textContent = "Sending…";

  try {
    const { error: insertError } = await supabaseClient.from("order_inquiries").insert({
      id: inquiryId,
      name: String(data.get("name")).trim(),
      contact: String(data.get("contact")).trim(),
      description: String(data.get("description")).trim(),
      design_title: String(data.get("design")).trim() || null
    });
    if (insertError) throw insertError;

    let savedWithReference = true;
    if (referenceFile) {
      const extension = referenceFile.type === "image/png" ? "png" : referenceFile.type === "image/webp" ? "webp" : "jpg";
      const referencePath = `customer-requests/${inquiryId}.${extension}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(REFERENCE_BUCKET)
        .upload(referencePath, referenceFile, { contentType: referenceFile.type, upsert: false });
      if (uploadError) {
        savedWithReference = false;
        console.error("The inquiry was saved, but its reference image could not be uploaded.", uploadError);
      } else {
        const { data: attached, error: attachError } = await supabaseClient.rpc("attach_inquiry_reference", {
          p_inquiry_id: inquiryId,
          p_reference_path: referencePath
        });
        if (attachError || attached !== true) {
          savedWithReference = false;
          console.error("The inquiry was saved, but its reference image could not be attached.", attachError || "The reference was rejected.");
        }
      }
    }

    form.hidden = true;
    document.querySelector("#requestSuccessMessage").textContent = savedWithReference
      ? "Thanks for sharing your idea. This is an inquiry, not a confirmed order. The maker will follow up to discuss what’s possible."
      : "Your inquiry was saved, but the reference image could not be attached. Please send the image to the maker when they follow up.";
    document.querySelector("#requestSuccess").hidden = false;
  } catch (error) {
    console.error("Could not save the customer inquiry.", error);
    errorNode.textContent = `We couldn’t send your inquiry: ${errorMessage(error)}`;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Send my inquiry <span aria-hidden="true">↗</span>';
  }
});

document.querySelector(".logout-button").addEventListener("click", async () => {
  const response = await fetch("/api/studio-session", { method: "DELETE" });
  if (!response.ok) {
    showToast("Could not close the private studio session. Close the browser tab and try again.");
    return;
  }
  adminModal.close();
  document.querySelector("#adminLogin").hidden = false;
  document.querySelector("#adminDashboard").hidden = true;
});

document.querySelector("#adminAvailability").addEventListener("change", async event => {
  const previousAvailability = availability;
  const newAvailability = event.target.value;
  try {
    await studioApi("availability", { value: newAvailability });
  } catch (error) {
    event.target.value = previousAvailability;
    showToast(`Could not update order availability: ${errorMessage(error)}`);
    return;
  }
  availability = newAvailability;
  renderAvailability();
  showToast("Public order status updated.");
});

document.querySelector(".add-item-button").addEventListener("click", () => {
  const form = document.querySelector("#itemForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.image_path.value = "";
  form.elements.published.checked = true;
  itemPhotoFile = null;
  document.querySelector("#itemModalTitle").innerHTML = 'Add a <em>piece.</em>';
  clearErrors(itemModal);
  setModalOpen(itemModal, true);
});

document.querySelector("#adminProducts").addEventListener("click", async event => {
  const row = event.target.closest(".admin-row");
  if (!row) return;
  const item = items.find(entry => entry.id === row.dataset.id);
  if (!item) return;

  if (event.target.closest(".edit-item")) {
    const form = document.querySelector("#itemForm");
    form.reset();
    form.elements.id.value = item.id;
    form.elements.image_path.value = item.image_path;
    form.elements.title.value = item.title;
    form.elements.category.value = CATEGORIES.includes(item.category) ? item.category : "Accessories";
    form.elements.image.value = /^https?:\/\//i.test(item.image_path) ? item.image_path : "";
    form.elements.description.value = item.description;
    form.elements.status.value = item.status;
    form.elements.published.checked = item.published;
    itemPhotoFile = null;
    document.querySelector("#itemModalTitle").innerHTML = 'Edit a <em>piece.</em>';
    clearErrors(itemModal);
    setModalOpen(itemModal, true);
  } else if (event.target.closest(".toggle-item")) {
    try {
      await studioApi("save-item", { id: item.id, item: { ...item, published: !item.published } });
    } catch (error) {
      showToast(`Could not update this piece: ${errorMessage(error)}`);
      return;
    }
    const wasPublished = item.published;
    await loadAdminData();
    showToast(wasPublished ? "Piece hidden from the collection." : "Piece published.");
  } else if (event.target.closest(".delete-item")) {
    if (!confirm(`Remove "${item.title}" from the collection?`)) return;
    try {
      await studioApi("delete-item", { id: item.id });
    } catch (error) {
      showToast(`Could not remove this piece: ${errorMessage(error)}`);
      return;
    }
    await loadAdminData();
    showToast("Piece removed.");
  }
});

document.querySelector("#itemForm [name='photoUpload']").addEventListener("change", event => {
  const file = event.target.files[0];
  const errorNode = document.querySelector("#itemError");
  errorNode.textContent = "";
  itemPhotoFile = null;
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    errorNode.textContent = "Please choose a PNG, JPG, or WEBP image.";
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    errorNode.textContent = "That image is larger than 5 MB. Please choose a smaller one.";
    event.target.value = "";
    return;
  }
  itemPhotoFile = file;
});

document.querySelector("#itemForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = document.querySelector("#itemError");
  const submitButton = form.querySelector('[type="submit"]');
  errorNode.textContent = "";

  const data = new FormData(form);
  const id = String(data.get("id"));
  const existing = items.find(item => item.id === id);
  const imageInput = String(data.get("image")).trim();
  if (imageInput && !/^https?:\/\//i.test(imageInput)) {
    errorNode.textContent = "Please enter a valid image URL beginning with http:// or https://.";
    return;
  }
  if (!itemPhotoFile && !imageInput && !data.get("image_path")) {
    errorNode.textContent = "Add a photo or provide a photo URL for this piece.";
    return;
  }

  submitButton.disabled = true;
  let uploadedPath = "";
  try {
    let imagePath = String(data.get("image_path"));
    if (itemPhotoFile) {
      const signed = await studioApi("upload-url", { contentType: itemPhotoFile.type });
      uploadedPath = signed.path;
      const { error: uploadError } = await supabaseClient.storage.from(IMAGE_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, itemPhotoFile, { contentType: itemPhotoFile.type, upsert: false });
      if (uploadError) throw uploadError;
      imagePath = uploadedPath;
    } else if (imageInput) {
      imagePath = imageInput;
    }

    const record = {
      title: String(data.get("title")).trim(),
      category: String(data.get("category")),
      description: String(data.get("description")).trim(),
      status: String(data.get("status")),
      image_path: imagePath,
      published: form.elements.published.checked
    };

    await studioApi("save-item", { ...(existing ? { id: existing.id } : {}), item: record });

    const previousImage = existing?.image_path;
    itemPhotoFile = null;
    if (isStoragePath(previousImage) && previousImage !== imagePath) {
      try {
        await studioApi("delete-item-image", { path: previousImage });
      } catch (cleanupError) {
        console.error("Piece saved, but its previous stored photo could not be deleted.", cleanupError);
      }
    }
    itemModal.close();
    await loadAdminData();
    showToast(existing ? "Piece updated." : "Piece added to your collection.");
  } catch (error) {
    console.error("Could not save the crochet piece.", error);
    errorNode.textContent = `Could not save this piece: ${errorMessage(error)}`;
    if (uploadedPath) {
      try {
        await studioApi("delete-item-image", { path: uploadedPath });
      } catch (cleanupError) {
        console.error("Could not clean up the unused uploaded image.", cleanupError);
      }
    }
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#inquiryList").addEventListener("change", async event => {
  if (!event.target.matches(".inquiry-status")) return;
  const card = event.target.closest(".inquiry-card");
  const inquiry = inquiries.find(entry => entry.id === card.dataset.id);
  if (!inquiry) return;
  const previousStatus = inquiry.status;
  try {
    await studioApi("inquiry-status", { id: inquiry.id, value: event.target.value });
  } catch (error) {
    event.target.value = previousStatus;
    showToast(`Could not update inquiry status: ${errorMessage(error)}`);
    return;
  }
  inquiry.status = event.target.value;
  showToast("Inquiry status updated.");
});

document.querySelector(".theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
  const dark = document.body.classList.contains("dark-theme");
  try {
    localStorage.setItem(STORAGE_KEYS.theme, dark ? "dark" : "light");
  } catch (error) {
    console.error("Could not save the theme preference.", error);
  }
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

try {
  if (localStorage.getItem(STORAGE_KEYS.theme) === "dark") {
    document.body.classList.add("dark-theme");
    document.querySelector(".theme-toggle span").textContent = "☀";
    document.querySelector(".theme-toggle").setAttribute("aria-label", "Switch to light theme");
  }
} catch (error) {
  console.error("Could not read the theme preference.", error);
}

renderAvailability();
renderProducts();
loadPublicData();
if (window.YT_STUDIO_LINK_TOKEN) openAdmin();
