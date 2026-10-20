"use strict";

/* =========================================================
   BorrowBox — Main Application
   API: http://localhost:3000/api
   ========================================================= */

const API = "http://localhost:3000/api";
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let equipment = [];
let users = [];
let loans = [];
let reservations = [];
let repairs = [];
let toastTimer = null;
let currentUser = null;

/* =========================
   SESSION AND UTILITIES
   ========================= */

const getToken = () =>
    localStorage.getItem("borrowbox_token") ||
    sessionStorage.getItem("borrowbox_token") ||
    "";

const getSavedUser = () => {
    try {
        return JSON.parse(
            localStorage.getItem("borrowbox_user") ||
            sessionStorage.getItem("borrowbox_user") ||
            "null"
        );
    } catch {
        return null;
    }
};

const admin = () => currentUser?.role === "Admin";

function clearSession() {
    localStorage.removeItem("borrowbox_token");
    localStorage.removeItem("borrowbox_user");
    sessionStorage.removeItem("borrowbox_token");
    sessionStorage.removeItem("borrowbox_user");
}

function logout() {
    clearSession();
    location.replace("login.html");
}

const today = () => {
    const d = new Date();

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
    ].join("-");
};

const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

const date = value => {
    if (!value) return "—";

    const d = new Date(String(value).slice(0, 10) + "T00:00:00");

    return isNaN(d)
        ? "—"
        : d.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
};

const qty = item => Number(item.available_quantity ?? 0);

const id = item => item.equipment_id ?? item.id;

/* =========================
   API REQUEST HELPER
   ========================= */

async function api(path, options = {}) {
    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
    };

    const token = getToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(API + path, {
        ...options,
        headers
    });

    const contentType = response.headers.get("content-type") || "";

    const result = contentType.includes("json")
        ? await response.json()
        : await response.text();

    if (response.status === 401) {
        clearSession();

        if (!location.pathname.endsWith("login.html")) {
            location.replace("login.html");
        }

        throw new Error(result?.error || "Please sign in again.");
    }

    if (!response.ok) {
        throw new Error(
            result?.error ||
            result?.message ||
            `Request failed (${response.status})`
        );
    }

    return result;
}

/* =========================
   PAGE ACCESS AND AUTH
   ========================= */

async function guardPage() {
    if (!getToken()) {
        location.replace("login.html");
        return false;
    }

    try {
        const result = await api("/auth/me");

        currentUser = result.user;

        if (!currentUser) {
            throw new Error("The server did not return a user.");
        }

        const savedUser = JSON.stringify(currentUser);

        localStorage.setItem("borrowbox_user", savedUser);
        sessionStorage.setItem("borrowbox_user", savedUser);

        if (
            location.pathname.endsWith("admin-access.html") &&
            currentUser.role !== "Admin"
        ) {
            location.replace("index.html?denied=admin");
            return false;
        }

        const roleSelect = $("#role-switcher");

        if (roleSelect) {
            roleSelect.value = currentUser.role;
            roleSelect.disabled = true;
        }

        const avatar = $(".avatar");

        if (avatar) {
            avatar.textContent = (
                currentUser.full_name || currentUser.role || "U"
            ).slice(0, 1).toUpperCase();
        }

        $$(".admin-only").forEach(element => {
            element.classList.toggle(
                "hidden",
                currentUser.role !== "Admin"
            );
        });

        const signedInName = $("#signed-in-name");

        if (signedInName) {
            signedInName.textContent = currentUser.full_name || "";
        }

        const topRight = $(".topbar .top-right");

        if (topRight && !$("#logout-button")) {
            const button = document.createElement("button");

            button.id = "logout-button";
            button.className = "btn";
            button.type = "button";
            button.textContent = "Sign out";
            button.addEventListener("click", logout);

            topRight.appendChild(button);
        }

        return true;
    } catch (error) {
        console.error("Session verification failed:", error);
        return false;
    }
}

/* =========================
   NOTIFICATIONS AND DISPLAY
   ========================= */

function toast(message, error = false) {
    const region = $("#toast-region");

    if (!region) {
        alert(message);
        return;
    }

    region.innerHTML = `
    <div class="toast ${error ? "error" : ""}">
      ${error ? "!" : "✓"} &nbsp; ${esc(message)}
    </div>
  `;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        region.replaceChildren();
    }, 3500);
}

