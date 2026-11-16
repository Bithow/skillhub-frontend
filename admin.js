// SkillHub Admin Dashboard
var API_BASE = window.SKILLHUB_API_BASE || "https://skillhub-backend-i3dr.onrender.com/api";

// ===== TOKEN ISOLATION =====
// Admin uses a separate storage key to prevent coexistence issues
var ADMIN_TOKEN_KEY = "skillhub_admin_token";
var USER_TOKEN_KEY  = "skillhub_token";

var adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
var currentAdminUser = null;
if (adminToken) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
}

// Security check: if someone navigates to admin.html while logged in as a regular user,
// make sure we never accidentally use the user token for admin API calls
function getAdminToken() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
}

function clearAdminSession() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    // Note: deliberately NOT removing skillhub_token — user session is separate
    adminToken = null;
}

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

        if (!res.ok || !data.success) {
            errEl.textContent = data.message || "Invalid credentials";
            errEl.style.display = "block";
            return;
        }

        if (!data.user || data.user.role !== "admin" || !data.token) {
            errEl.textContent = "Access denied. Admin accounts only.";
            errEl.style.display = "block";
            return;
        }

        adminToken = data.token;
        currentAdminUser = data.user;
        sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
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
    clearAdminSession();
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("dashboard").style.display = "none";
}

// Auto-login if admin token exists — verify it's actually an admin token
if (adminToken) {
    fetch(API_BASE + "/auth/me", {
        headers: { "Authorization": "Bearer " + adminToken }
    }).then(function(res) {
        if (res.status === 401) {
            clearAdminSession();
            return null;
        }
        if (!res.ok) throw new Error("Could not verify admin session");
        return res.json();
    }).then(function(data) {
        if (data && data.success && data.user && data.user.role === "admin") {
            currentAdminUser = data.user;
            document.getElementById("adminNameDisplay").textContent = data.user.name;
            document.getElementById("loginScreen").style.display = "none";
            document.getElementById("dashboard").style.display = "block";
            loadOverview();
        } else if (data) {
            // Token exists but is not an admin — clear it
            clearAdminSession();
        }
    }).catch(function() {
        var errEl = document.getElementById("loginError");
        errEl.textContent = "Could not verify the saved admin session. Check your connection and log in again.";
        errEl.style.display = "block";
    });
}

// ===== API HELPER =====
async function apiGet(endpoint) {
    var token = getAdminToken();
    if (!token) { adminLogout(); throw new Error("Not authenticated"); }
    var res = await fetch(API_BASE + endpoint, {
        headers: { "Authorization": "Bearer " + token }
    });
    if (res.status === 401) { clearAdminSession(); adminLogout(); throw new Error("Session expired"); }
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
}

