// SkillHub Admin Dashboard
var API_BASE = "https://skillhub-backend-i3dr.onrender.com/api";
var adminToken = localStorage.getItem("skillhub_admin_token");

// ===== AUTH =====
async function adminLogin() {
    var email = document.getElementById("adminEmail").value.trim();
    var password = document.getElementById("adminPassword").value;
    var errEl = document.getElementById("loginError");
    errEl.style.display = "none";

    try {
        var res = await fetch(API_BASE + "/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email, password: password })
        });
        var data = await res.json();

        if (!data.success) {
            errEl.textContent = data.message || "Invalid credentials";
            errEl.style.display = "block";
            return;
        }

        if (data.user.role !== "admin") {
            errEl.textContent = "Access denied. Admin accounts only.";
            errEl.style.display = "block";
            return;
        }

        adminToken = data.token;
        localStorage.setItem("skillhub_admin_token", adminToken);
        document.getElementById("adminNameDisplay").textContent = data.user.name;
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("dashboard").style.display = "block";
        loadOverview();
        loadPendingCount();
    } catch (err) {
        errEl.textContent = "Cannot reach server. Try again.";
        errEl.style.display = "block";
    }
}

function adminLogout() {
    localStorage.removeItem("skillhub_admin_token");
    adminToken = null;
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
}

// Auto-login if token exists
if (adminToken) {
    fetch(API_BASE + "/auth/me", {
        headers: { "Authorization": "Bearer " + adminToken }
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success && data.user.role === "admin") {
            document.getElementById("adminNameDisplay").textContent = data.user.name;
            document.getElementById("loginScreen").style.display = "none";
            document.getElementById("dashboard").style.display = "block";
            loadOverview();
        } else {
            localStorage.removeItem("skillhub_admin_token");
        }
    }).catch(function() {});
}

// ===== API HELPER =====
async function apiGet(endpoint) {
    var res = await fetch(API_BASE + endpoint, {
        headers: { "Authorization": "Bearer " + adminToken }
    });
    return await res.json();
}

async function apiPut(endpoint, body) {
    var res = await fetch(API_BASE + endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify(body)
    });
    return await res.json();
}