function badge(status) {
    const className = String(status || "unknown")
        .toLowerCase()
        .replace(/[^a-z]+/g, "-");

    return `
    <span class="badge ${esc(className)}">
      ${esc(status || "Unknown")}
    </span>
  `;
}

function symbol(item = {}) {
    const value = (
        (item.category || "") + " " + (item.name || "")
    ).toLowerCase();

    if (/camera|photo|lens/.test(value)) return "◉";
    if (/audio|microphone|speaker|headphone/.test(value)) return "♫";
    if (/laptop|computer|tablet/.test(value)) return "▱";
    if (/projector|presentation|screen/.test(value)) return "▣";
    if (/storage|usb|drive/.test(value)) return "▤";

    return "⬡";
}

function art(item, index = 0) {
    const colors = ["blue", "purple", "mint", "orange"];

    return `
    <div class="gear-art art-${colors[index % colors.length]}">
      <span>${symbol(item)}</span>
      <small>
        BB / ${String(id(item) || index + 1).padStart(3, "0")}
      </small>
    </div>
  `;
}

/* =========================
   GLOBAL PAGE SETUP
   ========================= */

function setup() {
    $("#menu")?.addEventListener("click", () => {
        $("#sidebar")?.classList.toggle("open");
    });

    $("#global-search")?.addEventListener("keydown", event => {
        if (event.key === "Enter" && event.target.value.trim()) {
            location.href =
                "equipment.html?q=" +
                encodeURIComponent(event.target.value.trim());
        }
    });

    document.addEventListener("keydown", event => {
        const tag = document.activeElement?.tagName;

        if (
            event.key === "/" &&
            !["INPUT", "SELECT", "TEXTAREA"].includes(tag)
        ) {
            $("#global-search")?.focus();
            event.preventDefault();
        }
    });
}

/* =========================
   DASHBOARD
   ========================= */

async function loadDashboard() {
    if (!$("#featured-equipment")) return;

    try {
        [equipment, loans] = await Promise.all([
            api("/equipment"),
            api("/borrowings").catch(() => [])
        ]);

        equipment = Array.isArray(equipment) ? equipment : [];
        loans = Array.isArray(loans) ? loans : [];

        const active = loans.filter(item => item.status === "Borrowed");

        const overdue = active.filter(
            item => String(item.due_date).slice(0, 10) < today()
        );

        if ($("#stat-total")) {
            $("#stat-total").textContent = equipment.length;
        }

        if ($("#stat-available")) {
            $("#stat-available").textContent = equipment.reduce(
                (total, item) => total + qty(item),
                0
            );
        }

        if ($("#stat-active")) {
            $("#stat-active").textContent = active.length;
        }

        if ($("#stat-overdue")) {
            $("#stat-overdue").textContent = overdue.length;
        }

        const featured = [...equipment]
            .sort((a, b) => qty(b) - qty(a))
            .slice(0, 4);

        $("#featured-equipment").innerHTML = featured.length
            ? featured.map((item, index) => `
          <article class="feature">
            ${art(item, index)}
            <h3>${esc(item.name)}</h3>
            <p>${esc(item.category)}</p>

            <div class="feature-foot">
              <span class="${qty(item) ? "available" : "unavailable"}">
                ● ${qty(item)} available
              </span>

              <a
                class="circle"
                href="borrow.html?equipment_id=${encodeURIComponent(id(item))}"
              >↗</a>
            </div>
          </article>
        `).join("")
            : "<p>No equipment found in database.</p>";

        $("#recent-activity").innerHTML = loans
            .slice(0, 5)
            .map(item => `
        <div class="activity">
          <span class="activity-icon">
            ${symbol({ name: item.equipment_name })}
          </span>

          <div>
            <b>
              ${esc(item.equipment_name || "Equipment")}
              ${item.status === "Returned" ? "returned" : "borrowed"}
            </b>

            <p>
              ${esc(item.full_name || "Borrower")}
              · Due ${date(item.due_date)}
            </p>
          </div>

          ${badge(item.status)}
        </div>
      `)
            .join("") || "<p>No borrowing activity yet.</p>";
    } catch (error) {
        $("#featured-equipment").innerHTML = `
      <div class="empty">
        <b>Can't reach BorrowBox API.</b>
        <p>Start the backend with <code>npm start</code>, then refresh.</p>
        <small>${esc(error.message)}</small>
      </div>
    `;

        $("#recent-activity").innerHTML =
            "<p>Activity appears when the API is connected.</p>";
    }
}

