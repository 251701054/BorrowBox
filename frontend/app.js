const API = (window.BORROWBOX_API_URL || "https://borrowbox-h11b.onrender.com/api").replace(/\/$/, "");
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function savedValue(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function clearSession() {
  ["borrowbox_token", "borrowbox_user"].forEach(key => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

let currentUser = null;
try {
  currentUser = JSON.parse(savedValue("borrowbox_user") || "null");
} catch {
  currentUser = null;
}

const token = () => savedValue("borrowbox_token");
const admin = () => currentUser?.role === "Admin";

let equipment = [];
let users = [];
let loans = [];
let reservations = [];
let repairs = [];
let toastTimer;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const esc = v =>
  String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const date = v => {
  if (!v) return "—";
  const d = new Date(String(v).slice(0, 10) + "T00:00:00");
  return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const qty = x => Number(x.available_quantity ?? 0);
const id = x => x.equipment_id ?? x.id;

function debounce(fn, delay = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function api(path, opts = {}) {
  const headers = {
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers || {})
  };
  const accessToken = token();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(API + path, { ...opts, headers });
  const data = (response.headers.get("content-type") || "").includes("json")
    ? await response.json()
    : await response.text();

  if (response.status === 401) {
    clearSession();
    if (!location.pathname.endsWith("/login.html")) {
      location.replace("login.html");
    }
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }
  return data;
}

function toast(msg, error = false) {
  const region = $("#toast-region");
  if (!region) {
    return;
  }
  region.innerHTML = `
    <div class="toast ${error ? "error" : ""}" role="status">
      <span class="toast-dot" aria-hidden="true"></span>
      <span>${esc(msg)}</span>
      <button type="button" class="toast-close" aria-label="Dismiss notification">✕</button>
    </div>
  `;
  region.querySelector(".toast-close")?.addEventListener("click", () => region.replaceChildren());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.replaceChildren(), 4000);
}

function badge(s) {
  const c = String(s || "unknown").toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="badge ${c}">${esc(s || "Unknown")}</span>`;
}

function symbol(x) {
  const s = ((x.category || "") + " " + (x.name || "")).toLowerCase();
  if (/camera|photo|lens/.test(s)) return "◉";
  if (/audio|microphone|speaker|headphone/.test(s)) return "♫";
  if (/laptop|computer|tablet/.test(s)) return "▱";
  if (/projector|presentation|screen/.test(s)) return "▣";
  if (/storage|usb|drive/.test(s)) return "▤";
  return "⬡";
}

function productImage(x) {
  const equipmentId = String(id(x) ?? "");
  return window.BORROWBOX_EQUIPMENT_PHOTOS?.[equipmentId] || "";
}

function art(x, i = 0) {
  const photo = productImage(x);
  const name = String(x.name || "Equipment");
  const description = String(x.description || "");
  const itemId = String(id(x) ?? i + 1).padStart(3, "0");
  const imageMarkup = photo
    ? `<img class="gear-photo" src="${esc(photo)}" alt="${esc(name + (description ? ": " + description : ""))}" loading="lazy" decoding="async" onerror="this.onerror=null;this.hidden=true;this.nextElementSibling.hidden=false">`
    : "";
  return `<div class="gear-art art-${["blue", "purple", "mint", "orange"][i % 4]}">
    ${imageMarkup}
    <span class="gear-photo-fallback" ${photo ? "hidden" : ""} aria-hidden="true"><span class="gear-fallback-symbol">${symbol(x)}</span><span class="gear-fallback-caption">${esc(x.category || "Equipment")}</span></span>
    <small>BB / ${esc(itemId)}</small>
  </div>`;
}

/* Accessible Modal & Confirmation Dialog */
function bbConfirm({ title = "Confirm action", message = "Are you sure?", confirmText = "Confirm", danger = false } = {}) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "bb-modal-backdrop";
    backdrop.innerHTML = `
      <div class="bb-modal" role="dialog" aria-modal="true" aria-labelledby="bb-confirm-title">
        <div class="bb-modal-head">
          <h2 id="bb-confirm-title">${esc(title)}</h2>
          <button type="button" class="btn ghost icon-only" data-modal-close aria-label="Close dialog">✕</button>
        </div>
        <div class="bb-modal-body">${esc(message)}</div>
        <div class="bb-modal-foot">
          <button type="button" class="btn secondary" data-modal-close>Cancel</button>
          <button type="button" class="btn ${danger ? "destructive" : "primary"}" data-modal-confirm>${esc(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = result => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
      resolve(result);
    };

    const onKey = e => {
      if (e.key === "Escape") close(false);
    };

    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", e => {
      if (e.target === backdrop) close(false);
    });
    backdrop.querySelectorAll("[data-modal-close]").forEach(btn => btn.addEventListener("click", () => close(false)));
    backdrop.querySelector("[data-modal-confirm]")?.addEventListener("click", () => close(true));
    backdrop.querySelector("[data-modal-confirm]")?.focus();
  });
}

