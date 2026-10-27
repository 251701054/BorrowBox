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
let equipment=[],users=[],loans=[],reservations=[],repairs=[],toastTimer;
const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>{if(!v)return "—";let d=new Date(String(v).slice(0,10)+"T00:00:00");return isNaN(d)?"—":d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})};
const qty=x=>Number(x.available_quantity??0), id=x=>x.equipment_id??x.id;
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
function toast(msg,error=false){let n=$("#toast-region");if(!n){alert(msg);return}n.innerHTML=`<div class="toast ${error?"error":""}">${error?"!":"✓"} &nbsp; ${esc(msg)}</div>`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.replaceChildren(),3500)}
function badge(s){let c=String(s||"unknown").toLowerCase().replace(/[^a-z]+/g,"-");return `<span class="badge ${c}">${esc(s||"Unknown")}</span>`}
function symbol(x){let s=((x.category||"")+" "+(x.name||"")).toLowerCase();return /camera|photo|lens/.test(s)?"◉":/audio|microphone|speaker|headphone/.test(s)?"♫":/laptop|computer|tablet/.test(s)?"▱":/projector|presentation|screen/.test(s)?"▣":/storage|usb|drive/.test(s)?"▤":"⬡"}
function art(x,i=0){return `<div class="gear-art art-${["blue","purple","mint","orange"][i%4]}"><span>${symbol(x)}</span><small>BB / ${String(id(x)||i+1).padStart(3,"0")}</small></div>`}
function setup() {
  $("#menu")?.addEventListener("click", () => $("#sidebar")?.classList.toggle("open"));

  const roleSelect = $("#role-switcher");
  if (roleSelect && currentUser) {
    roleSelect.value = currentUser.role;
    roleSelect.disabled = true;
  }

  const avatar = $(".avatar");
  if (avatar && currentUser) {
    avatar.textContent = (currentUser.full_name || "U").trim().charAt(0).toUpperCase();
    avatar.title = currentUser.full_name || "";
  }

  $$(".admin-only").forEach(el => el.classList.toggle("hidden", !admin()));
  if (!admin()) {
    $$('a[href="users.html"], a[href="maintenance.html"]').forEach(link => link.classList.add("hidden"));
  }

  const topRight = $(".top-right");
  if (topRight && !$("#logout-button")) {
    const logout = document.createElement("button");
    logout.id = "logout-button";
    logout.type = "button";
    logout.className = "btn secondary";
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
async function loadDashboard(){if(!$("#featured-equipment"))return;try{[equipment,loans]=await Promise.all([api("/equipment"),api("/borrowings").catch(()=>[])]);equipment=Array.isArray(equipment)?equipment:[];loans=Array.isArray(loans)?loans:[];let active=loans.filter(x=>x.status==="Borrowed"),late=active.filter(x=>String(x.due_date).slice(0,10)<today());$("#stat-total").textContent=equipment.length;$("#stat-available").textContent=equipment.reduce((n,x)=>n+qty(x),0);$("#stat-active").textContent=active.length;$("#stat-overdue").textContent=late.length;let top=[...equipment].sort((a,b)=>qty(b)-qty(a)).slice(0,4);$("#featured-equipment").innerHTML=top.length?top.map((x,i)=>`<article class="feature">${art(x,i)}<h3>${esc(x.name)}</h3><p>${esc(x.category)}</p><div class="feature-foot"><span class="${qty(x)?"available":"unavailable"}">● ${qty(x)} available</span><a class="circle" href="borrow.html?equipment_id=${encodeURIComponent(id(x))}">↗</a></div></article>`).join(""):`<p>No equipment found in database.</p>`;$("#recent-activity").innerHTML=loans.slice(0,5).map(x=>`<div class="activity"><span class="activity-icon">${symbol({name:x.equipment_name})}</span><div><b>${esc(x.equipment_name||"Equipment")} ${x.status==="Returned"?"returned":"borrowed"}</b><p>${esc(x.full_name||"Borrower")} · Due ${date(x.due_date)}</p></div>${badge(x.status)}</div>`).join("")||"<p>No borrowing activity yet.</p>"}catch(e){$("#featured-equipment").innerHTML=`<div class="empty"><b>Can't reach BorrowBox API.</b><p>Start the backend with <code>npm start</code>, then refresh.</p><small>${esc(e.message)}</small></div>`;$("#recent-activity").innerHTML="<p>Activity appears when the API is connected.</p>"}}
async function loadCatalogue() {
  const grid = $("#equipment-grid");
  if (!grid) return;

  const search = $("#equipment-search");
  const category = $("#category-filter");
  const availability = $("#availability-filter");
  const count = $("#catalogue-count");
  const chips = $("#category-chips");

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

    chips.innerHTML = '<button type="button" class="chip selected" data-category="">Everything</button>' +
      categories.map(value => `<button type="button" class="chip" data-category="${esc(value)}">${esc(value)}</button>`).join("");

    function render() {
      const q = search.value.toLowerCase().trim();
      const c = category.value;
      const a = availability.value;
      const list = equipment.filter(item =>
        (`${item.name || ""} ${item.category || ""} ${item.description || ""}`).toLowerCase().includes(q) &&
        (!c || item.category === c) &&
        (a === "all" || (a === "available" ? qty(item) > 0 : qty(item) <= 0))
      );

      count.textContent = `${list.length} item${list.length === 1 ? "" : "s"} found`;
      grid.innerHTML = list.length ? list.map((item, i) =>
        `<article class="catalogue-card">${art(item, i)}<div class="catalogue-body">
          <small>${esc(item.category || "UNCATEGORISED")} · #${esc(id(item))}</small>
          <h3>${esc(item.name || "Equipment")}</h3>
          <p>${esc(item.description || "A shared resource for your next project.")}</p>
          <div class="catalogue-foot"><span class="${qty(item) > 0 ? "available" : "unavailable"}">● ${qty(item) > 0 ? qty(item) + " available" : "Currently unavailable"}</span>
          ${qty(item) > 0 ? `<a class="btn tiny" href="borrow.html?equipment_id=${encodeURIComponent(id(item))}">Request item →</a>` : '<span class="badge overdue">Unavailable</span>'}</div>
        </div></article>`
      ).join("") : '<div class="empty wide"><b>No gear matches that search.</b><p>Try another name or category, or clear your filters.</p><button class="btn secondary" id="clear-filters" type="button">Clear filters</button></div>';

      chips.querySelectorAll("[data-category]").forEach(button =>
        button.classList.toggle("selected", button.dataset.category === category.value)
      );
      $("#clear-filters")?.addEventListener("click", () => {
        search.value = "";
        category.value = "";
        availability.value = "all";
        render();
      }, { once: true });
    }

    search.addEventListener("input", render);
    category.addEventListener("change", render);
    availability.addEventListener("change", render);
    chips.addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      category.value = button.dataset.category;
      render();
    });
    render();
  } catch (error) {
    grid.innerHTML = `<div class="empty wide"><b>Catalogue unavailable.</b><p>Check that the BorrowBox backend API is reachable.</p><small>${esc(error.message)}</small></div>`;
  }
}
async function setupBorrow(){let f=$("#borrow-form");if(!f)return;let bd=$("#borrow-date"),dd=$("#due-date"),sel=$("#equipment-id"),t=today(),n=new Date();n.setDate(n.getDate()+7);let next=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;bd.min=t;bd.value=t;dd.min=t;dd.value=next;bd.addEventListener("change",()=>{dd.min=bd.value;if(dd.value<=bd.value){let d=new Date(bd.value+"T00:00:00");d.setDate(d.getDate()+7);dd.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}});try{equipment=await api("/equipment");equipment.forEach(x=>{let o=new Option(`${x.name} · ${qty(x)} available`,id(x));o.disabled=qty(x)<=0;sel.add(o)});let wanted=new URLSearchParams(location.search).get("equipment_id");if(wanted)sel.value=wanted;sel.addEventListener("change",()=>{let x=equipment.find(x=>String(id(x))===sel.value);$("#selected-equipment-hint").textContent=x?`${x.category} · ${qty(x)} currently available`:"Select an item to check availability."})}catch(e){$("#borrow-message").textContent="Could not load equipment. Check your backend."}f.addEventListener("submit",async e=>{e.preventDefault();let m=$("#borrow-message"),b=$("#submit-borrow");if(dd.value<=bd.value){m.textContent="Expected return date must be after borrow date.";m.className="error-text";return}b.disabled=true;b.textContent="Sending request…";try{await api("/borrowings",{method:"POST",body:JSON.stringify({user_id:Number($("#user-id").value),equipment_id:Number(sel.value),borrow_date:bd.value,due_date:dd.value})});m.textContent="Request submitted. Track it in My Borrowings.";m.className="success-text";toast("Borrowing request submitted.");f.reset();bd.value=t;dd.value=next}catch(err){m.textContent=err.message;m.className="error-text"}finally{b.disabled=false;b.textContent="Send borrowing request →"}})}
async function loadHistory(){let body=$("#history-body");if(!body)return;try{loans=await api("/borrowings");loans=Array.isArray(loans)?loans:[];let active=loans.filter(x=>x.status==="Borrowed");$("#history-total").textContent=loans.length;$("#history-active").textContent=active.length;$("#history-overdue").textContent=active.filter(x=>String(x.due_date).slice(0,10)<today()).length;function render(){let q=($("#history-search")?.value||"").toLowerCase(),list=loans.filter(x=>`${x.equipment_name} ${x.full_name} ${x.status}`.toLowerCase().includes(q));body.innerHTML=list.map(x=>{let s=x.status==="Borrowed"&&String(x.due_date).slice(0,10)<today()?"Overdue":x.status;return `<tr><td><b>${esc(x.equipment_name||"Equipment")}</b><small>ID #${esc(x.equipment_id)}</small></td><td>${esc(x.full_name||"Unknown")}</td><td>${date(x.borrow_date)}</td><td>${date(x.due_date)}</td><td>${badge(s)}</td><td>${admin()&&x.status==="Borrowed"?`<button class="table-action" data-return="${esc(x.borrowing_id)}">Mark returned ↗</button>`:"—"}</td></tr>`}).join("")||'<tr><td colspan="6">No borrowing records found.</td></tr>';body.querySelectorAll("[data-return]").forEach(b=>b.onclick=async()=>{if(!confirm("Confirm this equipment has been returned?"))return;try{await api(`/borrowings/${b.dataset.return}/return`,{method:"PATCH"});toast("Equipment marked as returned.");loadHistory()}catch(e){toast(e.message,true)}})}$("#history-search")?.addEventListener("input",render);render()}catch(e){body.innerHTML=`<tr><td colspan="6">Unable to load records: ${esc(e.message)}</td></tr>`}}
async function loadReservations(){let body=$("#reservation-body");if(!body)return;try{reservations=await api("/reservations");reservations=Array.isArray(reservations)?reservations:[];function render(){let q=($("#reservation-search")?.value||"").toLowerCase(),s=$("#reservation-status-filter")?.value||"",list=reservations.filter(x=>`${x.full_name} ${x.equipment_name} ${x.status}`.toLowerCase().includes(q)&&(!s||x.status===s));$("#reservation-count").textContent=list.length+" requests";body.innerHTML=list.map(x=>`<tr><td><b>${esc(x.full_name||"Unknown")}</b><small>User #${esc(x.user_id)}</small></td><td>${esc(x.equipment_name||"Equipment")}</td><td>${date(x.reservation_date)}</td><td>${badge(x.status)}</td><td>${admin()&&x.status==="Pending"?`<button class="table-action" data-status="Approved" data-id="${esc(x.reservation_id)}">Approve</button> <button class="table-action danger" data-status="Cancelled" data-id="${esc(x.reservation_id)}">Reject</button>`:"—"}</td></tr>`).join("")||'<tr><td colspan="5">No reservations match these filters.</td></tr>';body.querySelectorAll("[data-status]").forEach(b=>b.onclick=async()=>{try{await api(`/reservations/${b.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});toast("Reservation updated.");loadReservations()}catch(e){toast(e.message,true)}})}$("#reservation-search")?.addEventListener("input",render);$("#reservation-status-filter")?.addEventListener("change",render);render()}catch(e){body.innerHTML=`<tr><td colspan="5">Unable to load reservations: ${esc(e.message)}</td></tr>`}}
async function loadUsers(){
  let body=$("#users-body");
  if(!body)return;
  try{
    users=await api("/users");
    users=Array.isArray(users)?users:[];
    function render(){
      let q=($("#users-search")?.value||"").toLowerCase();
      let list=users.filter(x=>`${x.full_name} ${x.email} ${x.role}`.toLowerCase().includes(q));
      $("#users-total").textContent=users.length;
      $("#users-admin").textContent=users.filter(x=>x.role==="Admin").length;
      $("#users-student").textContent=users.filter(x=>x.role==="Student").length;
      body.innerHTML=list.map(x=>`<tr>
        <td><b class="person"><span>${esc((x.full_name||"?").split(/\s+/).map(y=>y[0]).slice(0,2).join("").toUpperCase())}</span>${esc(x.full_name)}</b></td>
        <td>${esc(x.email)}</td>
        <td>${admin()?`<select class="inline-select user-role-select" data-role-user="${esc(x.user_id)}" aria-label="Role for ${esc(x.full_name)}"><option value="Student" ${x.role==="Student"?"selected":""}>Student</option><option value="Staff" ${x.role==="Staff"?"selected":""}>Staff</option><option value="Admin" ${x.role==="Admin"?"selected":""}>Admin</option></select>`:badge(x.role)}</td>
        <td>#${esc(x.user_id)}</td>
        <td>${admin()&&Number(x.user_id)!==Number(currentUser?.user_id)?`<button class="table-action danger" data-delete-user="${esc(x.user_id)}">Remove</button>`:"—"}</td>
      </tr>`).join("")||'<tr><td colspan="5">No people found.</td></tr>';

      body.querySelectorAll("[data-role-user]").forEach(sel=>sel.addEventListener("change",async()=>{
        const previous=users.find(u=>String(u.user_id)===sel.dataset.roleUser)?.role;
        if(!previous||!confirm(`Change this user's role from ${previous} to ${sel.value}?`)){sel.value=previous||"Student";return}
        sel.disabled=true;
        try{
          await api(`/users/${sel.dataset.roleUser}/role`,{method:"PATCH",body:JSON.stringify({role:sel.value})});
          toast("User role updated.");
          users=await api("/users");render();
        }catch(err){toast(err.message,true);sel.value=previous}
        finally{sel.disabled=false}
      }));
      body.querySelectorAll("[data-delete-user]").forEach(btn=>btn.addEventListener("click",async()=>{
        const person=users.find(u=>String(u.user_id)===btn.dataset.deleteUser);
        if(!person||!confirm(`Remove ${person.full_name} from BorrowBox? This cannot be undone.`))return;
        btn.disabled=true;
        try{
          await api(`/users/${btn.dataset.deleteUser}`,{method:"DELETE"});
          toast("User removed.");
          users=await api("/users");render();
        }catch(err){toast(err.message,true)}
        finally{btn.disabled=false}
      }));
    }
    $("#users-search")?.addEventListener("input",render);
    render();
    $("#toggle-user-form")?.addEventListener("click",()=>$("#user-form-panel").classList.toggle("hidden"));
    $("#close-user-form")?.addEventListener("click",()=>$("#user-form-panel").classList.add("hidden"));
    $("#user-form")?.addEventListener("submit",async e=>{
      e.preventDefault();
      let m=$("#user-message");
      try{
        await api("/users",{method:"POST",body:JSON.stringify({full_name:$("#user-name").value.trim(),email:$("#user-email").value.trim(),role:$("#user-role").value})});
        m.textContent="Person added successfully.";m.className="success-text";
        e.target.reset();users=await api("/users");render();toast("Person added to BorrowBox.");
      }catch(err){m.textContent=err.message;m.className="error-text"}
    });
  }catch(e){body.innerHTML=`<tr><td colspan="5">Unable to load users: ${esc(e.message)}</td></tr>`}
}
async function loadMaintenance(){let body=$("#maintenance-body");if(!body)return;try{[repairs,equipment]=await Promise.all([api("/maintenance"),api("/equipment")]);repairs=Array.isArray(repairs)?repairs:[];equipment=Array.isArray(equipment)?equipment:[];let sel=$("#maintenance-equipment");equipment.forEach(x=>sel.add(new Option(x.name,id(x))));$("#maintenance-date").value=today();function render(){let q=($("#maintenance-search")?.value||"").toLowerCase(),s=$("#maintenance-status-filter")?.value||"",list=repairs.filter(x=>`${x.equipment_name} ${x.issue_description} ${x.status}`.toLowerCase().includes(q)&&(!s||x.status===s));$("#maintenance-pending").textContent=repairs.filter(x=>x.status==="Pending").length;$("#maintenance-progress").textContent=repairs.filter(x=>x.status==="In Progress").length;$("#maintenance-completed").textContent=repairs.filter(x=>x.status==="Completed").length;body.innerHTML=list.map(x=>`<tr><td><b>${esc(x.equipment_name||"Equipment #"+x.equipment_id)}</b></td><td>${esc(x.issue_description)}</td><td>${date(x.maintenance_date)}</td><td>${badge(x.status)}</td><td>${admin()&&x.status!=="Completed"?`<div class="maintenance-action" data-maintenance-action><button type="button" class="maintenance-update-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Change status for ${esc(x.equipment_name||"equipment")}"><span>Change status</span><span class="maintenance-chevron" aria-hidden="true">⌄</span></button><div class="maintenance-update-menu" hidden role="group" aria-label="Choose maintenance status">${["Pending","In Progress","Completed"].filter(status=>status!==x.status).map(status=>`<button type="button" class="maintenance-option" data-repair="${esc(x.maintenance_id)}" data-status="${status}"><span class="maintenance-dot ${status.toLowerCase().replace(/ /g,"-")}"></span>${status}</button>`).join("")}</div></div>`:"—"}</td></tr>`).join("")||'<tr><td colspan="5">No maintenance issues found.</td></tr>';body.querySelectorAll("[data-maintenance-action]").forEach(action=>{const trigger=action.querySelector(".maintenance-update-trigger"),menu=action.querySelector(".maintenance-update-menu");trigger.addEventListener("click",()=>{const open=menu.hidden;body.querySelectorAll(".maintenance-update-menu").forEach(other=>{other.hidden=true;other.previousElementSibling?.setAttribute("aria-expanded","false")});menu.hidden=!open;if(open){const rect=trigger.getBoundingClientRect();const width=210;const left=Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12));const below=window.innerHeight-rect.bottom>155;menu.style.left=`${left}px`;menu.style.top=below?`${rect.bottom+8}px`:"auto";menu.style.bottom=below?"auto":`${window.innerHeight-rect.top+8}px`;}trigger.setAttribute("aria-expanded",String(open))});menu.querySelectorAll("[data-repair]").forEach(button=>button.addEventListener("click",async()=>{if(button.disabled)return;const previous=trigger.innerHTML;trigger.disabled=true;trigger.textContent="Updating…";menu.hidden=true;try{await api(`/maintenance/${button.dataset.repair}/status`,{method:"PATCH",body:JSON.stringify({status:button.dataset.status})});toast("Maintenance status updated.");await loadMaintenance()}catch(e){toast(e.message,true);trigger.disabled=false;trigger.innerHTML=previous;trigger.setAttribute("aria-expanded","false")}}))})}$("#maintenance-search")?.addEventListener("input",render);$("#maintenance-status-filter")?.addEventListener("change",render);render();$("#toggle-maintenance-form")?.addEventListener("click",()=>$("#maintenance-form-panel").classList.toggle("hidden"));$("#close-maintenance-form")?.addEventListener("click",()=>$("#maintenance-form-panel").classList.add("hidden"));$("#maintenance-form")?.addEventListener("submit",async e=>{e.preventDefault();let m=$("#maintenance-message");try{await api("/maintenance",{method:"POST",body:JSON.stringify({equipment_id:Number(sel.value),issue_description:$("#maintenance-issue").value.trim(),maintenance_date:$("#maintenance-date").value})});m.textContent="Issue report saved.";m.className="success-text";e.target.reset();$("#maintenance-date").value=today();toast("Maintenance issue reported.");loadMaintenance()}catch(err){m.textContent=err.message;m.className="error-text"}})}catch(e){body.innerHTML=`<tr><td colspan="5">Unable to load maintenance records: ${esc(e.message)}</td></tr>`}}
document.addEventListener("DOMContentLoaded", () => {
  if (!currentUser || !token()) {
    location.replace("login.html");
    return;
  }

  // Students must not open administrator-only pages.
  const adminPage = ["users.html", "maintenance.html"].some(page => location.pathname.endsWith(page));
  if (adminPage && !admin()) {
    location.replace("index.html");
    return;
  }

  setup();
  const userIdInput = $("#user-id");
  if (userIdInput) {
    userIdInput.value = currentUser.user_id;
    userIdInput.readOnly = true;
  }

  loadDashboard();
  loadCatalogue();
  setupBorrow();
  loadHistory();
  loadReservations();
  loadUsers();
  loadMaintenance();
});

// Close maintenance action menus when the user clicks outside.
document.addEventListener("click",event=>{if(event.target.closest("[data-maintenance-action]"))return;document.querySelectorAll(".maintenance-update-menu").forEach(menu=>{menu.hidden=true;menu.previousElementSibling?.setAttribute("aria-expanded","false")})});

// Keep floating maintenance menus from covering unrelated rows while scrolling.
window.addEventListener("scroll",()=>{document.querySelectorAll(".maintenance-update-menu").forEach(menu=>{menu.hidden=true;menu.previousElementSibling?.setAttribute("aria-expanded","false")})},true);