/* =========================
   EQUIPMENT CATALOGUE
   ========================= */

async function loadCatalogue() {
    const grid = $("#equipment-grid");

    if (!grid) return;

    const search = $("#equipment-search");
    const categoryFilter = $("#category-filter");
    const availabilityFilter = $("#availability-filter");
    const chips = $("#category-chips");

    const queryFromUrl = new URLSearchParams(location.search).get("q");

    if (queryFromUrl && search) {
        search.value = queryFromUrl;
    }

    try {
        equipment = await api("/equipment");
        equipment = Array.isArray(equipment) ? equipment : [];

        const categories = [
            ...new Set(equipment.map(item => item.category).filter(Boolean))
        ].sort();

        if (categoryFilter) {
            const existing = new Set(
                [...categoryFilter.options].map(option => option.value)
            );

            categories.forEach(category => {
                if (!existing.has(category)) {
                    categoryFilter.add(new Option(category, category));
                }
            });
        }

        if (chips) {
            chips.innerHTML = `
        <button class="chip selected" data-category="">
          Everything
        </button>
        ${categories.map(category => `
          <button
            class="chip"
            data-category="${esc(category)}"
          >${esc(category)}</button>
        `).join("")}
      `;
        }

        function render() {
            const query = (search?.value || "").toLowerCase().trim();
            const category = categoryFilter?.value || "";
            const availability = availabilityFilter?.value || "all";

            const list = equipment.filter(item => {
                const matchesQuery = (
                    `${item.name} ${item.category} ${item.description || ""}`
                ).toLowerCase().includes(query);

                const matchesCategory =
                    !category || item.category === category;

                const matchesAvailability =
                    availability === "all" ||
                    (availability === "available" && qty(item) > 0) ||
                    (availability === "unavailable" && qty(item) <= 0);

                return (
                    matchesQuery &&
                    matchesCategory &&
                    matchesAvailability
                );
            });

            if ($("#catalogue-count")) {
                $("#catalogue-count").textContent =
                    `${list.length} item${list.length === 1 ? "" : "s"} found`;
            }

            grid.innerHTML = list.length
                ? list.map((item, index) => `
            <article class="catalogue-card">
              ${art(item, index)}

              <div class="catalogue-body">
                <small>
                  ${esc(item.category || "UNCATEGORISED")}
                  · #${esc(id(item))}
                </small>

                <h3>${esc(item.name)}</h3>

                <p>
                  ${esc(
                    item.description ||
                    "A shared resource for your next project."
                )}
                </p>

                <div class="catalogue-foot">
                  <span class="${qty(item) ? "available" : "unavailable"}">
                    ● ${qty(item) > 0
                        ? qty(item) + " available"
                        : "Currently unavailable"
                    }
                  </span>

                  ${qty(item) > 0
                        ? `<a class="btn tiny"
                            href="borrow.html?equipment_id=${encodeURIComponent(id(item))}">
                           Request item →
                         </a>`
                        : '<span class="badge overdue">Unavailable</span>'
                    }
                </div>
              </div>
            </article>
          `).join("")
                : `
          <div class="empty wide">
            <b>No gear matches that search.</b>
            <p>Try another name or category, or clear your filters.</p>
            <button class="btn secondary" id="clear-filters">
              Clear filters
            </button>
          </div>
        `;

            $("#clear-filters")?.addEventListener("click", () => {
                if (search) search.value = "";
                if (categoryFilter) categoryFilter.value = "";
                if (availabilityFilter) availabilityFilter.value = "all";

                chips?.querySelectorAll("button").forEach(button => {
                    button.classList.toggle(
                        "selected",
                        button.dataset.category === ""
                    );
                });

                render();
            });
        }

        if (search && !search.dataset.handlerAttached) {
            search.dataset.handlerAttached = "true";
            search.addEventListener("input", render);
        }

        if (categoryFilter && !categoryFilter.dataset.handlerAttached) {
            categoryFilter.dataset.handlerAttached = "true";

            categoryFilter.addEventListener("change", () => {
                chips?.querySelectorAll("button").forEach(button => {
                    button.classList.toggle(
                        "selected",
                        button.dataset.category === categoryFilter.value
                    );
                });

                render();
            });
        }

        if (
            availabilityFilter &&
            !availabilityFilter.dataset.handlerAttached
        ) {
            availabilityFilter.dataset.handlerAttached = "true";
            availabilityFilter.addEventListener("change", render);
        }

        if (chips && !chips.dataset.handlerAttached) {
            chips.dataset.handlerAttached = "true";

            chips.addEventListener("click", event => {
                const button = event.target.closest("[data-category]");

                if (!button) return;

                if (categoryFilter) {
                    categoryFilter.value = button.dataset.category;
                }

                chips.querySelectorAll("button").forEach(item => {
                    item.classList.toggle("selected", item === button);
                });

                render();
            });
        }

        render();
    } catch (error) {
        grid.innerHTML = `
      <div class="empty wide">
        <b>Catalogue unavailable.</b>
        <p>Check that the backend is running at localhost:3000.</p>
        <small>${esc(error.message)}</small>
      </div>
    `;
    }
}