function showEquipmentDetail(item) {
  if (!item) return;
  const prevFocus = document.activeElement;
  const availableCount = qty(item);
  const backdrop = document.createElement("div");
  backdrop.className = "bb-modal-backdrop";
  backdrop.innerHTML = `
    <div class="bb-modal" role="dialog" aria-modal="true" aria-labelledby="bb-detail-title">
      <div class="bb-modal-head">
        <div>
          <small class="eyebrow">${esc(item.category || "Equipment")}</small>
          <h2 id="bb-detail-title">${esc(item.name || "Equipment")}</h2>
        </div>
        <button type="button" class="btn ghost icon-only" data-modal-close aria-label="Close details">✕</button>
      </div>
      <div class="bb-detail-media">${art(item)}</div>
      <div class="bb-modal-body">
        <p style="margin-top:0">${esc(item.description || "Shared campus equipment available for authorized borrowing.")}</p>
        <div class="bb-detail-grid">
          <div><small>Equipment ID</small><strong class="mono">#${esc(id(item))}</strong></div>
          <div><small>Availability</small><strong>${availableCount > 0 ? `${availableCount} unit${availableCount === 1 ? "" : "s"} available` : "Currently unavailable"}</strong></div>
          <div><small>Category</small><strong>${esc(item.category || "General")}</strong></div>
          <div><small>Status</small><strong>${availableCount > 0 ? "Available" : "Checked out"}</strong></div>
        </div>
        <div class="notice" style="margin-bottom:0">
          <strong>Care &amp; handling</strong>
          <p>${esc(defaultCareInstructions(item))}</p>
        </div>
      </div>
      <div class="bb-modal-foot">
        <button type="button" class="btn secondary" data-modal-close>Close</button>
        ${availableCount > 0
          ? `<a class="btn primary" href="borrow.html?equipment_id=${encodeURIComponent(id(item))}">Borrow equipment →</a>`
          : `<a class="btn secondary" href="reservations.html">Reserve for later →</a>`}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
  };
  const onKey = e => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll("[data-modal-close]").forEach(btn => btn.addEventListener("click", close));
  backdrop.querySelector("[data-modal-close]")?.focus();
}

function setup() {
  const sidebar = $("#sidebar");
  let backdrop = $(".sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  const closeMobileSidebar = () => {
    sidebar?.classList.remove("open");
    backdrop.classList.remove("visible");
  };

  $("#menu")?.addEventListener("click", () => {
    const isOpen = sidebar?.classList.toggle("open");
    backdrop.classList.toggle("visible", Boolean(isOpen));
  });
  backdrop.addEventListener("click", closeMobileSidebar);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && sidebar?.classList.contains("open")) closeMobileSidebar();
  });

  if (localStorage.getItem("borrowbox_sidebar_collapsed") === "1") {
    document.body.classList.add("sidebar-collapsed");
  }
  $("#sidebar-toggle")?.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("borrowbox_sidebar_collapsed", collapsed ? "1" : "0");
  });

  const roleSelect = $("#role-switcher");
  if (roleSelect && currentUser) {
    roleSelect.value = currentUser.role;
    roleSelect.disabled = true;
  }

  const initial = (currentUser?.full_name || "U").trim().charAt(0).toUpperCase();
  $$(".avatar").forEach(av => {
    av.textContent = initial;
    av.title = currentUser?.full_name || "";
  });

  if ($("#sidebar-user-name") && currentUser) {
    $("#sidebar-user-name").textContent = currentUser.full_name || "Campus Member";
  }
  if ($("#sidebar-user-role") && currentUser) {
    $("#sidebar-user-role").textContent = currentUser.role || "Student";
  }

  $$(".admin-only").forEach(el => el.classList.toggle("hidden", !admin()));
  if (!admin()) {
    $$('a[href="users.html"], a[href="admin-access.html"]').forEach(link => link.classList.add("hidden"));
  }

  const topRight = $(".top-right");
  if (topRight && !$("#logout-button")) {
    const logout = document.createElement("button");
    logout.id = "logout-button";
    logout.type = "button";
    logout.className = "btn secondary sm";
    logout.textContent = "Log out";
    logout.addEventListener("click", () => {
      clearSession();
      location.replace("login.html");
    });
    topRight.appendChild(logout);
  }

  $("#global-search")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.value.trim()) {
      location.href = "equipment.html?q=" + encodeURIComponent(event.target.value.trim());
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      $("#global-search")?.focus();
      event.preventDefault();
    }
  });
}

async function loadDashboard() {
  if (!$("#featured-equipment")) return;

  const greetingEl = $("#dashboard-greeting");
  const subtitleEl = $("#dashboard-subtitle");
  const eyebrowEl = $("#dashboard-eyebrow");
  if (greetingEl && currentUser) {
    const firstName = (currentUser.full_name || "").trim().split(/\s+/)[0] || "there";
    greetingEl.innerHTML = `Welcome back, <em>${esc(firstName)}</em>.`;
    if (eyebrowEl) eyebrowEl.textContent = `${String(currentUser.role || "Campus").toUpperCase()} WORKSPACE`;
    if (subtitleEl) {
      subtitleEl.textContent = admin()
        ? "Monitor campus inventory, active checkouts, pending reservations, and maintenance tickets."
        : currentUser.role === "Staff"
        ? "Access department equipment, track your checkouts, and manage reservations."
        : "Browse available campus equipment, track your borrowings, and manage reservations.";
    }
  }

  try {
    [equipment, loans] = await Promise.all([api("/equipment"), api("/borrowings").catch(() => [])]);
    equipment = Array.isArray(equipment) ? equipment : [];
    loans = Array.isArray(loans) ? loans : [];

    const active = loans.filter(x => x.status === "Borrowed");
    const late = active.filter(x => String(x.due_date).slice(0, 10) < today());

    $("#stat-total").textContent = equipment.length;
    $("#stat-available").textContent = equipment.reduce((n, x) => n + qty(x), 0);
    $("#stat-active").textContent = active.length;
    $("#stat-overdue").textContent = late.length;

    if (admin()) {
      const [dashSummary, maintList] = await Promise.all([
        api("/dashboard").catch(() => null),
        api("/maintenance").catch(() => [])
      ]);
      if (dashSummary) {
        if ($("#admin-stat-users")) $("#admin-stat-users").textContent = dashSummary.totalUsers ?? "—";
        if ($("#admin-stat-reservations")) $("#admin-stat-reservations").textContent = dashSummary.pendingReservations ?? "—";
      }
      if (Array.isArray(maintList) && $("#admin-stat-maintenance")) {
        $("#admin-stat-maintenance").textContent = maintList.filter(m => m.status !== "Completed").length;
      }
    }

    const top = [...equipment].sort((a, b) => qty(b) - qty(a)).slice(0, 4);
    $("#featured-equipment").innerHTML = top.length
      ? top
          .map(
            (x, i) => `<article class="feature">${art(x, i)}<h3>${esc(x.name)}</h3><p>${esc(x.category)}</p><div class="feature-foot"><span class="${qty(x) ? "available" : "unavailable"}">● ${qty(x)} available</span><a class="circle" href="borrow.html?equipment_id=${encodeURIComponent(id(x))}" aria-label="Borrow ${esc(x.name)}">↗</a></div></article>`
          )
          .join("")
      : `<div class="empty"><b>No equipment found</b><p>Inventory items will appear here once added.</p></div>`;

    $("#recent-activity").innerHTML =
      loans
        .slice(0, 5)
        .map(x => {
          const isLate = x.status === "Borrowed" && String(x.due_date).slice(0, 10) < today();
          const statusLabel = isLate ? "Overdue" : x.status;
          return `<div class="activity"><span class="activity-icon">${symbol({ name: x.equipment_name })}</span><div><b>${esc(x.equipment_name || "Equipment")}</b><p>${esc(x.full_name || "Borrower")} · Due ${date(x.due_date)}</p></div>${badge(statusLabel)}</div>`;
        })
        .join("") || `<div class="empty"><b>No borrowing activity yet</b><p>Your recent checkouts and returns will appear here.</p></div>`;
  } catch (e) {
    $("#featured-equipment").innerHTML = `<div class="empty"><b>Unable to reach BorrowBox API</b><p>Ensure the backend server is running and refresh the page.</p><small>${esc(e.message)}</small></div>`;
    $("#recent-activity").innerHTML = `<div class="empty"><p>Activity appears when the API is connected.</p></div>`;
  }
}

async function loadCatalogue() {
  const grid = $("#equipment-grid");
  if (!grid) return;

  const search = $("#equipment-search");
  const category = $("#category-filter");
  const availability = $("#availability-filter");
  const sortSelect = $("#equipment-sort");
  const count = $("#catalogue-count");
  const chips = $("#category-chips");
  const viewGridBtn = $("#view-grid");
  const viewListBtn = $("#view-list");

  try {
    const result = await api("/equipment");
    equipment = Array.isArray(result) ? result : [];

    if (!search || !category || !availability || !chips || !count) {
      throw new Error("Catalogue page is missing a required filter element. Check equipment.html IDs.");
    }

    const categories = [...new Set(equipment.map(item => item.category).filter(Boolean))].sort();
    category.querySelectorAll("option:not(:first-child)").forEach(option => option.remove());
    categories.forEach(value => category.add(new Option(value, value)));

    const query = new URLSearchParams(location.search).get("q");
    if (query) search.value = query;

    chips.innerHTML =
      '<button type="button" class="chip selected" data-category="">Everything</button>' +
      categories.map(value => `<button type="button" class="chip" data-category="${esc(value)}">${esc(value)}</button>`).join("");

    function render() {
      const q = search.value.toLowerCase().trim();
      const c = category.value;
      const a = availability.value;
      const sortMode = sortSelect?.value || "default";

      let list = equipment.filter(
        item =>
          `${item.name || ""} ${item.category || ""} ${item.description || ""} #${id(item)}`.toLowerCase().includes(q) &&
          (!c || item.category === c) &&
          (a === "all" || (a === "available" ? qty(item) > 0 : qty(item) <= 0))
      );

      if (sortMode === "name-asc") {
        list = [...list].sort((x, y) => String(x.name || "").localeCompare(String(y.name || "")));
      } else if (sortMode === "qty-desc") {
        list = [...list].sort((x, y) => qty(y) - qty(x));
      }

      count.textContent = `${list.length} item${list.length === 1 ? "" : "s"} found`;
      grid.innerHTML = list.length
        ? list
            .map(
              (item, i) => `
          <article class="catalogue-card">
            ${art(item, i)}
            <div class="catalogue-body">
              <small>${esc(item.category || "UNCATEGORISED")} · #${esc(id(item))}</small>
              <h3>${esc(item.name || "Equipment")}</h3>
              <p>${esc(item.description || "Shared campus equipment ready for authorized borrowing.")}</p>
              <div class="catalogue-foot">
                <span class="${qty(item) > 0 ? "available" : "unavailable"}">● ${qty(item) > 0 ? qty(item) + " available" : "Unavailable"}</span>
                <div class="catalogue-actions">
                  <button type="button" class="btn secondary tiny" data-detail-id="${esc(id(item))}">Details</button>
                  ${
                    qty(item) > 0
                      ? `<a class="btn primary tiny" href="borrow.html?equipment_id=${encodeURIComponent(id(item))}">Borrow →</a>`
                      : `<a class="btn outline tiny" href="reservations.html">Reserve</a>`
                  }
                </div>
              </div>
            </div>
          </article>`
            )
            .join("")
        : '<div class="empty wide"><b>No equipment matches that filter</b><p>Try another keyword or category, or reset your active filters.</p><button class="btn secondary" id="clear-filters" type="button">Clear filters</button></div>';

      chips.querySelectorAll("[data-category]").forEach(button => button.classList.toggle("selected", button.dataset.category === category.value));

      grid.querySelectorAll("[data-detail-id]").forEach(btn => {
        btn.addEventListener("click", () => {
          const item = equipment.find(x => String(id(x)) === btn.dataset.detailId);
          showEquipmentDetail(item);
        });
      });

      $("#clear-filters")?.addEventListener(
        "click",
        () => {
          search.value = "";
          category.value = "";
          availability.value = "all";
          if (sortSelect) sortSelect.value = "default";
          render();
        },
        { once: true }
      );
    }

    viewGridBtn?.addEventListener("click", () => {
      grid.classList.remove("list-view");
      viewGridBtn.classList.add("active");
      viewListBtn?.classList.remove("active");
    });
    viewListBtn?.addEventListener("click", () => {
      grid.classList.add("list-view");
      viewListBtn.classList.add("active");
      viewGridBtn?.classList.remove("active");
    });

    search.addEventListener("input", debounce(render, 150));
    category.addEventListener("change", render);
    availability.addEventListener("change", render);
    sortSelect?.addEventListener("change", render);
    chips.addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      category.value = button.dataset.category;
      render();
    });
    render();
  } catch (error) {
    grid.innerHTML = `<div class="empty wide"><b>Catalogue unavailable</b><p>Check that the BorrowBox backend API is reachable.</p><small>${esc(error.message)}</small></div>`;
  }
}

