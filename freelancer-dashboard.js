(function () {
    "use strict";

    var API_BASE = window.SKILLHUB_API_BASE || "https://skillhub-backend-i3dr.onrender.com/api";
    var API_ORIGIN = API_BASE.replace(/\/api$/, "");
    var token = sessionStorage.getItem("skillhub_token") || localStorage.getItem("skillhub_token");
    var user = null;
    var freelancer = null;
    var requests = [];

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
        });
    }

    function mediaUrl(value) {
        if (typeof value !== "string" || !value.trim()) return "";
        if (/^(https?:)?\/\//i.test(value) || /^data:image\//i.test(value)) return value;
        return API_ORIGIN + (value.charAt(0) === "/" ? value : "/" + value);
    }

    function setAvatar(container, url) {
        if (!container) return;
        container.innerHTML = "<i class='fas fa-user' aria-hidden='true'></i>";
        if (!url) return;
        var image = document.createElement("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", function () { image.remove(); });
        container.appendChild(image);
    }

    function profileCompletion() {
        var checks = [
            Boolean(user && user.profilePicture),
            Boolean(user && user.bio),
            Boolean(freelancer && freelancer.title),
            Boolean(freelancer && Array.isArray(freelancer.skills) && freelancer.skills.length),
            Number(freelancer && freelancer.hourlyRate) > 0,
            Boolean(freelancer && freelancer.experience),
            Boolean(freelancer && Array.isArray(freelancer.portfolio) && freelancer.portfolio.length)
        ];
        return Math.round(checks.filter(Boolean).length / checks.length * 100);
    }

    function initializeProfile() {
        var name = user.name || "Freelancer";
        var picture = mediaUrl(user.profilePicture);
        document.getElementById("freelancerName").textContent = name;
        var welcomeName = document.getElementById("freelancerWelcomeName");
        if (welcomeName) welcomeName.textContent = name.split(/\s+/)[0];
        document.getElementById("freelancerTitle").textContent = freelancer.title || "Add your professional title";
        setAvatar(document.getElementById("freelancerAvatar"), picture);
        setAvatar(document.getElementById("freelancerHeaderAvatar"), picture);

        var completion = profileCompletion();
        document.getElementById("freelancerCompletionLabel").textContent = completion + "% complete";
        document.getElementById("freelancerCompletionBar").style.width = completion + "%";
        document.getElementById("freelancerViews").textContent = Number(freelancer.views || 0).toLocaleString();

        var balance = Number(user.walletBalance || 0);
        var balanceText = "$" + balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USD";
        document.getElementById("freelancerWallet").textContent = balanceText;
        document.getElementById("freelancerWalletSummary").textContent = balanceText;

        renderServiceSummary();
        renderReviews();
        renderAnalytics();
    }

    function renderServiceSummary() {
        var container = document.getElementById("freelancerServiceSummary");
        var skills = Array.isArray(freelancer.skills) ? freelancer.skills : [];
        var portfolio = Array.isArray(freelancer.portfolio) ? freelancer.portfolio : [];
        var summary = "<div class='freelancer-data-row'><span>Professional title</span><strong>" + escapeHtml(freelancer.title || "Not added") + "</strong></div>" +
            "<div class='freelancer-data-row'><span>Hourly rate</span><strong>" + (Number(freelancer.hourlyRate) > 0 ? "$" + Number(freelancer.hourlyRate).toFixed(2) + " USD/hr" : "Not set") + "</strong></div>" +
            "<div class='freelancer-data-row'><span>Availability</span><strong>" + escapeHtml(String(freelancer.availability || "Not set").replace(/[_-]/g, " ")) + "</strong></div>" +
            "<div class='freelancer-data-row'><span>Skills</span><strong>" + (skills.length ? escapeHtml(skills.slice(0, 4).join(", ")) : "Not added") + "</strong></div>" +
            "<div class='freelancer-data-row'><span>Portfolio items</span><strong>" + portfolio.length.toLocaleString() + "</strong></div>";
        container.innerHTML = summary;
        document.getElementById("freelancerServicesPage").innerHTML = summary;
        renderPortfolio();
    }

    function renderPortfolio() {
        var container = document.getElementById("freelancerPortfolioGrid");
        var items = Array.isArray(freelancer.portfolio) ? freelancer.portfolio : [];
        if (!items.length) {
            container.innerHTML = "<div class='freelancer-empty-state freelancer-large-empty'><i class='fas fa-images'></i><div><strong>No portfolio items yet</strong><p>Add work samples from your profile editor. Existing portfolio entries will appear here.</p><a class='freelancer-request-reply' href='profile.html'>Open profile editor</a></div></div>";
            return;
        }
        container.innerHTML = items.map(function (item) {
            var title = item && item.title ? item.title : "Portfolio project";
            var image = mediaUrl(item && (item.imageUrl || item.image || item.thumbnail));
            var projectUrl = mediaUrl(item && item.projectUrl);
            var description = item && (item.description || item.category || "") || "";
            return "<article class='freelancer-portfolio-card'><div class='freelancer-portfolio-image'>" + (image ? "<img src='" + escapeHtml(image) + "' alt='' loading='lazy' onerror=\"this.remove()\">" : "<i class='fas fa-image' aria-hidden='true'></i>") + "</div>" +
                "<div class='freelancer-portfolio-copy'><strong>" + escapeHtml(title) + "</strong>" + (description ? "<p>" + escapeHtml(description) + "</p>" : "") +
                (projectUrl ? "<a href='" + escapeHtml(projectUrl) + "' target='_blank' rel='noopener noreferrer'>View project <i class='fas fa-arrow-up-right-from-square'></i></a>" : "") + "</div></article>";
        }).join("");
    }

    function requestCard(request) {
        var date = request.createdAt ? new Date(request.createdAt) : null;
        var dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Date unavailable";
        var clientId = request.clientId || "";
        var clientName = request.clientName || "Client";
        var status = String(request.status || "pending").toLowerCase();
        var reply = clientId
            ? "<a class='freelancer-request-reply' href='chat.html?userId=" + encodeURIComponent(clientId) + "&userName=" + encodeURIComponent(clientName) + "'><i class='fas fa-message'></i> Reply in chat</a>"
            : "";
        return "<article class='freelancer-request-card'><div class='freelancer-client-avatar'><i class='fas fa-user' aria-hidden='true'></i></div>" +
            "<div class='freelancer-request-copy'><strong>" + escapeHtml(clientName) + "</strong><p>" + escapeHtml(request.message || "Client sent a hire request.") + "</p><time datetime='" + escapeHtml(request.createdAt || "") + "'>" + escapeHtml(dateText) + "</time></div>" +
            "<span class='freelancer-request-status'>" + escapeHtml(status) + "</span>" + reply + "</article>";
    }

    function renderRequests() {
        var summary = document.getElementById("freelancerRecentRequests");
        var all = document.getElementById("freelancerAllRequests");
        if (!requests.length) {
            var empty = "<div class='freelancer-empty-state'><i class='fas fa-envelope-open-text'></i><div><strong>No client requests yet</strong><p>Hire requests from SkillHub clients will appear here.</p></div></div>";
            summary.innerHTML = empty;
            all.innerHTML = empty;
            return;
        }
        var cards = requests.map(requestCard);
        summary.innerHTML = cards.slice(0, 3).join("");
        all.innerHTML = cards.join("");
    }

    function renderReviews() {
        var container = document.getElementById("freelancerReviewSummary");
        var rating = Number(freelancer.rating || 0);
        var reviewCount = Number(user.totalReviews || freelancer.totalReviews || 0);
        if (!rating && !reviewCount) {
            container.innerHTML = "<div class='freelancer-empty-state'><i class='fas fa-star'></i><div><strong>No reviews recorded</strong><p>Client review details are not part of the current freelancer API.</p></div></div>";
            return;
        }
        container.innerHTML = "<article class='freelancer-review-metric'><span>Profile rating</span><strong><i class='fas fa-star' aria-hidden='true'></i> " + (rating ? rating.toFixed(1) + " / 5" : "—") + "</strong></article>" +
            "<article class='freelancer-review-metric'><span>Reviews</span><strong>" + reviewCount.toLocaleString() + "</strong></article>" +
            "<p class='freelancer-data-note'>Written client reviews are not available in the current API.</p>";
    }

    function renderAnalytics() {
        var rating = Number(freelancer.rating || 0);
        document.getElementById("freelancerAnalyticsGrid").innerHTML =
            "<article class='freelancer-analytics-card'><span>Profile views</span><strong>" + Number(freelancer.views || 0).toLocaleString() + "</strong></article>" +
            "<article class='freelancer-analytics-card'><span>Completed jobs</span><strong>" + Number(freelancer.completedJobs || freelancer.totalJobs || 0).toLocaleString() + "</strong></article>" +
            "<article class='freelancer-analytics-card'><span>Profile rating</span><strong>" + (rating ? rating.toFixed(1) + " / 5" : "—") + "</strong></article>";
    }

    function showView() {
        var view = new URLSearchParams(window.location.search).get("view") || "overview";
        var valid = ["overview", "work", "proposals", "invitations", "projects", "services", "portfolio", "contracts", "reviews", "analytics", "earnings"];
        if (valid.indexOf(view) === -1) view = "overview";
        document.querySelectorAll(".freelancer-view-section").forEach(function (section) {
            section.hidden = section.id !== view;
        });
        document.querySelectorAll("[data-freelancer-nav]").forEach(function (link) {
            var active = link.getAttribute("data-freelancer-nav") === view;
            link.classList.toggle("active", active);
            if (active) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        var labels = { overview: "Overview", work: "Find Work", proposals: "My Proposals", invitations: "Invitations", projects: "Active Projects", services: "My Services", portfolio: "My Portfolio", contracts: "Contracts", reviews: "Reviews", analytics: "Analytics", earnings: "Earnings" };
        var heading = document.getElementById("freelancerPageHeading");
        if (view === "overview") {
            heading.innerHTML = "Welcome back, <span id='freelancerWelcomeName'>Freelancer</span>!";
            if (user) document.getElementById("freelancerWelcomeName").textContent = (user.name || "Freelancer").split(/\s+/)[0];
        } else {
            heading.textContent = labels[view];
        }
        document.querySelector(".dashboard-topbar-kicker").textContent = view === "overview" ? "Freelance workspace" : "Freelance workspace / " + labels[view];
        document.getElementById("freelancerSubtitle").textContent = view === "overview" ? "Find work, build your reputation, and grow your independent practice." : "Manage your freelance workspace.";
        document.title = (view === "overview" ? "Freelancer Dashboard" : labels[view] + " | Freelancer Dashboard") + " | SkillHub";
    }

    function bindEvents() {
        document.getElementById("freelancerLogoutBtn").addEventListener("click", function () {
            [sessionStorage, localStorage].forEach(function (storage) {
                storage.removeItem("skillhub_token");
                storage.removeItem("skillhub_user");
            });
            window.location.href = "index.html#login-register";
        });
        document.getElementById("freelancerMenuButton").addEventListener("click", openMenu);
        document.getElementById("freelancerSidebarClose").addEventListener("click", closeMenu);
        document.getElementById("freelancerScrim").addEventListener("click", closeMenu);
        document.querySelectorAll("[data-freelancer-nav]").forEach(function (link) { link.addEventListener("click", closeMenu); });
        window.addEventListener("resize", function () { if (window.innerWidth > 760) closeMenu(); });
        bindFinanceEvents();
    }

    function openMenu() {
        document.getElementById("freelancerSidebar").classList.add("is-open");
        document.getElementById("freelancerScrim").hidden = false;
        document.getElementById("freelancerMenuButton").setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
    }

    function closeMenu() {
        document.getElementById("freelancerSidebar").classList.remove("is-open");
        document.getElementById("freelancerScrim").hidden = true;
        document.getElementById("freelancerMenuButton").setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
    }

    function renderProjectPayments(project) {
        var reports = Array.isArray(project.paymentReports) ? project.paymentReports : [];
        var reportMarkup = reports.length ? reports.map(function(report) {
            var action = report.status === "client_confirmed"
                ? "<span class='freelancer-data-note'>Client confirmed; awaiting SkillHub review</span>"
                : "";
            return "<article class='freelancer-project-payment'><div><strong>" + escapeHtml(report.currency) + " " + Number(report.amount || 0).toFixed(2) + "</strong><span>" + escapeHtml(String(report.status || "reported").replace(/_/g, " ")) + "</span></div><p>" + escapeHtml(report.paymentMethodDescription || "External payment") + " · " + escapeHtml(report.paymentDate ? new Date(report.paymentDate).toLocaleDateString() : "Date unavailable") + "</p><small>Reported external payment only; not SkillHub cash. Outstanding commission: " + escapeHtml(report.currency) + " " + Number(report.commissionAmount || 0).toFixed(2) + "</small>" + action + "</article>";
        }).join("") : "<p class='freelancer-data-note'>No external payment reports yet.</p>";
        var canReport = project.completionStatus === "approved";
        var form = canReport
            ? "<form class='freelancer-payment-report-form' data-project-id='" + escapeHtml(project.id) + "'><label>Amount received<input name='amount' type='number' min='0.01' step='0.01' required></label><label>Currency<input name='currency' value='" + escapeHtml(project.currency || "USD") + "' maxlength='3' required></label><label>Payment date<input name='paymentDate' type='date' required></label><label>Payment method<input name='paymentMethodDescription' maxlength='100' placeholder='Bank transfer, mobile money…' required></label><label>Transaction reference<input name='transactionReference' maxlength='120'></label><label>Evidence URL or note<input name='evidence' maxlength='1000' placeholder='Optional; avoid sensitive account details'></label><button type='submit'>Report external payment</button><span class='freelancer-report-message' role='status'></span></form>"
            : "<p class='freelancer-data-note'>Payment reporting unlocks after client approval of your submitted deliverable.</p>";
        return "<section class='freelancer-project-payments'><h4>External payment records</h4>" + reportMarkup + form + "</section>";
    }

    function renderFreelancerProjects(projects) {
        var container = document.getElementById("freelancerProjectList");
        if (!container) return;
        if (!projects.length) {
            container.innerHTML = "<div class='freelancer-empty-state freelancer-large-empty'><i class='fas fa-list-check'></i><div><strong>No project agreements yet</strong><p>Client project agreements will appear here. Payments are made directly to you and reported separately from SkillHub funds.</p></div></div>";
            return;
        }
        container.innerHTML = projects.map(function(project) {
            var submitButton = project.status === "active" && project.completionStatus === "not_started"
                ? "<button type='button' class='freelancer-project-deliver' data-project-id='" + escapeHtml(project.id) + "'>Submit completed work</button>"
                : "";
            return "<article class='freelancer-project-card'><header><div><span>" + escapeHtml(project.reference) + "</span><h3>" + escapeHtml(project.title) + "</h3></div><span class='freelancer-request-status'>" + escapeHtml(String(project.status).replace(/_/g, " ")) + "</span></header><p>" + escapeHtml(project.description) + "</p><div class='freelancer-project-meta'><strong>Client: " + escapeHtml(project.client && project.client.name || "Client") + "</strong><strong>Budget: " + escapeHtml(project.currency) + " " + Number(project.budget).toFixed(2) + "</strong><span>Freelancer share: " + (100 - Number(project.commissionPercent || 0)).toFixed(2) + "% · " + escapeHtml(project.paymentArrangement || "direct external") + " payment</span></div>" + submitButton + renderProjectPayments(project) + "</article>";
        }).join("");
    }

    async function loadFinance() {
        var summary = document.getElementById("freelancerFinanceSummary");
        var history = document.getElementById("freelancerWithdrawalHistory");
        var ledgerHistory = document.getElementById("freelancerLedgerHistory");
        if (!summary) return;
        try {
            var params = new URLSearchParams();
            var fromField = document.getElementById("freelancerFinanceFrom");
            var toField = document.getElementById("freelancerFinanceTo");
            var currencyField = document.getElementById("freelancerFinanceCurrency");
            var statusField = document.getElementById("freelancerFinanceStatus");
            var financeFilters = {
                from: fromField ? fromField.value : "",
                to: toField ? toField.value : "",
                currency: currencyField ? currencyField.value : "",
                status: statusField ? statusField.value : ""
            };
            Object.keys(financeFilters).forEach(function(key) { if (financeFilters[key]) params.set(key, financeFilters[key]); });
            var data = await getJson("/payments/financial-summary" + (params.toString() ? "?" + params.toString() : ""));
            summary.innerHTML = (data.totals || []).map(function(total) {
                return "<article class='freelancer-analytics-card'><span>Available for internal request · " + escapeHtml(total.currency) + "</span><strong>" + Number(total.availableForRequest || 0).toFixed(2) + "</strong><small>Recorded earnings only</small></article><article class='freelancer-analytics-card'><span>Verified external payments · " + escapeHtml(total.currency) + "</span><strong>" + Number(total.verifiedExternalPayments || 0).toFixed(2) + "</strong><small>Paid directly to you; not SkillHub cash</small></article><article class='freelancer-analytics-card'><span>Simulated course earnings · " + escapeHtml(total.currency) + "</span><strong>" + Number(total.simulatedEarnings || 0).toFixed(2) + "</strong><small>Test values only</small></article>";
            }).join("") || "<div class='freelancer-empty-state'><p>No recorded financial activity.</p></div>";
            history.innerHTML = (data.withdrawalRequests || []).map(function(item) {
                return "<article class='freelancer-project-payment'><strong>" + escapeHtml(item.reference) + " · " + escapeHtml(item.currency) + " " + Number(item.amount).toFixed(2) + "</strong><span>" + escapeHtml(item.status) + "</span><small>Internal request · simulated processing only</small>" + (item.decisionReason ? "<p>" + escapeHtml(item.decisionReason) + "</p>" : "") + "</article>";
            }).join("") || "<p class='freelancer-data-note'>No withdrawal requests.</p>";
            ledgerHistory.innerHTML = (data.entries || []).map(function(entry) {
                return "<article class='freelancer-ledger-row'><span>" + escapeHtml(String(entry.entryType).replace(/_/g, " ")) + (entry.isSimulated ? " · Simulated" : "") + "</span><strong>" + escapeHtml(entry.currency) + " " + Number(entry.amount).toFixed(2) + "</strong><small>" + escapeHtml(String(entry.status).replace(/_/g, " ")) + " · " + new Date(entry.createdAt).toLocaleDateString() + (entry.isSimulated ? " · no funds transferred" : "") + "</small></article>";
            }).join("") || "<p class='freelancer-data-note'>No ledger entries match these filters.</p>";
        } catch (error) {
            summary.innerHTML = "<div class='freelancer-empty-state'><p>Financial records could not be loaded: " + escapeHtml(error.message) + "</p></div>";
        }
    }

    async function submitWithdrawal() {
        var message = document.getElementById("freelancerWithdrawalMessage");
        if (!message) return;
        var amountField = document.getElementById("freelancerWithdrawalAmount");
        var amount = Number(amountField ? amountField.value : 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            message.textContent = "Enter a valid withdrawal amount.";
            return;
        }
        message.textContent = "Submitting internal request…";
        try {
            var result = await getJson("/payments/withdrawal-requests", "POST", {
                amount: amount,
                currency: document.getElementById("freelancerWithdrawalCurrency").value,
                payoutMethod: document.getElementById("freelancerPayoutMethod").value,
                destination: (document.getElementById("freelancerPayoutDestination").value || "").trim()
            });
            message.textContent = result.message;
            await loadFinance();
        } catch (error) { message.textContent = error.message; }
    }

    async function submitPaymentReport(form) {
        var projectId = form.dataset.projectId;
        var message = form.querySelector(".freelancer-report-message");
        var values = Object.fromEntries(new FormData(form).entries());
        message.textContent = "Submitting report…";
        try {
            var result = await getJson("/freelancers/projects/" + encodeURIComponent(projectId) + "/payment-reports", "POST", values);
            message.textContent = result.notice;
            await loadProjects();
        } catch (error) { message.textContent = error.message; }
    }

    async function loadProjects() {
        var container = document.getElementById("freelancerProjectList");
        if (!container) return;
        try {
            var result = await getJson("/freelancers/projects", "GET");
            renderFreelancerProjects(Array.isArray(result.projects) ? result.projects : []);
        } catch (error) {
            container.innerHTML = "<div class='freelancer-empty-state'><p>Projects could not be loaded: " + escapeHtml(error.message) + "</p></div>";
        }
    }

    async function updateProjectStatus(projectId, status) {
        try {
            await getJson("/freelancers/projects/" + encodeURIComponent(projectId), "PATCH", { status: status });
            await loadProjects();
        } catch (error) { window.alert(error.message); }
    }

    function bindFinanceEvents() {
        var withdrawalButton = document.getElementById("freelancerWithdrawalSubmit");
        if (withdrawalButton) withdrawalButton.addEventListener("click", submitWithdrawal);
        var refresh = document.getElementById("refreshFreelancerFinance");
        if (refresh) refresh.addEventListener("click", loadFinance);
        var filter = document.getElementById("filterFreelancerFinance");
        if (filter) filter.addEventListener("click", loadFinance);
        var projects = document.getElementById("freelancerProjectList");
        if (projects) projects.addEventListener("click", function(event) {
            var button = event.target.closest("[data-project-id]");
            if (button && button.classList.contains("freelancer-project-deliver")) updateProjectStatus(button.dataset.projectId, "delivered");
        });
        if (projects) projects.addEventListener("submit", function(event) {
            if (!event.target.matches(".freelancer-payment-report-form")) return;
            event.preventDefault();
            submitPaymentReport(event.target);
        });
    }

    async function getJson(path, method, body) {
        var headers = { Authorization: "Bearer " + token };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        var response = await fetch(API_BASE + path, {
            method: method || "GET",
            headers: headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        var payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "Could not load freelancer data.");
        return payload;
    }

    async function init() {
        bindEvents();
        showView();
        if (!token) {
            window.location.replace("index.html#login-register");
            return;
        }
        try {
            var account = await getJson("/auth/me");
            user = account.user;
            if (user.role !== "freelancer") {
                window.location.replace(user.role === "instructor" ? "instructor-dashboard.html" : "dashboard.html");
                return;
            }
            var ownProfile = await getJson("/freelancers/me");
            freelancer = ownProfile.freelancer;
            if (!freelancer) throw new Error("Freelancer profile is not available for this account.");
            initializeProfile();
            if (new URLSearchParams(window.location.search).get("view") === "overview") {
                document.getElementById("freelancerWelcomeName").textContent = (user.name || "Freelancer").split(/\s+/)[0];
            }
            document.getElementById("freelancerLoadMessage").textContent = "";
            try {
                var requestsData = await getJson("/freelancers/hire-requests");
                requests = Array.isArray(requestsData.requests) ? requestsData.requests : [];
            } catch (error) {
                requests = [];
                document.getElementById("freelancerRecentRequests").innerHTML = "<div class='freelancer-empty-state'><i class='fas fa-triangle-exclamation'></i><div><strong>Client requests could not be loaded</strong><p>" + escapeHtml(error.message) + "</p></div></div>";
            }
            renderRequests();
            await Promise.all([loadProjects(), loadFinance()]);
        } catch (error) {
            document.getElementById("freelancerLoadMessage").textContent = error.message || "Could not load your freelancer account.";
            document.getElementById("freelancerRecentRequests").innerHTML = "<div class='freelancer-empty-state'><i class='fas fa-triangle-exclamation'></i><div><strong>Freelancer data could not be loaded</strong></div></div>";
        }
    }

    document.addEventListener("DOMContentLoaded", init);
}());