async function apiPut(endpoint, body) {
    var token = getAdminToken();
    if (!token) { adminLogout(); throw new Error("Not authenticated"); }
    var res = await fetch(API_BASE + endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { clearAdminSession(); adminLogout(); throw new Error("Session expired"); }
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
}

async function apiPost(endpoint, body) {
    var token = getAdminToken();
    if (!token) { adminLogout(); throw new Error("Not authenticated"); }
    var res = await fetch(API_BASE + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { clearAdminSession(); adminLogout(); throw new Error("Session expired"); }
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
}

// ===== TABS =====
function showTab(name, e) {
    document.querySelectorAll(".tab-content").forEach(function(t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
    document.getElementById("tab-" + name).classList.add("active");
    if (e && e.target) e.target.classList.add("active");

    if (name === "overview") loadOverview();
    else if (name === "pending") loadPending();
    else if (name === "pendingpayments") loadPendingPayments();
    else if (name === "users") loadUsers();
    else if (name === "freelancers") loadFreelancers();
    else if (name === "courses") loadCourses();
    else if (name === "transactions") loadTransactions();
    else if (name === "messages") loadMessages();
    else if (name === "business") loadBusinessInquiries();
    else if (name === "support") loadSupportTickets();
    else if (name === "reports") loadReportsComplaints();
    else if (name === "notifications") loadNotifications();
    else if (name === "ai-studio") loadAiStudio();
    else if (name === "chats") loadAllChats();
    else if (name === "roles") loadAdminRoles();
    else if (name === "activity") loadAdminActivity();
    else if (name === "visitors") loadVisitorAnalytics();
    else if (name === "rates") loadRates();
}

var aiStudioRefreshTimer = null;
var aiStudioJobsCache = [];

function showAiStudioSection(name, button) {
    document.querySelectorAll(".ai-studio-section").forEach(function(section) { section.hidden = true; });
    document.querySelectorAll("#tab-ai-studio nav .tx-filter-btn").forEach(function(item) { item.classList.remove("active"); });
    var section = document.getElementById("aiStudioSection-" + name);
    if (section) section.hidden = false;
    if (button) button.classList.add("active");
    if (name === "production") loadAiStudioJobs();
    if (name === "usage") loadAiStudioUsage();
}

async function loadAiStudio() {
    try {
        var data = await apiGet("/admin/ai-studio/status");
        var services = data.services || {};
        var generator = document.getElementById("aiStudioGeneratorAvailability");
        var summary = document.getElementById("aiStudioProviderSummary");
        var generateButton = document.getElementById("aiStudioGenerateButton");
        if (generator) {
            generator.textContent = services.courseGeneration ? "Course provider ready" : "Course provider not configured";
            generator.className = "badge " + (services.courseGeneration ? "badge-active" : "badge-pending");
        }
        if (generateButton) generateButton.disabled = !services.courseGeneration;
        if (summary) summary.textContent = "Course generation: " + (services.courseGeneration ? (data.provider + " / " + data.model) : "not configured") + " | Video: " + (services.videoProduction ? "ready" : "not configured") + " | Voice: " + (services.voiceGeneration ? "ready" : "not configured") + " | Storage: " + (services.fileStorage ? "ready" : "not configured");
        setAiServiceBadge("aiVideoStatus", services.videoProduction, "Video provider ready", "Video provider not configured");
        setAiServiceBadge("aiMaterialsStatus", services.fileStorage, "Storage configured", "Storage not configured");
        setAiServiceBadge("aiLibraryStatus", services.fileStorage, "Persistent storage ready", "Persistent storage required");
        var settings = document.getElementById("aiStudioSettingsStatus");
        if (settings) settings.innerHTML = "<p style='font-size:.85rem;color:#475569;line-height:1.8;'>Course generation: <strong>" + (services.courseGeneration ? "configured" : "not configured") + "</strong><br>Video production: <strong>" + (services.videoProduction ? "configured" : "not configured") + "</strong><br>Voice generation: <strong>" + (services.voiceGeneration ? "configured" : "not configured") + "</strong><br>Persistent file storage: <strong>" + (services.fileStorage ? "configured" : "not configured") + "</strong><br>Monthly budget: <strong>" + (data.monthlyBudgetUsd ? "$" + Number(data.monthlyBudgetUsd).toFixed(2) : "not set") + "</strong></p>";
        var month = data.monthToDate || {};
        var jobCounts = data.jobs || {};
        var stats = document.getElementById("aiStudioStats");
        if (stats) stats.innerHTML = statCard("fa-list-ol", jobCounts.queued || 0, "Queued", "yellow") + statCard("fa-spinner", jobCounts.generating || 0, "Generating", "") + statCard("fa-check", jobCounts.completed || 0, "Completed", "green") + statCard("fa-triangle-exclamation", jobCounts.failed || 0, "Failed", "red");
        var usageStats = document.getElementById("aiStudioUsageStats");
        if (usageStats) usageStats.innerHTML = statCard("fa-coins", "$" + Number(month.estimatedCostUsd || 0).toFixed(4), "Estimated month-to-date cost", "green") + statCard("fa-arrow-up", Number(month.inputTokens || 0).toLocaleString(), "Input tokens", "") + statCard("fa-arrow-down", Number(month.outputTokens || 0).toLocaleString(), "Output tokens", "purple") + statCard("fa-bolt", month.requests || 0, "AI requests", "yellow");
        await loadAiStudioJobs();
        if (aiStudioRefreshTimer) clearInterval(aiStudioRefreshTimer);
        aiStudioRefreshTimer = setInterval(function() {
            var tab = document.getElementById("tab-ai-studio");
            if (tab && tab.classList.contains("active")) loadAiStudio();
        }, 15000);
    } catch (error) {
        var summaryEl = document.getElementById("aiStudioProviderSummary");
        if (summaryEl) summaryEl.textContent = "AI Studio access unavailable: " + error.message;
        var generator = document.getElementById("aiStudioGeneratorAvailability");
        if (generator) { generator.textContent = "Access denied"; generator.className = "badge badge-suspended"; }
    }
}

function setAiServiceBadge(id, ready, readyText, missingText) {
    var badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = ready ? readyText : missingText;
    badge.className = "badge " + (ready ? "badge-active" : "badge-pending");
}

async function submitAiCourse(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var submit = document.getElementById("aiStudioGenerateButton");
    var message = document.getElementById("aiStudioFormMessage");
    var payload = Object.fromEntries(new FormData(form).entries());
    payload.durationHours = Number(payload.durationHours);
    payload.moduleCount = Number(payload.moduleCount);
    payload.lessonCount = Number(payload.lessonCount);
    payload.certificateEligible = payload.certificateEligible === "true";
    submit.disabled = true;
    message.textContent = "Adding course production job to the queue...";
    try {
        var result = await apiPost("/admin/ai-studio/courses", payload);
        message.textContent = "Job queued. It will be saved as a pending course draft for admin review.";
        form.reset();
        await loadAiStudio();
        showAiStudioSection("production", document.querySelector("#tab-ai-studio nav .tx-filter-btn:nth-child(6)"));
    } catch (error) {
        message.textContent = error.message;
    } finally {
        submit.disabled = false;
    }
}

async function loadAiStudioJobs() {
    var el = document.getElementById("aiStudioJobs");
    if (!el) return;
    try {
        var data = await apiGet("/admin/ai-studio/jobs?limit=50");
        var jobs = data.jobs || [];
        aiStudioJobsCache = jobs;
        if (!jobs.length) { el.innerHTML = "<p style='padding:1.25rem;color:#64748b;'>No course production jobs yet.</p>"; return; }
        var rows = jobs.map(function(job) {
            var title = job.course ? job.course.title : (job.input && job.input.title) || "Course generation";
            var progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
            var error = job.error ? "<br><small style='color:#b91c1c;'>" + esc(job.error) + "</small>" : "";
            var retry = job.status === "failed" ? "<button class='action-btn btn-view' onclick='retryAiStudioJob(\"" + esc(job._id) + "\")'>Retry</button>" : "";
            var preview = job.output ? "<button class='action-btn btn-view' onclick='previewAiCourse(\"" + esc(job._id) + "\")'>Review content</button>" : "";
            return "<tr>" +
                "<td><strong>" + esc(title) + "</strong><br><small style='color:#64748b;'>" + esc(job.phase || job.jobType) + "</small>" + error + "</td>" +
                "<td><span class='badge " + (job.status === "completed" ? "badge-active" : job.status === "failed" ? "badge-suspended" : "badge-pending") + "'>" + esc(job.status) + "</span></td>" +
                "<td><progress value='" + progress + "' max='100' style='width:100px;vertical-align:middle;'></progress> " + progress + "%</td>" +
                "<td>" + esc(job.createdBy && job.createdBy.name || "Admin") + "</td>" +
                "<td>" + (job.estimatedCost == null ? "-" : "$" + Number(job.estimatedCost).toFixed(4)) + "</td>" +
                "<td>" + new Date(job.createdAt).toLocaleString() + "</td>" +
                "<td>" + preview + retry + (job.course ? "<button class='action-btn btn-approve' onclick='openPendingCourseQueue()'>Pending approval</button>" : "") + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<div style='overflow-x:auto;'><table><thead><tr><th>Course</th><th>Status</th><th>Progress</th><th>Requested by</th><th>Est. cost</th><th>Created</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    } catch (error) {
        el.innerHTML = "<p style='padding:1rem;color:#991b1b;'>Could not load production jobs: " + esc(error.message) + "</p>";
    }
}

function previewAiCourse(id) {
    var job = aiStudioJobsCache.find(function(item) { return item._id === id || item.id === id; });
    if (!job || !job.output) return;
    var course = job.output;
    var modules = Array.isArray(course.modules) ? course.modules : [];
    var moduleHtml = modules.map(function(module, moduleIndex) {
        var lessons = Array.isArray(module.lessons) ? module.lessons : [];
        var lessonHtml = lessons.map(function(lesson, lessonIndex) {
            return "<details style='padding:.55rem 0;border-top:1px solid #e2e8f0;'><summary style='cursor:pointer;font-weight:600;'>" + (moduleIndex + 1) + "." + (lessonIndex + 1) + " " + esc(lesson.title || "Untitled lesson") + "</summary><p style='padding:.5rem 0;color:#475569;white-space:pre-wrap;'>" + esc(lesson.description || "No description") + "</p><p style='color:#475569;white-space:pre-wrap;'><strong>Teaching content:</strong> " + esc(lesson.teachingContent || "Not provided") + "</p><p style='color:#475569;white-space:pre-wrap;'><strong>Narration:</strong> " + esc(lesson.narrationScript || "Not provided") + "</p></details>";
        }).join("");
        return "<section style='padding:.8rem 0;border-top:1px solid #cbd5e1;'><h4>Module " + (moduleIndex + 1) + ": " + esc(module.title || "Untitled module") + "</h4><p style='margin:.4rem 0;color:#64748b;'>" + esc(module.description || "") + "</p>" + lessonHtml + "</section>";
    }).join("");
    var objectives = Array.isArray(course.objectives) ? course.objectives : [];
    document.getElementById("modalContent").innerHTML = "<h3>" + esc(course.title || "Generated course draft") + "</h3>" +
        "<p style='color:#64748b;margin-bottom:1rem;'>" + esc(course.subtitle || "") + "</p>" +
        "<p style='white-space:pre-wrap;margin-bottom:1rem;'>" + esc(course.description || course.overview || "No description generated") + "</p>" +
        "<p><strong>Level:</strong> " + esc(course.level || "-") + " &nbsp; <strong>Duration:</strong> " + esc(course.durationHours || "-") + " hours</p>" +
        "<h4 style='margin-top:1rem;'>Learning objectives</h4><ul style='padding-left:1.25rem;margin:.5rem 0 1rem;'>" + objectives.map(function(item) { return "<li>" + esc(item) + "</li>"; }).join("") + "</ul>" +
        "<h4>Curriculum</h4>" + moduleHtml;
    document.getElementById("detailModal").classList.add("active");
}

function openPendingCourseQueue() {
    var pendingButton = Array.from(document.querySelectorAll(".tab-btn")).find(function(button) {
        return (button.getAttribute("onclick") || "").indexOf("showTab('pending'") >= 0;
    });
    showTab("pending", pendingButton ? { target: pendingButton } : null);
}

async function loadVisitorAnalytics() {
    try {
        var days = document.getElementById("visitorRange").value || "30";
        var data = await apiGet("/admin/site-visits?days=" + encodeURIComponent(days));
        var totals = data.totals || {};
        document.getElementById("visitorStats").innerHTML = statCard("fa-eye", Number(totals.pageViews || 0).toLocaleString(), "Page views · " + days + " days", "") +
            statCard("fa-user-group", Number(totals.uniqueSessions || 0).toLocaleString(), "Unique sessions", "green");
        var pages = data.topPages || [];
        document.getElementById("visitorPagesTable").innerHTML = pages.length
            ? "<table><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>" + pages.map(function(item) { return "<tr><td>" + esc(item.path) + "</td><td>" + Number(item.pageViews).toLocaleString() + "</td></tr>"; }).join("") + "</tbody></table>"
            : "<p style='padding:1rem;color:#64748b;'>No visits recorded in this period.</p>";
        var devices = data.devices || [];
        document.getElementById("visitorDevicesTable").innerHTML = devices.length
            ? "<table><thead><tr><th>Device</th><th>Views</th></tr></thead><tbody>" + devices.map(function(item) { return "<tr><td>" + esc(item.deviceType) + "</td><td>" + Number(item.pageViews).toLocaleString() + "</td></tr>"; }).join("") + "</tbody></table>"
            : "<p style='padding:1rem;color:#64748b;'>No device data available.</p>";
        var recent = data.recent || [];
        document.getElementById("visitorRecentTable").innerHTML = recent.length
            ? "<table><thead><tr><th>Anonymous session</th><th>Page</th><th>Device</th><th>Referrer</th><th>Time</th></tr></thead><tbody>" + recent.map(function(item) { return "<tr><td>" + esc(item.visitorKey) + "</td><td>" + esc(item.path) + "</td><td>" + esc(item.deviceType) + "</td><td>" + esc(item.referrer || "Direct") + "</td><td>" + new Date(item.createdAt).toLocaleString() + "</td></tr>"; }).join("") + "</tbody></table>"
            : "<p style='padding:1rem;color:#64748b;'>No recent visits recorded.</p>";
    } catch (error) {
        document.getElementById("visitorStats").innerHTML = "<p style='padding:1rem;color:#991b1b;'>Could not load visitor analytics: " + esc(error.message) + "</p>";
    }
}

async function retryAiStudioJob(id) {
    try {
        await apiPost("/admin/ai-studio/jobs/" + encodeURIComponent(id) + "/retry", {});
        await loadAiStudioJobs();
    } catch (error) {
        alert("Could not retry production job: " + error.message);
    }
}

async function loadAiStudioUsage() {
    var el = document.getElementById("aiStudioUsage");
    if (!el) return;
    try {
        var data = await apiGet("/admin/ai-studio/usage");
        var records = data.records || [];
        if (!records.length) { el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No AI provider usage recorded yet.</p>"; return; }
        var rows = records.map(function(record) {
            return "<tr><td>" + esc(record.operation) + "</td><td>" + esc(record.provider + " / " + record.model) + "</td><td><span class='badge " + (record.status === "succeeded" ? "badge-active" : "badge-suspended") + "'>" + esc(record.status) + "</span>" + (record.error ? "<br><small style='color:#b91c1c;'>" + esc(record.error) + "</small>" : "") + "</td><td>" + Number(record.inputTokens || 0).toLocaleString() + " / " + Number(record.outputTokens || 0).toLocaleString() + "</td><td>" + (record.estimatedCost == null ? "Not available" : "$" + Number(record.estimatedCost).toFixed(5)) + "</td><td>" + new Date(record.createdAt).toLocaleString() + "</td></tr>";
        }).join("");
        el.innerHTML = "<div style='overflow-x:auto;'><table><thead><tr><th>Operation</th><th>Provider</th><th>Result</th><th>Input / output tokens</th><th>Estimated cost</th><th>Time</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    } catch (error) {
        el.innerHTML = "<p style='padding:1rem;color:#991b1b;'>Could not load AI usage: " + esc(error.message) + "</p>";
    }
}

async function loadAdminRoles() {
    var el = document.getElementById("adminRolesTable");
    if (!el) return;
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading admin roles...</div>";
    try {
        var [catalogRes, usersRes] = await Promise.all([
            apiGet("/admin/roles/catalog"),
            apiGet("/admin/roles")
        ]);
        var roles = catalogRes.roles || [];
        var admins = usersRes.admins || [];
        var rows = admins.map(function(admin) {
            var selectedRole = admin.adminRole || 'super_admin';
            var choices = roles.map(function(role) {
                return "<option value='" + esc(role.id) + "'" + (selectedRole === role.id ? " selected" : "") + ">" + esc(role.label) + "</option>";
            }).join("");
            return "<tr>" +
                "<td>" + esc(admin.name || "Admin") + "</td>" +
                "<td>" + esc(admin.email || "-") + "</td>" +
                "<td><select data-role-user='" + esc(admin.id) + "' style='padding:.5rem;border:1px solid #e2e8f0;border-radius:.5rem;min-width:180px;'>" + choices + "</select></td>" +
                "<td><button class='action-btn btn-approve' onclick=\"saveAdminRole('" + esc(admin.id) + "', document.querySelector('[data-role-user=\\\"" + esc(admin.id) + "\\\"]').value)\">Save role</button></td>" +
                "</tr>";
        }).join("");
        el.innerHTML = rows
            ? "<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>" + rows + "</tbody></table>"
            : "<p style='padding:1rem;color:#64748b;'>No admin users found.</p>";
    } catch (error) {
        el.innerHTML = "<p style='padding:1rem;color:#991b1b;'>Could not load admin roles: " + esc(error.message) + "</p>";
    }
}

async function saveAdminRole(adminId, role) {
    try {
        await apiPut("/admin/roles/" + encodeURIComponent(adminId), { role: role });
        await loadAdminRoles();
        alert("Admin role saved.");
    } catch (error) {
        alert("Could not update role: " + error.message);
    }
}

async function loadAdminActivity() {
    var el = document.getElementById("adminActivityTable");
    if (!el) return;
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading activity...</div>";
    try {
        var data = await apiGet("/admin/activity?limit=100");
        var logs = data.logs || [];
        if (!logs.length) {
            el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No admin activity found.</p>";
            return;
        }
        var rows = logs.map(function(log) {
            return "<tr>" +
                "<td>" + esc(log.adminUser && log.adminUser.name ? log.adminUser.name : "System") + "</td>" +
                "<td>" + esc(log.action || "-") + "</td>" +
                "<td>" + esc(log.targetType || "-") + "</td>" +
                "<td>" + esc(log.summary || "-") + "</td>" +
                "<td>" + new Date(log.createdAt).toLocaleString() + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Admin</th><th>Action</th><th>Target</th><th>Summary</th><th>Time</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (error) {
        el.innerHTML = "<p style='padding:1rem;color:#991b1b;'>Could not load admin activity: " + esc(error.message) + "</p>";
    }
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
    if (!confirm("Approve this " + (role === "instructor" ? "instructor" : "freelancer") + "? They will become active on the platform.")) return;
    try {
        await apiPut("/admin/approve-user/" + id, { role: role });
        alert((role === "instructor" ? "Instructor" : "Freelancer") + " approved! They are now active.");
        loadPending();
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
    if (!confirm("Approve and publish this course?")) return;
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
            statCard("fa-wallet", "$" + parseFloat(s.totalRevenue || 0).toFixed(2), "Total Revenue", "green");
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
        detail("Wallet", "$" + parseFloat(u.walletBalance || 0).toFixed(2)) +
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
                "<td>$" + parseFloat(f.hourlyRate || 0).toFixed(2) + "/hr</td>" +
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
                "<td>$" + parseFloat(c.price || 0).toFixed(2) + "</td>" +
                "<td>" + esc(c.category || "-") + "</td>" +
                "<td><span class='badge badge-" + c.status + "'>" + c.status + "</span></td>" +
                "<td>" + (c.isFeatured ? "<span class='badge badge-published'>Featured</span>" : "—") + "</td>" +
                "<td>" +
                    (c.status === "pending" ? "<button class='action-btn btn-approve' onclick='approveCourse(\"" + c._id + "\")'>Approve</button>" : "") +
                    (c.status === "pending" ? "<button class='action-btn btn-reject' onclick='rejectCourse(\"" + c._id + "\")'>Reject</button>" : "") +
                    (c.status === "published" ? "<button class='action-btn " + (c.isFeatured ? "btn-reject" : "btn-approve") + "' onclick='toggleCourseFeatured(\"" + c._id + "\", " + (!c.isFeatured) + ")'>" + (c.isFeatured ? "Remove featured" : "Feature course") + "</button>" : "") +
                "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Title</th><th>Instructor</th><th>Price</th><th>Category</th><th>Status</th><th>Featured</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function toggleCourseFeatured(id, isFeatured) {
    try {
        await apiPut("/admin/courses/" + encodeURIComponent(id) + "/featured", { isFeatured: isFeatured });
        loadCourses();
    } catch (error) {
        alert("Could not update featured status: " + error.message);
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
var _allTransactions = []; // cached for client-side filtering
var _txFilter = 'all';

function setTxFilter(filter) {
    _txFilter = filter;
    // Update active button
    document.querySelectorAll('.tx-filter-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.id === 'txFilter-' + filter);
    });
    renderTransactionsTable();
}

function renderTransactionsTable() {
    var el = document.getElementById("transactionsTable");
    var filtered = _txFilter === 'all'
        ? _allTransactions
        : _allTransactions.filter(function(t) { return t.status === _txFilter; });

    if (!filtered.length) {
        var labels = { all: 'transactions', pending: 'pending transactions', approved: 'approved transactions', rejected: 'rejected transactions' };
        el.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>No " + (labels[_txFilter] || 'transactions') + " found.</p>";
        return;
    }

    var rows = filtered.map(function(t) {
        var user     = t.userId ? t.userId.name : "Unknown";
        var userId   = t.userId ? (t.userId._id || t.userId) : "";
        var itemId   = t.metadata ? (t.metadata.courseId || t.metadata.freelancerId || "") : "";
        var itemType = t.type || "course_purchase";
        var isPending = t.status === "pending";
        var simulationCheckout = t.metadata && t.metadata.paymentMode === "prelaunch_simulated";
        var statusLabel = t.isSimulated && t.status === "completed" ? "Successful (Simulated)" : t.status;
        var typeLabel = (t.type || "-") + (t.isSimulated || simulationCheckout ? " · Simulated" : "");
        var txJson   = JSON.stringify(t).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");

        var actionBtns = "<button class='action-btn btn-view' onclick='viewTransaction(this)' data-tx='" + txJson + "'><i class='fas fa-eye'></i> View</button>";
        if (isPending && !simulationCheckout) {
            actionBtns +=
                "<button class='action-btn btn-approve' onclick='approveTransaction(\"" + t._id + "\",\"" + userId + "\",\"" + itemId + "\",\"" + itemType + "\")'>✓ Approve</button>" +
                "<button class='action-btn btn-reject' onclick='rejectTransaction(\"" + t._id + "\")'>✗ Reject</button>";
        } else if (isPending && simulationCheckout) {
            actionBtns += "<span style='color:#2563eb;font-size:.78rem;'>Awaiting learner simulation</span>";
        } else {
            actionBtns += "<span style='color:#64748b;font-size:0.78rem;margin-left:0.5rem;'>" + t.status + "</span>";
        }

        return "<tr>" +
            "<td>" + esc(user) + "</td>" +
            "<td>" + esc(typeLabel) + "</td>" +
            "<td>" + esc(t.currency || "USD") + " " + parseFloat(t.amount || 0).toFixed(2) + "</td>" +
            "<td><span class='badge badge-" + t.status + "'>" + esc(statusLabel) + "</span>" + (t.isSimulated ? "<br><small style='color:#2563eb;'>No funds transferred</small>" : "") + "</td>" +
            "<td>" + esc(t.paymentMethod || "-") + "</td>" +
            "<td>" + new Date(t.createdAt).toLocaleDateString() + "</td>" +
            "<td>" + actionBtns + "</td>" +
            "</tr>";
    }).join("");

    el.innerHTML = "<table><thead><tr><th>User</th><th>Type</th><th>Amount</th><th>Status</th><th>Method</th><th>Date</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
}

async function loadTransactions() {
    var el = document.getElementById("transactionsTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    try {
        var data = await apiGet("/admin/transactions?limit=100");
        if (!data.success || !data.transactions.length) {
            _allTransactions = [];
            el.innerHTML = "<p style='padding:1rem;'>No transactions found.</p>";
            return;
        }
        _allTransactions = data.transactions;
        renderTransactionsTable();
        loadFinancialReport();
        loadCommissionSettings();
        loadFinancialReviewQueues();
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function loadMessages() {
    var el = document.getElementById("messagesTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading contact messages...</div>";
    try {
        var data = await apiGet("/contact/messages?limit=100");
        var messages = data.messages || [];
        if (!messages.length) {
            el.innerHTML = "<p style='padding:1rem;'>No contact messages found.</p>";
            return;
        }
        var rows = messages.map(function(item) {
            return "<tr>" +
                "<td>" + esc(item.name || "Unknown") + "</td>" +
                "<td>" + esc(item.email || "-") + "</td>" +
                "<td>" + esc(item.subject || "-") + "</td>" +
                "<td>" + esc(item.message || "-") + "</td>" +
                "<td>" + new Date(item.createdAt).toLocaleString() + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Name</th><th>Email</th><th>Subject</th><th>Message</th><th>Submitted</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function loadBusinessInquiries() {
    var el = document.getElementById("businessInquiriesTable");
    if (!el) return;
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading business inquiries...</div>";
    try {
        var data = await apiGet("/admin/inquiries?limit=100");
        var inquiries = data.inquiries || [];
        if (!inquiries.length) {
            el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No business inquiries found.</p>";
            return;
        }
        var rows = inquiries.map(function(item) {
            var status = (item.status || 'new');
            var badge = status === 'new' ? 'badge-pending' : status === 'in_progress' ? 'badge-active' : status === 'closed' ? 'badge-active' : 'badge-user';
            var actionButtons = status === 'closed'
                ? "<span class='badge badge-active'>Closed</span>"
                : "<button class='action-btn btn-view' onclick='updateInquiryStatus(\"" + item._id + "\", \"in_progress\")'>Start follow-up</button>" +
                  "<button class='action-btn btn-approve' onclick='updateInquiryStatus(\"" + item._id + "\", \"closed\")'>Mark closed</button>";
            return "<tr>" +
                "<td>" + esc(item.name || "Unknown") + "</td>" +
                "<td>" + esc(item.email || "-") + "</td>" +
                "<td>" + esc(item.phone || "-") + "</td>" +
                "<td>" + esc((item.message || "").substring(0, 80)) + ((item.message && item.message.length > 80) ? "..." : "") + "</td>" +
                "<td><span class='badge " + badge + "'>" + esc(status.replace('_', ' ')) + "</span></td>" +
                "<td>" + new Date(item.createdAt).toLocaleDateString() + "</td>" +
                "<td>" + actionButtons + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Request</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function updateInquiryStatus(id, status) {
    try {
        await apiPut("/admin/inquiries/" + encodeURIComponent(id) + "/status", { status: status });
        loadBusinessInquiries();
    } catch (error) {
        alert("Could not update business inquiry: " + error.message);
    }
}

async function loadSupportTickets() {
    var el = document.getElementById("supportTicketsTable");
    if (!el) return;
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading support tickets...</div>";
    try {
        var data = await apiGet("/admin/tickets?limit=100");
        var tickets = data.tickets || [];
        if (!tickets.length) {
            el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No support tickets found.</p>";
            return;
        }
        var rows = tickets.map(function(item) {
            var status = item.status || 'new';
            var badge = status === 'new' ? 'badge-pending' : status === 'open' ? 'badge-active' : status === 'resolved' || status === 'closed' ? 'badge-active' : 'badge-user';
            var actionButtons = status === 'closed'
                ? "<span class='badge badge-active'>Closed</span>"
                : "<button class='action-btn btn-view' onclick='updateSupportTicketStatus(\"" + item._id + "\", \"open\")'>Open</button>" +
                  "<button class='action-btn btn-approve' onclick='updateSupportTicketStatus(\"" + item._id + "\", \"resolved\")'>Resolve</button>";
            return "<tr>" +
                "<td>" + esc(item.name || "Unknown") + "</td>" +
                "<td>" + esc(item.email || "-") + "</td>" +
                "<td>" + esc(item.phone || "-") + "</td>" +
                "<td>" + esc((item.message || "").substring(0, 80)) + ((item.message && item.message.length > 80) ? "..." : "") + "</td>" +
                "<td><span class='badge " + badge + "'>" + esc(status.replace('_', ' ')) + "</span></td>" +
                "<td>" + new Date(item.createdAt).toLocaleDateString() + "</td>" +
                "<td>" + actionButtons + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Issue</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function updateSupportTicketStatus(id, status) {
    try {
        await apiPut("/admin/tickets/" + encodeURIComponent(id) + "/status", { status: status });
        loadSupportTickets();
    } catch (error) {
        alert("Could not update support ticket: " + error.message);
    }
}

async function loadReportsComplaints() {
    var el = document.getElementById("reportsComplaintsTable");
    if (!el) return;
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading reports and complaints...</div>";
    try {
        var data = await apiGet("/admin/reports?limit=100");
        var reports = data.reports || [];
        if (!reports.length) {
            el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No reports or complaints found.</p>";
            return;
        }
        var rows = reports.map(function(item) {
            var status = item.status || 'new';
            var badge = status === 'new' ? 'badge-pending' : status === 'reviewing' || status === 'investigating' ? 'badge-user' : status === 'resolved' || status === 'closed' ? 'badge-active' : 'badge-suspended';
            var actionButtons = status === 'closed' || status === 'resolved'
                ? "<span class='badge badge-active'>" + esc(status) + "</span>"
                : "<button class='action-btn btn-view' onclick='updateReportComplaintStatus(\"" + item._id + "\", \"reviewing\")'>Review</button>" +
                  "<button class='action-btn btn-approve' onclick='updateReportComplaintStatus(\"" + item._id + "\", \"resolved\")'>Resolve</button>";
            return "<tr>" +
                "<td>" + esc(item.subject || "-") + "</td>" +
                "<td>" + esc(item.name || "Unknown") + "</td>" +
                "<td>" + esc(item.email || "-") + "</td>" +
                "<td>" + esc((item.message || "").substring(0, 80)) + ((item.message && item.message.length > 80) ? "..." : "") + "</td>" +
                "<td><span class='badge " + badge + "'>" + esc(status.replace('_', ' ')) + "</span></td>" +
                "<td>" + new Date(item.createdAt).toLocaleDateString() + "</td>" +
                "<td>" + actionButtons + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Type</th><th>Name</th><th>Email</th><th>Details</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function updateReportComplaintStatus(id, status) {
    try {
        await apiPut("/admin/reports/" + encodeURIComponent(id) + "/status", { status: status });
        loadReportsComplaints();
    } catch (error) {
        alert("Could not update report/complaint: " + error.message);
    }
}

async function loadNotifications() {
    var el = document.getElementById("notificationsTable");
    if (!el) return;
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading notifications...</div>";
    try {
        var data = await apiGet("/admin/notifications");
        var notifications = data.notifications || [];
        if (!notifications.length) {
            el.innerHTML = "<p style='padding:1rem;color:#64748b;'>No notifications published yet.</p>";
            return;
        }
        var rows = notifications.map(function(item) {
            var status = item.read ? "Read" : "Unread";
            return "<tr>" +
                "<td><strong>" + esc(item.title || "Announcement") + "</strong><br><small style='color:#64748b;'>" + esc(item.type || "info") + " · " + esc(item.audience || "all") + "</small></td>" +
                "<td>" + esc(item.message || "-") + "</td>" +
                "<td><span class='badge badge-pending'>" + esc(status) + "</span></td>" +
                "<td>" + new Date(item.createdAt).toLocaleString() + "</td>" +
                "<td>" + (!item.read ? "<button class='action-btn btn-view' onclick='markNotificationRead(\"" + item._id + "\")'>Mark read</button>" : "<span class='badge badge-active'>Done</span>") + "</td>" +
                "</tr>";
        }).join("");
        el.innerHTML = "<table><thead><tr><th>Title</th><th>Message</th><th>Status</th><th>Published</th><th>Action</th></tr></thead><tbody>" + rows + "</tbody></table>";
    } catch (error) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + error.message + "</p>";
    }
}

async function createNotification() {
    var title = document.getElementById("notificationTitle").value.trim();
    var message = document.getElementById("notificationMessage").value.trim();
    var type = document.getElementById("notificationType").value;
    var audience = document.getElementById("notificationAudience").value;
    if (!title || !message) {
        alert("Title and message are required for the notification.");
        return;
    }
    try {
        await apiPost("/admin/notifications", { title: title, message: message, type: type, audience: audience });
        document.getElementById("notificationTitle").value = "";
        document.getElementById("notificationMessage").value = "";
        loadNotifications();
        alert("Notification published successfully.");
    } catch (error) {
        alert("Could not publish notification: " + error.message);
    }
}

async function markNotificationRead(id) {
    try {
        await apiPut("/admin/notifications/" + encodeURIComponent(id) + "/read", {});
        loadNotifications();
    } catch (error) {
        alert("Could not mark notification as read: " + error.message);
    }
}

async function loadAllChats() {
    var el = document.getElementById("chatsContainer");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading conversations...</div>";
    try {
        var data = await apiGet("/chat/admin/all");
        var chats = data.conversations || [];
        if (!chats.length) {
            el.innerHTML = "<p style='padding:1rem;'>No active conversations found.</p>";
            return;
        }
        el.innerHTML = chats.map(function(chat) {
            var user1 = chat.user1 || {};
            var user2 = chat.user2 || {};
            var other = user1 && user2 && user1.name && user2.name
                ? user1.name + " / " + user2.name
                : "Conversation";
            var target = user1 && user2 && user1.name && user2.name ? user1 : user2;
            var preview = (chat.lastMessage && chat.lastMessage.content) || "No message yet";
            return "<div class='chat-conv-item' onclick='openAdminConversation(\"" + esc(chat.conversationId) + "\", \"" + esc(other) + "\")'>" +
                "<div class='chat-avatar'><i class='fas fa-comments'></i></div>" +
                "<div class='chat-user-info'>" +
                "<div class='chat-user-name'>" + esc(other) + "</div>" +
                "<div class='chat-last-msg'>" + esc(preview) + "</div>" +
                "</div>" +
                "<div class='chat-meta'>" +
                (chat.lastMessage && chat.lastMessage.createdAt ? "<span class='chat-last-msg'>" + new Date(chat.lastMessage.createdAt).toLocaleDateString() + "</span>" : "") +
                (chat.messageCount ? "<span class='chat-msg-count'>" + chat.messageCount + "</span>" : "") +
                "</div>" +
                "</div>";
        }).join("");
    } catch (err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function openAdminConversation(conversationId, label) {
    var panel = document.getElementById("chatViewerPanel");
    var title = document.getElementById("chatViewerTitle");
    var container = document.getElementById("chatViewerMessages");
    panel.style.display = "block";
    title.textContent = label || "Conversation";
    container.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading conversation...</div>";
    try {
        var data = await apiGet("/chat/admin/conversation/" + encodeURIComponent(conversationId));
        var messages = data.messages || [];
        if (!messages.length) {
            container.innerHTML = "<p style='padding:1rem;color:#64748b;'>No messages in this conversation yet.</p>";
            return;
        }
        var me = currentAdminUser || await apiGet("/auth/me");
        var myId = me && me.user ? me.user.id : null;
        if (!myId) myId = currentAdminUser && currentAdminUser.id ? currentAdminUser.id : null;
        var targetId = null;
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            if (String(msg.senderId) !== String(myId)) { targetId = msg.senderId; break; }
            if (String(msg.receiverId) !== String(myId)) { targetId = msg.receiverId; break; }
        }
        var html = messages.map(function(msg) {
            var fromMe = String(msg.senderId) === String(myId);
            return "<div class='admin-msg-row " + (fromMe ? "right" : "left") + "'>" +
                "<div class='admin-bubble'>" + esc(msg.content || "") + "</div>" +
                "</div>";
        }).join("");
        container.innerHTML = html + "<form id='adminReplyForm' style='margin-top:1rem;display:flex;gap:.75rem;align-items:flex-end;'>" +
            "<textarea id='adminReplyInput' rows='2' placeholder='Reply to this conversation...' style='flex:1;border:1px solid #e2e8f0;border-radius:.75rem;padding:.75rem 1rem;resize:vertical;'></textarea>" +
            "<button type='submit' class='refresh-btn'><i class='fas fa-paper-plane'></i> Send</button>" +
            "</form>";
        var form = document.getElementById("adminReplyForm");
        form.addEventListener("submit", async function(event) {
            event.preventDefault();
            var input = document.getElementById("adminReplyInput");
            var content = (input.value || "").trim();
            if (!content || !targetId) return;
            try {
                var response = await fetch(API_BASE + "/chat/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + getAdminToken() },
                    body: JSON.stringify({ receiverId: String(targetId), content: content, type: "text" })
                });
                var payload = await response.json();
                if (!response.ok || !payload.success) throw new Error(payload.message || "Could not send reply.");
                input.value = "";
                await openAdminConversation(conversationId, label);
            } catch (error) {
                alert("Reply failed: " + error.message);
            }
        });
    } catch (error) {
        container.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + error.message + "</p>";
    }
}

function financialQuery() {
    var params = new URLSearchParams();
    var values = {
        from: document.getElementById("financeFrom").value,
        to: document.getElementById("financeTo").value,
        type: document.getElementById("financeType").value,
        status: document.getElementById("financeStatus").value,
        currency: document.getElementById("financeCurrency").value.trim().toUpperCase(),
        simulated: document.getElementById("financeMode").value
    };
    Object.keys(values).forEach(function(key) { if (values[key]) params.set(key, values[key]); });
    return params.toString();
}

function reportRows(rows, field, label) {
    if (!rows || !rows.length) return "<p style='color:#64748b;font-size:.82rem;'>No recorded amounts.</p>";
    return rows.map(function(row) {
        return "<div style='display:flex;justify-content:space-between;gap:.5rem;font-size:.82rem;padding:.2rem 0;'><span>" + esc(row.currency) + " " + label + "</span><strong>" + Number(row[field] || 0).toFixed(2) + "</strong></div>";
    }).join("");
}

async function loadFinancialReport() {
    var container = document.getElementById("financialReportSummary");
    if (!container) return;
    container.innerHTML = "<div class='loading'>Loading ledger totals…</div>";
    try {
        var query = financialQuery();
        var data = await apiGet("/admin/financial-report" + (query ? "?" + query : ""));
        var report = data.report || {};
        var recorded = report.coursePayments && report.coursePayments.recorded || [];
        var simulated = report.coursePayments && report.coursePayments.simulated || [];
        var pending = report.pendingCoursePayments || [];
        var withdrawals = report.withdrawals || [];
        var external = report.externalFreelancePayments || [];
        var cards = [
            ["Recorded course volume", reportRows(recorded, "volume", "course volume")],
            ["Simulated course volume", reportRows(simulated, "volume", "simulated volume")],
            ["Recorded SkillHub commission", reportRows(recorded, "skillhubCommission", "commission")],
            ["Recorded instructor earnings", reportRows(recorded, "instructorEarnings", "earnings")],
            ["External freelance payment reports", external.map(function(row) { return "<div style='display:flex;justify-content:space-between;gap:.5rem;font-size:.82rem;padding:.2rem 0;'><span>" + esc(row.currency) + " " + esc(row.status) + " · reported</span><strong>" + Number(row.reportedVolume || 0).toFixed(2) + "</strong></div><small style='display:block;color:#64748b;'>Freelancer net " + Number(row.freelancerNetReported || 0).toFixed(2) + " · commission outstanding " + Number(row.skillhubCommissionOutstanding || 0).toFixed(2) + " · SkillHub cash 0.00</small>"; }).join("") || "<p style='color:#64748b;font-size:.82rem;'>No external reports.</p>"],
            ["Pending course orders", pending.map(function(row) { return "<div style='display:flex;justify-content:space-between;gap:.5rem;font-size:.82rem;padding:.2rem 0;'><span>" + esc(row.currency) + " pending orders</span><strong>" + Number(row.count || 0) + "</strong></div>"; }).join("") || "<p style='color:#64748b;font-size:.82rem;'>No pending orders.</p>"],
            ["Withdrawals", withdrawals.map(function(row) { return "<div style='display:flex;justify-content:space-between;gap:.5rem;font-size:.82rem;padding:.2rem 0;'><span>" + esc(row.currency) + " " + esc(row.status) + "</span><strong>" + Number(row.count || 0) + " · " + Number(row.amount || 0).toFixed(2) + "</strong></div>"; }).join("") || "<p style='color:#64748b;font-size:.82rem;'>No withdrawal records.</p>"]
        ];
        container.innerHTML = "<article class='stat-card'><i class='fas fa-receipt'></i><h3>" + Number(report.transactionCount || 0) + "</h3><p>Recorded transactions</p></article>" + cards.map(function(card) {
            return "<article class='stat-card'><p style='font-weight:700;color:#1e293b;margin-bottom:.5rem;'>" + card[0] + "</p>" + card[1] + "</article>";
        }).join("");
    } catch (error) {
        container.innerHTML = "<p style='padding:.75rem;color:#991b1b;'>Could not load financial report: " + esc(error.message) + "</p>";
    }
}

async function loadCommissionSettings() {
    try {
        var data = await apiGet("/admin/settings/commission");
        var settings = data.settings || {};
        var course = settings.course || {};
        var freelance = settings.freelance || {};
        document.getElementById("courseInstructorShare").value = course.instructorSharePercent ?? 80;
        document.getElementById("courseCommissionShare").value = course.skillhubCommissionPercent ?? 20;
        document.getElementById("freelancerShare").value = freelance.freelancerSharePercent ?? 90;
        document.getElementById("freelanceCommissionShare").value = freelance.skillhubCommissionPercent ?? 10;
        document.getElementById("commissionSettingsMessage").textContent = "Current rates loaded.";
    } catch (error) {
        document.getElementById("commissionSettingsMessage").textContent = "Could not load settings: " + error.message;
    }
}

async function saveCommissionSettings() {
    var message = document.getElementById("commissionSettingsMessage");
    var settings = {
        course: {
            instructorSharePercent: Number(document.getElementById("courseInstructorShare").value),
            skillhubCommissionPercent: Number(document.getElementById("courseCommissionShare").value)
        },
        freelance: {
            freelancerSharePercent: Number(document.getElementById("freelancerShare").value),
            skillhubCommissionPercent: Number(document.getElementById("freelanceCommissionShare").value)
        }
    };
    message.textContent = "Saving…";
    try {
        await apiPut("/admin/settings/commission", settings);
        message.textContent = "Rates saved. New course orders will use these settings.";
    } catch (error) {
        message.textContent = "Could not save rates: " + error.message;
    }
}

async function loadFinancialReviewQueues() {
    var container = document.getElementById("financialReviewQueues");
    if (!container) return;
    container.innerHTML = "<div class='loading'>Loading financial review records…</div>";
    try {
        var results = await Promise.all([
            apiGet("/admin/refund-requests"),
            apiGet("/admin/withdrawal-requests"),
            apiGet("/admin/freelance-payment-reports")
        ]);
        var refunds = results[0].refunds || [];
        var withdrawals = results[1].withdrawals || [];
        var reports = results[2].reports || [];
        var refundRows = refunds.map(function(item) {
            var open = !["approved_recorded", "rejected"].includes(item.status);
            var actions = open
                ? "<button class='action-btn btn-approve' onclick=\"reviewFinanceItem('refund-requests','" + esc(item.id) + "','approved_recorded')\">Record approved</button><button class='action-btn btn-reject' onclick=\"reviewFinanceItem('refund-requests','" + esc(item.id) + "','rejected')\">Reject</button>"
                : "<span class='badge badge-pending'>" + esc(item.status) + "</span>";
            return "<tr><td>Refund</td><td>" + esc(item.user && item.user.name || "User") + "</td><td>" + esc(item.transaction && item.transaction.reference || item.reference) + "</td><td>" + esc(item.transaction && item.transaction.currency || "USD") + " " + Number(item.transaction && item.transaction.amount || 0).toFixed(2) + "</td><td>" + esc(item.reason) + "</td><td>" + esc(item.status) + "</td><td>" + actions + "</td></tr>";
        });
        var withdrawalRows = withdrawals.map(function(item) {
            var open = !["rejected", "failed", "reversed", "completed"].includes(item.status);
            var actions = open
                ? "<button class='action-btn btn-approve' onclick=\"reviewFinanceItem('withdrawal-requests','" + esc(item.id) + "','approved')\">Approve request</button><button class='action-btn btn-reject' onclick=\"reviewFinanceItem('withdrawal-requests','" + esc(item.id) + "','rejected')\">Reject</button><button class='action-btn btn-view' onclick=\"reviewFinanceItem('withdrawal-requests','" + esc(item.id) + "','completed')\">Record simulated complete</button>"
                : "<span class='badge badge-pending'>" + esc(item.status) + "</span>";
            return "<tr><td>Withdrawal · simulated workflow</td><td>" + esc(item.user && item.user.name || "User") + " (" + esc(item.user && item.user.role || "") + ")</td><td>" + esc(item.reference) + "</td><td>" + esc(item.currency) + " " + Number(item.amount).toFixed(2) + "</td><td>" + esc(item.payoutMethod) + " " + esc(item.destinationMasked || "") + "</td><td>" + esc(item.status) + "</td><td>" + actions + "</td></tr>";
        });
        var reportRows = reports.map(function(item) {
            var open = !["verified_external", "rejected"].includes(item.status);
            var actions = open
                ? (item.status === "client_confirmed" ? "<button class='action-btn btn-approve' onclick=\"reviewFinanceItem('freelance-payment-reports','" + esc(item.id) + "','verified_external')\">Verify external</button>" : "") + "<button class='action-btn btn-view' onclick=\"reviewFinanceItem('freelance-payment-reports','" + esc(item.id) + "','needs_evidence')\">Request evidence</button><button class='action-btn btn-reject' onclick=\"reviewFinanceItem('freelance-payment-reports','" + esc(item.id) + "','rejected')\">Reject report</button>"
                : "<span class='badge badge-pending'>" + esc(item.status) + "</span>";
            return "<tr><td>External freelance payment</td><td>" + esc(item.reporter && item.reporter.name || "Freelancer") + "</td><td>" + esc(item.project && item.project.reference || "") + " · " + esc(item.reference) + "</td><td>" + esc(item.currency) + " " + Number(item.amount).toFixed(2) + "</td><td>" + esc(item.paymentMethodDescription) + " · " + esc(item.transactionReference || "No ref") + "</td><td>" + esc(item.status) + "</td><td>" + actions + "</td></tr>";
        });
        var rows = refundRows.concat(withdrawalRows, reportRows);
        container.innerHTML = rows.length
            ? "<table><thead><tr><th>Record</th><th>Account</th><th>Reference</th><th>Amount</th><th>Details</th><th>Status</th><th>Actions</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>"
            : "<p style='padding:1.25rem;color:#64748b;'>No refund, withdrawal, or freelance payment reports to review.</p>";
    } catch (error) {
        container.innerHTML = "<p style='padding:1rem;color:#991b1b;'>Could not load review queues: " + esc(error.message) + "</p>";
    }
}

async function reviewFinanceItem(resource, id, status) {
    var reason = "";
    var note = "";
    if (status === "rejected" || status === "needs_evidence" || status === "flagged") {
        reason = prompt(status === "rejected" ? "Reason for rejection:" : "Provide a review note:");
        if (!reason || !reason.trim()) return;
    }
    if (resource === "withdrawal-requests" && status === "completed") {
        note = "Simulated processing record only; no payout transfer was initiated.";
        if (!confirm("Record this request as simulated completion? This does not transfer money.")) return;
    }
    try {
        await apiPut("/admin/" + resource + "/" + encodeURIComponent(id) + "/review", { status: status, reason: reason, note: note });
        await loadFinancialReviewQueues();
        await loadFinancialReport();
    } catch (error) {
        alert("Could not update financial record: " + error.message);
    }
}

function viewTransaction(btn) {
    var t;
    try { t = JSON.parse(btn.getAttribute("data-tx").replace(/&quot;/g, '"')); } catch(e) { alert("Could not load transaction details."); return; }

    var user     = t.userId ? t.userId.name  : "Unknown";
    var phone    = t.userId ? (t.userId.phone || t.payerPhone || "-") : (t.payerPhone || "-");
    var email    = t.userId ? (t.userId.email || "-") : "-";
    var userId   = t.userId ? (t.userId._id  || t.userId) : "";
    var itemId   = t.metadata ? (t.metadata.courseId || t.metadata.freelancerId || "") : "";
    var itemType = t.type || "course_purchase";
    var isPending = t.status === "pending";

    // Receipt image — could be a URL or base64
    var receiptHtml = "";
    var receiptSrc  = t.receiptImage || t.receiptUrl || (t.metadata && (t.metadata.paymentProof || t.metadata.receiptUrl)) || null;
    if (receiptSrc) {
        receiptHtml =
            "<div style='margin:1rem 0;'>" +
            "<div style='font-size:0.78rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem;'>Receipt Image</div>" +
            "<img src='" + receiptSrc + "' class='receipt-img' alt='Payment receipt' " +
            "onerror=\"this.outerHTML='<p style=\\'color:#ef4444;font-size:0.85rem;\\'>Receipt image could not be loaded.</p>'\" />" +
            "<a href='" + receiptSrc + "' target='_blank' style='font-size:0.78rem;color:#2563eb;font-weight:600;'>" +
            "<i class='fas fa-external-link-alt'></i> Open full size</a>" +
            "</div>";
    } else if (t.isSimulated) {
        receiptHtml = "<div style='background:#eff6ff;border:1px solid #bfdbfe;border-radius:0.5rem;padding:0.75rem;font-size:0.82rem;color:#1e40af;margin:1rem 0;'><i class='fas fa-flask'></i> Simulated transaction only. No funds were received or transferred.</div>";
    } else {
        receiptHtml = "<div style='background:#fef3c7;border:1px solid #fde68a;border-radius:0.5rem;padding:0.75rem;font-size:0.82rem;color:#92400e;margin:1rem 0;'>" +
            "<i class='fas fa-exclamation-triangle'></i> No receipt image available for this transaction.</div>";
    }

    // Approve/Reject buttons inside modal (only for pending)
    var modalActionBtns = isPending
        ? "<button class='action-btn btn-approve' style='flex:1;justify-content:center;padding:0.75rem;font-size:0.9rem;' " +
            "onclick=\"closeModal();approveTransaction('" + t._id + "','" + userId + "','" + itemId + "','" + itemType + "')\">" +
            "<i class='fas fa-check-circle'></i> Approve Payment</button>" +
          "<button class='action-btn btn-reject' style='flex:1;justify-content:center;padding:0.75rem;font-size:0.9rem;' " +
            "onclick=\"closeModal();rejectTransaction('" + t._id + "')\">" +
            "<i class='fas fa-times-circle'></i> Reject</button>"
        : "<span style='color:#64748b;font-size:0.875rem;'>This transaction is already <strong>" + t.status + "</strong>.</span>";

    document.getElementById("modalContent").innerHTML =
        "<h3><i class='fas fa-receipt' style='color:#2563eb;margin-right:0.5rem;'></i>Transaction Details</h3>" +
        detailHtml("Status",   "<span class='badge badge-" + t.status + "'>" + t.status + "</span>") +
        detail("User",       user) +
        detail("Email",      email) +
        detail("Phone",      phone) +
        detail("Item",       t.itemName || "-") +
        detail("Type",       t.type || "-") +
        detail("Amount",     "$" + parseFloat(t.amount || 0).toFixed(2)) +
        detail("Currency",   t.currency || "USD") +
        (t.isSimulated ? detail("Payment Mode", "Simulated — no funds transferred") : "") +
        detail("SkillHub Commission", "$" + parseFloat(t.commission || 0).toFixed(2)) +
        detail("Net Earnings", "$" + parseFloat(t.netAmount || 0).toFixed(2)) +
        detail("Method",     t.paymentMethod || "-") +
        detail("Tx Ref",     t.transactionRef || t.txRef || "-") +
        detail("Payer Name", t.payerName || "-") +
        detail("Submitted",  new Date(t.createdAt).toLocaleString()) +
        (t.notes ? detail("Notes", t.notes) : "") +
        receiptHtml +
        "<div class='modal-actions'>" + modalActionBtns + "</div>";

    document.getElementById("detailModal").classList.add("active");
}

// ===== PENDING PAYMENTS TAB =====
async function loadPendingPayments() {
    var el = document.getElementById("pendingPaymentsTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading pending payments...</div>";
    try {
        var data = await apiGet("/admin/transactions?limit=100");
        if (!data.success) { el.innerHTML = "<p style='padding:1rem;color:red;'>Failed to load transactions.</p>"; return; }

        var pending = (data.transactions || []).filter(function(t) {
            return t.status === "pending" && !(t.metadata && t.metadata.paymentMode === "prelaunch_simulated");
        });

        // Update badge
        var badge = document.getElementById("pendingPaymentsCount");
        if (badge) badge.textContent = pending.length > 0 ? pending.length : "";

        if (!pending.length) {
            el.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>" +
                "<i class='fas fa-check-circle' style='color:#10b981;font-size:2rem;display:block;margin-bottom:0.5rem;'></i>" +
                "No pending payments. All caught up!</p>";
            return;
        }

        var rows = pending.map(function(t) {
            var user     = t.userId ? t.userId.name : "Unknown";
            var userId   = t.userId ? (t.userId._id || t.userId) : "";
            var itemId   = t.metadata ? (t.metadata.courseId || t.metadata.freelancerId || "") : "";
            var itemType = t.type || "course_purchase";
            var txJson   = JSON.stringify(t).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;");
            var hasReceipt = !!(t.receiptImage || t.receiptUrl || (t.metadata && (t.metadata.paymentProof || t.metadata.receiptUrl)));

            return "<tr>" +
                "<td><strong>" + esc(user) + "</strong></td>" +
                "<td>" + esc(t.itemName || t.type || "-") + "</td>" +
                "<td>$" + parseFloat(t.amount || 0).toFixed(2) + "</td>" +
                "<td>" + esc(t.paymentMethod || "-") + "</td>" +
                "<td>" + esc(t.transactionRef || t.txRef || "-") + "</td>" +
                "<td>" + new Date(t.createdAt).toLocaleDateString() + "</td>" +
                "<td>" +
                    "<button class='action-btn btn-view' onclick='viewTransaction(this)' data-tx='" + txJson + "'>" +
                        "<i class='fas fa-" + (hasReceipt ? "image" : "eye") + "'></i> " +
                        (hasReceipt ? "View Receipt" : "View") +
                    "</button>" +
                    "<button class='action-btn btn-approve' onclick='approveTransaction(\"" + t._id + "\",\"" + userId + "\",\"" + itemId + "\",\"" + itemType + "\")'>✓ Approve</button>" +
                    "<button class='action-btn btn-reject' onclick='rejectTransaction(\"" + t._id + "\")'>✗ Reject</button>" +
                "</td>" +
            "</tr>";
        }).join("");

        el.innerHTML = "<table><thead><tr>" +
            "<th>User</th><th>Item</th><th>Amount</th><th>Method</th><th>Tx Ref</th><th>Date</th><th>Actions</th>" +
            "</tr></thead><tbody>" + rows + "</tbody></table>";

    } catch(err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function approveTransaction(txId, userId, itemId, itemType) {
    if (!confirm("Approve this payment and enroll the user?")) return;
    try {
        // Step 1: Approve the transaction
        var res = await apiPut("/admin/transactions/" + txId + "/approve", {});
        if (!res.success) throw new Error(res.message || "Approval failed");

        // Enrollment and wallet settlement are committed by the backend with the approval.
        // Notify user via WhatsApp if their phone is available.
        try {
            var tx = res.transaction || {};
            var userPhone = tx.payerPhone || (tx.userId && tx.userId.phone) || null;
            var courseName = tx.itemName || "your course";
            if (userPhone) {
                var clean = userPhone.replace(/\D/g, "");
                // Prepend country code if missing (default Uganda 256)
                if (clean.length <= 10) clean = "256" + clean.replace(/^0/, "");
                var msg = encodeURIComponent(
                    "✅ SkillHub Payment Approved!\n\n" +
                    "Your payment for \"" + courseName + "\" has been verified and your access is now active.\n\n" +
                    "👉 Log in at skillhub.netlify.app and go to Profile → My Courses to start learning.\n\n" +
                    "Thank you for choosing SkillHub! 🎓"
                );
                window.open("https://wa.me/" + clean + "?text=" + msg, "_blank");
            }
        } catch(e) { /* WhatsApp notification is best-effort */ }

        alert("Payment approved! User has been notified.");
        loadTransactions();
        loadPendingPayments();
        loadPendingCount();
        loadOverview();
    } catch(err) {
        alert("Error: " + err.message);
    }
}

async function rejectTransaction(txId) {
    var reason = prompt("Reason for rejection (will be shown to user):");
    if (reason === null) return;
    try {
        var res = await apiPut("/admin/transactions/" + txId + "/reject", { reason: reason || "Payment could not be verified." });
        if (!res.success) throw new Error(res.message || "Rejection failed");
        alert("Payment rejected. User has been notified.");
        loadTransactions();
        loadPendingPayments();
        loadPendingCount();
    } catch(err) {
        alert("Error: " + err.message);
    }
}

// ===== MESSAGES =====
async function loadMessages() {
    var el = document.getElementById("messagesTable");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading messages...</div>";

    var messages = [];

    // Try backend first — messages submitted from any device appear here
    try {
        var data = await apiGet("/contact/messages");
        if (data.success && data.messages && data.messages.length) {
            messages = data.messages.map(function(m) {
                return {
                    name:      m.name      || "-",
                    email:     m.email     || "-",
                    phone:     m.phone     || "-",
                    subject:   m.subject   || "-",
                    message:   m.message   || "",
                    timestamp: m.createdAt || m.timestamp || new Date().toISOString()
                };
            });
        }
    } catch(e) { /* backend endpoint may not exist yet — fall through */ }

    // Merge localStorage messages (submitted before backend endpoint existed)
    // Deduplicate by timestamp
    var local = [];
    try { local = JSON.parse(localStorage.getItem("skillhub_contacts") || "[]"); } catch(e) {}
    if (local.length) {
        var backendTimestamps = new Set(messages.map(function(m) { return m.timestamp; }));
        local.forEach(function(m) {
            if (!backendTimestamps.has(m.timestamp)) messages.push(m);
        });
    }

    // Sort newest first
    messages.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    if (!messages.length) {
        el.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'>" +
            "<i class='fas fa-inbox' style='font-size:2rem;display:block;margin-bottom:0.5rem;opacity:0.3;'></i>" +
            "No messages yet. Messages submitted via the contact form will appear here.</p>";
        return;
    }

    var rows = messages.map(function(m) {
        return "<tr>" +
            "<td>" + esc(m.name) + "</td>" +
            "<td>" + esc(m.email) + "</td>" +
            "<td>" + esc(m.subject || "-") + "</td>" +
            "<td>" + esc((m.message || "").substring(0, 60)) + (m.message && m.message.length > 60 ? "..." : "") + "</td>" +
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

// Like detail() but value is already safe HTML (e.g. a badge span)
function detailHtml(label, valueHtml) {
    return "<div class='detail-row'><span class='detail-label'>" + label + ":</span><span>" + valueHtml + "</span></div>";
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

    // Also refresh pending payments badge
    try {
        var txData = await apiGet("/admin/transactions?limit=100");
        if (txData.success) {
            var pendingCount = (txData.transactions || []).filter(function(t) {
                return t.status === "pending" && !(t.metadata && t.metadata.paymentMode === "prelaunch_simulated");
            }).length;
            var payBadge = document.getElementById("pendingPaymentsCount");
            if (payBadge) payBadge.textContent = pendingCount > 0 ? pendingCount : "";
        }
    } catch(e) {}
}

// ===== LIVE CHATS (Admin view of all conversations) =====

async function loadAllChats() {
    var el = document.getElementById("chatsContainer");
    el.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading conversations...</div>";
    try {
        var res = await fetch(API_BASE + "/chat/admin/all", {
            headers: { "Authorization": "Bearer " + adminToken }
        });
        var data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to load chats");

        var convs = data.conversations || [];
        if (!convs.length) {
            el.innerHTML = "<p style='padding:2rem;text-align:center;color:#64748b;'><i class='fas fa-comment-slash' style='font-size:2rem;display:block;margin-bottom:0.5rem;opacity:0.3;'></i>No conversations yet.</p>";
            return;
        }

        var html = "<table><thead><tr>" +
            "<th>Participant 1</th><th>Participant 2</th>" +
            "<th>Last Message</th><th>Messages</th><th>Time</th><th>Action</th>" +
            "</tr></thead><tbody>";

        html += convs.map(function(c) {
            var u1 = c.user1 || {};
            var u2 = c.user2 || {};
            var lastMsg = c.lastMessage || {};
            var preview = (lastMsg.content || "").substring(0, 50) + (lastMsg.content && lastMsg.content.length > 50 ? "…" : "");
            var time = lastMsg.createdAt ? new Date(lastMsg.createdAt).toLocaleString() : "-";
            return "<tr>" +
                "<td><strong>" + esc(u1.name || "Unknown") + "</strong><br><small style='color:#64748b;'>" + esc(u1.role || "") + "</small></td>" +
                "<td><strong>" + esc(u2.name || "Unknown") + "</strong><br><small style='color:#64748b;'>" + esc(u2.role || "") + "</small></td>" +
                "<td style='max-width:200px;'>" + esc(preview) + "</td>" +
                "<td><span class='chat-msg-count'>" + (c.messageCount || 0) + "</span></td>" +
                "<td style='font-size:0.78rem;color:#64748b;'>" + time + "</td>" +
                "<td><button class='action-btn btn-view' onclick='viewAdminChat(\"" + esc(c.conversationId) + "\", \"" + esc(u1.name || "User") + "\", \"" + esc(u2.name || "User") + "\")'>" +
                "<i class='fas fa-eye'></i> View</button></td>" +
                "</tr>";
        }).join("");

        html += "</tbody></table>";
        el.innerHTML = html;

    } catch(err) {
        el.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

async function viewAdminChat(conversationId, name1, name2) {
    var panel = document.getElementById("chatViewerPanel");
    var title = document.getElementById("chatViewerTitle");
    var msgArea = document.getElementById("chatViewerMessages");

    title.innerHTML = "<i class='fas fa-comments' style='color:#2563eb;'></i> " + esc(name1) + " &harr; " + esc(name2);
    msgArea.innerHTML = "<div class='loading'><i class='fas fa-spinner fa-spin'></i> Loading...</div>";
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth" });

    try {
        var res = await fetch(API_BASE + "/chat/admin/conversation/" + encodeURIComponent(conversationId), {
            headers: { "Authorization": "Bearer " + adminToken }
        });
        var data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to load");

        var messages = data.messages || [];
        if (!messages.length) {
            msgArea.innerHTML = "<p style='text-align:center;color:#94a3b8;padding:2rem;'>No messages in this conversation.</p>";
            return;
        }

        var html = "";
        var lastDate = null;

        messages.forEach(function(msg) {
            var d = new Date(msg.createdAt);
            var dateStr = d.toDateString();
            if (dateStr !== lastDate) {
                html += "<div class='admin-date-sep'>" + d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) + "</div>";
                lastDate = dateStr;
            }

            var sender = msg.senderId || {};
            var receiver = msg.receiverId || {};
            var senderName = sender.name || "User";
            var initials = senderName.split(" ").map(function(n){ return n[0]; }).join("").toUpperCase().slice(0,2);
            var time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            var isRight = messages.indexOf(msg) % 2 === 0; // alternate for visual variety — actual direction based on sender

            // Determine direction: we'll use index-based alternation for admin view
            // Actually use sender name to keep consistent
            var direction = (senderName === name1) ? "left" : "right";

            var bubbleContent = "";
            if (msg.type === "image" && msg.fileUrl) {
                bubbleContent = "<img src='" + esc(msg.fileUrl) + "' style='max-width:180px;border-radius:8px;display:block;margin-bottom:4px;' />";
                if (msg.content && msg.content !== msg.fileName) bubbleContent += esc(msg.content);
            } else {
                bubbleContent = esc(msg.content || "");
            }

            html += "<div class='admin-msg-row " + direction + "'>" +
                "<div class='chat-avatar' style='width:30px;height:30px;font-size:0.7rem;flex-shrink:0;'>" + initials + "</div>" +
                "<div>" +
                    "<div class='admin-msg-sender'>" + esc(senderName) + " → " + esc(receiver.name || "User") + "</div>" +
                    "<div class='admin-bubble'>" + bubbleContent + "</div>" +
                    "<div class='admin-msg-time'>" + time + (msg.read ? " · Read ✓✓" : "") + "</div>" +
                "</div>" +
            "</div>";
        });

        msgArea.innerHTML = html;
        msgArea.scrollTop = msgArea.scrollHeight;

    } catch(err) {
        msgArea.innerHTML = "<p style='color:red;padding:1rem;'>Error: " + err.message + "</p>";
    }
}

// ===== EXCHANGE RATES =====

// Default rates (fallback if admin has never set them)
var DEFAULT_RATES = {
    ET: { code: 'ETB', name: 'Ethiopia',    flag: '🇪🇹', rate: 175  },
    UG: { code: 'UGX', name: 'Uganda',      flag: '🇺🇬', rate: 3500 },
    SS: { code: 'SSP', name: 'South Sudan', flag: '🇸🇸', rate: 5400 },
    KE: { code: 'KES', name: 'Kenya',       flag: '🇰🇪', rate: 120  }
};

var RATES_STORAGE_KEY = 'skillhub_exchange_rates';

function getRates() {
    try {
        var stored = localStorage.getItem(RATES_STORAGE_KEY);
        return stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_RATES));
    } catch(e) {
        return JSON.parse(JSON.stringify(DEFAULT_RATES));
    }
}

async function loadRates() {
    var rates = getRates();
    var form = document.getElementById('ratesForm');
    if (!form) return;

    try {
        var token = getAdminToken();
        if (token) {
            var response = await fetch(API_BASE + '/admin/settings/exchange-rates', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            var result = await response.json();
            if (response.ok && result.success && result.rates) {
                rates = Object.assign({}, DEFAULT_RATES, result.rates);
                localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates));
            }
        }
    } catch(e) {
        // Use the last local copy if the backend cannot be reached.
    }

    var html = '';
    Object.keys(DEFAULT_RATES).forEach(function(countryCode) {
        var def = DEFAULT_RATES[countryCode];
        var current = rates[countryCode] || def;
        var currentRate = current.rate || def.rate;

        html += '<div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;margin-bottom:0.75rem;">' +
            '<div style="font-size:1.5rem;flex-shrink:0;">' + def.flag + '</div>' +
            '<div style="flex:1;">' +
                '<div style="font-weight:700;font-size:0.9rem;color:#1e293b;">' + def.name + '</div>' +
                '<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">1 USD = ? ' + def.code + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;">' +
                '<input type="number" id="rate-' + countryCode + '" value="' + currentRate + '" min="1" step="1" ' +
                'style="width:110px;padding:0.5rem 0.75rem;border:2px solid #e2e8f0;border-radius:0.5rem;font-size:0.9rem;font-weight:700;text-align:center;font-family:inherit;" ' +
                'oninput="previewRate(\'' + countryCode + '\', this.value, \'' + def.code + '\')">' +
                '<span style="font-size:0.85rem;font-weight:600;color:#64748b;">' + def.code + '</span>' +
            '</div>' +
        '</div>' +
        '<div id="preview-' + countryCode + '" style="font-size:0.78rem;color:#059669;margin:-0.5rem 0 0.75rem 1rem;display:none;">' +
        '</div>';
    });

    form.innerHTML = html;

    // Show current preview for each rate
    Object.keys(DEFAULT_RATES).forEach(function(countryCode) {
        var inputEl = document.getElementById('rate-' + countryCode);
        if (inputEl) previewRate(countryCode, inputEl.value, DEFAULT_RATES[countryCode].code);
    });
}

function previewRate(countryCode, rateVal, code) {
    var preview = document.getElementById('preview-' + countryCode);
    if (!preview) return;
    var rate = parseFloat(rateVal);
    if (!rate || rate <= 0) { preview.style.display = 'none'; return; }
    // Show example: $10 = X local
    var example10 = Math.round(10 * rate).toLocaleString();
    var example30 = Math.round(30 * rate).toLocaleString();
    preview.style.display = 'block';
    preview.innerHTML = '<i class="fas fa-check-circle"></i> ' +
        '$10 ≈ ' + example10 + ' ' + code + ' &nbsp;|&nbsp; ' +
        '$30 ≈ ' + example30 + ' ' + code;
}

async function saveRates() {
    var btn = document.getElementById('saveRatesBtn');
    var msg = document.getElementById('ratesSaveMsg');
    var rates = {};
    var valid = true;

    Object.keys(DEFAULT_RATES).forEach(function(countryCode) {
        var input = document.getElementById('rate-' + countryCode);
        if (!input) return;
        var val = parseFloat(input.value);
        if (!val || val <= 0) { valid = false; return; }
        rates[countryCode] = Object.assign({}, DEFAULT_RATES[countryCode], { rate: val });
    });

    if (!valid) {
        msg.style.display = 'block';
        msg.style.background = '#fee2e2';
        msg.style.color = '#991b1b';
        msg.textContent = 'Please enter a valid rate (greater than 0) for all currencies.';
        return;
    }

    // Disable button while saving
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        var token = getAdminToken();
        if (!token) throw new Error('Admin session expired. Please sign in again.');
        var response = await fetch(API_BASE + '/admin/settings/exchange-rates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ rates: rates })
        });
        var result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Could not save rates to the backend.');
        }
        rates = Object.assign({}, DEFAULT_RATES, result.rates || rates);
        localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates));
    } catch(e) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Exchange Rates';
        msg.style.display = 'block';
        msg.style.background = '#fee2e2';
        msg.style.color = '#991b1b';
        msg.textContent = e.message || 'Could not save exchange rates. Please retry.';
        return;
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Exchange Rates';

    msg.style.display = 'block';
    msg.style.background = '#d1fae5';
    msg.style.color = '#065f46';
    msg.textContent = '✓ Exchange rates saved successfully! The payment page will now use these rates.';

    setTimeout(function() { msg.style.display = 'none'; }, 4000);
}