async function setupBorrow() {
  const f = $("#borrow-form");
  if (!f) return;
  const bd = $("#borrow-date");
  const dd = $("#due-date");
  const sel = $("#equipment-id");
  const t = today();
  const n = new Date();
  n.setDate(n.getDate() + 7);
  const next = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;

  bd.min = t;
  bd.value = t;
  dd.min = t;
  dd.value = next;

  bd.addEventListener("change", () => {
    dd.min = bd.value;
    if (dd.value <= bd.value) {
      const d = new Date(bd.value + "T00:00:00");
      d.setDate(d.getDate() + 7);
      dd.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  });

  try {
    equipment = await api("/equipment");
    equipment.forEach(x => {
      const o = new Option(`${x.name} · ${qty(x)} available`, id(x));
      o.disabled = qty(x) <= 0;
      sel.add(o);
    });
    const wanted = new URLSearchParams(location.search).get("equipment_id");
    if (wanted) {
      sel.value = wanted;
      const x = equipment.find(item => String(id(item)) === sel.value);
      if (x) $("#selected-equipment-hint").textContent = `${x.category} · ${qty(x)} currently available`;
    }
    sel.addEventListener("change", () => {
      const x = equipment.find(item => String(id(item)) === sel.value);
      $("#selected-equipment-hint").textContent = x ? `${x.category} · ${qty(x)} currently available` : "Select an item to check availability.";
    });
  } catch {
    $("#borrow-message").textContent = "Could not load equipment. Check your backend connection.";
  }

  f.addEventListener("submit", async e => {
    e.preventDefault();
    const m = $("#borrow-message");
    const b = $("#submit-borrow");
    if (dd.value <= bd.value) {
      m.textContent = "Expected return date must be after borrow date.";
      m.className = "error-text";
      return;
    }
    b.disabled = true;
    b.textContent = "Sending request…";
    try {
      await api("/borrowings", {
        method: "POST",
        body: JSON.stringify({ equipment_id: Number(sel.value), due_date: dd.value })
      });
      m.textContent = "Request submitted. Track it in Borrowings.";
      m.className = "success-text";
      toast("Equipment borrowed successfully.");
      f.reset();
      bd.value = t;
      dd.value = next;
      $("#selected-equipment-hint").textContent = "Select an item to check availability.";
      try {
        equipment = await api("/equipment");
        sel.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());
        equipment.forEach(x => {
          const o = new Option(`${x.name} · ${qty(x)} available`, id(x));
          o.disabled = qty(x) <= 0;
          sel.add(o);
        });
      } catch {
        // Ignore refresh error after successful submission
      }
    } catch (err) {
      m.textContent = err.message;
      m.className = "error-text";
      toast(err.message, true);
    } finally {
      b.disabled = false;
      b.textContent = "Send borrowing request →";
    }
  });
}