/* =========================
   BORROWING REQUEST FORM
   ========================= */

async function setupBorrow() {
    const form = $("#borrow-form");

    if (!form || form.dataset.handlerAttached) return;

    form.dataset.handlerAttached = "true";

    const borrowDate = $("#borrow-date");
    const dueDate = $("#due-date");
    const equipmentSelect = $("#equipment-id");

    if (!borrowDate || !dueDate || !equipmentSelect) return;

    const startDate = today();
    const defaultDue = new Date();

    defaultDue.setDate(defaultDue.getDate() + 7);

    const nextWeek = [
        defaultDue.getFullYear(),
        String(defaultDue.getMonth() + 1).padStart(2, "0"),
        String(defaultDue.getDate()).padStart(2, "0")
    ].join("-");

    borrowDate.min = startDate;
    borrowDate.value = startDate;

    dueDate.min = startDate;
    dueDate.value = nextWeek;

    borrowDate.addEventListener("change", () => {
        dueDate.min = borrowDate.value;

        if (dueDate.value <= borrowDate.value) {
            const newDate = new Date(
                borrowDate.value + "T00:00:00"
            );

            newDate.setDate(newDate.getDate() + 7);

            dueDate.value = [
                newDate.getFullYear(),
                String(newDate.getMonth() + 1).padStart(2, "0"),
                String(newDate.getDate()).padStart(2, "0")
            ].join("-");
        }
    });

    try {
        equipment = await api("/equipment");
        equipment = Array.isArray(equipment) ? equipment : [];

        equipmentSelect.replaceChildren(
            new Option("Choose equipment", "")
        );

        equipment.forEach(item => {
            const option = new Option(
                `${item.name} · ${qty(item)} available`,
                id(item)
            );

            option.disabled = qty(item) <= 0;
            equipmentSelect.add(option);
        });

        const requestedId =
            new URLSearchParams(location.search).get("equipment_id");

        if (requestedId) {
            equipmentSelect.value = requestedId;
        }

        function updateEquipmentHint() {
            const item = equipment.find(
                entry => String(id(entry)) === equipmentSelect.value
            );

            const hint = $("#selected-equipment-hint");

            if (hint) {
                hint.textContent = item
                    ? `${item.category} · ${qty(item)} currently available`
                    : "Select an item to check availability.";
            }
        }

        equipmentSelect.addEventListener("change", updateEquipmentHint);
        updateEquipmentHint();
    } catch (error) {
        const message = $("#borrow-message");

        if (message) {
            message.textContent =
                "Could not load equipment. Check your backend.";
            message.className = "error-text";
        }

        return;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const message = $("#borrow-message");
        const button = $("#submit-borrow");

        if (!message || !button) return;

        if (!equipmentSelect.value) {
            message.textContent = "Please choose equipment.";
            message.className = "error-text";
            return;
        }

        if (dueDate.value <= borrowDate.value) {
            message.textContent =
                "Expected return date must be after borrow date.";
            message.className = "error-text";
            return;
        }

        button.disabled = true;
        button.textContent = "Sending request…";

        try {
            await api("/borrowings", {
                method: "POST",
                body: JSON.stringify({
                    equipment_id: Number(equipmentSelect.value),
                    borrow_date: borrowDate.value,
                    due_date: dueDate.value
                })
            });

            message.textContent =
                "Request submitted. Track it in My Borrowings.";
            message.className = "success-text";

            toast("Borrowing request submitted.");

            form.reset();

            borrowDate.value = startDate;
            dueDate.value = nextWeek;

            const hint = $("#selected-equipment-hint");

            if (hint) {
                hint.textContent = "Select an item to check availability.";
            }
        } catch (error) {
            message.textContent = error.message;
            message.className = "error-text";
        } finally {
            button.disabled = false;
            button.textContent = "Send borrowing request →";
        }
    });
}

