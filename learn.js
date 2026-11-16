(function() {
    "use strict";

    var API_BASE = window.SKILLHUB_API_BASE || "https://skillhub-backend-i3dr.onrender.com/api";
    var PAGE_SIZE = 12;
    var state = { page: 1, totalPages: 1, courses: [], featured: false, category: "", search: "", sort: "-createdAt", level: "" };
    var categories = {
        technology: { label: "Technology", aliases: ["web_development", "mobile_development", "data_science", "technology"] },
        business: { label: "Business", aliases: ["business"] },
        design: { label: "Design", aliases: ["design"] },
        marketing: { label: "Marketing", aliases: ["marketing"] },
        entrepreneurship: { label: "Entrepreneurship", aliases: ["entrepreneurship", "other"] }
    };

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function(character) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
        });
    }

    function getId(course) { return course.id || course._id || ""; }
    function getLevel(value) {
        var levels = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", all_levels: "All levels" };
        return levels[String(value || "").toLowerCase()] || "";
    }
    function getCategoryLabel(value) {
        var key = String(value || "").toLowerCase();
        if (key.indexOf("web_") === 0 || key.indexOf("mobile_") === 0 || key.indexOf("data_") === 0) return "Technology";
        if (key === "other") return "Entrepreneurship";
        return key ? key.replace(/_/g, " ").replace(/\b\w/g, function(character) { return character.toUpperCase(); }) : "";
    }
    function getCourseImage(course) {
        var thumbnail = course.thumbnail || course.image || "";
        if (!thumbnail) return "";
        try { return new URL(thumbnail, location.href).href; } catch (error) { return ""; }
    }
    function renderCard(course) {
        var id = getId(course);
        var title = escapeHtml(course.title || "Untitled course");
        var instructor = escapeHtml(course.instructorName || course.instructorId && course.instructorId.name || "SkillHub instructor");
        var category = escapeHtml(getCategoryLabel(course.category));
        var level = getLevel(course.level);
        var duration = Number(course.duration);
        var image = getCourseImage(course);
        var rating = Number(course.rating);
        var reviewCount = Number(course.reviewCount || course.totalReviews || 0);
        var price = Number(course.price);
        return "<article class='learn-course-card'>" +
            "<a class='learn-course-image" + (image ? " has-image" : "") + "' href='course.html?id=" + encodeURIComponent(id) + "' aria-label='View " + title + "'>" +
                (image ? "<img src='" + escapeHtml(image) + "' alt='' loading='lazy'>" : "<span class='learn-course-placeholder'><i class='fas fa-book-open' aria-hidden='true'></i></span>") +
                (course.isFeatured ? "<span class='learn-featured-label'>Featured</span>" : "") +
            "</a>" +
            "<div class='learn-course-body'>" +
                "<div class='learn-course-meta'><span>" + category + "</span>" + (level ? "<span>" + escapeHtml(level) + "</span>" : "") + "</div>" +
                "<h3><a href='course.html?id=" + encodeURIComponent(id) + "'>" + title + "</a></h3>" +
                "<p class='learn-course-instructor'>" + instructor + "</p>" +
                "<div class='learn-course-facts'>" +
                    (duration > 0 ? "<span><i class='far fa-clock' aria-hidden='true'></i> " + escapeHtml(duration) + " hrs</span>" : "") +
                    (rating > 0 ? "<span class='learn-course-rating'><i class='fas fa-star' aria-hidden='true'></i> " + rating.toFixed(1) + (reviewCount > 0 ? " <small>(" + reviewCount + ")</small>" : "") + "</span>" : "") +
                "</div>" +
                "<div class='learn-course-footer'><strong>" + (Number.isFinite(price) ? "$" + escapeHtml(price.toFixed(2)) + " USD" : "Price on request") + "</strong><a href='course.html?id=" + encodeURIComponent(id) + "'>View course <i class='fas fa-arrow-right' aria-hidden='true'></i></a></div>" +
            "</div></article>";
    }

    async function fetchCourses(params) {
        var query = new URLSearchParams(params);
        var response = await fetch(API_BASE + "/courses?" + query.toString());
        var data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Could not load courses.");
        return data;
    }

    function setMessage(container, text, isError) {
        if (!container) return;
        container.innerHTML = "<div class='learn-empty" + (isError ? " is-error" : "") + "'>" + escapeHtml(text) + "</div>";
    }

    function initLandingSearch() {
        var searchForm = document.getElementById("learnSearchForm");
        var searchInput = document.getElementById("learnSearchInput");
        var searchStatus = document.getElementById("learnSearchStatus");
        if (!searchForm || !searchInput) return;
        searchInput.addEventListener("input", function() {
            searchInput.setCustomValidity("");
            if (searchStatus) searchStatus.textContent = "";
        });
        searchForm.addEventListener("submit", function(event) {
            event.preventDefault();
            var value = searchInput.value.trim();
            if (value.length < 2) {
                var message = "Enter at least 2 characters to search courses.";
                searchInput.setCustomValidity(message);
                if (searchStatus) searchStatus.textContent = message;
                searchInput.focus();
                return;
            }
            if (value.length > 100) {
                var tooLongMessage = "Search must be 100 characters or fewer.";
                searchInput.setCustomValidity(tooLongMessage);
                if (searchStatus) searchStatus.textContent = tooLongMessage;
                searchInput.focus();
                return;
            }
            searchInput.setCustomValidity("");
            if (searchStatus) searchStatus.textContent = "Searching courses...";
            location.href = "courses.html?search=" + encodeURIComponent(value);
        });
        document.querySelectorAll("[data-query]").forEach(function(button) {
            button.addEventListener("click", function() {
                location.href = "courses.html?search=" + encodeURIComponent(button.dataset.query);
            });
        });
    }

    async function loadLanding() {
        var featuredHost = document.getElementById("featuredCourses");
        var trendingHost = document.getElementById("trendingCourses");
        initLandingSearch();
        var query = new URLSearchParams({ limit: "4", featured: "true", sort: "-createdAt" });
        try {
            var featuredData = await fetchCourses(query);
            var featuredCourses = featuredData.courses || [];
            if (featuredCourses.length) featuredHost.innerHTML = featuredCourses.map(renderCard).join("");
            else setMessage(featuredHost, "No featured courses yet.");
        } catch (error) { setMessage(featuredHost, "Featured courses are temporarily unavailable.", true); }

        try {
            var trendingData = await fetchCourses({ limit: "4", sort: "trending" });
            var trendingCourses = trendingData.courses || [];
            if (trendingCourses.length) trendingHost.innerHTML = trendingCourses.map(renderCard).join("");
            else setMessage(trendingHost, "Published courses will appear here as activity is recorded.");
        } catch (error) { setMessage(trendingHost, "Trending courses are temporarily unavailable.", true); }

        var categoryHost = document.getElementById("learnCategories");
        if (categoryHost) {
            try {
                var counts = {};
                Object.keys(categories).forEach(function(key) { counts[key] = 0; });
                await Promise.all(Object.keys(categories).map(async function(key) {
                    var countData = await fetchCourses({ category: key, limit: "1" });
                    counts[key] = Number(countData.total) || 0;
                }));
                categoryHost.querySelectorAll(".learn-category").forEach(function(link) {
                    var key = new URL(link.href).searchParams.get("category");
                    var count = counts[key] || 0;
                    var detail = link.querySelector("small");
                    if (detail) detail.textContent += " · " + count + (count === 1 ? " course" : " courses");
                });
            } catch (error) { /* Category descriptions remain useful when counts are unavailable. */ }
        }
    }

    function getCatalogueParams() {
        var params = { page: String(state.page), limit: String(PAGE_SIZE), sort: state.sort };
        if (state.search) params.search = state.search;
        if (state.featured) params.featured = "true";
        if (state.category) params.category = state.category;
        if (state.level) params.level = state.level;
        if (state.minPrice) params.minPrice = state.minPrice;
        if (state.maxPrice) params.maxPrice = state.maxPrice;
        return params;
    }

    async function loadCatalogue() {
        var host = document.getElementById("catalogueCourses");
        if (!host) return;
        host.innerHTML = "<div class='learn-loading'>Loading courses...</div>";
        try {
            var data = await fetchCourses(getCatalogueParams());
            state.courses = data.courses || [];
            state.totalPages = Math.max(1, Number(data.totalPages) || 1);
            document.getElementById("catalogueCount").textContent = data.total + (data.total === 1 ? " course" : " courses");
            document.getElementById("cataloguePageLabel").textContent = "Page " + state.page + " of " + state.totalPages;
            document.getElementById("cataloguePrevious").disabled = state.page <= 1;
            document.getElementById("catalogueNext").disabled = state.page >= state.totalPages;
            document.getElementById("catalogueHeading").textContent = state.featured ? "Featured courses" : state.category ? (categories[state.category] && categories[state.category].label || getCategoryLabel(state.category)) + " courses" : state.search ? "Search results" : "All courses";
            if (!state.courses.length) setMessage(host, "No published courses match these filters.");
            else host.innerHTML = state.courses.map(renderCard).join("");
        } catch (error) {
            setMessage(host, "Courses are temporarily unavailable. Please try again.", true);
        }
    }

    function initCatalogue() {
        var form = document.getElementById("catalogueSearch");
        if (!form) return;
        var params = new URLSearchParams(location.search);
        state.search = params.get("search") || "";
        state.featured = params.get("featured") === "true";
        state.category = params.get("category") || "";
        state.sort = params.get("sort") || "-createdAt";
        state.level = params.get("level") || "";
        state.minPrice = params.get("minPrice") || "";
        state.maxPrice = params.get("maxPrice") || "";
        form.value = state.search;
        form.maxLength = 100;
        form.setAttribute("aria-describedby", "catalogueSearchStatus");
        var catalogueSearchStatus = document.getElementById("catalogueSearchStatus");
        form.addEventListener("input", function() {
            form.setCustomValidity("");
            if (catalogueSearchStatus) catalogueSearchStatus.textContent = "";
        });
        document.getElementById("catalogueCategory").value = state.category;
        document.getElementById("catalogueLevel").value = state.level;
        document.getElementById("catalogueMinPrice").value = state.minPrice;
        document.getElementById("catalogueMaxPrice").value = state.maxPrice;
        document.getElementById("catalogueSort").value = state.sort;

        var debounce;
        form.addEventListener("input", function() {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(function() {
                var query = form.value.trim();
                if (query && query.length < 2) {
                    var shortMessage = "Enter at least 2 characters to search courses.";
                    form.setCustomValidity(shortMessage);
                    if (catalogueSearchStatus) catalogueSearchStatus.textContent = shortMessage;
                    return;
                }
                if (query.length > 100) {
                    var longMessage = "Search must be 100 characters or fewer.";
                    form.setCustomValidity(longMessage);
                    if (catalogueSearchStatus) catalogueSearchStatus.textContent = longMessage;
                    return;
                }
                form.setCustomValidity("");
                if (catalogueSearchStatus) catalogueSearchStatus.textContent = "";
                state.search = query;
                state.page = 1;
                loadCatalogue();
            }, 250);
        });
        document.getElementById("catalogueCategory").addEventListener("change", function(event) { state.category = event.target.value; state.page = 1; loadCatalogue(); });
        document.getElementById("catalogueLevel").addEventListener("change", function(event) { state.level = event.target.value; state.page = 1; loadCatalogue(); });
        document.getElementById("catalogueMinPrice").addEventListener("change", function(event) { state.minPrice = event.target.value; state.page = 1; loadCatalogue(); });
        document.getElementById("catalogueMaxPrice").addEventListener("change", function(event) { state.maxPrice = event.target.value; state.page = 1; loadCatalogue(); });
        document.getElementById("catalogueSort").addEventListener("change", function(event) { state.sort = event.target.value; state.page = 1; loadCatalogue(); });
        document.getElementById("clearCatalogueFilters").addEventListener("click", function() {
            state = { page: 1, totalPages: 1, courses: [], featured: false, category: "", search: "", sort: "-createdAt", level: "", minPrice: "", maxPrice: "" };
            form.value = "";
            document.getElementById("catalogueCategory").value = "";
            document.getElementById("catalogueLevel").value = "";
            document.getElementById("catalogueMinPrice").value = "";
            document.getElementById("catalogueMaxPrice").value = "";
            document.getElementById("catalogueSort").value = "-createdAt";
            history.replaceState(null, "", "courses.html");
            loadCatalogue();
        });
        document.getElementById("cataloguePrevious").addEventListener("click", function() { if (state.page > 1) { state.page -= 1; loadCatalogue(); } });
        document.getElementById("catalogueNext").addEventListener("click", function() { if (state.page < state.totalPages) { state.page += 1; loadCatalogue(); } });
        loadCatalogue();
    }

    window.LearnDiscovery = {
        refresh: function() {
            if (document.getElementById("learnSearchForm")) return loadLanding();
            if (document.getElementById("catalogueCourses")) return loadCatalogue();
        }
    };
    if (document.getElementById("learnSearchForm")) loadLanding();
    if (document.getElementById("catalogueCourses")) initCatalogue();
})();