async function loadHistory() {
  const body = $("#history-body");
  if (!body) return;

  try {
    loans = await api("/borrowings");
    loans = Array.isArray(loans) ? loans : [];
    const active = loans.filter(x => x.status === "Borrowed");
    $("#history-total").textContent = loans.length;
    $("#history-active").textContent = active.length;
    $("#history-overdue").textContent = active.filter(x => String(x.due_date).slice(0, 10) < today()).length;

    function render() {
      const q = ($("#history-search")?.value || "").toLowerCase();
      const statusFilter = $("#history-status-filter")?.value || "";
      const list = loans.filter(x => {
        const computedStatus = x.status === "Borrowed" && String(x.due_date).slice(0, 10) < today() ? "Overdue" : x.status;
        const matchesQuery = `${x.equipment_name} ${x.full_name} ${computedStatus}`.toLowerCase().includes(q);
        const matchesStatus = !statusFilter || computedStatus === statusFilter;
        return matchesQuery && matchesStatus;
      });

      body.innerHTML =
        list
          .map(x => {
            const s = x.status === "Borrowed" && String(x.due_date).slice(0, 10) < today() ? "Overdue" : x.status;
            return `<tr>
              <td><b>${esc(x.equipment_name || "Equipment")}</b><small class="mono">ID #${esc(x.equipment_id)}</small></td>
              <td>${esc(x.full_name || "Unknown")}</td>
              <td>${date(x.borrow_date)}</td>
              <td>${date(x.due_date)}</td>
              <td>${badge(s)}</td>
              <td>${admin() && x.status === "Borrowed" ? `<button type="button" class="table-action" data-return="${esc(x.borrowing_id)}" data-item-name="${esc(x.equipment_name || "equipment")}">Mark returned ↗</button>` : "—"}</td>
            </tr>`;
          })
          .join("") || '<tr><td colspan="6"><div class="empty"><b>No borrowing records found</b><p>No records match your current search or filter.</p></div></td></tr>';

      body.querySelectorAll("[data-return]").forEach(b => {
        b.onclick = async () => {
          const ok = await bbConfirm({
            title: "Confirm equipment return",
            message: `Mark "${b.dataset.itemName}" as returned? This will restore available stock.`,
            confirmText: "Mark returned"
          });
          if (!ok) return;
          b.disabled = true;
          try {
            await api(`/borrowings/${b.dataset.return}/return`, { method: "PATCH" });
            toast("Equipment returned successfully.");
            loadHistory();
          } catch (e) {
            toast(e.message, true);
            b.disabled = false;
          }
        };
      });
    }

    if (!body.dataset.bound) {
      body.dataset.bound = "1";
      $("#history-search")?.addEventListener("input", debounce(render, 150));
      $("#history-status-filter")?.addEventListener("change", render);
    }
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6">Unable to load records: ${esc(e.message)}</td></tr>`;
  }
}