/* =========================
   BORROWING HISTORY
   ========================= */

async function loadHistory() {
    const body = $("#history-body");

    if (!body) return;

    try {
        loans = await api("/borrowings");
        loans = Array.isArray(loans) ? loans : [];

        const active = loans.filter(
            item => item.status === "Borrowed"
        );

        if ($("#history-total")) {
            $("#history-total").textContent = loans.length;
        }

        if ($("#history-active")) {
            $("#history-active").textContent = active.length;
        }

        if ($("#history-overdue")) {
            $("#history-overdue").textContent = active.filter(
                item => String(item.due_date).slice(0, 10) < today()
            ).length;
        }

        function render() {
            const query = ($("#history-search")?.value || "")
                .toLowerCase()
                .trim();

            const list = loans.filter(item =>
                `${item.equipment_name} ${item.full_name} ${item.status}`
                    .toLowerCase()
                    .includes(query)
            );

            body.innerHTML = list.map(item => {
                const status =
                    item.status === "Borrowed" &&
                        String(item.due_date).slice(0, 10) < today()
                        ? "Overdue"
                        : item.status;

                return `
          <tr>
            <td>
              <b>${esc(item.equipment_name || "Equipment")}</b>
              <small>ID #${esc(item.equipment_id)}</small>
            </td>

            <td>${esc(item.full_name || "Unknown")}</td>
            <td>${date(item.borrow_date)}</td>
            <td>${date(item.due_date)}</td>
            <td>${badge(status)}</td>

            <td>
              ${admin() && item.status === "Borrowed"
                        ? `<button class="table-action"
                             data-return="${esc(item.borrowing_id)}">
                       Mark returned ↗
                     </button>`
                        : "—"
                    }
            </td>
          </tr>
        `;
            }).join("") || `
        <tr>
          <td colspan="6">No borrowing records found.</td>
        </tr>
      `;

            body.querySelectorAll("[data-return]").forEach(button => {
                button.addEventListener("click", async () => {
                    if (!confirm("Confirm this equipment has been returned?")) {
                        return;
                    }

                    button.disabled = true;

                    try {
                        await api(
                            `/borrowings/${button.dataset.return}/return`,
                            { method: "PATCH" }
                        );

                        toast("Equipment marked as returned.");
                        await loadHistory();
                    } catch (error) {
                        toast(error.message, true);
                        button.disabled = false;
                    }
                });
            });
        }

        const search = $("#history-search");

        if (search && !search.dataset.handlerAttached) {
            search.dataset.handlerAttached = "true";
            search.addEventListener("input", render);
        }

        render();
    } catch (error) {
        body.innerHTML = `
      <tr>
        <td colspan="6">
          Unable to load records: ${esc(error.message)}
        </td>
      </tr>
    `;
    }
}

/* =========================
   RESERVATIONS
   ========================= */

