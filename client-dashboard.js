(function () {
    "use strict";

    var API_BASE = window.SKILLHUB_API_BASE || "https://skillhub-backend-i3dr.onrender.com/api";
    var token = sessionStorage.getItem("skillhub_token") || localStorage.getItem("skillhub_token");

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
        });
    }

    async function apiRequest(path, method, body) {
        var response = await fetch(API_BASE + path, {
            method: method || "GET",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: body ? JSON.stringify(body) : undefined
        });
        var result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
        return result;
    }

    var validViews = [
        "overview",
        "talent",
        "post-project",
        "projects",
        "proposals",
        "hired",
        "messages",
        "contracts",
        "deliverables",
        "payments",
        "saved",
        "reviews"
    ];

    function getSessionUser() {
        var user = null;
        if (window.StorageManager && StorageManager.getUserSession) {
            user = StorageManager.getUserSession() || {};
        }
        if (!user || !user.loggedIn) {
            user = { name: "Client", role: "client" };
        }
        return user;
    }

    function setAvatar(element, url) {
        if (!element) return;
        element.innerHTML = "<i class='fas fa-user' aria-hidden='true'></i>";
        if (!url) return;
        var image = document.createElement("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", function () { image.remove(); });
        element.appendChild(image);
    }

    function setActiveView(view) {
        var sections = document.querySelectorAll(".client-view-section");
        sections.forEach(function (section) {
            section.hidden = section.id !== view;
        });

        document.querySelectorAll("[data-client-nav]").forEach(function (link) {
            var active = link.getAttribute("data-client-nav") === view;
            link.classList.toggle("active", active);
            if (active) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });

        if (view === "overview") {
            document.title = "Client Dashboard | SkillHub";
        } else {
            var titleMap = {
                talent: "Find Talent",
                "post-project": "Post a Project",
                projects: "My Projects",
                proposals: "Proposals",
                hired: "Hired Talent",
                messages: "Messages",
                contracts: "Contracts",
                deliverables: "Deliverables",
                payments: "Payments & Transactions",
                saved: "Saved Talent",
                reviews: "Reviews"
            };
            document.title = (titleMap[view] || "Client Dashboard") + " | SkillHub";
        }
    }

    function bindEvents() {
        document.getElementById("clientLogoutBtn").addEventListener("click", function () {
            if (window.ApiService) ApiService.clearToken();
            [sessionStorage, localStorage].forEach(function (storage) {
                storage.removeItem("skillhub_token");
                storage.removeItem("skillhub_user");
            });
            window.location.href = "index.html#login-register";
        });

        document.getElementById("clientMenuButton").addEventListener("click", openMenu);
        document.getElementById("clientSidebarClose").addEventListener("click", closeMenu);
        document.getElementById("clientScrim").addEventListener("click", closeMenu);
        document.querySelectorAll("[data-client-nav]").forEach(function (link) {
            link.addEventListener("click", function () {
                closeMenu();
            });
        });
        window.addEventListener("resize", function () {
            if (window.innerWidth > 760) closeMenu();
        });
    }

    function openMenu() {
        document.getElementById("clientSidebar").classList.add("is-open");
        document.getElementById("clientScrim").hidden = false;
        document.getElementById("clientMenuButton").setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
    }

    function closeMenu() {
        document.getElementById("clientSidebar").classList.remove("is-open");
        document.getElementById("clientScrim").hidden = true;
        document.getElementById("clientMenuButton").setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
    }

    function populateUser(sessionUser) {
        sessionUser = sessionUser || getSessionUser();
        var name = sessionUser.name || "Client";
        var firstName = name.split(/\s+/)[0] || "Client";

        document.getElementById("clientName").textContent = name;
        document.getElementById("clientWelcomeName").textContent = firstName;

        var profilePicture = sessionUser.profilePicture || "";
        setAvatar(document.getElementById("clientAvatar"), profilePicture);
        setAvatar(document.getElementById("clientHeaderAvatar"), profilePicture);

        document.getElementById("clientOpenProjects").textContent = "0";
        document.getElementById("clientHiredCount").textContent = "0";
        document.getElementById("clientTotalSpent").textContent = "$0.00";
        document.getElementById("clientActiveProjects").textContent = "0";
        document.getElementById("clientHiredFreelancers").textContent = "0";
        document.getElementById("clientPendingProposals").textContent = "0";
        document.getElementById("clientSpentTotal").textContent = "$0.00";
    }

    function setProjectMessage(message, isError) {
        var element = document.getElementById("clientProjectMessage");
        if (!element) return;
        element.textContent = message || "";
        element.style.color = isError ? "#b42318" : "#2563eb";
    }

    async function loadFreelancers() {
        var select = document.getElementById("projectFreelancer");
        if (!select) return;
        try {
            var data = await apiRequest("/freelancers?limit=100");
            var freelancers = Array.isArray(data.freelancers) ? data.freelancers : [];
            select.innerHTML = "<option value=''>Choose an approved freelancer</option>" + freelancers.map(function (freelancer) {
                var name = freelancer.userId && freelancer.userId.name || "Freelancer";
                var details = [freelancer.title, Array.isArray(freelancer.skills) ? freelancer.skills.slice(0, 3).join(", ") : ""].filter(Boolean).join(" · ");
                return "<option value='" + escapeHtml(freelancer.id || freelancer._id) + "'>" + escapeHtml(name) + (details ? " — " + escapeHtml(details) : "") + "</option>";
            }).join("");
            if (!freelancers.length) select.innerHTML = "<option value=''>No approved freelancers available</option>";
        } catch (error) {
            select.innerHTML = "<option value=''>Freelancers could not be loaded</option>";
        }
    }

    function paymentReportHtml(project) {
        var reports = Array.isArray(project.paymentReports) ? project.paymentReports : [];
        if (!reports.length) return "<p class='client-data-note'>No external payment reports yet.</p>";
        return "<div class='client-payment-reports'><h4>Reported external payments</h4>" + reports.map(function (report) {
            var actions = report.status === "awaiting_client"
                ? "<div class='client-report-actions'><button type='button' data-report-decision='confirm' data-project-id='" + escapeHtml(project.id) + "' data-report-id='" + escapeHtml(report.id) + "'>Confirm</button><button type='button' data-report-decision='dispute' data-project-id='" + escapeHtml(project.id) + "' data-report-id='" + escapeHtml(report.id) + "'>Dispute</button></div>"
                : "";
            return "<article class='client-payment-report'><div><strong>" + escapeHtml(report.currency) + " " + Number(report.amount || 0).toFixed(2) + "</strong><span>" + escapeHtml(String(report.status || "reported").replace(/_/g, " ")) + "</span></div><p>" + escapeHtml(report.paymentMethodDescription || "External payment") + " · " + escapeHtml(report.paymentDate ? new Date(report.paymentDate).toLocaleDateString() : "Date unavailable") + "</p><small>SkillHub commission recorded as outstanding: " + escapeHtml(report.currency) + " " + Number(report.commissionAmount || 0).toFixed(2) + " · not collected</small>" + actions + "</article>";
        }).join("") + "</div>";
    }

    function renderProjects(projects) {
        var container = document.getElementById("clientProjectList");
        if (!container) return;
        if (!projects.length) {
            container.innerHTML = "<div class='client-empty-state client-large-empty'><i class='fas fa-list-check'></i><div><strong>No projects yet</strong><p>Create a project agreement with an approved freelancer to start tracking delivery and external payment reports.</p></div></div>";
            return;
        }
        container.innerHTML = projects.map(function (project) {
            var completeAction = project.completionStatus === "delivered" && project.status !== "completed"
                ? "<button type='button' class='client-project-action' data-project-complete='" + escapeHtml(project.id) + "'>Approve deliverable</button>"
                : "";
            return "<article class='client-project-card'><header><div><span class='client-project-ref'>" + escapeHtml(project.reference) + "</span><h3>" + escapeHtml(project.title) + "</h3></div><span class='client-project-status'>" + escapeHtml(String(project.status).replace(/_/g, " ")) + "</span></header><p>" + escapeHtml(project.description) + "</p><div class='client-project-meta'><span>Freelancer: " + escapeHtml(project.freelancer && project.freelancer.name || "Freelancer") + "</span><strong>Agreed budget: " + escapeHtml(project.currency) + " " + Number(project.budget).toFixed(2) + "</strong><span>SkillHub commission: " + Number(project.commissionPercent).toFixed(2) + "% · external payment arrangement</span></div>" + completeAction + paymentReportHtml(project) + "</article>";
        }).join("");
    }

    async function loadProjects() {
        var container = document.getElementById("clientProjectList");
        if (!container) return;
        container.innerHTML = "<div class='client-empty-state'><i class='fas fa-spinner fa-spin'></i><div><strong>Loading projects</strong></div></div>";
        try {
            var data = await apiRequest("/freelancers/projects");
            var projects = Array.isArray(data.projects) ? data.projects : [];
            renderProjects(projects);
            var active = projects.filter(function (project) { return !["completed", "cancelled"].includes(project.status); }).length;
            var hired = new Set(projects.map(function (project) { return project.freelancerId; })).size;
            document.getElementById("clientOpenProjects").textContent = active;
            document.getElementById("clientActiveProjects").textContent = active;
            document.getElementById("clientHiredCount").textContent = hired;
            document.getElementById("clientHiredFreelancers").textContent = hired;
        } catch (error) {
            container.innerHTML = "<div class='client-empty-state'><i class='fas fa-triangle-exclamation'></i><div><strong>Projects could not be loaded</strong><p>" + escapeHtml(error.message) + "</p></div></div>";
        }
    }

    async function createProject() {
        var button = document.getElementById("publishProjectBtn");
        var payload = {
            freelancerId: document.getElementById("projectFreelancer").value,
            title: document.getElementById("projectTitle").value.trim(),
            description: document.getElementById("projectDescription").value.trim(),
            budget: Number(document.getElementById("projectBudget").value),
            currency: document.getElementById("projectCurrency").value
        };
        if (!payload.freelancerId || !payload.title || !payload.description || !Number.isFinite(payload.budget) || payload.budget <= 0) {
            setProjectMessage("Select a freelancer and enter a title, description, and positive budget.", true);
            return;
        }
        button.disabled = true;
        setProjectMessage("Creating the project agreement…", false);
        try {
            var result = await apiRequest("/freelancers/projects", "POST", payload);
            setProjectMessage(result.message || "Project agreement created.", false);
            document.getElementById("projectTitle").value = "";
            document.getElementById("projectDescription").value = "";
            document.getElementById("projectBudget").value = "";
            await loadProjects();
            setActiveView("projects");
        } catch (error) {
            setProjectMessage(error.message || "Could not create project.", true);
        } finally {
            button.disabled = false;
        }
    }

    async function handleProjectAction(event) {
        var completeId = event.target.getAttribute("data-project-complete");
        var decision = event.target.getAttribute("data-report-decision");
        if (completeId) {
            try {
                await apiRequest("/freelancers/projects/" + encodeURIComponent(completeId), "PATCH", { status: "completed" });
                await loadProjects();
            } catch (error) { window.alert(error.message); }
        } else if (decision) {
            var projectId = event.target.getAttribute("data-project-id");
            var reportId = event.target.getAttribute("data-report-id");
            var response = decision === "dispute" ? window.prompt("Explain why you dispute this reported payment:") : "Client confirmed external payment";
            if (decision === "dispute" && !response) return;
            try {
                await apiRequest("/freelancers/projects/" + encodeURIComponent(projectId) + "/payment-reports/" + encodeURIComponent(reportId) + "/client-response", "PUT", { decision: decision, response: response });
                await loadProjects();
            } catch (error) { window.alert(error.message); }
        }
    }

    async function init() {
        bindEvents();
        if (!token) {
            window.location.replace("index.html#login-register");
            return;
        }
        var sessionUser = getSessionUser();
        try {
            var accountResponse = await apiRequest("/auth/me");
            var account = accountResponse.user || {};
            if (account.role !== "client") {
                window.location.replace(account.role === "freelancer" ? "freelancer-dashboard.html" : account.role === "instructor" ? "instructor-dashboard.html" : "dashboard.html");
                return;
            }
            populateUser(Object.assign({}, sessionUser, account, { role: account.role === "user" ? sessionUser.role : account.role }));
            await Promise.all([loadFreelancers(), loadProjects()]);
        } catch (error) {
            document.getElementById("clientLoadMessage").textContent = "Could not load client workspace: " + error.message;
            populateUser(sessionUser);
        }
        var view = new URLSearchParams(window.location.search).get("view") || "overview";
        if (validViews.indexOf(view) === -1) view = "overview";
        setActiveView(view);
        document.getElementById("clientLoadMessage").textContent = "";
        document.getElementById("publishProjectBtn").addEventListener("click", createProject);
        document.getElementById("clientProjectList").addEventListener("click", handleProjectAction);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