async function loadReservations() {
  const body = $("#reservation-body");
  if (!body) return;

  try {
    const [resList, equipList] = await Promise.all([
      api("/reservations"),
      equipment.length ? Promise.resolve(equipment) : api("/equipment").catch(() => [])
    ]);
    reservations = Array.isArray(resList) ? resList : [];
    if (Array.isArray(equipList) && equipList.length) equipment = equipList;

    const resSelect = $("#reservation-equipment");
    if (resSelect && resSelect.options.length <= 1 && equipment.length) {
      equipment.forEach(x => resSelect.add(new Option(`${x.name} (${x.category || "General"})`, id(x))));
    }
    const resDate = $("#reservation-date");
    if (resDate && !resDate.value) {
      resDate.min = today();
      resDate.value = today();
    }

    function render() {
      const q = ($("#reservation-search")?.value || "").toLowerCase();
      const s = $("#reservation-status-filter")?.value || "";
      const list = reservations.filter(
        x => `${x.full_name} ${x.equipment_name} ${x.status}`.toLowerCase().includes(q) && (!s || x.status === s)
      );
      $("#reservation-count").textContent = `${list.length} request${list.length === 1 ? "" : "s"}`;

      body.innerHTML =
        list
          .map(
            x => `<tr>
              <td><b>${esc(x.full_name || "Unknown")}</b><small class="mono">User #${esc(x.user_id)}</small></td>
              <td>${esc(x.equipment_name || "Equipment")}</td>
              <td>${date(x.reservation_date)}</td>
              <td>${badge(x.status)}</td>
              <td>${
                admin() && x.status === "Pending"
                  ? `<button type="button" class="table-action" data-status="Approved" data-id="${esc(x.reservation_id)}">Approve</button> <button type="button" class="table-action danger" data-status="Cancelled" data-id="${esc(x.reservation_id)}">Reject</button>`
                  : "—"
              }</td>
            </tr>`
          )
          .join("") || '<tr><td colspan="5"><div class="empty"><b>No reservations found</b><p>Create a new reservation or adjust your filters.</p></div></td></tr>';

      body.querySelectorAll("[data-status]").forEach(b => {
        b.onclick = async () => {
          const isCancel = b.dataset.status === "Cancelled";
          if (isCancel) {
            const ok = await bbConfirm({
              title: "Reject reservation",
              message: "Are you sure you want to reject this reservation request?",
              confirmText: "Reject reservation",
              danger: true
            });
            if (!ok) return;
          }
          try {
            await api(`/reservations/${b.dataset.id}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status: b.dataset.status })
            });
            toast("Reservation updated.");
            loadReservations();
          } catch (e) {
            toast(e.message, true);
          }
        };
      });
    }

    if (!body.dataset.bound) {
      body.dataset.bound = "1";
      $("#reservation-search")?.addEventListener("input", debounce(render, 150));
      $("#reservation-status-filter")?.addEventListener("change", render);

      $("#toggle-reservation-form")?.addEventListener("click", () => $("#reservation-form-panel")?.classList.toggle("hidden"));
      $("#close-reservation-form")?.addEventListener("click", () => $("#reservation-form-panel")?.classList.add("hidden"));
      $("#cancel-reservation-form")?.addEventListener("click", () => $("#reservation-form-panel")?.classList.add("hidden"));

      $("#reservation-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const msg = $("#reservation-form-message");
        const submitBtn = $("#submit-reservation");
        const equipmentId = Number($("#reservation-equipment")?.value);
        const dateVal = $("#reservation-date")?.value;
        if (!Number.isInteger(equipmentId) || equipmentId < 1 || !dateVal) {
          msg.textContent = "Please choose equipment and a reservation date.";
          msg.className = "error-text";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
        try {
          await api("/reservations", {
            method: "POST",
            body: JSON.stringify({ equipment_id: equipmentId, reservation_date: dateVal })
          });
          msg.textContent = "Reservation created successfully.";
          msg.className = "success-text";
          toast("Reservation created successfully.");
          e.target.reset();
          if (resDate) resDate.value = today();
          $("#reservation-form-panel")?.classList.add("hidden");
          loadReservations();
        } catch (err) {
          msg.textContent = err.message;
          msg.className = "error-text";
          toast(err.message, true);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit reservation →";
        }
      });
    }

    render();
  } catch (e) {
    if ($("#reservation-count")) $("#reservation-count").textContent = "Unavailable";
    body.innerHTML = `<tr><td colspan="5">Unable to load reservations: ${esc(e.message)}</td></tr>`;
  }
}

async function loadUsers() {
  const body = $("#users-body");
  if (!body) return;

  try {
    users = await api("/users");
    users = Array.isArray(users) ? users : [];

    function render() {
      const q = ($("#users-search")?.value || "").toLowerCase();
      const list = users.filter(x => `${x.full_name} ${x.email} ${x.role}`.toLowerCase().includes(q));
      $("#users-total").textContent = users.length;
      $("#users-admin").textContent = users.filter(x => x.role === "Admin").length;
      $("#users-student").textContent = users.filter(x => x.role === "Student").length;

      body.innerHTML =
        list
          .map(
            x => `<tr>
              <td><b class="person"><span>${esc((x.full_name || "?").split(/\s+/).map(y => y[0]).slice(0, 2).join("").toUpperCase())}</span>${esc(x.full_name)}</b></td>
              <td>${esc(x.email)}</td>
              <td>${
                admin()
                  ? `<select class="inline-select user-role-select" data-role-user="${esc(x.user_id)}" aria-label="Role for ${esc(x.full_name)}"><option value="Student" ${x.role === "Student" ? "selected" : ""}>Student</option><option value="Staff" ${x.role === "Staff" ? "selected" : ""}>Staff</option><option value="Admin" ${x.role === "Admin" ? "selected" : ""}>Admin</option></select>`
                  : badge(x.role)
              }</td>
              <td class="mono">#${esc(x.user_id)}</td>
              <td>${
                admin() && Number(x.user_id) !== Number(currentUser?.user_id)
                  ? `<button type="button" class="table-action danger" data-delete-user="${esc(x.user_id)}">Remove</button>`
                  : "—"
              }</td>
            </tr>`
          )
          .join("") || '<tr><td colspan="5"><div class="empty"><b>No people found</b><p>No accounts match your search.</p></div></td></tr>';

      body.querySelectorAll("[data-role-user]").forEach(sel =>
        sel.addEventListener("change", async () => {
          const previous = users.find(u => String(u.user_id) === sel.dataset.roleUser)?.role;
          if (!previous) return;
          const ok = await bbConfirm({
            title: "Change user role",
            message: `Change this user's role from ${previous} to ${sel.value}?`,
            confirmText: "Update role"
          });
          if (!ok) {
            sel.value = previous || "Student";
            return;
          }
          sel.disabled = true;
          try {
            await api(`/users/${sel.dataset.roleUser}/role`, {
              method: "PATCH",
              body: JSON.stringify({ role: sel.value })
            });
            toast("User role updated.");
            users = await api("/users");
            render();
          } catch (err) {
            toast(err.message, true);
            sel.value = previous;
          } finally {
            sel.disabled = false;
          }
        })
      );

      body.querySelectorAll("[data-delete-user]").forEach(btn =>
        btn.addEventListener("click", async () => {
          const person = users.find(u => String(u.user_id) === btn.dataset.deleteUser);
          if (!person) return;
          const ok = await bbConfirm({
            title: "Remove user",
            message: `Remove ${person.full_name} from BorrowBox? This cannot be undone.`,
            confirmText: "Remove user",
            danger: true
          });
          if (!ok) return;
          btn.disabled = true;
          try {
            await api(`/users/${btn.dataset.deleteUser}`, { method: "DELETE" });
            toast("User removed.");
            users = await api("/users");
            render();
          } catch (err) {
            toast(err.message, true);
          } finally {
            btn.disabled = false;
          }
        })
      );
    }

    if (!body.dataset.bound) {
      body.dataset.bound = "1";
      $("#users-search")?.addEventListener("input", debounce(render, 150));
      $("#toggle-user-form")?.addEventListener("click", () => $("#user-form-panel").classList.toggle("hidden"));
      $("#close-user-form")?.addEventListener("click", () => $("#user-form-panel").classList.add("hidden"));
      $("#user-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const m = $("#user-message");
        try {
          await api("/users", {
            method: "POST",
            body: JSON.stringify({
              full_name: $("#user-name").value.trim(),
              email: $("#user-email").value.trim(),
              role: $("#user-role").value
            })
          });
          m.textContent = "Person added successfully.";
          m.className = "success-text";
          e.target.reset();
          users = await api("/users");
          render();
          toast("Person added to BorrowBox.");
        } catch (err) {
          m.textContent = err.message;
          m.className = "error-text";
          toast(err.message, true);
        }
      });
    }
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5">Unable to load users: ${esc(e.message)}</td></tr>`;
  }
}