async function loadReservations() {
    const body = $("#reservation-body");

    if (!body) return;

    try {
        reservations = await api("/reservations");
        reservations = Array.isArray(reservations) ? reservations : [];

        function render() {
            const query = ($("#reservation-search")?.value || "")
                .toLowerCase()
                .trim();

            const selectedStatus =
                $("#reservation-status-filter")?.value || "";

            const list = reservations.filter(item =>
                `${item.full_name} ${item.equipment_name} ${item.status}`
                    .toLowerCase()
                    .includes(query) &&
                (!selectedStatus || item.status === selectedStatus)
            );

            if ($("#reservation-count")) {
                $("#reservation-count").textContent =
                    `${list.length} requests`;
            }

            body.innerHTML = list.map(item => `
        <tr>
          <td>
            <b>${esc(item.full_name || "Unknown")}</b>
            <small>User #${esc(item.user_id)}</small>
          </td>

          <td>${esc(item.equipment_name || "Equipment")}</td>
          <td>${date(item.reservation_date)}</td>
          <td>${badge(item.status)}</td>

          <td>
            ${admin() && item.status === "Pending"
                    ? `
                  <button class="table-action"
                    data-status="Approved"
                    data-id="${esc(item.reservation_id)}">
                    Approve
                  </button>

                  <button class="table-action danger"
                    data-status="Cancelled"
                    data-id="${esc(item.reservation_id)}">
                    Reject
                  </button>
                `
                    : "—"
                }
          </td>
        </tr>
      `).join("") || `
        <tr>
          <td colspan="5">No reservations match these filters.</td>
        </tr>
      `;

            body.querySelectorAll("[data-status]").forEach(button => {
                button.addEventListener("click", async () => {
                    const reservationId = button.dataset.id;
                    const newStatus = button.dataset.status;

                    button.disabled = true;

                    try {
                        await api(
                            `/reservations/${reservationId}/status`,
                            {
                                method: "PATCH",
                                body: JSON.stringify({ status: newStatus })
                            }
                        );

                        const reservation = reservations.find(
                            item =>
                                String(item.reservation_id) === String(reservationId)
                        );

                        if (reservation) {
                            reservation.status = newStatus;
                        }

                        toast("Reservation updated.");
                        render();
                    } catch (error) {
                        toast(error.message, true);
                        button.disabled = false;
                    }
                });
            });
        }

        const search = $("#reservation-search");
        const statusFilter = $("#reservation-status-filter");

        if (search && !search.dataset.handlerAttached) {
            search.dataset.handlerAttached = "true";
            search.addEventListener("input", render);
        }

        if (statusFilter && !statusFilter.dataset.handlerAttached) {
            statusFilter.dataset.handlerAttached = "true";
            statusFilter.addEventListener("change", render);
        }

        render();
    } catch (error) {
        body.innerHTML = `
      <tr>
        <td colspan="5">
          Unable to load reservations: ${esc(error.message)}
        </td>
      </tr>
    `;
    }
}

/* =========================
   USERS AND PEOPLE MANAGEMENT
   ========================= */