// ===== TABS =====
function showTab(name, e) {
    document.querySelectorAll(".tab-content").forEach(function(t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
    document.getElementById("tab-" + name).classList.add("active");
    if (e && e.target) e.target.classList.add("active");

    if (name === "overview") loadOverview();
    else if (name === "pending") loadPending();
    else if (name === "users") loadUsers();
    else if (name === "freelancers") loadFreelancers();
    else if (name === "courses") loadCourses();
    else if (name === "transactions") loadTransactions();
    else if (name === "messages") loadMessages();
}

// ===== PENDING APPROVALS =====
async function loadPending() {
    var el = document.getElementById("pendingTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    try {
        var data = await apiGet("/admin/pending");
        if (!data.success) { el.innerHTML = "<p style='padding:1rem;'>Failed to load.</p>"; return; }

        var instructors = data.pending.instructors || [];
        var freelancers = data.pending.freelancers || [];
        var courses = data.pending.courses || [];
        var total = instructors.length + freelancers.length + courses.length;

        // Update badge
        var badge = document.getElementById("pendingCount");
        if (badge) badge.textContent = total > 0 ? total : "";

        if (total === 0) {
            el.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'><i class='fas fa-check-circle' style='color:#10b981;font-size:2rem;display:block;margin-bottom:0.5rem;'></i>No pending approvals. All caught up!</p>";
            return;
        }

        var html = "";

        if (instructors.length > 0) {
            html += "<div style='padding:1rem 1.5rem;background:#eff6ff;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1e40af;'><i class='fas fa-chalkboard-teacher'></i> Pending Instructors (" + instructors.length + ")</div>";
            html += "<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Actions</th></tr></thead><tbody>";
            html += instructors.map(function(u) {
                return "<tr>" +
                    "<td>" + esc(u.name) + "</td>" +
                    "<td>" + esc(u.email) + "</td>" +
                    "<td>" + esc(u.phone || "-") + "</td>" +
                    "<td>" + new Date(u.createdAt).toLocaleDateString() + "</td>" +
                    "<td>" +
                    "<button class='action-btn btn-approve' onclick='approveUser(\"" + u._id + "\", \"instructor\")'>✓ Approve</button>" +
                    "<button class='action-btn btn-reject' onclick='rejectUser(\"" + u._id + "\")'>✗ Reject</button>" +
                    "</td></tr>";
            }).join("") + "</tbody></table>";
        }

        if (freelancers.length > 0) {
            html += "<div style='padding:1rem 1.5rem;background:#f5f3ff;border-bottom:1px solid #e2e8f0;font-weight:700;color:#5b21b6;margin-top:1rem;'><i class='fas fa-laptop-code'></i> Pending Freelancers (" + freelancers.length + ")</div>";
            html += "<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Skills</th><th>Joined</th><th>Actions</th></tr></thead><tbody>";
            html += freelancers.map(function(u) {
                return "<tr>" +
                    "<td>" + esc(u.name) + "</td>" +
                    "<td>" + esc(u.email) + "</td>" +
                    "<td>" + esc(u.phone || "-") + "</td>" +
                    "<td>" + esc((u.skills || []).join(", ") || "-") + "</td>" +
                    "<td>" + new Date(u.createdAt).toLocaleDateString() + "</td>" +
                    "<td>" +
                    "<button class='action-btn btn-approve' onclick='approveUser(\"" + u._id + "\", \"freelancer\")'>✓ Approve</button>" +
                    "<button class='action-btn btn-reject' onclick='rejectUser(\"" + u._id + "\")'>✗ Reject</button>" +
                    "</td></tr>";
            }).join("") + "</tbody></table>";
        }

        if (courses.length > 0) {
            html += "<div style='padding:1rem 1.5rem;background:#fef3c7;border-bottom:1px solid #e2e8f0;font-weight:700;color:#92400e;margin-top:1rem;'><i class='fas fa-book'></i> Pending Courses (" + courses.length + ")</div>";
            html += "<table><thead><tr><th>Title</th><th>Instructor</th><th>Price</th><th>Actions</th></tr></thead><tbody>";
            html += courses.map(function(c) {
                return "<tr>" +
                    "<td>" + esc(c.title) + "</td>" +
                    "<td>" + esc(c.instructorName || "-") + "</td>" +
                    "<td>$" + (c.price || 0) + "</td>" +
                    "<td>" +
                    "<button class='action-btn btn-approve' onclick='approveCourseFromPending(\"" + c._id + "\")'>✓ Approve</button>" +
                    "<button class='action-btn btn-reject' onclick='rejectCourse(\"" + c._id + "\")'>✗ Reject</button>" +
                    "</td></tr>";
            }).join("") + "</tbody></table>";
        }

        el.innerHTML = html;
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function approveUser(id, role) {
    try {
        await apiPut("/admin/approve-user/" + id, { role: role });
        alert((role === "instructor" ? "Instructor" : "Freelancer") + " approved! They are now active.");
        loadPending();
        // Update badge
        loadOverview();
    } catch(e) { alert("Error: " + e.message); }
}

async function rejectUser(id) {
    var reason = prompt("Reason for rejection (will be shown to user):");
    if (reason === null) return;
    try {
        await apiPut("/admin/reject-user/" + id, { reason: reason || "Application not approved." });
        alert("User rejected.");
        loadPending();
    } catch(e) { alert("Error: " + e.message); }
}

async function approveCourseFromPending(id) {
    await apiPut("/admin/approve-course/" + id, {});
    alert("Course approved and published!");
    loadPending();
}
async function loadOverview() {
    var grid = document.getElementById("statsGrid");
    grid.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading stats...</div>";
    try {
        var data = await apiGet("/admin/stats");
        if (!data.success) { grid.innerHTML = "<p>Failed to load stats.</p>"; return; }
        var s = data.stats;
        grid.innerHTML =
            statCard("fa-users", s.totalUsers || 0, "Total Users", "") +
            statCard("fa-user-graduate", (s.totalUsers - (s.pendingInstructors || 0) - (s.pendingFreelancers || 0)) || 0, "Learners", "green") +
            statCard("fa-chalkboard-teacher", s.pendingInstructors || 0, "Pending Instructors", "yellow") +
            statCard("fa-laptop-code", s.pendingFreelancers || 0, "Pending Freelancers", "purple") +
            statCard("fa-book", s.totalCourses || 0, "Published Courses", "green") +
            statCard("fa-clock", s.pendingCourses || 0, "Pending Courses", "yellow") +
            statCard("fa-money-bill", s.totalTransactions || 0, "Total Transactions", "purple") +
            statCard("fa-wallet", (s.totalRevenue || 0) + " ETB", "Total Revenue", "green");
    } catch (err) {
        grid.innerHTML = "<p style='color:red;padding:1rem;'>Error loading stats: " + err.message + "</p>";
    }
}

function statCard(icon, value, label, color) {
    return "<div class='stat-card " + color + "'>" +
        "<i class='fas " + icon + "'></i>" +
        "<h3>" + value + "</h3>" +
        "<p>" + label + "</p>" +
        "</div>";
}

// ===== USERS =====
async function loadUsers() {
    var el = document.getElementById("usersTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    try {
        var data = await apiGet("/admin/users?limit=100");
        if (!data.success || !data.users.length) { el.innerHTML = "<p style='padding:1rem;'>No users found.</p>"; return; }
        var rows = data.users.map(function(u) {
            return "<tr>" +
                "<td>" + esc(u.name) + "</td>" +
                "<td>" + esc(u.email) + "</td>" +
                "<td>" + esc(u.phone || "-") + "</td>" +
                "<td><span class='badge badge-" + u.role + "'>" + u.role + "</span></td>" +
                "<td><span class='badge badge-" + u.status + "'>" + u.status + "</span></td>" +
                "<td>" + new Date(u.createdAt).toLocaleDateString() + "</td>" +
                "<td>" +
                    (u.status !== "suspended" ? "<button class='action-btn btn-suspend' onclick='suspendUser(\"" + u._id + "\")'>Suspend</button>" : "") +
                    "<button class='action-btn btn-view' onclick='viewUser(" + JSON.stringify(u).replace(/'/g, "&#39;") + ")'>View</button>" +
                "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function suspendUser(id) {
    if (!confirm("Suspend this user?")) return;
    await apiPut("/admin/reject-user/" + id, { reason: "Suspended by admin" });
    loadUsers();
}

function viewUser(u) {
    document.getElementById("modalContent").innerHTML =
        "<h3>" + esc(u.name) + "</h3>" +
        detail("Email", u.email) +
        detail("Phone", u.phone || "-") +
        detail("Role", u.role) +
        detail("Status", u.status) +
        detail("Country", u.country || "-") +
        detail("Wallet", (u.walletBalance || 0) + " ETB") +
        detail("Joined", new Date(u.createdAt).toLocaleString());
    document.getElementById("detailModal").classList.add("active");
}

// ===== FREELANCERS =====
async function loadFreelancers() {
    var el = document.getElementById("freelancersTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    try {
        var data = await apiGet("/freelancers?limit=100");
        if (!data.freelancers || !data.freelancers.length) { el.innerHTML = "<p style='padding:1rem;'>No freelancers found.</p>"; return; }
        var rows = data.freelancers.map(function(f) {
            var name = f.userId ? f.userId.name : "Unknown";
            var phone = f.userId ? f.userId.phone : "-";
            return "<tr>" +
                "<td>" + esc(name) + "</td>" +
                "<td>" + esc(f.title || "-") + "</td>" +
                "<td>" + esc((f.skills || []).join(", ") || "-") + "</td>" +
                "<td>" + (f.hourlyRate || 0) + " ETB/hr</td>" +
                "<td><span class='badge badge-" + f.status + "'>" + f.status + "</span></td>" +
                "<td>" +
                    (f.status === "pending" ? "<button class='action-btn btn-approve' onclick='approveFreelancer(\"" + f._id + "\")'>Approve</button>" : "") +
                    (f.status === "pending" ? "<button class='action-btn btn-reject' onclick='rejectFreelancer(\"" + f._id + "\")'>Reject</button>" : "") +
                "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Name</th><th>Title</th><th>Skills</th><th>Rate</th><th>Status</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function approveFreelancer(id) {
    await apiPut("/admin/approve-user/" + id, { role: "freelancer" });
    alert("Freelancer approved!");
    loadFreelancers();
}

async function rejectFreelancer(id) {
    var reason = prompt("Reason for rejection:");
    if (!reason) return;
    await apiPut("/admin/reject-user/" + id, { reason: reason });
    loadFreelancers();
}

// ===== COURSES =====
async function loadCourses() {
    var el = document.getElementById("coursesTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    try {
        var data = await apiGet("/admin/pending");
        var allCourses = [];
        if (data.success) {
            allCourses = data.pending.courses || [];
        }
        var published = await apiGet("/courses?limit=100");
        if (published.courses) allCourses = allCourses.concat(published.courses);

        if (!allCourses.length) { el.innerHTML = "<p style='padding:1rem;'>No courses found.</p>"; return; }
        var rows = allCourses.map(function(c) {
            return "<tr>" +
                "<td>" + esc(c.title) + "</td>" +
                "<td>" + esc(c.instructorName || "-") + "</td>" +
                "<td>" + (c.price || 0) + " ETB</td>" +
                "<td>" + esc(c.category || "-") + "</td>" +
                "<td><span class='badge badge-" + c.status + "'>" + c.status + "</span></td>" +
                "<td>" +
                    (c.status === "pending" ? "<button class='action-btn btn-approve' onclick='approveCourse(\"" + c._id + "\")'>Approve</button>" : "") +
                    (c.status === "pending" ? "<button class='action-btn btn-reject' onclick='rejectCourse(\"" + c._id + "\")'>Reject</button>" : "") +
                "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Title</th><th>Instructor</th><th>Price</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function approveCourse(id) {
    await apiPut("/admin/approve-course/" + id, {});
    alert("Course approved and published!");
    loadCourses();
}

async function rejectCourse(id) {
    var reason = prompt("Reason for rejection:");
    if (!reason) return;
    await apiPut("/admin/reject-course/" + id, { reason: reason });
    loadCourses();
}

// ===== TRANSACTIONS =====
async function loadTransactions() {
    var el = document.getElementById("transactionsTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    try {
        var data = await apiGet("/admin/transactions?limit=100");
        if (!data.success || !data.transactions.length) { el.innerHTML = "<p style='padding:1rem;'>No transactions found.</p>"; return; }
        var rows = data.transactions.map(function(t) {
            var user = t.userId ? t.userId.name : "Unknown";
            return "<tr>" +
                "<td>" + esc(user) + "</td>" +
                "<td>" + esc(t.type || "-") + "</td>" +
                "<td>" + (t.amount || 0) + " ETB</td>" +
                "<td><span class='badge badge-" + t.status + "'>" + t.status + "</span></td>" +
                "<td>" + esc(t.paymentMethod || "-") + "</td>" +
                "<td>" + new Date(t.createdAt).toLocaleDateString() + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>Method</th><th>Date</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

// ===== MESSAGES =====
function loadMessages() {
    var el = document.getElementById("messagesTable");
    var messages = JSON.parse(localStorage.getItem("skillhub_contacts") || "[]");
    if (!messages.length) {
        el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No messages yet. Messages submitted via the contact form will appear here.</p>";
        return;
    }
    var rows = messages.reverse().map(function(m) {
        return "<tr>" +
            "<td>" + esc(m.name) + "</td>" +
            "<td>" + esc(m.email) + "</td>" +
            "<td>" + esc(m.subject || "-") + "</td>" +
            "<td>" + esc((m.message || "").substring(0, 60)) + "...</td>" +
            "<td>" + new Date(m.timestamp).toLocaleDateString() + "</td>" +
            "<td><button class='action-btn btn-view' onclick='viewMessage(" + JSON.stringify(m).replace(/'/g, "&#39;") + ")'>View</button></td>" +
            "</tr>";
    }).join("");
    el.innerHTML = "<table><thead><tr><th>Name</th><th>Email</th><th>Subject</th><th>Message</th><th>Date</th><th>Action</th></tr></thead><tbody>" + rows + "</tbody></table>";
}

function viewMessage(m) {
    document.getElementById("modalContent").innerHTML =
        "<h3>Message from " + esc(m.name) + "</h3>" +
        detail("Email", m.email) +
        detail("Phone", m.phone || "-") +
        detail("Subject", m.subject || "-") +
        detail("Date", new Date(m.timestamp).toLocaleString()) +
        "<div style='margin-top:1rem;padding:1rem;background:#f8fafc;border-radius:0.5rem;font-size:0.875rem;'>" + esc(m.message) + "</div>";
    document.getElementById("detailModal").classList.add("active");
}

// ===== HELPERS =====
function esc(str) {
    if (!str) return "";
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function detail(label, value) {
    return "<div class='detail-row'><span class='detail-label'>" + label + ":</span><span>" + esc(String(value || "-")) + "</span></div>";
}

function closeModal() {
    document.getElementById("detailModal").classList.remove("active");
}

function filterTable(tableId, query) {
    var el = document.getElementById(tableId);
    var rows = el.querySelectorAll("tbody tr");
    query = query.toLowerCase();
    rows.forEach(function(row) {
        row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
    });
}

// Enter key on login
document.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && document.getElementById("loginScreen").style.display !== "none") {
        adminLogin();
    }
});

// ===== PENDING COUNT BADGE =====
async function loadPendingCount() {
    try {
        var data = await apiGet("/admin/pending");
        if (!data.success) return;
        var total = (data.pending.instructors || []).length + (data.pending.freelancers || []).length + (data.pending.courses || []).length;
        var badge = document.getElementById("pendingCount");
        if (badge) badge.textContent = total > 0 ? total : "";
    } catch(e) {}
}