function defaultCareInstructions(item) {
  if (item?.care_instructions) return item.care_instructions;
  const cat = String(item?.category || "").toLowerCase();
  if (cat.includes("photo") || cat.includes("camera")) {
    return "Always attach lens caps when not shooting. Clean lenses only with a microfiber cloth and avoid dusty or wet environments.";
  }
  if (cat.includes("electron")) {
    return "Keep away from liquids and extreme heat. Shut down properly before packing and report any screen, port, or battery issues.";
  }
  if (cat.includes("accessor")) {
    return "Do not bend connectors or yank cables by the cord. Store adapters dry and report frayed wires right away.";
  }
  if (cat.includes("storage")) {
    return "Always eject the drive safely before unplugging. Keep away from magnets, moisture, and drops.";
  }
  if (cat.includes("audio")) {
    return "Keep volume levels safe, coil cables loosely, and store headphones and recorders in their protective cases.";
  }
  if (cat.includes("presentation")) {
    return "Allow projector bulbs to cool before moving. Never look directly into laser pointers and wipe whiteboards clean.";
  }
  if (cat.includes("lab")) {
    return "Inspect probes and power leads before use. Unplug heating tools after use, let hot parts cool, and follow lab safety rules.";
  }
  return "Handle with care, keep clean and dry, return all accessories, and report any damage promptly.";
}