async function loadUsers() {
    const body = $("#users-body");

    if (!body) return;

    try {
        users = await api("/users");
        users = Array.isArray(users) ? users : [];

        function render() {
            const query = ($("#users-search")?.value || "")
                .toLowerCase()
                .trim();

            const list = users.filter(user =>
                `${user.full_name} ${user.email} ${user.role}`
                    .toLowerCase()
                    .includes(query)
            );

            if ($("#users-total")) {
                $("#users-total").textContent = users.length;
            }

            if ($("#users-admin")) {
                $("#users-admin").textContent = users.filter(
                    user => user.role === "Admin"
                ).length;
            }

            if ($("#users-student")) {
                $("#users-student").textContent = users.filter(
                    user => user.role === "Student"
                ).length;
            }

            body.innerHTML = list.map(user => {
                const initials = (user.full_name || "?")
                    .split(/\s+/)
                    .map(part => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();

                return `
          <tr>
            <td>
              <b class="person">
                <span>${esc(initials)}</span>
                ${esc(user.full_name)}
              </b>
            </td>

            <td>${esc(user.email)}</td>
            <td>${badge(user.role)}</td>
            <td>#${esc(user.user_id)}</td>
          </tr>
        `;
            }).join("") || `
        <tr>
          <td colspan="4">No people found.</td>
        </tr>
      `;
        }

        const search = $("#users-search");

        if (search && !search.dataset.handlerAttached) {
            search.dataset.handlerAttached = "true";
            search.addEventListener("input", render);
        }

        const toggleButton = $("#toggle-user-form");

        if (toggleButton && !toggleButton.dataset.handlerAttached) {
            toggleButton.dataset.handlerAttached = "true";

            toggleButton.addEventListener("click", () => {
                $("#user-form-panel")?.classList.toggle("hidden");
            });
        }

        const closeButton = $("#close-user-form");

        if (closeButton && !closeButton.dataset.handlerAttached) {
            closeButton.dataset.handlerAttached = "true";

            closeButton.addEventListener("click", () => {
                $("#user-form-panel")?.classList.add("hidden");
            });
        }

        const form = $("#user-form");

        if (form && !form.dataset.handlerAttached) {
            form.dataset.handlerAttached = "true";

            form.addEventListener("submit", async event => {
                event.preventDefault();

                const message = $("#user-message");
                const submitButton = form.querySelector('[type="submit"]');

                const fullName = $("#user-name")?.value.trim();
                const email = $("#user-email")?.value.trim();
                const role = $("#user-role")?.value;

                if (!fullName || !email || !role) {
                    if (message) {
                        message.textContent = "Please complete all required fields.";
                        message.className = "error-text";
                    }

                    return;
                }

                if (submitButton) submitButton.disabled = true;

                try {
                    await api("/users", {
                        method: "POST",
                        body: JSON.stringify({
                            full_name: fullName,
                            email,
                            role
                        })
                    });

                    if (message) {
                        message.textContent = "Person added successfully.";
                        message.className = "success-text";
                    }

                    form.reset();

                    users = await api("/users");
                    users = Array.isArray(users) ? users : [];

                    render();

                    toast("Person added to BorrowBox.");
                } catch (error) {
                    if (message) {
                        message.textContent = error.message;
                        message.className = "error-text";
                    }
                } finally {
                    if (submitButton) submitButton.disabled = false;
                }
            });
        }

        render();
    } catch (error) {
        body.innerHTML = `
      <tr>
        <td colspan="4">
          Unable to load users: ${esc(error.message)}
        </td>
      </tr>
    `;
    }
}

/* =========================
   CARE AND MAINTENANCE
   ========================= */

async function loadMaintenance() {
    const body = $("#maintenance-body");

    if (!body) return;

    try {
        const results = await Promise.all([
            api("/maintenance"),
            api("/equipment")
        ]);

        repairs = Array.isArray(results[0]) ? results[0] : [];
        equipment = Array.isArray(results[1]) ? results[1] : [];

        const equipmentSelect = $("#maintenance-equipment");

        if (equipmentSelect) {
            const previousSelection = equipmentSelect.value;

            equipmentSelect.replaceChildren(
                new Option("Choose equipment", "")
            );

            equipment.forEach(item => {
                equipmentSelect.add(
                    new Option(item.name, id(item))
                );
            });

            if (
                previousSelection &&
                [...equipmentSelect.options].some(
                    option => option.value === previousSelection
                )
            ) {
                equipmentSelect.value = previousSelection;
            }
        }

        const maintenanceDate = $("#maintenance-date");

        if (maintenanceDate && !maintenanceDate.value) {
            maintenanceDate.value = today();
        }

        function render() {
            const query = ($("#maintenance-search")?.value || "")
                .toLowerCase()
                .trim();

            const selectedStatus =
                $("#maintenance-status-filter")?.value || "";

            const list = repairs.filter(item =>
                `${item.equipment_name} ${item.issue_description} ${item.status}`
                    .toLowerCase()
                    .includes(query) &&
                (!selectedStatus || item.status === selectedStatus)
            );

            if ($("#maintenance-pending")) {
                $("#maintenance-pending").textContent =
                    repairs.filter(item => item.status === "Pending").length;
            }

            if ($("#maintenance-progress")) {
                $("#maintenance-progress").textContent =
                    repairs.filter(item => item.status === "In Progress").length;
            }

            if ($("#maintenance-completed")) {
                $("#maintenance-completed").textContent =
                    repairs.filter(item => item.status === "Completed").length;
            }

            body.innerHTML = list.map(item => {
                const status = item.status || "Pending";

                const statusClass = status
                    .toLowerCase()
                    .replace(/\s+/g, "-");

                const statusControl =
                    admin() && status !== "Completed"
                        ? `
              <div class="maintenance-status-control">
                <select
                  class="maintenance-status-select status-${esc(statusClass)}"
                  data-repair="${esc(item.maintenance_id)}"
                  data-original-status="${esc(status)}"
                  aria-label="Update status for ${esc(item.equipment_name || "equipment")
                        }"
                >
                  <option value="Pending"
                    ${status === "Pending" ? "selected" : ""}>
                    Pending
                  </option>

                  <option value="In Progress"
                    ${status === "In Progress" ? "selected" : ""}>
                    In Progress
                  </option>

                  <option value="Completed"
                    ${status === "Completed" ? "selected" : ""}>
                    Completed
                  </option>
                </select>
              </div>
            `
                        : `
              <span class="maintenance-status-locked">
                ${status === "Completed" ? "✓ Completed" : "—"}
              </span>
            `;

                return `
          <tr>
            <td>
              <b>
                ${esc(
                    item.equipment_name ||
                    "Equipment #" + item.equipment_id
                )}
              </b>
            </td>

            <td>${esc(item.issue_description)}</td>
            <td>${date(item.maintenance_date)}</td>
            <td>${badge(status)}</td>
            <td>${statusControl}</td>
          </tr>
        `;
            }).join("") || `
        <tr>
          <td colspan="5">No maintenance issues found.</td>
        </tr>
      `;

            body.querySelectorAll("[data-repair]").forEach(select => {
                select.addEventListener("change", async () => {
                    const newStatus = select.value;
                    const previousStatus = select.dataset.originalStatus;
                    const repairId = select.dataset.repair;

                    if (!newStatus || newStatus === previousStatus) return;

                    select.disabled = true;
                    select.classList.add("is-saving");

                    try {
                        await api(`/maintenance/${repairId}/status`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: newStatus })
                        });

                        const repair = repairs.find(
                            item =>
                                String(item.maintenance_id) === String(repairId)
                        );

                        if (repair) {
                            repair.status = newStatus;
                        }

                        toast("Maintenance status updated.");
                        render();
                    } catch (error) {
                        toast(error.message || "Could not update status.", true);

                        select.value = previousStatus;
                        select.disabled = false;
                        select.classList.remove("is-saving");
                    }
                });
            });
        }

        const search = $("#maintenance-search");

        if (search && !search.dataset.handlerAttached) {
            search.dataset.handlerAttached = "true";
            search.addEventListener("input", render);
        }

        const statusFilter = $("#maintenance-status-filter");

        if (statusFilter && !statusFilter.dataset.handlerAttached) {
            statusFilter.dataset.handlerAttached = "true";
            statusFilter.addEventListener("change", render);
        }

        const toggleButton = $("#toggle-maintenance-form");

        if (toggleButton && !toggleButton.dataset.handlerAttached) {
            toggleButton.dataset.handlerAttached = "true";

            toggleButton.addEventListener("click", () => {
                $("#maintenance-form-panel")?.classList.toggle("hidden");
            });
        }

        const closeButton = $("#close-maintenance-form");

        if (closeButton && !closeButton.dataset.handlerAttached) {
            closeButton.dataset.handlerAttached = "true";

            closeButton.addEventListener("click", () => {
                $("#maintenance-form-panel")?.classList.add("hidden");
            });
        }

        const form = $("#maintenance-form");

        if (form && !form.dataset.maintenanceHandlerAttached) {
            form.dataset.maintenanceHandlerAttached = "true";

            form.addEventListener("submit", async event => {
                event.preventDefault();

                const message = $("#maintenance-message");

                const equipmentId =
                    $("#maintenance-equipment")?.value;

                const issue =
                    $("#maintenance-issue")?.value.trim();

                const reportedDate =
                    $("#maintenance-date")?.value;

                if (!equipmentId || !issue || !reportedDate) {
                    if (message) {
                        message.textContent =
                            "Please complete all required fields.";
                        message.className = "error-text";
                    }

                    return;
                }

                const submitButton =
                    form.querySelector('[type="submit"]');

                if (submitButton) submitButton.disabled = true;

                try {
                    await api("/maintenance", {
                        method: "POST",
                        body: JSON.stringify({
                            equipment_id: Number(equipmentId),
                            issue_description: issue,
                            maintenance_date: reportedDate
                        })
                    });

                    if (message) {
                        message.textContent = "Issue report saved.";
                        message.className = "success-text";
                    }

                    form.reset();

                    if ($("#maintenance-date")) {
                        $("#maintenance-date").value = today();
                    }

                    toast("Maintenance issue reported.");

                    await loadMaintenance();
                } catch (error) {
                    if (message) {
                        message.textContent = error.message;
                        message.className = "error-text";
                    }
                } finally {
                    if (submitButton) submitButton.disabled = false;
                }
            });
        }

        render();
    } catch (error) {
        body.innerHTML = `
      <tr>
        <td colspan="5">
          Unable to load maintenance records: ${esc(error.message)}
        </td>
      </tr>
    `;
    }
}

/* =========================
   APPLICATION INITIALIZATION
   ========================= */

document.addEventListener("DOMContentLoaded", async () => {
    const allowed = await guardPage();

    if (!allowed) return;

    setup();

    // Each function checks whether its page elements exist.
    // This allows the same app.js file to serve multiple pages.
    loadDashboard();
    loadCatalogue();
    setupBorrow();
    loadHistory();
    loadReservations();
    loadUsers();
    loadMaintenance();

    if (
        new URLSearchParams(location.search).get("denied") === "admin"
    ) {
        toast("Administrator access required.", true);
    }
});