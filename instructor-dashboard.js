(function () {
    "use strict";

    var API_BASE = window.SKILLHUB_API_BASE || "https://skillhub-backend-i3dr.onrender.com/api";
    var API_ORIGIN = API_BASE.replace(/\/api$/, "");
    var token = sessionStorage.getItem("skillhub_token") || localStorage.getItem("skillhub_token");
    var courses = [];
    var activeFilter = "all";
    var searchTerm = "";

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
        });
    }

    function mediaUrl(value) {
        if (!value) return "";
        if (/^(https?:)?\/\//i.test(value) || /^data:image\//i.test(value)) return value;
        return API_ORIGIN + (value.charAt(0) === "/" ? value : "/" + value);
    }

    function setImage(container, url, fallbackHtml) {
        if (!container) return;
        container.innerHTML = fallbackHtml;
        if (!url) return;
        var image = document.createElement("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", function () { image.remove(); });
        container.appendChild(image);
    }

    function setProfile(user) {
        var name = user.name || "Instructor";
        document.getElementById("instructorName").textContent = name;
        var welcomeName = document.getElementById("instructorWelcomeName");
        if (welcomeName) welcomeName.textContent = name.split(/\s+/)[0];
        var picture = mediaUrl(user.profilePicture);
        var avatar = document.getElementById("instructorAvatar");
        setImage(avatar, picture, "<i class='fas fa-user'></i>");
        setImage(document.getElementById("instructorHeaderAvatar"), picture, "<i class='fas fa-user'></i>");
    }

    function showWorkspaceView() {
        var view = new URLSearchParams(window.location.search).get("view") || "overview";
        var views = {
            overview: ["instructor-stats", "courses", "student-activity", "performance-summary", "quick-actions"],
            courses: ["courses"],
            curriculum: ["curriculum"],
            students: ["students"],
            assignments: ["assignments"],
            quizzes: ["quizzes"],
            announcements: ["announcements"],
            reviews: ["reviews"],
            analytics: ["analytics"],
            earnings: ["earnings"]
        };
        if (!Object.prototype.hasOwnProperty.call(views, view)) view = "overview";
        document.querySelectorAll(".instructor-view-section").forEach(function (section) {
            section.hidden = views[view].indexOf(section.id) === -1;
        });
        document.querySelectorAll("[data-instructor-nav]").forEach(function (link) {
            var active = link.getAttribute("data-instructor-nav") === view;
            link.classList.toggle("active", active);
            if (active) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        var title = view === "overview" ? "Welcome back" : ({ courses: "My Courses", curriculum: "Curriculum & Lessons", students: "Students", assignments: "Assignments", quizzes: "Quizzes & Assessments", announcements: "Announcements", reviews: "Reviews & Ratings", analytics: "Analytics", earnings: "Earnings" })[view];
        var heading = document.querySelector(".instructor-welcome-copy h1");
        if (view === "overview") {
            heading.innerHTML = "Welcome back, <span id='instructorWelcomeName'>Instructor</span>!";
        } else {
            heading.textContent = title;
        }
        var subtitle = document.querySelector(".instructor-subtitle");
        subtitle.textContent = view === "overview" ? "Your teaching space is ready. Keep your courses moving forward." : "Manage your teaching workspace.";
        document.querySelector(".dashboard-topbar-kicker").textContent = view === "overview" ? "Instructor workspace" : "Instructor workspace / " + title;
        document.title = (view === "overview" ? "Instructor Dashboard" : title + " | Instructor Dashboard") + " | SkillHub";
        if (view === "curriculum") renderCurriculumCourses();
    }

    function renderCurriculumCourses() {
        var container = document.getElementById("instructorCurriculumCourseList");
        if (!courses.length) {
            container.innerHTML = "<div class='dashboard-empty-state instructor-empty'><i class='fas fa-list-check'></i><p>Create a course first to organize its lessons.</p></div>";
            return;
        }
        container.innerHTML = courses.map(function (course) {
            var id = course.id || course._id;
            return "<article class='instructor-curriculum-row'><div><strong>" + escapeHtml(course.title || "Untitled course") + "</strong><span>" + escapeHtml(statusLabel(course.status)) + "</span></div><a href='create-course.html?courseId=" + encodeURIComponent(id || "") + "'><i class='fas fa-list-check'></i> Manage lessons</a></article>";
        }).join("");
    }

    function statusLabel(status) {
        return String(status || "draft").toLowerCase().replace(/[_-]+/g, " ");
    }

    function courseCard(course) {
        var id = course.id || course._id;
        var status = String(course.status || "draft").toLowerCase();
        var image = mediaUrl(course.thumbnail);
        var rating = Number(course.rating || 0);
        var reviewCount = Number(course.reviewCount || course.totalReviews || 0);
        var title = escapeHtml(course.title || "Untitled course");
        var category = escapeHtml(String(course.category || "Uncategorized").replace(/[_-]+/g, " "));
        var thumbnail = image
            ? "<img src='" + escapeHtml(image) + "' alt='' loading='lazy' onerror=\"this.remove()\">"
            : "<div class='instructor-course-placeholder'><i class='fas fa-book-open' aria-hidden='true'></i></div>";
        var ratingLabel = rating > 0 && reviewCount > 0 ? rating.toFixed(1) + " · " + reviewCount + " reviews" : "No reviews";
        return "<article class='instructor-course-card' data-course-status='" + escapeHtml(status) + "'>" +
            "<div class='instructor-course-cover'>" + thumbnail + "<span class='instructor-course-status status-" + escapeHtml(status) + "'>" + escapeHtml(statusLabel(status)) + "</span></div>" +
            "<div class='instructor-course-card-content'><p class='instructor-course-category'>" + category + "</p><h3>" + title + "</h3>" +
            "<div class='instructor-course-facts'><span><i class='fas fa-users'></i> " + Number(course.studentCount || 0).toLocaleString() + " students</span>" +
            "<span><i class='fas fa-star'></i> " + escapeHtml(ratingLabel) + "</span></div>" +
            "<div class='instructor-course-footer'><span class='instructor-course-price'>" + (Number.isFinite(Number(course.price)) ? "$" + Number(course.price).toFixed(2) : "Price not set") + "</span>" +
            "<div class='instructor-course-actions'><a href='create-course.html?courseId=" + encodeURIComponent(id || "") + "'><i class='fas fa-pen'></i> Edit</a>" +
            "<a href='course.html?id=" + encodeURIComponent(id || "") + "'><i class='fas fa-arrow-up-right-from-square'></i> View</a></div></div></div></article>";
    }

    function filteredCourses() {
        return courses.filter(function (course) {
            var status = String(course.status || "draft").toLowerCase();
            var matchesFilter = activeFilter === "all" || status === activeFilter;
            var query = searchTerm.toLowerCase();
            var matchesSearch = !query || String(course.title || "").toLowerCase().includes(query) || String(course.category || "").toLowerCase().includes(query);
            return matchesFilter && matchesSearch;
        });
    }

    function renderCourses() {
        var grid = document.getElementById("instructorCourseGrid");
        var note = document.getElementById("instructorCourseNote");
        var visible = filteredCourses();
        if (!visible.length) {
            grid.innerHTML = "<div class='dashboard-empty-state instructor-empty'><i class='fas fa-book-open'></i><p>" + (courses.length ? "No courses match this filter." : "You have not created any courses yet.") + "</p></div>";
            note.textContent = "";
            return;
        }
        grid.innerHTML = visible.map(courseCard).join("");
        note.textContent = "Showing " + visible.length + " of " + courses.length + " courses.";
    }

    function renderPerformance() {
        var performance = document.getElementById("instructorPerformanceList");
        var analytics = document.getElementById("instructorAnalyticsGrid");
        var totalViews = courses.reduce(function (sum, course) { return sum + Number(course.views || 0); }, 0);
        var totalStudents = courses.reduce(function (sum, course) { return sum + Number(course.studentCount || 0); }, 0);
        var ratedCourses = courses.filter(function (course) { return Number(course.rating || 0) > 0; });
        var averageRating = ratedCourses.length ? ratedCourses.reduce(function (sum, course) { return sum + Number(course.rating || 0); }, 0) / ratedCourses.length : null;

        if (!courses.length) {
            performance.innerHTML = "<div class='dashboard-empty-state instructor-empty'><i class='fas fa-chart-simple'></i><p>Course performance will appear when your course data is available.</p></div>";
        } else {
            var max = Math.max.apply(null, courses.map(function (course) { return Number(course.studentCount || 0); }).concat([1]));
            performance.innerHTML = courses.slice(0, 5).map(function (course) {
                var students = Number(course.studentCount || 0);
                return "<div class='instructor-performance-row'><span class='instructor-performance-title' title='" + escapeHtml(course.title || "Course") + "'>" + escapeHtml(course.title || "Course") + "</span><div class='instructor-performance-track' aria-label='" + students + " students'><div class='instructor-performance-fill' style='width:" + Math.round(students / max * 100) + "%'></div></div><span class='instructor-performance-value'>" + students + " students</span></div>";
            }).join("");
        }
        analytics.innerHTML = "<article class='instructor-analytics-card'><span>Course views</span><strong>" + totalViews.toLocaleString() + "</strong></article>" +
            "<article class='instructor-analytics-card'><span>Enrollments</span><strong>" + totalStudents.toLocaleString() + "</strong></article>" +
            "<article class='instructor-analytics-card'><span>Course rating</span><strong>" + (averageRating === null ? "—" : averageRating.toFixed(1) + " / 5") + "</strong></article>";

        var reviewSummary = document.getElementById("instructorReviewSummary");
        var reviewCount = courses.reduce(function (sum, course) { return sum + Number(course.reviewCount || 0); }, 0);
        if (averageRating !== null && reviewCount > 0) {
            reviewSummary.innerHTML = "<article class='instructor-analytics-card'><span>Average course rating</span><strong><i class='fas fa-star' aria-hidden='true'></i> " + averageRating.toFixed(1) + " / 5</strong></article><article class='instructor-analytics-card'><span>Reviews received</span><strong>" + reviewCount.toLocaleString() + "</strong></article>";
        }
    }

    async function loadInstructorFinance() {
        var summary = document.getElementById("instructorFinanceSummary");
        var history = document.getElementById("instructorWithdrawalHistory");
        var ledgerHistory = document.getElementById("instructorLedgerHistory");
        if (!summary) return;
        try {
            var params = new URLSearchParams();
            var fromField = document.getElementById("instructorFinanceFrom");
            var toField = document.getElementById("instructorFinanceTo");
            var currencyField = document.getElementById("instructorFinanceCurrency");
            var statusField = document.getElementById("instructorFinanceStatus");
            var financeFilters = {
                from: fromField ? fromField.value : "",
                to: toField ? toField.value : "",
                currency: currencyField ? currencyField.value : "",
                status: statusField ? statusField.value : ""
            };
            Object.keys(financeFilters).forEach(function(key) { if (financeFilters[key]) params.set(key, financeFilters[key]); });
            var response = await fetch(API_BASE + "/payments/financial-summary" + (params.toString() ? "?" + params.toString() : ""), { headers: { Authorization: "Bearer " + token } });
            var data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || "Could not load financial records.");
            summary.innerHTML = (data.totals || []).map(function(total) {
                return "<article class='instructor-analytics-card'><span>Available for internal request · " + escapeHtml(total.currency) + "</span><strong>" + Number(total.availableForRequest || 0).toFixed(2) + "</strong><small>Recorded earnings only</small></article><article class='instructor-analytics-card'><span>Simulated course earnings · " + escapeHtml(total.currency) + "</span><strong>" + Number(total.simulatedEarnings || 0).toFixed(2) + "</strong><small>Test values only; not received funds</small></article>";
            }).join("") || "<div class='dashboard-empty-state instructor-empty'><p>No recorded financial activity.</p></div>";
            history.innerHTML = (data.withdrawalRequests || []).map(function(item) {
                return "<article class='instructor-curriculum-row'><div><strong>" + escapeHtml(item.reference) + " · " + escapeHtml(item.currency) + " " + Number(item.amount).toFixed(2) + "</strong><span>" + escapeHtml(String(item.status).replace(/_/g, " ")) + " · Internal simulated workflow only</span>" + (item.decisionReason ? "<span>" + escapeHtml(item.decisionReason) + "</span>" : "") + "</div></article>";
            }).join("") || "<p class='instructor-results-note'>No withdrawal requests yet.</p>";
            ledgerHistory.innerHTML = (data.entries || []).map(function(entry) {
                return "<article class='instructor-ledger-row'><span>" + escapeHtml(String(entry.entryType).replace(/_/g, " ")) + (entry.isSimulated ? " · Simulated" : "") + "</span><strong>" + escapeHtml(entry.currency) + " " + Number(entry.amount).toFixed(2) + "</strong><small>" + escapeHtml(String(entry.status).replace(/_/g, " ")) + " · " + new Date(entry.createdAt).toLocaleDateString() + (entry.isSimulated ? " · no funds transferred" : "") + "</small></article>";
            }).join("") || "<p class='instructor-results-note'>No ledger entries match these filters.</p>";
        } catch (error) {
            summary.innerHTML = "<div class='dashboard-empty-state instructor-empty'><p>Financial records could not be loaded: " + escapeHtml(error.message) + "</p></div>";
        }
    }

    async function requestInstructorWithdrawal() {
        var message = document.getElementById("instructorWithdrawalMessage");
        if (!message) return;
        var amountField = document.getElementById("instructorWithdrawalAmount");
        var amount = Number(amountField ? amountField.value : 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            message.textContent = "Enter a valid withdrawal amount.";
            return;
        }
        message.textContent = "Submitting internal request…";
        try {
            var response = await fetch(API_BASE + "/payments/withdrawal-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                body: JSON.stringify({
                    amount: amount,
                    currency: document.getElementById("instructorWithdrawalCurrency").value,
                    payoutMethod: document.getElementById("instructorPayoutMethod").value,
                    destination: (document.getElementById("instructorPayoutDestination").value || "").trim()
                })
            });
            var result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "Could not submit the request.");
            message.textContent = result.message;
            await loadInstructorFinance();
        } catch (error) { message.textContent = error.message; }
    }

    function applyUserData(user) {
        setProfile(user);
        courses = Array.isArray(user.courses) ? user.courses : [];
        var students = courses.reduce(function (sum, course) { return sum + Number(course.studentCount || 0); }, 0);
        document.getElementById("instructorCourseCount").textContent = courses.length.toLocaleString();
        document.getElementById("instructorStudentCount").textContent = students.toLocaleString();
        renderCourses();
        renderPerformance();
        if (new URLSearchParams(window.location.search).get("view") === "curriculum") renderCurriculumCourses();
    }

    function bindEvents() {
        document.querySelectorAll("[data-course-filter]").forEach(function (button) {
            button.addEventListener("click", function () {
                activeFilter = button.getAttribute("data-course-filter");
                document.querySelectorAll("[data-course-filter]").forEach(function (item) {
                    var active = item === button;
                    item.classList.toggle("active", active);
                    item.setAttribute("aria-pressed", active ? "true" : "false");
                });
                renderCourses();
            });
        });
        document.getElementById("instructorCourseSearch").addEventListener("input", function (event) {
            searchTerm = event.target.value.trim();
            renderCourses();
        });
        document.querySelectorAll("[data-instructor-nav]").forEach(function (link) {
            link.addEventListener("click", function () {
                closeMenu();
            });
        });
        document.querySelectorAll("[data-add-lesson]").forEach(function (link) {
            link.addEventListener("click", function (event) {
                event.preventDefault();
                if (courses.length) {
                    var target = courses.find(function (course) { return Array.isArray(course.lessons); }) || courses[0];
                    window.location.href = "create-course.html?courseId=" + encodeURIComponent(target.id || target._id);
                } else {
                    window.location.href = "instructor-dashboard.html?view=curriculum";
                }
            });
        });
        document.getElementById("instructorLogoutBtn").addEventListener("click", function () {
            sessionStorage.removeItem("skillhub_token");
            localStorage.removeItem("skillhub_token");
            sessionStorage.removeItem("skillhub_user");
            localStorage.removeItem("skillhub_user");
            window.location.href = "index.html#login-register";
        });
        document.getElementById("instructorMenuButton").addEventListener("click", function () { openMenu(); });
        document.getElementById("instructorSidebarClose").addEventListener("click", closeMenu);
        document.getElementById("instructorScrim").addEventListener("click", closeMenu);
        var withdrawalSubmit = document.getElementById("instructorWithdrawalSubmit");
        if (withdrawalSubmit) withdrawalSubmit.addEventListener("click", requestInstructorWithdrawal);
        var earningsLink = document.querySelector("[data-instructor-nav='earnings']");
        if (earningsLink) earningsLink.addEventListener("click", loadInstructorFinance);
        var filterButton = document.getElementById("filterInstructorFinance");
        if (filterButton) filterButton.addEventListener("click", loadInstructorFinance);
        window.addEventListener("resize", function () { if (window.innerWidth > 760) closeMenu(); });
    }

    function openMenu() {
        document.getElementById("instructorSidebar").classList.add("is-open");
        document.getElementById("instructorScrim").hidden = false;
        document.getElementById("instructorMenuButton").setAttribute("aria-expanded", "true");
        document.body.style.overflow = "hidden";
    }

    function closeMenu() {
        document.getElementById("instructorSidebar").classList.remove("is-open");
        document.getElementById("instructorScrim").hidden = true;
        document.getElementById("instructorMenuButton").setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
    }

    async function init() {
        bindEvents();
        showWorkspaceView();
        if (!token) {
            window.location.replace("index.html#login-register");
            return;
        }
        try {
            var response = await fetch(API_BASE + "/auth/me", { headers: { Authorization: "Bearer " + token } });
            var payload = await response.json();
            if (!response.ok || !payload.success || !payload.user) throw new Error("Your session could not be verified.");
            if (payload.user.role !== "instructor") {
                window.location.replace(payload.user.role === "user" ? "dashboard.html" : "index.html");
                return;
            }
            applyUserData(payload.user);
            if (new URLSearchParams(window.location.search).get("view") === "earnings") await loadInstructorFinance();
            document.getElementById("instructorLoadMessage").textContent = "";
        } catch (error) {
            document.getElementById("instructorLoadMessage").textContent = error.message || "Could not load your instructor data. Please try again.";
            document.getElementById("instructorCourseGrid").innerHTML = "<div class='dashboard-empty-state instructor-empty'><i class='fas fa-triangle-exclamation'></i><p>Course data could not be loaded.</p></div>";
        }
    }

    document.addEventListener("DOMContentLoaded", init);
}());