async function loadMaintenance() {
  const body = $("#maintenance-body");
  if (!body) return;

  const eyebrow = $("#maintenance-tracker-eyebrow");
  const title = $("#maintenance-tracker-title");
  if (eyebrow) eyebrow.textContent = admin() ? "REPAIR TRACKER" : "MY MAINTENANCE REQUESTS";
  if (title) title.innerHTML = admin() ? "Reported issues<span>.</span>" : "My reported issues<span>.</span>";

  try {
    [repairs, equipment] = await Promise.all([api("/maintenance"), api("/equipment")]);
    repairs = Array.isArray(repairs) ? repairs : [];
    equipment = Array.isArray(equipment) ? equipment : [];

    const sel = $("#maintenance-equipment");
    if (sel) {
      const previousSelection = sel.value;
      sel.querySelectorAll("option:not(:first-child)").forEach(opt => opt.remove());
      equipment.forEach(x => sel.add(new Option(x.name, id(x))));
      if (previousSelection) sel.value = previousSelection;
    }
    const dateInput = $("#maintenance-date");
    if (dateInput && !dateInput.value) dateInput.value = today();

    const careBody = $("#care-guide-body");
    const careCat = $("#care-category-filter");
    const careSearch = $("#care-search");

    if (careCat) {
      const prevCat = careCat.value;
      const cats = [...new Set(equipment.map(x => x.category).filter(Boolean))].sort();
      careCat.querySelectorAll("option:not(:first-child)").forEach(opt => opt.remove());
      cats.forEach(c => careCat.add(new Option(c, c)));
      if (prevCat) careCat.value = prevCat;
    }

    function renderCareGuide() {
      if (!careBody) return;
      const q = (careSearch?.value || "").toLowerCase().trim();
      const cat = careCat?.value || "";
      const list = equipment.filter(
        x => `${x.name || ""} ${x.category || ""} ${defaultCareInstructions(x)}`.toLowerCase().includes(q) && (!cat || x.category === cat)
      );
      careBody.innerHTML = list.length
        ? list
            .map(
              x => `<tr>
            <td><b>${esc(x.name || "Equipment")}</b><small class="mono">ID #${esc(id(x))}</small></td>
            <td>${badge(x.category || "General")}</td>
            <td>${esc(defaultCareInstructions(x))}</td>
            <td><span class="${qty(x) > 0 ? "available" : "unavailable"}">● ${qty(x)} available</span></td>
            <td><button type="button" class="table-action" data-report-equipment="${esc(id(x))}">Report issue ↗</button></td>
          </tr>`
            )
            .join("")
        : '<tr><td colspan="5"><div class="empty"><b>No equipment matches that filter</b></div></td></tr>';

      careBody.querySelectorAll("[data-report-equipment]").forEach(btn => {
        btn.addEventListener("click", () => {
          const panel = $("#maintenance-form-panel");
          if (panel) panel.classList.remove("hidden");
          if (sel) sel.value = btn.dataset.reportEquipment;
          if (dateInput && !dateInput.value) dateInput.value = today();
          panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          $("#maintenance-issue")?.focus();
        });
      });
    }

    function render() {
      const q = ($("#maintenance-search")?.value || "").toLowerCase();
      const s = $("#maintenance-status-filter")?.value || "";
      const list = repairs.filter(
        x => `${x.equipment_name || ""} ${x.issue_description || ""} ${x.reported_by || ""} ${x.status || ""}`.toLowerCase().includes(q) && (!s || x.status === s)
      );
      $("#maintenance-pending").textContent = repairs.filter(x => x.status === "Pending").length;
      $("#maintenance-progress").textContent = repairs.filter(x => x.status === "In Progress").length;
      $("#maintenance-completed").textContent = repairs.filter(x => x.status === "Completed").length;

      const colCount = admin() ? 6 : 4;
      body.innerHTML =
        list
          .map(
            x => `<tr>
        <td><b>${esc(x.equipment_name || "Equipment #" + x.equipment_id)}</b></td>
        <td>${esc(x.issue_description)}</td>
        ${admin() ? `<td>${esc(x.reported_by || (x.user_id ? "User #" + x.user_id : "Legacy record"))}</td>` : ""}
        <td>${date(x.maintenance_date)}</td>
        <td>${badge(x.status)}</td>
        ${
          admin()
            ? `<td>${
                x.status !== "Completed"
                  ? `<div class="maintenance-action" data-maintenance-action><button type="button" class="maintenance-update-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Change status for ${esc(x.equipment_name || "equipment")}"><span>Change status</span><span class="maintenance-chevron" aria-hidden="true">⌄</span></button><div class="maintenance-update-menu" hidden role="group" aria-label="Choose maintenance status">${["Pending", "In Progress", "Completed"]
                      .filter(status => status !== x.status)
                      .map(
                        status =>
                          `<button type="button" class="maintenance-option" data-repair="${esc(x.maintenance_id)}" data-status="${status}"><span class="maintenance-dot ${status.toLowerCase().replace(/ /g, "-")}"></span>${status}</button>`
                      )
                      .join("")}</div></div>`
                  : "—"
              }</td>`
            : ""
        }
      </tr>`
          )
          .join("") ||
        `<tr><td colspan="${colCount}"><div class="empty"><b>${admin() ? "No maintenance issues found" : "No maintenance requests submitted"}</b></div></td></tr>`;

      body.querySelectorAll("[data-maintenance-action]").forEach(action => {
        const trigger = action.querySelector(".maintenance-update-trigger");
        const menu = action.querySelector(".maintenance-update-menu");
        trigger.addEventListener("click", () => {
          const open = menu.hidden;
          body.querySelectorAll(".maintenance-update-menu").forEach(other => {
            other.hidden = true;
            other.previousElementSibling?.setAttribute("aria-expanded", "false");
          });
          menu.hidden = !open;
          if (open) {
            const rect = trigger.getBoundingClientRect();
            const width = 196;
            const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
            const below = window.innerHeight - rect.bottom > 155;
            menu.style.left = `${left}px`;
            menu.style.top = below ? `${rect.bottom + 8}px` : "auto";
            menu.style.bottom = below ? "auto" : `${window.innerHeight - rect.top + 8}px`;
          }
          trigger.setAttribute("aria-expanded", String(open));
        });
        menu.querySelectorAll("[data-repair]").forEach(button =>
          button.addEventListener("click", async () => {
            if (button.disabled) return;
            const previous = trigger.innerHTML;
            trigger.disabled = true;
            trigger.textContent = "Updating…";
            menu.hidden = true;
            try {
              await api(`/maintenance/${button.dataset.repair}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status: button.dataset.status })
              });
              toast("Maintenance record updated.");
              await loadMaintenance();
            } catch (e) {
              toast(e.message, true);
              trigger.disabled = false;
              trigger.innerHTML = previous;
              trigger.setAttribute("aria-expanded", "false");
            }
          })
        );
      });
    }

    renderCareGuide();
    render();

    if (!body.dataset.bound) {
      body.dataset.bound = "1";
      careSearch?.addEventListener("input", debounce(renderCareGuide, 150));
      careCat?.addEventListener("change", renderCareGuide);
      $("#maintenance-search")?.addEventListener("input", debounce(render, 150));
      $("#maintenance-status-filter")?.addEventListener("change", render);
      $("#toggle-maintenance-form")?.addEventListener("click", () => $("#maintenance-form-panel").classList.toggle("hidden"));
      $("#close-maintenance-form")?.addEventListener("click", () => $("#maintenance-form-panel").classList.add("hidden"));
      $("#maintenance-form")?.addEventListener("submit", async e => {
        e.preventDefault();
        const m = $("#maintenance-message");
        const equipmentId = Number(sel.value);
        const issueDescription = $("#maintenance-issue").value.trim();
        if (!Number.isInteger(equipmentId) || equipmentId < 1 || !issueDescription) {
          m.textContent = "Please choose equipment and describe the issue.";
          m.className = "error-text";
          return;
        }
        try {
          await api("/maintenance", {
            method: "POST",
            body: JSON.stringify({
              equipment_id: equipmentId,
              issue_description: issueDescription,
              maintenance_date: $("#maintenance-date").value
            })
          });
          m.textContent = "Issue report saved.";
          m.className = "success-text";
          e.target.reset();
          $("#maintenance-date").value = today();
          toast("Maintenance issue reported.");
          await loadMaintenance();
        } catch (err) {
          m.textContent = err.message;
          m.className = "error-text";
          toast(err.message, true);
        }
      });
    }
  } catch (e) {
    body.innerHTML = `<tr><td colspan="${admin() ? 6 : 4}">Unable to load maintenance records: ${esc(e.message)}</td></tr>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!currentUser || !token()) {
    location.replace("login.html");
    return;
  }

  // Students and Staff must not open administrator-only pages.
  const adminPage = ["users.html", "admin-access.html"].some(page => location.pathname.endsWith(page));
  if (adminPage && !admin()) {
    location.replace("index.html");
    return;
  }

  setup();
  loadDashboard();
  loadCatalogue();
  setupBorrow();
  loadHistory();
  loadReservations();
  loadUsers();
  loadMaintenance();
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".maintenance-update-menu").forEach(menu => {
    if (!menu.hidden) {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute("aria-expanded", "false");
      menu.previousElementSibling?.focus();
    }
  });
});

document.addEventListener("click", event => {
  if (event.target.closest("[data-maintenance-action]")) return;
  document.querySelectorAll(".maintenance-update-menu").forEach(menu => {
    menu.hidden = true;
    menu.previousElementSibling?.setAttribute("aria-expanded", "false");
  });
});

window.addEventListener(
  "scroll",
  () => {
    document.querySelectorAll(".maintenance-update-menu").forEach(menu => {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
  },
  true
);
