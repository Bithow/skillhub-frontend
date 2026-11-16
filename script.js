// SkillHub Frontend - Version 3.0 - Connected to Backend API
// Last updated: deployed to Netlify

// ===== HTTPS ENFORCEMENT =====
// Redirect to HTTPS if accessed over plain HTTP (production only — skip on localhost)
(function enforceHttps() {
    if (window.location.protocol === 'http:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.startsWith('192.168.')) {
        window.location.replace('https:' + window.location.href.substring(5));
    }
})();

// ===== CONSOLE SUPPRESSION (production only) =====
// Suppress console.warn/error on live site to avoid leaking internal details
(function suppressConsoleOnProduction() {
    var isLocal = window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1' ||
                  window.location.hostname.startsWith('192.168.');
    if (!isLocal) {
        console.warn = function() {};
        console.error = function() {};
        // Keep console.log silent too on production
        console.log = function() {};
    }
})();

// ===== CURRENCY UTILITY =====
var CurrencyUtil = {
    // All prices and monetary amounts are stored and displayed in USD.
    getUserCountry: function() {
        var session = StorageManager.get(CONFIG.SESSION_KEY, {});
        return session.country || null;
    },
    // Display price in USD on cards
    displayUSD: function(usdPrice) {
        return "$" + parseFloat(usdPrice).toFixed(2);
    },
    toLocal: function(usdAmount) {
        return { amount: Number(usdAmount), display: this.displayUSD(usdAmount), code: "USD" };
    },
    // Get payment URL — price always in USD
    paymentUrl: function(name, usdPrice, type, id) {
        return "payment.html?name=" + encodeURIComponent(name) +
            "&price=" + usdPrice +
            "&type=" + (type || "course") +
            "&id=" + (id || "");
    }
};

// ===== CONFIG =====
// Auto-detect if running on localhost or a real device/network
var CONFIG = {
    ADMIN_WHATSAPP: "+211910628427",
    BUSINESS_WHATSAPP: "+211910628427",
    API_BASE: window.SKILLHUB_API_BASE || "https://skillhub-backend-i3dr.onrender.com/api",
    TOKEN_KEY: "skillhub_token",
    SESSION_KEY: "skillhub_user",
    NEWSLETTER_KEY: "skillhub_newsletter",
    CONTACT_KEY: "skillhub_contacts",
    MSG_TIMEOUT: 5000,
    FORM_DELAY: 3000
};

var Utils = {
    escapeHtml: function(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },
    formatPhone: function(phone) {
        return String(phone).replace(/\s/g, "").replace(/^\+/, "");
    },
    debounce: function(fn, wait) {
        var t;
        return function() {
            var a = arguments;
            clearTimeout(t);
            t = setTimeout(function() { fn.apply(null, a); }, wait || 100);
        };
    }
};

// ===== SLOW API / SERVER WAKE-UP NOTICE =====
// Render free tier spins down after inactivity — first request can take 10-30s.
// After 5s of waiting, show a friendly notice so users don't think the site is broken.
var SlowAPINotice = {
    _timer: null,
    _active: 0, // count of in-flight requests
    _shown: false,
    DELAY: 5000, // show notice after 5s

    start: function() {
        this._active++;
        if (this._timer || this._shown) return;
        this._timer = setTimeout(function() {
            SlowAPINotice.show();
        }, this.DELAY);
    },

    stop: function() {
        this._active = Math.max(0, this._active - 1);
        if (this._active > 0) return;
        clearTimeout(this._timer);
        this._timer = null;
        this.hide();
    },

    show: function() {
        if (this._shown) return;
        this._shown = true;
        var existing = document.getElementById('slowApiNotice');
        if (existing) return;
        var el = document.createElement('div');
        el.id = 'slowApiNotice';
        el.innerHTML =
            '<i class="fas fa-hourglass-half" style="font-size:1.1rem;"></i>' +
            '<span>Our server is waking up — this usually takes <strong>10–20 seconds</strong> on first load. Please hang on...</span>' +
            '<button onclick="document.getElementById(\'slowApiNotice\').style.display=\'none\'" ' +
            'style="background:none;border:none;cursor:pointer;color:#92400e;font-size:1rem;padding:0;margin-left:0.5rem;">✕</button>';
        el.style.cssText =
            'position:fixed;bottom:1.25rem;left:50%;transform:translateX(-50%);' +
            'background:#fef3c7;border:1px solid #fde68a;color:#92400e;' +
            'padding:0.75rem 1.25rem;border-radius:0.75rem;font-size:0.85rem;' +
            'display:flex;align-items:center;gap:0.65rem;box-shadow:0 4px 16px rgba(0,0,0,0.12);' +
            'z-index:99999;max-width:90vw;line-height:1.4;';
        document.body.appendChild(el);
    },

    hide: function() {
        this._shown = false;
        var el = document.getElementById('slowApiNotice');
        if (el) {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.4s';
            setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
        }
    }
};

// ===== API SERVICE =====
var ApiService = {
    getToken: function() {
        try {
            var sessionToken = sessionStorage.getItem(CONFIG.TOKEN_KEY);
            if (sessionToken) return sessionToken;
            return localStorage.getItem(CONFIG.TOKEN_KEY);
        } catch (e) {
            return null;
        }
    },
    setToken: function(token) {
        try {
            sessionStorage.setItem(CONFIG.TOKEN_KEY, token);
        } catch (e) {
            try { localStorage.setItem(CONFIG.TOKEN_KEY, token); } catch (err) {}
        }
        try { localStorage.removeItem(CONFIG.TOKEN_KEY); } catch (e) {}
    },
    clearToken: function() {
        try { sessionStorage.removeItem(CONFIG.TOKEN_KEY); } catch (e) {}
        try { localStorage.removeItem(CONFIG.TOKEN_KEY); } catch (e) {}
        try { sessionStorage.removeItem(CONFIG.SESSION_KEY); } catch (e) {}
        try { localStorage.removeItem(CONFIG.SESSION_KEY); } catch (e) {}
    },
    request: async function(endpoint, method, body) {
        var headers = { "Content-Type": "application/json" };
        var isPublicAuthRequest = /^\/auth\/(login|register|forgot-password|reset-password)$/.test(endpoint);
        var token = isPublicAuthRequest ? null : this.getToken();
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }
        var options = { method: method || "GET", headers: headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            SlowAPINotice.start();
            var res = await fetch(CONFIG.API_BASE + endpoint, options);
            SlowAPINotice.stop();

            // ---- 401 interceptor ----
            // Token expired or user suspended — clear session and redirect to login
            if (res.status === 401 && token) {
                this.clearToken();
                // Only redirect if not already on the login page
                var isIndexPage = window.location.pathname.includes("index");
                if (!isIndexPage) {
                    window.location.href = "index.html?session=expired";
                } else {
                    // On index page — show auth message inline
                    var msgEl = document.getElementById("authMessage");
                    if (msgEl) {
                        msgEl.textContent = "Your session has expired. Please log in again.";
                        msgEl.className = "error";
                        msgEl.style.display = "block";
                    }
                    // Show the login form
                    if (typeof NavbarUser !== "undefined") NavbarUser.update();
                }
                throw new Error("Session expired. Please log in again.");
            }

            var data = await res.json();
            if (!res.ok) {
                // Sanitize error message — don't expose raw DB errors to users
                var validationMessage = data.errors && data.errors.length ? data.errors[0].msg : "";
                var safeMsg = data.message || validationMessage || "Request failed";
                if (safeMsg.includes("Cast to ObjectId") || safeMsg.includes("MongoServer") || safeMsg.includes("E11000")) {
                    safeMsg = "Something went wrong. Please try again.";
                }
                throw new Error(safeMsg);
            }
            return data;
        } catch (err) {
            SlowAPINotice.stop();
            if (err.message === "Failed to fetch") {
                throw new Error("Server is waking up, please wait 10 seconds and try again.");
            }
            throw err;
        }
    },
    getEnrolledCourses: async function() {
        return await this.request("/courses/enrolled/me", "GET");
    },
    getTransactions: async function(params) {
        var query = params ? "?" + new URLSearchParams(params).toString() : "";
        return await this.request("/payments/transactions" + query, "GET");
    },
    getStats: async function() {
        // Stats endpoint is at /api/stats — API_BASE already has /api so use full URL
        try {
            var res = await fetch(CONFIG.API_BASE.replace("/api", "") + "/api/stats");
            return await res.json();
        } catch (e) {
            return { success: false };
        }
    },
    forgotPassword: async function(phone) {
        return await this.request("/auth/forgot-password", "POST", { phone });
    },
    resetPassword: async function(phone, code, newPassword) {
        return await this.request("/auth/reset-password", "POST", { phone, code, newPassword });
    },
    getMe: async function() {
        return await this.request("/auth/me", "GET");
    },
    validateSession: async function() {
        try {
            var data = await this.getMe();
            if (!data || !data.success || !data.user) {
                this.clearToken();
                return null;
            }
            var session = StorageManager.getUserSession() || {};
            var validatedRole = data.user.role || session.role || "user";
            if (validatedRole === "user" && session.role === "client" && session.email && session.email.toLowerCase() === String(data.user.email || "").toLowerCase()) {
                validatedRole = "client";
            }
            var nextSession = {
                email: data.user.email || session.email || "",
                name: data.user.name || session.name || "User",
                role: validatedRole,
                loggedIn: true,
                rememberMe: !!session.rememberMe,
                country: data.user.country || session.country || ""
            };
            StorageManager.saveUserSession(nextSession);
            return Object.assign({}, data.user, { role: validatedRole });
        } catch (err) {
            this.clearToken();
            return null;
        }
    },
    updateProfile: async function(data) {
        return await this.request("/auth/profile", "PUT", data);
    },
    changePassword: async function(currentPassword, newPassword) {
        return await this.request("/auth/change-password", "PUT", { currentPassword, newPassword });
    },
    register: async function(name, email, phone, password, role, country, extraData) {
        var body = {
            name: name,
            email: email,
            phone: phone,
            password: password,
            role: role,
            country: country || ""
        };
        if (extraData) {
            if (extraData.skills) body.skills = extraData.skills.split(",").map(function(s){ return s.trim(); });
            if (extraData.hourlyRate !== undefined && extraData.hourlyRate !== "") body.hourlyRate = Number(extraData.hourlyRate);
            if (extraData.portfolio) body.portfolio = extraData.portfolio;
            if (extraData.profilePicture) body.profilePicture = extraData.profilePicture;
            if (extraData.bio) body.bio = extraData.bio;
            if (extraData.expertise) body.expertise = extraData.expertise;
        }
        var data;
        try {
            data = await this.request("/auth/register", "POST", body);
        } catch (error) {
            if (role !== "client" || !/invalid role/i.test(error.message)) throw error;
            body.role = "user";
            data = await this.request("/auth/register", "POST", body);
        }
        if (data.token) { this.setToken(data.token); }
        return data;
    },
    login: async function(email, password) {
        var data = await this.request("/auth/login", "POST", {
            email: email,
            password: password
        });
        if (data.token) { this.setToken(data.token); }
        return data;
    },
    getCourses: async function(params) {
        var query = params ? "?" + new URLSearchParams(params).toString() : "";
        return await this.request("/courses" + query, "GET");
    },
    getFreelancers: async function(params) {
        var query = params ? "?" + new URLSearchParams(params).toString() : "";
        return await this.request("/freelancers" + query, "GET");
    }
};

// ===== WHATSAPP SERVICE =====
var WhatsAppService = {
    sendToNumber: function(phone, message) {
        var clean = Utils.formatPhone(phone);
        return window.open("https://wa.me/" + clean + "?text=" + encodeURIComponent(message), "_blank");
    },
    sendToAdmin: function(msg) { return this.sendToNumber(CONFIG.ADMIN_WHATSAPP, msg); },
    sendToBusiness: function(msg) { this.sendToNumber(CONFIG.BUSINESS_WHATSAPP, msg); },
    notifyNewInstructor: function(name, skill, phone) {
        this.sendToAdmin("NEW INSTRUCTOR:\nName: " + name + "\nSkill: " + skill + "\nPhone: " + phone);
    },
    notifyNewFreelancer: function(name, skill, phone, portfolio) {
        return this.sendToAdmin("NEW FREELANCER:\nName: " + name + "\nSkill: " + skill + "\nPhone: " + phone +
            (portfolio ? "\nPortfolio: " + portfolio : ""));
    },
    courseInquiry: function(title, price, instructor, phone) {
        var msg = "Hi, I need help with the course \"" + title + "\" ($" + parseFloat(price).toFixed(2) + ") by " + instructor + ".";
        this.sendToNumber(phone || CONFIG.ADMIN_WHATSAPP, msg);
    },
    contactFreelancer: function(name, phone, skill) {
        var msg = "Hi " + name + ", I found you on SkillHub (" + skill + "). I want to hire you!";
        this.sendToNumber(phone, msg);
    },
    generalCourseInquiry: function() {
        this.sendToAdmin("Hello, I want to buy a course on SkillHub. Please share available courses.");
    },
    submitContactForm: function(name, email, phone, subject, message, contactRole) {
        var subjects = {
            course: "Course Inquiry",
            instructor: "Become Instructor",
            freelancer: "Freelancer Registration",
            project: "Project Inquiry",
            business: "Business Inquiry",
            support: "Technical Support",
            other: "Other"
        };
        var msg = "*SkillHub Contact*\nName: " + name + "\nEmail: " + email + "\nPhone: " + (phone || "N/A") + "\nContacting as: " + contactRole + "\nSubject: " + subject + "\nMessage: " + message;
        this.sendToBusiness(msg);
    }
};

// ===== STORAGE =====
var StorageManager = {
    get: function(key, def) {
        try {
            var d = sessionStorage.getItem(key);
            if (d === null) {
                d = localStorage.getItem(key);
            }
            return d ? JSON.parse(d) : (def !== undefined ? def : null);
        } catch(e) {
            return (def !== undefined ? def : null);
        }
    },
    set: function(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify(data));
        } catch(e) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch(e2) {
                // QuotaExceededError — storage full, clear old notification cache first
                if (e2.name === 'QuotaExceededError' || e2.code === 22) {
                    try {
                        localStorage.removeItem('skillhub_notifs');
                        localStorage.removeItem('skillhub_pending_payments');
                        localStorage.setItem(key, JSON.stringify(data)); // retry once
                    } catch(e3) { /* still full — silently fail */ }
                }
            }
        }
    },
    addNewsletterSubscriber: function(email) {
        var subs = this.get(CONFIG.NEWSLETTER_KEY, []);
        if (!subs.includes(email)) {
            subs.push(email);
            this.set(CONFIG.NEWSLETTER_KEY, subs);
            return true;
        }
        return false;
    },
    saveContactSubmission: function(data) {
        var list = this.get(CONFIG.CONTACT_KEY, []);
        list.push(Object.assign({}, data, { id: Date.now(), timestamp: new Date().toISOString() }));
        this.set(CONFIG.CONTACT_KEY, list);
    },
    saveUserSession: function(user) { this.set(CONFIG.SESSION_KEY, user); },
    getUserSession: function() { return this.get(CONFIG.SESSION_KEY); }
};

// ===== UI HELPER =====
var AuthGuard = {
    isLoggedIn: async function() {
        var token = ApiService.getToken();
        var session = StorageManager.getUserSession() || {};
        if (session.loggedIn) return true;
        if (!token) return false;
        var user = await ApiService.validateSession();
        return !!user;
    }
};

var UIHelper = {
    hideAllContainers: function() {
        ["instructorFormCard", "coursesListContainer", "freelancerFormCard", "freelancerHireContainer"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.add("hidden");
        });
    },
    showMessage: function(element, message, type) {
        if (!element) return;
        element.textContent = message;
        element.className = type || "success";
        element.style.display = "block";
        setTimeout(function() { element.style.display = "none"; }, CONFIG.MSG_TIMEOUT);
    },
    showLoading: function(container, message) {
        if (!container) return;
        container.innerHTML = "<div style='text-align:center;padding:3rem;color:#6b7280;'><i class='fas fa-spinner fa-spin' style='font-size:2rem;display:block;margin-bottom:1rem;'></i>" + (message || "Loading...") + "</div>";
        container.classList.remove("hidden");
    }
};

// ===== COURSE MANAGER =====
var CourseManager = {
    courses: [],
    container: null,
    init: function() {
        this.container = document.getElementById("coursesListContainer");
    },
    loadFromAPI: async function() {
        UIHelper.showLoading(this.container, "Loading courses...");
        try {
            var data = await ApiService.getCourses({ limit: 50 });
            var courseList = Array.isArray(data) ? data :
                (Array.isArray(data && data.courses) ? data.courses :
                (Array.isArray(data && data.data) ? data.data :
                (Array.isArray(data && data.items) ? data.items : [])));

            if (courseList.length > 0) {
                this.courses = courseList.map(function(c) {
                    return { id: c._id, title: c.title, instructorName: c.instructorName || "Instructor", price: c.price, description: c.description, instructorPhone: c.instructorPhone || "" };
                });
            } else {
                // Database empty — show sample courses
                this.courses = [
                    { id: "1", title: "Full-Stack Web Dev Bootcamp", instructorName: "Biruk T.", price: 49.99, description: "HTML, CSS, JavaScript, React, Node.js, MongoDB. Build real-world projects from scratch.", instructorPhone: "+251901234567" },
                    { id: "2", title: "Graphic Design Masterclass", instructorName: "Meron A.", price: 29.99, description: "Master Photoshop, Illustrator, Canva. Create stunning logos and branding materials.", instructorPhone: "+251911223344" },
                    { id: "3", title: "Digital Marketing Essentials", instructorName: "Dawit K.", price: 39.99, description: "SEO, Social Media, Google Ads, Content Strategy. Grow your business online.", instructorPhone: "+251922334455" }
                ];
            }
        } catch (err) {
            console.warn("Using sample courses:", err.message);
            this.courses = [
                { id: "1", title: "Full-Stack Web Dev Bootcamp", instructorName: "Biruk T.", price: 49.99, description: "HTML, CSS, JavaScript, React, Node.js, MongoDB.", instructorPhone: "+251901234567" },
                { id: "2", title: "Graphic Design Masterclass", instructorName: "Meron A.", price: 29.99, description: "Master Photoshop, Illustrator, Canva.", instructorPhone: "+251911223344" },
                { id: "3", title: "Digital Marketing Essentials", instructorName: "Dawit K.", price: 39.99, description: "SEO, Social Media, Google Ads, Content Strategy.", instructorPhone: "+251922334455" }
            ];
        }
    },
    render: function() {
        if (!this.container) return;
        if (this.courses.length === 0) {
            this.container.innerHTML = "<div style='text-align:center;padding:3rem;'>No courses yet. Be the first instructor!</div>";
            this.container.classList.remove("hidden");
            return;
        }
        var self = this;
        this.container.innerHTML = this.courses.map(function(c) {
            return "<div class='course-card'>" +
                "<h3>" + Utils.escapeHtml(c.title) + "</h3>" +
                "<div class='instructor'><i class='fas fa-chalkboard-user'></i> " + Utils.escapeHtml(c.instructorName) + "</div>" +
                "<div class='price'>" + CurrencyUtil.displayUSD(c.price) + "</div>" +
                "<button class='btn btn-purple view-course-btn' data-id='" + Utils.escapeHtml(String(c.id)) + "'><i class='fas fa-info-circle'></i> View Details</button>" +
                "</div>";
        }).join("");
        this.container.querySelectorAll(".view-course-btn").forEach(function(btn) {
            btn.addEventListener("click", function() { self.viewDetails(btn.dataset.id); });
        });
        this.container.classList.remove("hidden");
    },
    viewDetails: function(courseId) {
        var course = this.courses.find(function(c) { return String(c.id) === String(courseId); });
        if (!course) return;
        var modal = document.getElementById("courseModal");
        var modalBody = document.getElementById("modalBody");
        var token = ApiService.getToken();
        var isFree = Number(course.price) === 0;
        modalBody.innerHTML =
            "<h2 style='font-size:1.5rem;margin-bottom:1rem;'>" + Utils.escapeHtml(course.title) + "</h2>" +
            "<p style='margin-bottom:0.5rem;'><strong>Instructor:</strong> " + Utils.escapeHtml(course.instructorName) + "</p>" +
            "<p style='margin-bottom:1rem;'><strong>Description:</strong> " + Utils.escapeHtml(course.description) + "</p>" +
            "<p style='font-size:1.75rem;font-weight:bold;color:#10b981;margin-bottom:1.5rem;'>" + CurrencyUtil.displayUSD(course.price) + "</p>" +
            (token
                ? "<a href='course.html?id=" + Utils.escapeHtml(String(course.id)) + "' class='btn btn-blue btn-full' style='display:block;text-align:center;text-decoration:none;margin-bottom:0.75rem;'><i class='fas fa-play-circle'></i> View Course Content</a>"
                : "") +
            (isFree
                ? (token
                    ? "<button type='button' class='btn btn-green btn-full free-course-enroll' data-id='" + Utils.escapeHtml(String(course.id)) + "'><i class='fas fa-user-plus'></i> Enroll for Free</button>"
                    : "<a href='index.html#login-register' class='btn btn-green btn-full' style='display:block;text-align:center;text-decoration:none;'><i class='fas fa-sign-in-alt'></i> Log in to Enroll for Free</a>")
                : "<a href='" + CurrencyUtil.paymentUrl(course.title, course.price, "course", course.id) + "' class='btn btn-green btn-full' style='display:block;text-align:center;text-decoration:none;'><i class='fas fa-flask'></i> Simulate Course Payment</a>");
        var enrollButton = modalBody.querySelector(".free-course-enroll");
        if (enrollButton) enrollButton.addEventListener("click", async function() {
            enrollButton.disabled = true;
            enrollButton.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Enrolling…";
            try {
                await ApiService.request("/courses/" + encodeURIComponent(String(course.id)) + "/enroll", "POST", {});
                NotificationManager.add("You are enrolled in " + course.title + ".", "success");
                window.location.href = "course.html?id=" + encodeURIComponent(String(course.id));
            } catch (error) {
                enrollButton.disabled = false;
                enrollButton.innerHTML = "<i class='fas fa-user-plus'></i> Enroll for Free";
                NotificationManager.add(error.message || "Could not enroll in this course.", "error");
            }
        });
        modal.style.display = "flex";
    },
    showView: async function() {
        UIHelper.hideAllContainers();
        await this.loadFromAPI();
        this.render();
    }
};

// ===== FREELANCER MANAGER =====
var FreelancerManager = {
    freelancers: [],
    currentFilter: "",
    loadError: false,
    experienceRank: { entry: 0, junior: 1, intermediate: 2, senior: 3, expert: 4 },
    init: function() {},
    loadFromAPI: async function() {
        var container = document.getElementById("freelancerProfilesList");
        UIHelper.showLoading(container, "Loading freelancers...");
        this.loadError = false;
        try {
            var data = await ApiService.getFreelancers({ limit: 100 });
            var freelancerList = Array.isArray(data) ? data :
                (Array.isArray(data && data.freelancers) ? data.freelancers :
                (Array.isArray(data && data.data) ? data.data : []));
            this.freelancers = freelancerList.map(function(f) {
                var account = f.userId && typeof f.userId === "object" ? f.userId :
                    (f.user && typeof f.user === "object" ? f.user : {});
                var accountId = account._id || account.id ||
                    (typeof f.userId === "string" ? f.userId : f.user || "");
                var portfolioItem = Array.isArray(f.portfolio) ? f.portfolio[0] : f.portfolio;
                return {
                    id: f._id || f.id || "",
                    userId: accountId,
                    name: account.name || f.name || "Freelancer",
                    skill: Array.isArray(f.skills) ? f.skills.join(", ") : (f.skills || f.skill || ""),
                    portfolio: portfolioItem && (portfolioItem.projectUrl || portfolioItem.url) || "",
                    phone: account.phone || f.phone || "",
                    services: f.title || "Freelance services",
                    hourlyRate: f.hourlyRate || 0,
                    bio: account.bio || f.bio || "",
                    profilePicture: account.profilePicture || f.profilePicture || null,
                    rating: f.rating || 0,
                    totalReviews: account.totalReviews || 0,
                    completedJobs: f.completedJobs || 0,
                    availability: f.availability || "available",
                    isVerified: f.isVerified || false,
                    experience: f.experience || "junior",
                    createdAt: f.createdAt || "",
                    portfolioItems: Array.isArray(f.portfolio) ? f.portfolio : []
                };
            });
        } catch (err) {
            console.warn("Could not load freelancers:", err.message);
            this.freelancers = [];
            this.loadError = true;
        }
    },
    getFilteredFreelancers: function() {
        var value = function(id) {
            var input = document.getElementById(id);
            return input ? input.value : "";
        };
        var search = value("skillFilterInput").trim().toLowerCase();
        var minRate = parseFloat(value("freelancerMinRate"));
        var maxRate = parseFloat(value("freelancerMaxRate"));
        var experience = value("freelancerExperienceFilter");
        var availability = value("freelancerAvailabilityFilter");
        var sort = value("freelancerSort") || "match";
        var filtered = this.freelancers.filter(function(f) {
            var searchText = [f.name, f.services, f.skill, f.bio].join(" ").toLowerCase();
            return (!search || searchText.includes(search)) &&
                (!Number.isFinite(minRate) || f.hourlyRate >= minRate) &&
                (!Number.isFinite(maxRate) || f.hourlyRate <= maxRate) &&
                (!experience || f.experience === experience) &&
                (!availability || f.availability === availability);
        });
        filtered.sort(function(a, b) {
            if (sort === "rating") return b.rating - a.rating;
            if (sort === "experience") return (FreelancerManager.experienceRank[b.experience] || 0) - (FreelancerManager.experienceRank[a.experience] || 0);
            if (sort === "rate") return a.hourlyRate - b.hourlyRate;
            if (sort === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            return b.rating - a.rating || (FreelancerManager.experienceRank[b.experience] || 0) - (FreelancerManager.experienceRank[a.experience] || 0);
        });
        return filtered;
    },
    validateSearch: function() {
        var input = document.getElementById("skillFilterInput");
        var message = document.getElementById("talentSearchValidation");
        var query = (input.value || "").trim();
        if (query && query.length < 2) {
            message.textContent = "Enter at least 2 characters to search professionals.";
            input.focus();
            return false;
        }
        if (query.length > 100) {
            message.textContent = "Search must be 100 characters or fewer.";
            input.focus();
            return false;
        }
        message.textContent = "";
        return true;
    },
    mediaUrl: function(value) {
        if (typeof value !== "string") return "";
        var url = value.trim();
        return /^(https?:\/\/|\/|\.\/|data:image\/)/i.test(url) ? url : "";
    },
    render: function() {
        var container = document.getElementById("freelancerProfilesList");
        if (!container) return;
        var filtered = this.getFilteredFreelancers();
        var count = document.getElementById("freelancerResultCount");
        if (count) count.textContent = filtered.length + (filtered.length === 1 ? " professional" : " professionals");
        if (filtered.length === 0) {
            container.innerHTML = this.loadError
                ? "<div class='marketplace-empty'><i class='fas fa-triangle-exclamation'></i><h4>Talent could not be loaded</h4><p>Check your connection and try again.</p><button class='marketplace-primary-btn' type='button' onclick='FreelancerManager.showHire()'>Try again</button></div>"
                : "<div class='marketplace-empty'><i class='fas fa-magnifying-glass'></i><h4>No matching professionals</h4><p>Try changing your search or clearing one or more filters.</p><button class='marketplace-clear-btn' type='button' onclick='FreelancerManager.resetFilter()'>Clear filters</button></div>";
            return;
        }
        container.innerHTML = filtered.map(function(f) {
            var profilePicture = FreelancerManager.mediaUrl(f.profilePicture);
            var avatarHtml = profilePicture
                ? "<img src='" + Utils.escapeHtml(profilePicture) + "' alt='Portrait of " + Utils.escapeHtml(f.name) + "' loading='lazy'>"
                : "<span class='fl-avatar-placeholder' aria-label='No profile photo'><i class='fas fa-user' aria-hidden='true'></i></span>";
            var availClass = { available:"avail-green", busy:"avail-yellow", not_available:"avail-red", looking:"avail-blue" }[f.availability] || "avail-green";
            var availLabel = { available:"Available", busy:"Busy", not_available:"Unavailable", looking:"Open to Work" }[f.availability] || "Available";
            var verifiedBadge = f.isVerified ? "<span class='verified-badge'><i class='fas fa-circle-check'></i> Verified</span>" : "";
            var skillTags = (f.skill || "").split(",").filter(Boolean).slice(0,5).map(function(s){ return "<span class='fl-skill-tag'>" + Utils.escapeHtml(s.trim()) + "</span>"; }).join("");
            var rateDisplay = f.hourlyRate ? "<strong>$" + Number(f.hourlyRate).toFixed(2) + " USD</strong><span>/ hr</span>" : "Rate not listed";
              var rating = f.rating > 0 ? "<span class='fl-rating'><i class='fas fa-star'></i> " + parseFloat(f.rating).toFixed(1) + (f.totalReviews ? " <span class='fl-review-count'> (" + f.totalReviews + ")</span>" : "") + "</span>" : "";
            var jobs = f.completedJobs ? "<span class='fl-jobs'><i class='fas fa-briefcase'></i> " + f.completedJobs + " completed</span>" : "";
            var portfolioItem = f.portfolioItems[0] || {};
            var portfolioImage = FreelancerManager.mediaUrl(portfolioItem.imageUrl);
            var portfolioPreview = portfolioImage ? "<img class='fl-portfolio-preview' src='" + Utils.escapeHtml(portfolioImage) + "' alt='Portfolio: " + Utils.escapeHtml(portfolioItem.title || "Project") + "' loading='lazy'>" : "";
            return "<div class='freelancer-card-pro'>" +
                "<div class='fl-card-top'>" +
                    "<div class='fl-avatar'>" + avatarHtml + "</div>" +
                    "<div class='fl-card-info'>" +
                        "<div class='fl-name-row'>" +
                            "<h3>" + Utils.escapeHtml(f.name) + "</h3>" +
                            verifiedBadge +
                        "</div>" +
                        "<div class='fl-title'>" + Utils.escapeHtml(f.services || f.skill) + "</div>" +
                        "<div class='fl-meta-row'>" +
                            "<span class='fl-avail " + availClass + "'><i class='fas fa-circle'></i> " + availLabel + "</span>" +
                        "</div>" +
                    "</div>" +
                "</div>" +
                "<div class='fl-proof-row'>" + rating + jobs + "</div>" +
                "<p class='fl-bio'>" + Utils.escapeHtml(f.bio ? f.bio.slice(0, 150) + (f.bio.length > 150 ? "..." : "") : "View this profile to learn more about their work and experience.") + "</p>" +
                (portfolioPreview ? "<div class='fl-portfolio-strip'>" + portfolioPreview + "<span>Portfolio work</span></div>" : "") +
                "<div class='fl-skills-row'>" + skillTags + "</div>" +
                "<div class='fl-card-rate'>" + rateDisplay + "</div>" +
                "<div class='fl-actions'>" +
                    "<button type='button' class='fl-btn-profile freelancer-profile-btn' data-id='" + Utils.escapeHtml(String(f.id || "")) + "'><i class='fas fa-arrow-up-right-from-square'></i> View profile</button>" +
                    "<button type='button' class='fl-btn-msg contact-freelancer-btn' data-name='" + Utils.escapeHtml(f.name) + "' data-userid='" + Utils.escapeHtml(String(f.userId || "")) + "'>" +
                        "<i class='fas fa-comment-dots'></i> Message" +
                    "</button>" +
                "</div>" +
            "</div>";
        }).join("");
        container.querySelectorAll(".freelancer-profile-btn").forEach(function(btn) {
            btn.addEventListener("click", function() { FreelancerManager.showProfile(btn.dataset.id); });
        });
        container.querySelectorAll(".contact-freelancer-btn").forEach(function(btn) {
            btn.addEventListener("click", function() {
                FreelancerManager.contact(btn.dataset.name, btn.dataset.userid);
            });
        });
    },
    contact: function(name, userId) {
        if (!userId) {
            NotificationManager.add("This profile cannot be contacted right now.", "error");
            return;
        }
        MessagingManager.open(name, userId);
    },
    sendHireRequest: async function(freelancerId, name) {
        if (!ApiService.getToken()) {
            MessagingManager.open(name, "");
            return;
        }
        var details = window.prompt("Briefly describe the project you want help with:");
        if (details === null) return;
        details = details.trim();
        if (!details) {
            NotificationManager.add("Add a short project description to send a hire request.", "info");
            return;
        }
        try {
            await ApiService.request("/freelancers/" + encodeURIComponent(freelancerId) + "/hire-requests", "POST", { message: details });
            NotificationManager.add("Hire request sent. Continue the conversation in SkillHub chat.", "success");
        } catch (error) {
            NotificationManager.add(error.message || "Could not send your hire request.", "error");
        }
    },
    showProfile: async function(freelancerId) {
        var freelancer = this.freelancers.find(function(item) { return String(item.id) === String(freelancerId); });
        var list = document.getElementById("freelancerProfilesList");
        var detail = document.getElementById("freelancerProfileDetail");
        if (!freelancer || !detail || !list) return;
        detail.hidden = false;
        list.hidden = true;
        detail.innerHTML = "<div class='marketplace-empty'><i class='fas fa-spinner fa-spin'></i><p>Loading professional profile...</p></div>";
        try {
            var response = await ApiService.request("/freelancers/" + encodeURIComponent(freelancerId), "GET");
            var record = response.freelancer || {};
            var account = record.userId && typeof record.userId === "object" ? record.userId : {};
            var profileName = account.name || freelancer.name;
            var profilePhoto = this.mediaUrl(account.profilePicture || freelancer.profilePicture);
            var avatar = profilePhoto ? "<img src='" + Utils.escapeHtml(profilePhoto) + "' alt='Portrait of " + Utils.escapeHtml(profileName) + "'>" : "<span class='fl-avatar-placeholder'><i class='fas fa-user' aria-hidden='true'></i></span>";
            var portfolio = Array.isArray(record.portfolio) ? record.portfolio : [];
            var languages = Array.isArray(record.languages) ? record.languages.filter(function(language) { return language && language.name; }) : [];
            var education = Array.isArray(record.education) ? record.education.filter(function(item) { return item && (item.degree || item.institution); }) : [];
            var certifications = Array.isArray(record.certifications) ? record.certifications.filter(function(item) { return item && item.name; }) : [];
            var projects = portfolio.length ? portfolio.map(function(project) {
                var image = FreelancerManager.mediaUrl(project.imageUrl);
                var link = FreelancerManager.mediaUrl(project.projectUrl);
                return "<article class='fl-project'>" + (image ? "<img src='" + Utils.escapeHtml(image) + "' alt='" + Utils.escapeHtml(project.title || "Portfolio project") + "' loading='lazy'>" : "") +
                    "<div><h4>" + Utils.escapeHtml(project.title || "Portfolio project") + "</h4>" + (project.description ? "<p>" + Utils.escapeHtml(project.description) + "</p>" : "") +
                    (link ? "<a class='fl-project-link' href='" + Utils.escapeHtml(link) + "' target='_blank' rel='noopener noreferrer'><span>View project</span><i class='fas fa-arrow-up-right-from-square' aria-hidden='true'></i></a>" : "") + "</div></article>";
            }).join("") : "<p class='fl-profile-muted'>No portfolio projects have been added yet.</p>";
            var experienceLabel = (record.experience || freelancer.experience || "").replace(/_/g, " ").replace(/\b\w/g, function(character) { return character.toUpperCase(); });
            var profileSkills = Array.isArray(record.skills) ? record.skills : [];
            var profileTitle = String(record.title || freelancer.services || "");
            if (!profileTitle || /^freelance (professional|services)$/i.test(profileTitle.trim())) {
                profileTitle = profileSkills.length ? "Freelancer specializing in " + profileSkills.slice(0, 3).join(", ") : "Freelance professional";
            }
            var profileBio = account.bio || freelancer.bio || "No introduction has been added yet.";
            var background = "";
            if (Number(record.yearsOfExperience) > 0) background += "<p class='fl-profile-muted'>" + Number(record.yearsOfExperience) + " years of experience</p>";
            if (languages.length) background += "<h4>Languages</h4><p class='fl-profile-muted'>" + languages.map(function(language) { return Utils.escapeHtml(language.name) + (language.proficiency ? " (" + Utils.escapeHtml(language.proficiency) + ")" : ""); }).join(" · ") + "</p>";
            if (education.length) background += "<h4>Education</h4>" + education.map(function(item) { return "<p class='fl-profile-muted'>" + Utils.escapeHtml([item.degree, item.institution, item.year].filter(Boolean).join(" · ")) + "</p>"; }).join("");
            if (certifications.length) background += "<h4>Certifications</h4>" + certifications.map(function(item) { return "<p class='fl-profile-muted'>" + Utils.escapeHtml([item.name, item.issuer, item.year].filter(Boolean).join(" · ")) + "</p>"; }).join("");
            detail.innerHTML = "<button type='button' class='fl-back-btn'><i class='fas fa-arrow-left'></i> Back to professionals</button>" +
                "<header class='fl-profile-header'><div class='fl-avatar fl-profile-avatar'>" + avatar + "</div><div class='fl-profile-heading'><div class='fl-name-row'><h3>" + Utils.escapeHtml(profileName) + "</h3>" + (record.isVerified ? "<span class='verified-badge'><i class='fas fa-circle-check'></i> Verified</span>" : "") + "</div>" +
                "<p class='fl-title'>" + Utils.escapeHtml(profileTitle) + "</p><div class='fl-proof-row'>" + (Number(record.rating || freelancer.rating) > 0 ? "<span class='fl-rating'><i class='fas fa-star'></i> " + Number(record.rating || freelancer.rating).toFixed(1) + "</span>" : "") + (experienceLabel ? "<span class='fl-profile-experience'>" + Utils.escapeHtml(experienceLabel) + " experience</span>" : "") + (record.completedJobs ? "<span class='fl-profile-experience'>" + Number(record.completedJobs) + " completed jobs</span>" : "") + "</div></div>" +
                "<div class='fl-profile-rate'>" + (record.hourlyRate ? "$" + Number(record.hourlyRate).toFixed(2) + " USD <span>/ hr</span>" : "Rate not listed") + "</div></header>" +
                "<div class='fl-profile-content'><section><h4>About</h4><p>" + Utils.escapeHtml(profileBio) + "</p><h4>Skills</h4><div class='fl-skills-row'>" + profileSkills.map(function(skill) { return "<span class='fl-skill-tag'>" + Utils.escapeHtml(skill) + "</span>"; }).join("") + "</div>" + background + "</section>" +
                "<section><h4>Portfolio</h4><div class='fl-project-list'>" + projects + "</div></section></div>" +
                "<footer class='fl-profile-actions'><button type='button' class='fl-btn-profile fl-profile-hire'><i class='fas fa-handshake'></i> Request to hire</button><button type='button' class='fl-btn-msg fl-profile-contact'><i class='fas fa-comment-dots'></i> Message " + Utils.escapeHtml(profileName.split(" ")[0]) + "</button></footer>";
            detail.querySelector(".fl-back-btn").addEventListener("click", function() { detail.hidden = true; list.hidden = false; });
            detail.querySelector(".fl-profile-contact").addEventListener("click", function() { FreelancerManager.contact(profileName, freelancer.userId); });
            detail.querySelector(".fl-profile-hire").addEventListener("click", function() { FreelancerManager.sendHireRequest(freelancerId, profileName); });
        } catch (error) {
            detail.innerHTML = "<button type='button' class='fl-back-btn'><i class='fas fa-arrow-left'></i> Back to professionals</button><div class='marketplace-empty'><h4>Could not load this profile</h4><p>Try again or return to the talent directory.</p><button type='button' class='marketplace-primary-btn fl-profile-retry'>Try again</button></div>";
            detail.querySelector(".fl-back-btn").addEventListener("click", function() { detail.hidden = true; list.hidden = false; });
            detail.querySelector(".fl-profile-retry").addEventListener("click", function() { FreelancerManager.showProfile(freelancerId); });
        }
    },
    showHire: async function() {
        UIHelper.hideAllContainers();
        document.getElementById("freelancerHireContainer").classList.remove("hidden");
        var profileDetail = document.getElementById("freelancerProfileDetail");
        if (profileDetail) profileDetail.hidden = true;
        document.getElementById("freelancerProfilesList").hidden = false;
        await this.loadFromAPI();
        this.render();
    },
    filter: function() { if (this.validateSearch()) this.render(); },
    resetFilter: function() {
        ["skillFilterInput", "freelancerMinRate", "freelancerMaxRate", "freelancerExperienceFilter", "freelancerAvailabilityFilter"].forEach(function(id) {
            var input = document.getElementById(id);
            if (input) input.value = "";
        });
        var sort = document.getElementById("freelancerSort");
        if (sort) sort.value = "match";
        this.render();
    }
};

// ===== FORM HANDLERS =====
var FormHandlers = {
    initInstructorForm: function() {
        var form = document.getElementById("instructorRegisterForm");
        if (!form) return;
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            var name = document.getElementById("instName").value.trim();
            var email = document.getElementById("instEmail").value.trim();
            var skill = document.getElementById("instSkill").value.trim();
            var phone = document.getElementById("instPhone").value.trim();
            var msgEl = document.getElementById("instructorSuccessMsg");
            WhatsAppService.notifyNewInstructor(name, skill + (email ? " | Email: " + email : ""), phone);
            UIHelper.showMessage(msgEl, "Registration submitted! Admin will contact you via WhatsApp.", "success");
            form.reset();
            setTimeout(function() { document.getElementById("instructorFormCard").classList.add("hidden"); }, CONFIG.FORM_DELAY);
        });
    },
    initFreelancerForm: function() {
        var form = document.getElementById("freelancerRegForm");
        if (!form) return;
        var profileEditorFields = ["freeTitle", "freeBio", "freeHourlyRate", "freeProfilePicture", "freeExperience", "freeAvailability"];
        var isProfileEditorForm = profileEditorFields.every(function(id) { return document.getElementById(id); });
        if (!isProfileEditorForm) {
            var profileButton = document.getElementById("showFreelancerFormBtn");
            function openFreelancerDestination(event) {
                event.preventDefault();
                if (!ApiService.getToken()) AuthNavigation.open("register", "freelancer");
                else window.location.href = "freelancer-dashboard.html";
            }
            if (profileButton) profileButton.addEventListener("click", openFreelancerDestination);
            form.addEventListener("submit", openFreelancerDestination);
            return;
        }
        var activeProfile = null;
        var status = document.getElementById("freelancerProfileStatus");
        var saveButton = document.getElementById("freelancerSaveBtn");
        function setProfileForm(profile, account) {
            activeProfile = profile || null;
            document.getElementById("freelancerFormTitle").textContent = activeProfile ? "Manage your professional profile" : "Create your professional profile";
            document.getElementById("freeName").value = account.name || "";
            document.getElementById("freeName").readOnly = true;
            document.getElementById("freeTitle").value = profile && profile.title || "";
            document.getElementById("freeBio").value = account.bio || "";
            document.getElementById("freeSkill").value = profile && Array.isArray(profile.skills) ? profile.skills.join(", ") : "";
            document.getElementById("freeHourlyRate").value = profile && profile.hourlyRate || "";
            document.getElementById("freeExperience").value = profile && profile.experience || "junior";
            document.getElementById("freeAvailability").value = profile && profile.availability || "available";
            document.getElementById("freeProfilePicture").value = account.profilePicture || "";
            var portfolio = profile && Array.isArray(profile.portfolio) ? profile.portfolio[0] : null;
            document.getElementById("freePortfolio").value = portfolio && portfolio.projectUrl || "";
            saveButton.innerHTML = activeProfile ? "<i class='fas fa-floppy-disk'></i> Update profile" : "<i class='fas fa-floppy-disk'></i> Save profile";
            var fields = [document.getElementById("freeName").value, document.getElementById("freeTitle").value, document.getElementById("freeBio").value, document.getElementById("freeSkill").value, document.getElementById("freeHourlyRate").value, document.getElementById("freeProfilePicture").value, document.getElementById("freePortfolio").value];
            var completion = Math.round(fields.filter(Boolean).length / fields.length * 100);
            document.getElementById("freelancerCompletionWrap").hidden = false;
            document.getElementById("freelancerCompletionValue").textContent = completion + "%";
            document.getElementById("freelancerCompletionBar").style.width = completion + "%";
        }
        function updateCompletion() {
            var fields = [document.getElementById("freeName").value, document.getElementById("freeTitle").value, document.getElementById("freeBio").value, document.getElementById("freeSkill").value, document.getElementById("freeHourlyRate").value, document.getElementById("freeProfilePicture").value, document.getElementById("freePortfolio").value];
            var completion = Math.round(fields.filter(Boolean).length / fields.length * 100);
            document.getElementById("freelancerCompletionValue").textContent = completion + "%";
            document.getElementById("freelancerCompletionBar").style.width = completion + "%";
        }
        ["freeTitle", "freeBio", "freeSkill", "freeHourlyRate", "freeProfilePicture", "freePortfolio"].forEach(function(id) {
            document.getElementById(id).addEventListener("input", updateCompletion);
        });
        function openProfileEditor() {
            var card = document.getElementById("freelancerFormCard");
            card.classList.remove("hidden");
            document.getElementById("freelancerHireContainer").classList.add("hidden");
            document.getElementById("login-register").scrollIntoView({ behavior: "smooth", block: "start" });
            status.textContent = "Loading your profile...";
            return ApiService.getMe().then(function(accountData) {
                return ApiService.request("/freelancers/me", "GET").then(function(data) {
                    setProfileForm(data.freelancer || {}, accountData.user || {});
                    status.textContent = "Your profile is ready to edit.";
                }).catch(function(error) {
                    if (/not found/i.test(error.message)) {
                        setProfileForm(null, accountData.user || {});
                        status.textContent = "Complete the fields below to create your profile.";
                    } else {
                        status.textContent = error.message || "Could not load your profile.";
                    }
                });
            }).catch(function(error) { status.textContent = error.message || "Could not load your account."; });
        }
        var showFreelancerBtn = document.getElementById("showFreelancerFormBtn");
        if (showFreelancerBtn) showFreelancerBtn.addEventListener("click", function() {
            if (!ApiService.getToken()) {
                AuthNavigation.open("register", "freelancer");
                return;
            }
            openProfileEditor();
        });
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            if (!ApiService.getToken()) {
                AuthNavigation.open("register", "freelancer");
                return;
            }
            var title = document.getElementById("freeTitle").value.trim();
            var skills = document.getElementById("freeSkill").value.split(",").map(function(skill) { return skill.trim(); }).filter(Boolean);
            var hourlyRate = Number(document.getElementById("freeHourlyRate").value);
            var bio = document.getElementById("freeBio").value.trim();
            var picture = document.getElementById("freeProfilePicture").value.trim();
            var projectUrl = document.getElementById("freePortfolio").value.trim();
            if (!title || !skills.length || !Number.isFinite(hourlyRate) || hourlyRate < 1) {
                status.textContent = "Add a title, at least one skill, and an hourly rate of at least $1.00 USD.";
                return;
            }
            saveButton.disabled = true;
            status.textContent = "Saving your professional profile...";
            try {
                await ApiService.request("/auth/profile", "PUT", { profilePicture: picture || null, bio: bio });
                var existingPortfolio = activeProfile && Array.isArray(activeProfile.portfolio) ? activeProfile.portfolio.slice() : [];
                if (projectUrl) {
                    if (existingPortfolio.length) existingPortfolio[0] = Object.assign({}, existingPortfolio[0], { projectUrl: projectUrl });
                    else existingPortfolio.push({ title: "Portfolio", projectUrl: projectUrl });
                }
                var payload = {
                    title: title,
                    skills: skills,
                    hourlyRate: hourlyRate,
                    experience: document.getElementById("freeExperience").value,
                    availability: document.getElementById("freeAvailability").value,
                    portfolio: existingPortfolio
                };
                var saved = activeProfile
                    ? await ApiService.request("/freelancers/me", "PUT", payload)
                    : await ApiService.request("/freelancers", "POST", payload);
                activeProfile = saved.freelancer || payload;
                status.textContent = activeProfile.status === "approved" ? "Profile saved. Your latest changes are live." : "Profile submitted. It will appear in search after admin approval.";
                setProfileForm(activeProfile, { name: document.getElementById("freeName").value, bio: bio, profilePicture: picture });
                NotificationManager.add("Freelancer profile saved.", "success");
            } catch (error) {
                status.textContent = error.message || "Could not save your profile.";
            } finally {
                saveButton.disabled = false;
            }
        });
    },
    initContactForm: function() {
        var form = document.getElementById("contactForm");
        var msgEl = document.getElementById("contactFormMessage");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var name = document.getElementById("contactName").value.trim();
            var email = document.getElementById("contactEmail").value.trim();
            var phone = document.getElementById("contactPhone").value.trim();
            var contactRole = document.getElementById("contactRole").value;
            var inquirySubject = document.getElementById("contactSubject").value.trim();
            var message = document.getElementById("contactMessage").value.trim();
            if (!name || !email || !contactRole || !inquirySubject || !message) { UIHelper.showMessage(msgEl, "Please fill in all required fields", "error"); return; }
            if (!email.includes("@")) { UIHelper.showMessage(msgEl, "Please enter a valid email address", "error"); return; }

            var roleSubjects = {
                "Learner / Student": "course",
                Instructor: "instructor",
                Freelancer: "freelancer",
                "Client / Employer": "project",
                "Business / Organization": "business",
                Partner: "business",
                "General Inquiry": "support",
                Other: "other"
            };
            var subject = roleSubjects[contactRole] || "other";
            var submittedMessage = "Contacting as: " + contactRole + "\nSubject: " + inquirySubject + "\n\n" + message;

            // Submit to backend first so admin sees it from any device
            var submitted = false;
            try {
                var res = await fetch(CONFIG.API_BASE + "/contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name, email: email, phone: phone, subject: subject, message: submittedMessage })
                });
                var data = await res.json();
                if (res.ok && data.success) submitted = true;
            } catch(e) { /* fall through to localStorage backup */ }

            // Always save to localStorage as backup
            StorageManager.saveContactSubmission({ name: name, email: email, phone: phone, contactRole: contactRole, subject: inquirySubject, message: message });

            // Also send to admin WhatsApp
            WhatsAppService.submitContactForm(name, email, phone, inquirySubject, message, contactRole);
            UIHelper.showMessage(msgEl, "Message sent! Redirecting to WhatsApp...", "success");
            form.reset();
        });
    },
    initNewsletterForm: function() {
        var form = document.getElementById("newsletterForm");
        var msgEl = document.getElementById("newsletterMessage");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var email = document.getElementById("newsletterEmail").value.trim();
            if (!email || !email.includes("@")) { UIHelper.showMessage(msgEl, "Please enter a valid email address", "error"); return; }

            // Try to save to backend first
            try {
                await ApiService.request("/newsletter/subscribe", "POST", { email: email });
            } catch(e) { /* Backend may not have this endpoint — save locally */ }

            // Always save locally as backup
            if (StorageManager.addNewsletterSubscriber(email)) {
                UIHelper.showMessage(msgEl, "Subscribed! Thanks for joining.", "success");
                document.getElementById("newsletterEmail").value = "";
            } else {
                UIHelper.showMessage(msgEl, "This email is already subscribed!", "error");
            }
        });
    },
    initLoginForm: function() {
        var form = document.getElementById("loginFormElement");
        var msgEl = document.getElementById("authMessage");
        if (!form) return;
        var _submitting = false;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            if (_submitting) return;
            var email = document.getElementById("loginEmail").value.trim();
            var password = document.getElementById("loginPassword").value;
            var rememberMe = document.getElementById("rememberMe").checked;
            var selectedRole = document.getElementById("loginSelectedRole").value || "learner";
            if (!email || !password) { UIHelper.showMessage(msgEl, "Please fill in all fields", "error"); return; }
            var submitBtn = form.querySelector("button[type='submit']");
            var originalText = submitBtn ? submitBtn.innerHTML : "";
            _submitting = true;
            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Logging in..."; }
            UIHelper.showMessage(msgEl, "Logging in...", "success");
            try {
                var data = await ApiService.login(email, password);
                var loginRole = data.user.role;
                var expectedRole = selectedRole === "learner" ? "user" : selectedRole;
                if (loginRole === "user" && (selectedRole === "learner" || selectedRole === "client")) {
                    loginRole = selectedRole === "client" ? "client" : "user";
                } else if (loginRole === "employer") {
                    loginRole = "client";
                }
                if (loginRole !== expectedRole) {
                    ApiService.clearToken();
                    var roleNames = { user: "Learner", instructor: "Instructor", freelancer: "Freelancer", client: "Client / Employer" };
                    UIHelper.showMessage(msgEl, "This account is registered as " + (roleNames[loginRole] || loginRole) + ". Select that role and try again.", "error");
                    _submitting = false;
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
                    return;
                }
                StorageManager.saveUserSession({ email: email, name: data.user.name, role: loginRole, loggedIn: true, rememberMe: rememberMe, country: data.user.country });
                UIHelper.showMessage(msgEl, "Welcome back, " + data.user.name + "!", "success");
                NavbarUser.update();
                NotificationManager.add("Welcome back, " + data.user.name + "!", "success", "Login Successful");
                form.reset();
                setTimeout(function() {
                    var redirectDestination = DashboardManager.resolveDashboardUrl(Object.assign({}, data.user, { role: loginRole }));
                    window.location.href = redirectDestination;
                }, 800);
            } catch (err) {
                var errMsg = err.message;
                if (errMsg.includes("waking up")) {
                    errMsg = "Server is starting up — please wait 30 seconds and try again.";
                }
                UIHelper.showMessage(msgEl, errMsg, "error");
                _submitting = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
            }
        });
    },
    initRegisterForm: function() {
        var form = document.getElementById("registerFormElement");
        var msgEl = document.getElementById("authMessage");
        if (!form) return;
        var _submitting = false;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            if (_submitting) return;
            var fullName = document.getElementById("regFullName").value.trim();
            var email = document.getElementById("regEmail").value.trim();
            var phone = document.getElementById("regPhone").value.trim();
            var password = document.getElementById("regPassword").value;
            var confirmPassword = document.getElementById("regConfirmPassword").value;
            var agreeTerms = document.getElementById("agreeTerms").checked;
            var role = document.getElementById("regSelectedRole").value;
            if (!fullName || !email || !password || !confirmPassword) { UIHelper.showMessage(msgEl, "Please fill in all required fields", "error"); return; }
            if (password !== confirmPassword) { UIHelper.showMessage(msgEl, "Passwords do not match", "error"); return; }
            if (password.length < 6) { UIHelper.showMessage(msgEl, "Password must be at least 6 characters", "error"); return; }
            if (!agreeTerms) { UIHelper.showMessage(msgEl, "Please agree to the Terms of Service", "error"); return; }
            var roleMap = { learner: "user", instructor: "instructor", freelancer: "freelancer", client: "client" };
            var backendRole = roleMap[role] || "user";
            var submitBtn = form.querySelector("button[type='submit']");
            var originalText = submitBtn ? submitBtn.innerHTML : "";
            _submitting = true;
            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Creating account..."; }
            UIHelper.showMessage(msgEl, "Creating your account...", "success");
            try {
                var country = document.getElementById("regCountry") ? document.getElementById("regCountry").value : "";
                var extraData = {};
                if (role === "freelancer") {
                    extraData.skills = document.getElementById("regSkills") ? document.getElementById("regSkills").value.trim() : "";
                    extraData.hourlyRate = document.getElementById("regHourlyRate") ? document.getElementById("regHourlyRate").value : "";
                    extraData.portfolio = document.getElementById("regPortfolio") ? document.getElementById("regPortfolio").value.trim() : "";
                    extraData.profilePicture = document.getElementById("regProfilePic") ? document.getElementById("regProfilePic").value.trim() : "";
                }
                if (role === "instructor") {
                    extraData.expertise = document.getElementById("regExpertise") ? document.getElementById("regExpertise").value.trim() : "";
                    extraData.bio = document.getElementById("regBio") ? document.getElementById("regBio").value.trim() : "";
                    extraData.profilePicture = document.getElementById("regInstructorProfilePic") ? document.getElementById("regInstructorProfilePic").value.trim() : "";
                }
                var data = await ApiService.register(fullName, email, phone, password, backendRole, country, extraData);
                var successMsg = "Welcome to SkillHub, " + fullName + "! ";
                if (role === "freelancer") successMsg += "Your freelancer profile is pending admin review.";
                else if (role === "instructor") successMsg += "Your instructor account is pending admin review.";
                else successMsg += "Start exploring courses today!";
                UIHelper.showMessage(msgEl, successMsg, "success");
                // Save country to session and keep client role available on the frontend even when backend stores this as a user account
                StorageManager.saveUserSession({ email: email, name: fullName, role: role === "client" ? "client" : backendRole, country: country, loggedIn: false });
                form.reset();
                document.getElementById("freelancerExtraFields").classList.add("hidden");
                document.getElementById("instructorExtraFields").classList.add("hidden");
                // Show welcome modal
                WelcomeManager.show(fullName, role);

                // Send WhatsApp welcome to user if phone provided
                if (phone) {
                    var welcomeMsg = "Welcome to SkillHub, " + fullName + "! Your account has been created. ";
                    if (role === "instructor") welcomeMsg += "Your instructor account is pending review — we'll contact you within 24 hours.";
                    else if (role === "freelancer") welcomeMsg += "Your freelancer profile is pending review — we'll contact you within 24 hours.";
                    else welcomeMsg += "Start exploring courses at skillhub.netlify.app";
                    try { WhatsAppService.sendToNumber(phone, welcomeMsg); } catch(e) {}
                }
                setTimeout(function() {
                    var loginTab = document.querySelector(".auth-tab[data-tab='login']");
                    if (loginTab) loginTab.click();
                    var loginRoleButton = document.querySelector("#loginForm .role-btn[data-role='" + (role === "learner" ? "learner" : role) + "']");
                    if (loginRoleButton) loginRoleButton.click();
                    document.getElementById("loginEmail").value = email;
                }, 2500);
            } catch (err) {
                var regErrMsg = err.message;
                if (regErrMsg.includes('duplicate key') || regErrMsg.includes('E11000')) {
                    regErrMsg = 'An account with this email already exists. Please log in instead.';
                } else if (regErrMsg.includes('waking up')) {
                    regErrMsg = 'Server is starting up — please wait 30 seconds and try again.';
                }
                UIHelper.showMessage(msgEl, regErrMsg, "error");
                _submitting = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
            }
        });
    }
};

// ===== ANIMATIONS =====
var animationIntervals = [];
var AnimationManager = {
    init: function() { this.initScrollReveal(); this.initGlowEffect(); },
    initScrollReveal: function() {
        var elements = document.querySelectorAll(".feature-box, .mission-card, .value-item, .footer-section");
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) { entry.target.style.opacity = "1"; entry.target.style.transform = "translateY(0)"; observer.unobserve(entry.target); }
            });
        }, { threshold: 0.2 });
        elements.forEach(function(el) { el.style.opacity = "0"; el.style.transform = "translateY(20px)"; el.style.transition = "opacity 0.6s ease, transform 0.6s ease"; observer.observe(el); });
    },
    initGlowEffect: function() {
        var stats = document.querySelectorAll(".stat-number");
        var timer = setInterval(function() {
            stats.forEach(function(s) { s.style.textShadow = "0 0 10px rgba(251,191,36,0.5)"; setTimeout(function() { s.style.textShadow = "none"; }, 500); });
        }, 3000);
        animationIntervals.push(timer);
    },
    cleanup: function() { animationIntervals.forEach(function(id) { clearInterval(id); }); animationIntervals = []; }
};

// ===== NAVIGATION =====
var NavigationManager = {
    init: function() {
        this.initNavbarScroll();
        this.initMegaMenus();
        this.initAuthNavigation();
        this.initGlobalSearch();
        this.initActiveLinkHighlight();
        this.initSmoothScroll();
        this.initBackToTop();
        this.initCopyToClipboard();
        this.initSocialLinks();
        this.initContactClickHandlers();
    },
    initNavbarScroll: function() {
        window.addEventListener("scroll", Utils.debounce(function() {
            var navbar = document.querySelector(".navbar");
            if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 50);
        }));
    },
    initMegaMenus: function() {
        var hamburger = document.getElementById("hamburger");
        var navLinks = document.getElementById("navLinks");
        var scrim = document.getElementById("navScrim");
        if (!hamburger || !navLinks) return;

        function setExpanded(item, open) {
            var trigger = item && item.querySelector(".nav-trigger");
            if (!item || !trigger) return;
            item.classList.toggle("is-open", open);
            trigger.setAttribute("aria-expanded", open ? "true" : "false");
        }

        function closeMenus(except) {
            navLinks.querySelectorAll(".nav-item.is-open").forEach(function(item) {
                if (item !== except) setExpanded(item, false);
            });
        }

        function closeAccountMenu() {
            var accountMenu = document.getElementById("navAccountMenu");
            var accountToggle = document.getElementById("navAccountToggle");
            if (accountMenu) accountMenu.hidden = true;
            if (accountToggle) accountToggle.setAttribute("aria-expanded", "false");
        }

        function closeMobileMenu() {
            navLinks.classList.remove("active");
            hamburger.classList.remove("active");
            hamburger.setAttribute("aria-expanded", "false");
            hamburger.setAttribute("aria-label", "Open navigation menu");
            if (scrim) scrim.hidden = true;
            document.body.style.overflow = "";
        }

        function closeAll() {
            closeMenus();
            closeAccountMenu();
            closeMobileMenu();
        }

        function runMenuAction(link) {
            var action = link.getAttribute("data-nav-action");
            if (action === "show-courses") {
                window.location.href = "courses.html";
            } else if (action === "show-instructor") {
                var instructor = document.getElementById("showInstructorFormBtn");
                if (instructor) instructor.click();
            } else if (action === "show-freelancer-form") {
                var freelancerForm = document.getElementById("showFreelancerFormBtn");
                if (freelancerForm) freelancerForm.click();
            } else if (action === "browse-freelancers") {
                var hire = document.getElementById("hireFreelancerBtn");
                if (hire) hire.click();
            } else if (action === "show-mission-vision") {
                var mission = document.getElementById("mission-vision");
                if (mission) {
                    var navHeight = (document.querySelector(".navbar") || {}).offsetHeight || 0;
                    window.scrollTo({ top: mission.getBoundingClientRect().top + window.scrollY - navHeight - 12, behavior: "smooth" });
                    history.replaceState(null, "", "#mission-vision");
                }
            }
        }

        navLinks.querySelectorAll(".nav-item").forEach(function(item) {
            var trigger = item.querySelector(".nav-trigger");
            if (!trigger) return;
            trigger.addEventListener("click", function() {
                var willOpen = !item.classList.contains("is-open");
                closeMenus(item);
                setExpanded(item, willOpen);
            });
            item.addEventListener("pointerenter", function() {
                if (window.matchMedia("(min-width: 1081px)").matches) {
                    closeMenus(item);
                    setExpanded(item, true);
                }
            });
            item.addEventListener("pointerleave", function() {
                if (window.matchMedia("(min-width: 1081px)").matches && !item.contains(document.activeElement)) {
                    setExpanded(item, false);
                }
            });
            item.addEventListener("focusout", function(event) {
                if (!item.contains(event.relatedTarget) && window.matchMedia("(min-width: 1081px)").matches) {
                    setExpanded(item, false);
                }
            });
        });

        hamburger.addEventListener("click", function() {
            var open = !navLinks.classList.contains("active");
            navLinks.classList.toggle("active", open);
            hamburger.classList.toggle("active", open);
            hamburger.setAttribute("aria-expanded", open ? "true" : "false");
            hamburger.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
            if (scrim) scrim.hidden = !open;
            document.body.style.overflow = open ? "hidden" : "";
        });

        if (scrim) scrim.addEventListener("click", closeAll);
        navLinks.addEventListener("click", function(event) {
            var link = event.target.closest("a");
            if (!link) return;
            var dashboardTab = link.getAttribute("data-dashboard-tab");
            closeMenus();
            if (navLinks.classList.contains("active")) closeMobileMenu();
            if (dashboardTab) {
                event.preventDefault();
                DashboardManager.show();
                return;
            }
            if (link.hasAttribute("data-nav-action")) setTimeout(function() { runMenuAction(link); }, 250);
        });

        document.addEventListener("click", function(event) {
            if (!event.target.closest(".navbar")) closeAll();
        });
        document.addEventListener("keydown", function(event) {
            if (event.key !== "Escape") return;
            closeAll();
            hamburger.focus();
        });
        window.addEventListener("resize", Utils.debounce(function() {
            if (window.innerWidth > 1080) closeMobileMenu();
        }, 150));

        var accountToggle = document.getElementById("navAccountToggle");
        var accountMenu = document.getElementById("navAccountMenu");
        if (accountToggle && accountMenu) {
            accountToggle.addEventListener("click", function(event) {
                event.stopPropagation();
                var open = accountMenu.hidden;
                accountMenu.hidden = !open;
                accountToggle.setAttribute("aria-expanded", open ? "true" : "false");
            });
            accountMenu.addEventListener("click", function(event) {
                if (event.target.closest("a, button")) closeAccountMenu();
            });
        }
    },
    initAuthNavigation: function() {
        document.querySelectorAll("[data-auth-tab]").forEach(function(link) {
            link.addEventListener("click", function(event) {
                event.preventDefault();
                AuthNavigation.open(link.dataset.authTab);
            });
        });
    },
    initGlobalSearch: function() {
        var root = document.getElementById("navSearch");
        var panel = document.getElementById("navSearchPanel");
        var form = document.getElementById("navSearchForm");
        var input = document.getElementById("navSearchInput");
        var results = document.getElementById("navSearchResults");
        var mobileToggle = document.getElementById("navSearchToggle");
        var closeButton = document.getElementById("navSearchClose");
        var suggestions = document.getElementById("navSearchSuggestions");
        if (!root || !panel || !form || !input || !results) return;

        var timer = null;
        var requestId = 0;
        var activeResult = -1;

        function escapeHtml(value) {
            return String(value || "").replace(/[&<>"']/g, function(character) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
            });
        }

        function closeResults() {
            results.hidden = true;
            input.setAttribute("aria-expanded", "false");
            activeResult = -1;
        }

        function closeSearch() {
            panel.hidden = true;
            panel.classList.remove("search-panel-open");
            closeResults();
            if (suggestions) suggestions.hidden = false;
            if (mobileToggle) {
                mobileToggle.setAttribute("aria-expanded", "false");
                mobileToggle.setAttribute("aria-label", "Open search");
            }
        }

        function openSearch() {
            panel.hidden = false;
            requestAnimationFrame(function() {
                panel.classList.add("search-panel-open");
                input.focus();
            });
            if (mobileToggle) {
                mobileToggle.setAttribute("aria-expanded", "true");
                mobileToggle.setAttribute("aria-label", "Close search");
            }
        }

        function showStatus(message) {
            results.innerHTML = "<div class='search-results-status' role='status'>" + escapeHtml(message) + "</div>";
            results.hidden = false;
            input.setAttribute("aria-expanded", "true");
        }

        function renderResults(data) {
            var html = "";
            var courses = data.courses || [];
            var freelancers = data.freelancers || [];
            if (courses.length) {
                html += "<h2 class='search-results-heading'>Courses</h2>";
                html += courses.map(function(course) {
                    var description = course.shortDescription || course.category || course.instructorName || "View course details";
                    return "<a class='search-result' role='option' href='course.html?id=" + encodeURIComponent(course.id || course._id) + "'>" +
                        "<i class='fas fa-book-open' aria-hidden='true'></i><span class='search-result-copy'><strong>" + escapeHtml(course.title) + "</strong><small>" + escapeHtml(description) + "</small></span>" +
                        "<span class='search-result-meta'>" + escapeHtml(CurrencyUtil.displayUSD(course.price)) + "</span></a>";
                }).join("");
            }
            if (freelancers.length) {
                html += "<h2 class='search-results-heading'>Freelancers</h2>";
                html += freelancers.map(function(freelancer) {
                    var person = freelancer.userId || {};
                    var subtitle = [freelancer.title, (freelancer.skills || []).slice(0, 3).join(", ")].filter(Boolean).join(" · ");
                    var freelancerId = freelancer.id || freelancer._id;
                    return "<a class='search-result platform-freelancer-result' role='option' href='#earn' data-freelancer-id='" + encodeURIComponent(freelancerId || "") + "'>" +
                        "<i class='fas fa-user-tie' aria-hidden='true'></i><span class='search-result-copy'><strong>" + escapeHtml(person.name || freelancer.title || "Freelancer") + "</strong><small>" + escapeHtml(subtitle || "Available freelancer") + "</small></span>" +
                        "<span class='search-result-meta'>$" + escapeHtml(Number(freelancer.hourlyRate || 0).toFixed(2)) + " USD/hr</span></a>";
                }).join("");
            }
            if (!html) html = "<div class='search-results-status' role='status'>No matching courses or freelancers.</div>";
            results.innerHTML = html;
            results.hidden = false;
            input.setAttribute("aria-expanded", "true");
            activeResult = -1;
            results.querySelectorAll(".platform-freelancer-result").forEach(function(result) {
                result.addEventListener("click", async function(event) {
                    event.preventDefault();
                    var freelancerId = result.dataset.freelancerId;
                    closeSearch();
                    if (!freelancerId) return;
                    try {
                        await FreelancerManager.showHire();
                        if (FreelancerManager.freelancers.some(function(freelancer) { return String(freelancer.id) === String(freelancerId); })) {
                            await FreelancerManager.showProfile(freelancerId);
                        } else {
                            NotificationManager.add("This freelancer is no longer available in the directory.", "info");
                        }
                    } catch (error) {
                        NotificationManager.add(error.message || "Could not open this freelancer profile.", "error");
                    }
                });
            });
        }

        async function search(query, currentRequest) {
            try {
                var response = await fetch(CONFIG.API_BASE + "/users/platform-search?q=" + encodeURIComponent(query));
                var data = await response.json();
                if (response.ok && data.success) {
                    if (currentRequest === requestId) renderResults(data);
                    return;
                }
            } catch (error) {
                // Older deployed backends may not yet expose the combined search endpoint.
            }
            try {
                var encodedQuery = encodeURIComponent(query);
                var responses = await Promise.all([
                    fetch(CONFIG.API_BASE + "/courses?search=" + encodedQuery + "&limit=8"),
                    fetch(CONFIG.API_BASE + "/freelancers?search=" + encodedQuery + "&limit=8")
                ]);
                var payloads = await Promise.all(responses.map(function(result) { return result.json(); }));
                if (currentRequest !== requestId) return;
                if (responses.some(function(result) { return !result.ok; })) throw new Error("Search is temporarily unavailable.");
                renderResults({
                    courses: payloads[0].courses || [],
                    freelancers: payloads[1].freelancers || []
                });
            } catch (error) {
                if (currentRequest === requestId) showStatus(error.message || "Search is temporarily unavailable.");
            }
        }

        function submitSearch(query) {
            query = String(query || input.value).trim();
            if (query.length < 2 || query.length > 100) {
                input.focus();
                showStatus(query.length < 2 ? "Type at least 2 characters to search." : "Search must be 100 characters or fewer.");
                return;
            }
            if (suggestions) suggestions.hidden = true;
            showStatus("Searching courses and freelancers…");
            search(query, ++requestId);
        }

        input.addEventListener("input", function() { input.setCustomValidity(""); });

        form.addEventListener("submit", function(event) {
            event.preventDefault();
            submitSearch(input.value);
        });

        input.addEventListener("input", function() {
            var query = input.value.trim();
            clearTimeout(timer);
            requestId += 1;
            if (suggestions) suggestions.hidden = query.length >= 2;
            if (suggestions) suggestions.hidden = query.length >= 2;
            if (query.length < 2 || query.length > 100) {
                if (query) showStatus(query.length < 2 ? "Type at least 2 characters to search." : "Search must be 100 characters or fewer.");
                else closeResults();
                return;
            }
            showStatus("Searching courses and freelancers…");
            var currentRequest = requestId;
            timer = setTimeout(function() { search(query, currentRequest); }, 220);
        });

        input.addEventListener("keydown", function(event) {
            var items = Array.from(results.querySelectorAll(".search-result"));
            if (event.key === "ArrowDown" && items.length) {
                event.preventDefault();
                activeResult = (activeResult + 1) % items.length;
                items[activeResult].focus();
            } else if (event.key === "Escape") {
                closeResults();
                input.blur();
            }
        });

        results.addEventListener("keydown", function(event) {
            var items = Array.from(results.querySelectorAll(".search-result"));
            var index = items.indexOf(document.activeElement);
            if (event.key === "ArrowDown" && items.length) {
                event.preventDefault();
                items[(index + 1) % items.length].focus();
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                if (index <= 0) input.focus();
                else items[index - 1].focus();
            } else if (event.key === "Escape") {
                closeResults();
                input.focus();
            }
        });

        if (mobileToggle) mobileToggle.addEventListener("click", function() {
            if (panel.hidden) openSearch();
            else closeSearch();
        });
        if (closeButton) closeButton.addEventListener("click", closeSearch);
        if (suggestions) suggestions.addEventListener("click", function(event) {
            var button = event.target.closest("[data-search-suggestion]");
            if (!button) return;
            input.value = button.getAttribute("data-search-suggestion");
            submitSearch(input.value);
        });

        document.addEventListener("click", function(event) {
            if (!panel.hidden && !panel.contains(event.target) && !root.contains(event.target)) closeSearch();
        });
        document.addEventListener("keydown", function(event) {
            if (event.key === "Escape" && !panel.hidden) {
                closeSearch();
                mobileToggle && mobileToggle.focus();
            }
        });
    },
    initActiveLinkHighlight: function() {
        function setActive() {
            var sections = document.querySelectorAll("section");
            var links = document.querySelectorAll(".nav-link");
            var current = "";
            var scrollPos = window.scrollY + 100;
            sections.forEach(function(s) { if (scrollPos >= s.offsetTop && scrollPos < s.offsetTop + s.clientHeight) { current = s.getAttribute("id"); } });
            links.forEach(function(link) { link.classList.remove("active"); if (link.getAttribute("href") === "#" + current) link.classList.add("active"); });
        }
        window.addEventListener("scroll", Utils.debounce(setActive));
        setActive();
    },
    initSmoothScroll: function() {
        document.querySelectorAll("a[href^='#']").forEach(function(anchor) {
            anchor.addEventListener("click", function(e) {
                var targetId = anchor.getAttribute("href");
                if (targetId === "#") return;
                var target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0;
                    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" });
                }
            });
        });
    },
    initBackToTop: function() {
        var btn = document.getElementById("backToTop");
        if (!btn) return;
        window.addEventListener("scroll", Utils.debounce(function() {
            btn.style.opacity = window.scrollY > 300 ? "1" : "0";
            btn.style.visibility = window.scrollY > 300 ? "visible" : "hidden";
        }));
        btn.addEventListener("click", function() { window.scrollTo({ top: 0, behavior: "smooth" }); });
    },
    initCopyToClipboard: function() {
        document.querySelectorAll(".contact-value").forEach(function(value) {
            value.style.cursor = "pointer";
            value.title = "Click to copy";
            value.addEventListener("click", async function() {
                var text = value.textContent;
                try {
                    await navigator.clipboard.writeText(text);
                    var original = value.textContent;
                    value.textContent = "Copied!";
                    value.style.color = "#10b981";
                    setTimeout(function() { value.textContent = original; value.style.color = ""; }, 2000);
                } catch (err) { console.error("Copy failed:", err); }
            });
        });
    },
    initSocialLinks: function() {
        document.querySelectorAll(".social-link, .social-icon").forEach(function(link) {
            if (link.target === "_blank") link.rel = "noopener noreferrer";
        });
    },
    initContactClickHandlers: function() {
        // Contact links use their own configured href destinations.
    }
};

var AuthNavigation = {
    open: function(tabName, requestedRole) {
        if (tabName === "register" && ApiService && ApiService.getToken && ApiService.getToken()) {
            if (DashboardManager && DashboardManager.show) DashboardManager.show();
            return;
        }

        var target = document.getElementById("login-register");
        var tab = document.querySelector(".auth-tab[data-tab='" + tabName + "']");
        var register = document.getElementById("registerForm");
        if (tabName === "register" && register) {
            register.dataset.signupEntry = requestedRole ? "direct" : "chooser";
        }

        if (tab) tab.click();
        if (tabName === "register") {
            var roleStep = document.getElementById("signupRoleStep");
            var details = document.getElementById("signupDetails");
            if (requestedRole && window.SignupRoleSelection) {
                window.SignupRoleSelection.select(requestedRole, true);
            } else {
                if (roleStep) roleStep.hidden = false;
                if (details) details.classList.add("hidden");
            }
        }

        if (target) {
            var navHeight = (document.querySelector(".navbar") || {}).offsetHeight || 0;
            window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navHeight, behavior: "smooth" });
        }

        var navLinks = document.getElementById("navLinks");
        var hamburger = document.getElementById("hamburger");
        var scrim = document.getElementById("navScrim");
        if (navLinks && navLinks.classList.contains("active")) {
            navLinks.classList.remove("active");
            if (hamburger) {
                hamburger.classList.remove("active");
                hamburger.setAttribute("aria-expanded", "false");
            }
            if (scrim) scrim.hidden = true;
            document.body.style.overflow = "";
        }
    },
    openRole: function(role) {
        this.open("register", role);
    }
};

// ===== AUTH UI =====
var AuthUI = {
    init: function() { this.initTabs(); this.initRoleButtons(); this.initPasswordToggles(); this.initForgotPassword(); },
    initTabs: function() {
        var tabs = document.querySelectorAll(".auth-tab");
        var loginForm = document.getElementById("loginForm");
        var registerForm = document.getElementById("registerForm");
        tabs.forEach(function(tab) {
            tab.addEventListener("click", function() {
                tabs.forEach(function(t) { t.classList.remove("active"); });
                tab.classList.add("active");
                var isLogin = tab.getAttribute("data-tab") === "login";
                loginForm.classList.toggle("active", isLogin);
                registerForm.classList.toggle("active", !isLogin);
                if (!isLogin) {
                    var roleStep = document.getElementById("signupRoleStep");
                    var details = document.getElementById("signupDetails");
                    var requestedRole = new URLSearchParams(window.location.search).get("role");
                    var hasRequestedRole = ["learner", "instructor", "freelancer", "client"].includes(requestedRole);
                    if (hasRequestedRole && window.SignupRoleSelection) {
                        if (roleStep) roleStep.hidden = false;
                        if (details) details.classList.add("hidden");
                        window.SignupRoleSelection.select(requestedRole, true);
                    } else {
                        if (roleStep) roleStep.hidden = false;
                        if (details) details.classList.add("hidden");
                        if (registerForm) registerForm.dataset.signupEntry = "chooser";
                    }
                }
            });
        });
    },
    initRoleButtons: function() {
        document.querySelectorAll("#loginForm .role-btn").forEach(function(btn) {
            btn.addEventListener("click", function() {
                document.querySelectorAll("#loginForm .role-btn").forEach(function(b) { b.classList.remove("active"); });
                btn.classList.add("active");
                document.getElementById("loginSelectedRole").value = btn.getAttribute("data-role");
            });
        });
        document.querySelectorAll("#registerForm .role-btn[data-role-reg]").forEach(function(btn) {
            btn.addEventListener("click", function() {
            document.querySelectorAll("#registerForm .role-btn[data-role-reg]").forEach(function(b) { b.classList.remove("active"); });
                btn.classList.add("active");
                var role = btn.getAttribute("data-role-reg");
                document.getElementById("regSelectedRole").value = role;
                // Show/hide extra fields based on role
                document.getElementById("freelancerExtraFields").classList.toggle("hidden", role !== "freelancer");
                document.getElementById("instructorExtraFields").classList.toggle("hidden", role !== "instructor");
            });
        });

        function resolveBackendRole(role) {
            if (role === "instructor" || role === "freelancer" || role === "client") return role;
            return "user";
        }

        var registerForm = document.getElementById("registerForm");
        var roleStep = document.getElementById("signupRoleStep");
        var details = document.getElementById("signupDetails");
        var continueButton = document.getElementById("signupContinue");
        var selectedLabel = document.getElementById("signupSelectedLabel");
        var selectedRole = "";
        var roleLabels = {
            learner: "Learner",
            instructor: "Instructor",
            freelancer: "Freelancer",
            client: "Client / Employer"
        };

        function chooseRole(role) {
            selectedRole = role;
            document.querySelectorAll(".signup-role-card").forEach(function(card) {
                var active = card.dataset.signupRole === role;
                card.classList.toggle("selected", active);
                card.setAttribute("aria-pressed", active ? "true" : "false");
            });
            if (continueButton) continueButton.disabled = !role;
            if (document.getElementById("signupRoleError")) document.getElementById("signupRoleError").hidden = true;
        }

        document.querySelectorAll(".signup-role-card").forEach(function(card) {
            card.addEventListener("click", function() { chooseRole(card.dataset.signupRole); });
        });

        window.SignupRoleSelection = {
            select: function(role, continueToForm) {
                if (!roleLabels[role]) return;
                chooseRole(role);
                if (continueToForm) {
                    var backendRole = resolveBackendRole(role);
                    var roleButton = document.querySelector("#registerForm .role-btn[data-role-reg='" + backendRole + "']");
                    if (roleButton) roleButton.click();
                    var selectedRoleInput = document.getElementById("regSelectedRole");
                    if (selectedRoleInput) selectedRoleInput.value = backendRole;
                    if (selectedLabel) selectedLabel.textContent = roleLabels[role];
                    if (roleStep) roleStep.hidden = true;
                    if (details) details.classList.remove("hidden");
                }
            }
        };

        document.querySelectorAll("[data-signup-direct-role]").forEach(function(link) {
            link.addEventListener("click", function(event) {
                event.preventDefault();
                var role = link.dataset.signupDirectRole;
                AuthNavigation.open("register", role);
            });
        });

        if (continueButton) continueButton.addEventListener("click", function() {
            if (!selectedRole) {
                var error = document.getElementById("signupRoleError");
                if (error) error.hidden = false;
                return;
            }
            var backendRole = resolveBackendRole(selectedRole);
            var roleButton = document.querySelector("#signupLegacyRoleControls .role-btn[data-role-reg='" + backendRole + "']");
            if (roleButton) roleButton.click();
            else document.getElementById("regSelectedRole").value = backendRole;
            if (selectedLabel) selectedLabel.textContent = roleLabels[selectedRole];
            if (roleStep) roleStep.hidden = true;
            if (details) details.classList.remove("hidden");
            var firstInput = document.getElementById("regFullName");
            if (firstInput) firstInput.focus();
        });

        var changeRoleButton = document.getElementById("signupChangeRole");
        if (changeRoleButton) changeRoleButton.addEventListener("click", function() {
            if (details) details.classList.add("hidden");
            if (roleStep) roleStep.hidden = false;
            var selected = document.querySelector(".signup-role-card.selected");
            if (selected) selected.focus();
        });

    },
    initPasswordToggles: function() {
        document.querySelectorAll(".toggle-password").forEach(function(toggle) {
            toggle.addEventListener("click", function() {
                var input = document.getElementById(toggle.getAttribute("data-target"));
                var icon = toggle.querySelector("i");
                if (input.type === "password") { input.type = "text"; icon.classList.replace("fa-eye", "fa-eye-slash"); }
                else { input.type = "password"; icon.classList.replace("fa-eye-slash", "fa-eye"); }
            });
        });
    },
    initForgotPassword: function() {
        document.querySelectorAll(".forgot-link").forEach(function(link) {
            link.addEventListener("click", function(e) {
                e.preventDefault();
                UIHelper.showMessage(document.getElementById("authMessage"), "Password reset feature coming soon.", "success");
            });
        });
    }
};

// ===== BUTTON HANDLERS =====
var ButtonHandlers = {
    init: function() {
        // ── Hero buttons ──────────────────────────────────────────────
        var heroBadge = document.getElementById("heroBadge");
        if (heroBadge) heroBadge.addEventListener("click", function() {
            var target = document.getElementById("login-register");
            if (target) { var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0; window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" }); }
        });
        var heroGetStarted = document.getElementById("heroGetStarted");
        if (heroGetStarted) heroGetStarted.addEventListener("click", async function(e) {
            e.preventDefault();
            if (await AuthGuard.isLoggedIn()) { DashboardManager.show(); }
            else { AuthNavigation.open("register"); }
        });
        var heroExploreCourses = document.getElementById("heroExploreCourses");
        if (heroExploreCourses) heroExploreCourses.addEventListener("click", function(e) {
            e.preventDefault();
            var target = document.getElementById("courses");
            if (target) { var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0; window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" }); }
        });

        document.querySelectorAll("[data-hero-action]").forEach(function(button) {
            button.addEventListener("click", async function(event) {
                event.preventDefault();
                var action = button.getAttribute("data-hero-action");
                if (action === "show-instructor") {
                    if (await AuthGuard.isLoggedIn()) {
                        DashboardManager.show();
                        NotificationManager.add("To become an instructor, update your role in Settings.", "info");
                    } else {
                        AuthNavigation.open("register", "instructor");
                    }
                    return;
                }
                if (action === "show-freelancer-form") {
                    var freelancerCard = document.getElementById("freelancerFormCard");
                    if (freelancerCard) {
                        freelancerCard.classList.remove("hidden");
                        document.getElementById("earn").scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                    return;
                }
                if (action === "browse-freelancers") {
                    var earnSection = document.getElementById("earn");
                    var container = document.getElementById("freelancerHireContainer");
                    if (earnSection) earnSection.scrollIntoView({ behavior: "smooth", block: "start" });
                    if (container) container.classList.remove("hidden");
                    if (typeof FreelancerManager !== "undefined" && FreelancerManager && typeof FreelancerManager.showHire === "function") {
                        FreelancerManager.showHire();
                    }
                }
            });
        });

        document.querySelectorAll("[data-open-project-inquiry]").forEach(function(button) {
            button.addEventListener("click", function(event) {
                event.preventDefault();
                var modal = document.getElementById("projectInquiry");
                if (modal) modal.hidden = false;
            });
        });

        document.querySelectorAll("[data-open-business-inquiry]").forEach(function(button) {
            button.addEventListener("click", function(event) {
                event.preventDefault();
                var modal = document.getElementById("businessInquiry");
                if (modal) modal.hidden = false;
            });
        });

        // ── Courses section ───────────────────────────────────────────
        var showInstructorBtn = document.getElementById("showInstructorFormBtn");
        if (showInstructorBtn) showInstructorBtn.addEventListener("click", async function() {
            if (await AuthGuard.isLoggedIn()) {
                DashboardManager.show();
                NotificationManager.add("To become an instructor, update your role in Settings.", "info");
            } else {
                AuthNavigation.open("register", "instructor");
            }
        });

        // ── Earn section ──────────────────────────────────────────────
        var showFreelancerBtn = document.getElementById("showFreelancerFormBtn");
        var hireBtn = document.getElementById("hireFreelancerBtn");
        if (hireBtn) hireBtn.addEventListener("click", function() { FreelancerManager.showHire(); });

        var filterBtn = document.getElementById("filterSkillBtn");
        if (filterBtn) filterBtn.addEventListener("click", function() { FreelancerManager.filter(); });

        var resetBtn = document.getElementById("resetFilterBtn");
        if (resetBtn) resetBtn.addEventListener("click", function() { FreelancerManager.resetFilter(); });

        ["skillFilterInput", "freelancerMinRate", "freelancerMaxRate", "freelancerExperienceFilter", "freelancerAvailabilityFilter", "freelancerSort"].forEach(function(id) {
            var input = document.getElementById(id);
            if (!input) return;
            input.addEventListener(id === "skillFilterInput" ? "input" : "change", function() {
                if (id === "skillFilterInput") document.getElementById("talentSearchValidation").textContent = "";
                FreelancerManager.filter();
            });
            if (id === "skillFilterInput") input.addEventListener("keydown", function(event) {
                if (event.key === "Enter") { event.preventDefault(); FreelancerManager.filter(); }
            });
        });

        // ── Course modal ──────────────────────────────────────────────
        var modalClose = document.querySelector(".modal-close");
        if (modalClose) modalClose.addEventListener("click", function() { document.getElementById("courseModal").style.display = "none"; });
        window.addEventListener("click", function(e) { var modal = document.getElementById("courseModal"); if (e.target === modal) modal.style.display = "none"; });
    }
};

// ===== NOTIFICATION MANAGER =====
var NotificationManager = {
    notifications: [],
    init: function() {
        this.notifications = StorageManager.get("skillhub_notifs") || [];
        this.renderBell();
        var btn = document.getElementById("navNotifBtn");
        var dropdown = document.getElementById("notifDropdown");
        if (btn) btn.addEventListener("click", function(e) {
            e.stopPropagation();
            dropdown.classList.toggle("hidden");
            NotificationManager.markAllRead();
        });
        document.addEventListener("click", function(e) {
            if (dropdown && !dropdown.contains(e.target) && e.target !== btn) {
                dropdown.classList.add("hidden");
            }
        });
        var clearBtn = document.getElementById("notifClearBtn");
        if (clearBtn) clearBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            NotificationManager.clearAll();
        });
    },
    add: function(message, type, title) {
        var notif = {
            id: Date.now(),
            message: message,
            type: type || "info",
            title: title || "",
            read: false,
            time: new Date().toISOString()
        };
        this.notifications.unshift(notif);
        if (this.notifications.length > 20) this.notifications = this.notifications.slice(0, 20);
        localStorage.setItem("skillhub_notifs", JSON.stringify(this.notifications));
        this.renderBell();
        this.renderList();
        this.showToast(message, type);
    },
    markAllRead: function() {
        this.notifications.forEach(function(n) { n.read = true; });
        localStorage.setItem("skillhub_notifs", JSON.stringify(this.notifications));
        this.renderBell();
        this.renderList();
    },
    clearAll: function() {
        this.notifications = [];
        localStorage.setItem("skillhub_notifs", JSON.stringify([]));
        this.renderBell();
        this.renderList();
    },
    renderBell: function() {
        var dot = document.getElementById("notifDot");
        if (!dot) return;
        var unread = this.notifications.filter(function(n) { return !n.read; }).length;
        if (unread > 0) {
            dot.classList.remove("hidden");
            dot.textContent = unread > 9 ? "9+" : unread;
        } else {
            dot.classList.add("hidden");
        }
    },
    renderList: function() {
        var list = document.getElementById("notifList");
        if (!list) return;
        if (!this.notifications.length) {
            list.innerHTML = "<div class='notif-empty'><i class='fas fa-bell-slash'></i><p>No notifications yet</p></div>";
            return;
        }
        var icons = { info: "fa-info-circle", success: "fa-check-circle", warning: "fa-exclamation-triangle", error: "fa-times-circle" };
        list.innerHTML = this.notifications.map(function(n) {
            var icon = icons[n.type] || "fa-info-circle";
            var timeAgo = NotificationManager._timeAgo(n.time);
            return "<div class='notif-item" + (n.read ? "" : " unread") + "'>" +
                "<div class='notif-item-icon notif-" + n.type + "'><i class='fas " + icon + "'></i></div>" +
                "<div class='notif-item-body'>" +
                    (n.title ? "<div class='notif-item-title'>" + Utils.escapeHtml(n.title) + "</div>" : "") +
                    "<div class='notif-item-msg'>" + Utils.escapeHtml(n.message) + "</div>" +
                    "<div class='notif-item-time'>" + timeAgo + "</div>" +
                "</div>" +
            "</div>";
        }).join("");
    },
    showToast: function(message, type) {
        var existing = document.getElementById("skToast");
        if (existing) existing.remove();
        var toast = document.createElement("div");
        toast.id = "skToast";
        toast.className = "sk-toast sk-toast-" + (type || "info");
        var icons = { info: "fa-info-circle", success: "fa-check-circle", warning: "fa-exclamation-triangle", error: "fa-times-circle" };
        toast.innerHTML = "<i class='fas " + (icons[type] || "fa-info-circle") + "'></i><span>" + Utils.escapeHtml(message) + "</span>";
        document.body.appendChild(toast);
        setTimeout(function() { toast.classList.add("show"); }, 10);
        setTimeout(function() { toast.classList.remove("show"); setTimeout(function() { if (toast.parentNode) toast.remove(); }, 400); }, 4000);
    },
    _timeAgo: function(iso) {
        var diff = (Date.now() - new Date(iso).getTime()) / 1000;
        if (diff < 60) return "just now";
        if (diff < 3600) return Math.floor(diff / 60) + "m ago";
        if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
        return Math.floor(diff / 86400) + "d ago";
    }
};

// ===== WELCOME MANAGER =====
var WelcomeManager = {
    show: function(name, role) {
        var modal = document.getElementById("welcomeModal");
        if (!modal) return;
        var roleConfig = {
            learner: {
                icon: "fa-graduation-cap",
                title: "Welcome, " + name + "! 🎓",
                subtitle: "Your learning journey starts now.",
                msg: "Explore hundreds of courses taught by expert instructors. Learn at your own pace and earn certificates.",
                actions: [
                    { label: "Explore Courses", icon: "fa-book-open", href: "#courses", cls: "btn-primary" },
                    { label: "View Profile", icon: "fa-user", href: "profile.html", cls: "btn-secondary-outline" }
                ]
            },
            instructor: {
                icon: "fa-chalkboard-teacher",
                title: "Welcome, Instructor " + name + "! 👨‍🏫",
                subtitle: "Your application is under review.",
                msg: "Our admin team will review your instructor application within 24 hours. You'll receive a WhatsApp notification once approved.",
                actions: [
                    { label: "View Dashboard", icon: "fa-th-large", href: "instructor-dashboard.html", cls: "btn-primary" },
                    { label: "Explore Platform", icon: "fa-compass", href: "#how-it-works", cls: "btn-secondary-outline" }
                ]
            },
            freelancer: {
                icon: "fa-laptop-code",
                title: "Welcome, " + name + "! 💼",
                subtitle: "Your freelancer profile is pending review.",
                msg: "Admin will verify your profile within 24 hours. Once approved, clients can find and hire you directly.",
                actions: [
                    { label: "View Dashboard", icon: "fa-th-large", href: "freelancer-dashboard.html", cls: "btn-primary" },
                    { label: "Browse Freelancers", icon: "fa-users", href: "#earn", cls: "btn-secondary-outline" }
                ]
            },
            client: {
                icon: "fa-briefcase",
                title: "Welcome, " + name + "! 💼",
                subtitle: "Your hiring workspace is ready.",
                msg: "Find professionals, compare candidates, and manage your projects all from one client dashboard.",
                actions: [
                    { label: "Open Dashboard", icon: "fa-th-large", href: "client-dashboard.html", cls: "btn-primary" },
                    { label: "Find Talent", icon: "fa-user-tie", href: "client-dashboard.html?view=talent", cls: "btn-secondary-outline" }
                ]
            }
        };
        var cfg = roleConfig[role] || roleConfig.learner;
        var iconEl = document.getElementById("welcomeIcon");
        var titleEl = document.getElementById("welcomeTitle");
        var subtitleEl = document.getElementById("welcomeSubtitle");
        var msgEl = document.getElementById("welcomeMsg");
        var actionsEl = document.getElementById("welcomeActions");
        if (iconEl) iconEl.innerHTML = "<i class='fas " + cfg.icon + "'></i>";
        if (titleEl) titleEl.textContent = cfg.title;
        if (subtitleEl) subtitleEl.textContent = cfg.subtitle;
        if (msgEl) msgEl.textContent = cfg.msg;
        if (actionsEl) {
            actionsEl.innerHTML = cfg.actions.map(function(a) {
                return "<a href='" + a.href + "' class='welcome-action-btn " + a.cls + "' onclick='document.getElementById(\"welcomeModal\").style.display=\"none\"'>" +
                    "<i class='fas " + a.icon + "'></i> " + a.label + "</a>";
            }).join("");
        }
        modal.style.display = "flex";
        this._spawnConfetti();
        var closeBtn = document.getElementById("welcomeCloseBtn");
        if (closeBtn) closeBtn.onclick = function() { modal.style.display = "none"; };
        modal.addEventListener("click", function(e) { if (e.target === modal) modal.style.display = "none"; });
    },
    _spawnConfetti: function() {
        var container = document.getElementById("welcomeConfetti");
        if (!container) return;
        container.innerHTML = "";
        var colors = ["#2563eb", "#fbbf24", "#10b981", "#8b5cf6", "#f59e0b"];
        for (var i = 0; i < 30; i++) {
            var dot = document.createElement("div");
            dot.className = "confetti-dot";
            dot.style.cssText = "left:" + Math.random() * 100 + "%;background:" + colors[Math.floor(Math.random() * colors.length)] + ";animation-delay:" + (Math.random() * 0.8) + "s;animation-duration:" + (1 + Math.random()) + "s;";
            container.appendChild(dot);
        }
    }
};

// ===== MESSAGING MANAGER =====
var MessagingManager = {
    open: function(name, userId) {
        var token = ApiService.getToken();

        // Not logged in — prompt to login first
        if (!token) {
            var target = document.getElementById('login-register');
            if (target) {
                var navH = (document.querySelector('.navbar') || {}).offsetHeight || 0;
                window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: 'smooth' });
            }
            NotificationManager.add('Please log in to send messages.', 'info');
            return;
        }

        // Has account → open internal chat
        if (userId) {
            window.location.href = 'chat.html?userId=' + encodeURIComponent(userId) + '&userName=' + encodeURIComponent(name);
            return;
        }

        // No userId — data issue, inform user
        NotificationManager.add('This freelancer\'s account is not available. Try the Hire button to get in touch.', 'info');
    }
};

// ===== REAL-TIME STATS =====
var StatsManager = {
    load: async function() {
        try {
            var data = await ApiService.getStats();
            if (!data || !data.success || !data.stats) throw new Error("Platform statistics are unavailable.");
            var stats = data.stats;
            this.updateAll(stats.totalUsers, stats.totalCourses, stats.totalFreelancers, stats.totalInstructors);
        } catch (e) {
            document.querySelectorAll(".about-stats .stat-number").forEach(function(counter) { counter.textContent = "—"; });
        }
    },
    updateAll: function(users, courses, freelancers, instructors) {
        var displayCount = function(value) {
            return value !== null && value !== "" && Number.isFinite(Number(value)) ? String(Number(value)) : "—";
        };
        // Hero stats (Active Courses / Happy Learners / Expert Instructors)
        var heroStats = document.querySelectorAll(".hero-stats .stat-number");
        if (heroStats[0]) heroStats[0].textContent = displayCount(courses);
        if (heroStats[1]) heroStats[1].textContent = displayCount(users);
        if (heroStats[2]) heroStats[2].textContent = displayCount(instructors);

        // About section live backend totals
        var aboutCounters = document.querySelectorAll(".about-stats .stat-number");
        if (aboutCounters[0]) aboutCounters[0].textContent = displayCount(courses);
        if (aboutCounters[1]) aboutCounters[1].textContent = displayCount(users);
        if (aboutCounters[2]) aboutCounters[2].textContent = displayCount(instructors);
        if (aboutCounters[3]) aboutCounters[3].textContent = displayCount(freelancers);

    }
};

// ===== DASHBOARD MANAGER =====
var DashboardManager = {
    user: null,
    resolveDashboardUrl: function(user) {
        if (!user || !user.role) return "dashboard.html";
        if (user.role === "instructor") return "instructor-dashboard.html";
        if (user.role === "freelancer") return "freelancer-dashboard.html";
        if (user.role === "client" || user.role === "employer" || user.accountType === "client") return "client-dashboard.html";
        return "dashboard.html";
    },
    redirectToDashboard: function(user) {
        var target = this.resolveDashboardUrl(user);
        if (window.location.pathname.split("/").pop() !== target) {
            window.location.href = target;
        }
    },
    init: function() {
        this.initTabs();
        this.initProfileForm();
        this.initPasswordForm();
        this.initPhoneForm();
        this.initCountryForm();
        this.initProfileEditToggle();
        this.initRefreshPayments();
        var logoutBtn = document.getElementById("dashLogoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function() {
                ApiService.clearToken();
                NavbarUser.update();
                DashboardManager.hide();
                document.getElementById("login-register").scrollIntoView({ behavior: "smooth" });
            });
        }
    },
    show: async function() {
        var currentUser = await ApiService.validateSession().catch(function() { return null; });
        if (currentUser) {
            this.redirectToDashboard(currentUser);
            return;
        }
        var section = document.getElementById("dashboard");
        if (!section) return;
        document.title = "My Dashboard – SkillHub";
        section.classList.remove("hidden");
        section.scrollIntoView({ behavior: "smooth" });
        await this.loadUserData();
    },
    hide: function() {
        var section = document.getElementById("dashboard");
        if (section) section.classList.add("hidden");
    },
    loadUserData: async function() {
        // Show loading state
        var container = document.getElementById("dashCoursesList");
        if (container) UIHelper.showLoading(container, "Loading your data...");
        try {
            var data = await ApiService.getMe();
            if (!data.success) return;
            this.user = data.user;
            this.renderHeader(data.user);
            this.renderProfileOverview(data.user);
            this.prefillProfile(data.user);

            // Load courses based on role
            if (data.user.role === "instructor") {
                this.renderCourses(data.user.courses || []);
            } else {
                // Learner — fetch enrolled courses separately
                try {
                    var enrolled = await ApiService.getEnrolledCourses();
                    this.renderEnrolledCourses(enrolled.courses || []);
                } catch (e) {
                    this.renderEnrolledCourses([]);
                }
            }

            // Load payment history
            this.loadPaymentHistory();
        } catch (e) {
            var session = StorageManager.getUserSession();
            if (session) this.renderHeaderFromSession(session);
            if (container) {
                container.innerHTML = "<div class='dash-empty-state'><i class='fas fa-wifi-slash'></i><p>Could not load data. Make sure the backend is running.</p></div>";
            }
        }
    },
    renderHeader: function(user) {
        var nameEl = document.getElementById("dashName");
        var roleEl = document.getElementById("dashRoleBadge");
        var walletEl = document.getElementById("dashWallet");
        var ratingEl = document.getElementById("dashRating");
        var statusEl = document.getElementById("dashStatus");
        var enrolledEl = document.getElementById("dashEnrolledCount");
        var avatarEl = document.getElementById("dashAvatar");

        if (nameEl) nameEl.textContent = user.name ? user.name.split(" ")[0] : "User";
        if (roleEl) {
            var roleIcons = { user: "fa-user-graduate", instructor: "fa-chalkboard-teacher", freelancer: "fa-laptop-code", admin: "fa-shield-alt" };
            var icon = roleIcons[user.role] || "fa-user";
            roleEl.innerHTML = "<i class='fas " + icon + "'></i> " + (user.role || "Learner").charAt(0).toUpperCase() + (user.role || "learner").slice(1);
            roleEl.className = "dash-role-badge role-" + (user.role || "user");
        }
        // Show "Create Course" button only for instructors and admins
        var createCourseBtn = document.getElementById("dashCreateCourseBtn");
        var navCreateCourseLink = document.getElementById("navCreateCourseLink");
        if (user.role === "instructor" || user.role === "admin") {
            if (createCourseBtn) createCourseBtn.style.display = "inline-flex";
            if (navCreateCourseLink) navCreateCourseLink.style.display = "inline-flex";
        }

        // Customize tab label based on role
        var tabLabel = document.getElementById("tabCoursesLabel");
        if (tabLabel) {
            if (user.role === "instructor") tabLabel.textContent = "My Courses";
            else if (user.role === "freelancer") tabLabel.textContent = "My Services";
            else tabLabel.textContent = "My Courses";
        }

        // Show role-specific stat labels
        var walletEl = document.getElementById("dashWallet");
        if (walletEl) {
            if (user.role === "instructor") {
                walletEl.closest(".dash-stat-card").querySelector(".dash-stat-label").textContent = "Total Earnings";
            } else if (user.role === "freelancer") {
                walletEl.closest(".dash-stat-card").querySelector(".dash-stat-label").textContent = "Wallet Balance";
            }
        }        if (walletEl) {
            // Only instructors and freelancers show wallet — learners do not
            var role = user.role || "user";
            if (role === "instructor" || role === "freelancer") {
                walletEl.textContent = "$" + parseFloat(user.walletBalance || 0).toFixed(2);
            } else {
                // Learners: hide the wallet stat card entirely
                var walletCard = walletEl.closest(".dash-stat-card");
                if (walletCard) walletCard.style.display = "none";
            }
        }
        if (ratingEl) ratingEl.textContent = user.rating ? user.rating.toFixed(1) + " ★" : "—";
        if (statusEl) {
            statusEl.textContent = (user.status || "pending").charAt(0).toUpperCase() + (user.status || "pending").slice(1);
            statusEl.style.color = user.status === "active" ? "#10b981" : user.status === "pending" ? "#f59e0b" : "#ef4444";
        }
        if (enrolledEl) {
            var enrolled = user.courses ? user.courses.length : 0;
            enrolledEl.textContent = enrolled;
        }
        if (avatarEl) {
            this._renderAvatar(avatarEl, user, "1.4rem");
        }
    },
    _renderAvatar: function(el, user, fontSize) {
        if (user.profilePicture) {
            el.innerHTML = "<img src='" + Utils.escapeHtml(user.profilePicture) + "' alt='Avatar' style='width:100%;height:100%;object-fit:cover;border-radius:50%;'>";
        } else {
            var initials = (user.name || "U").split(" ").map(function(n) { return n[0]; }).join("").toUpperCase().slice(0, 2);
            el.innerHTML = "<span>" + initials + "</span>";
            el.style.background = "linear-gradient(135deg, #3b82f6, #8b5cf6)";
            el.style.color = "white";
            el.style.display = "flex";
            el.style.alignItems = "center";
            el.style.justifyContent = "center";
            el.style.fontSize = fontSize || "1.4rem";
            el.style.fontWeight = "700";
        }
    },
    renderProfileOverview: function(user) {
        var lgAvatar = document.getElementById("profileAvatarLg");
        if (lgAvatar) this._renderAvatar(lgAvatar, user, "2.5rem");

        var countryNames = { ET: "🇪🇹 Ethiopia", SS: "🇸🇸 South Sudan", KE: "🇰🇪 Kenya", UG: "🇺🇬 Uganda" };
        var setEl = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val || "—"; };
        setEl("profileFullName", user.name);
        setEl("profileEmail", user.email);
        setEl("profilePhone", user.phone);
        setEl("profileCountry", countryNames[user.country] || user.country || "—");

        // Role chip
        var roleChip = document.getElementById("profileRoleChip");
        if (roleChip) {
            var roleLabel = { user: "Learner", instructor: "Instructor", freelancer: "Freelancer", admin: "Admin" };
            var roleColors = {
                user: "background:#dbeafe;color:#1d4ed8;",
                instructor: "background:#d1fae5;color:#065f46;",
                freelancer: "background:#ede9fe;color:#5b21b6;",
                admin: "background:#fee2e2;color:#991b1b;"
            };
            roleChip.textContent = roleLabel[user.role] || "Learner";
            roleChip.style.cssText = roleColors[user.role] || roleColors.user;
        }

        var bioEl = document.getElementById("profileBioText");
        if (bioEl) bioEl.textContent = user.bio || "No bio added yet.";

        var skillsWrap = document.getElementById("profileSkillsWrap");
        var skillsTags = document.getElementById("profileSkillsTags");
        if (user.skills && user.skills.length > 0) {
            if (skillsWrap) skillsWrap.classList.remove("hidden");
            if (skillsTags) {
                skillsTags.innerHTML = user.skills.map(function(s) {
                    return "<span class='skill-tag'>" + Utils.escapeHtml(s) + "</span>";
                }).join("");
            }
        } else {
            if (skillsWrap) skillsWrap.classList.add("hidden");
        }

        var countrySelect = document.getElementById("dashNewCountry");
        if (countrySelect && user.country) countrySelect.value = user.country;

        var phoneInput = document.getElementById("dashNewPhone");
        if (phoneInput && user.phone) phoneInput.value = user.phone;
    },
    renderHeaderFromSession: function(session) {
        var nameEl = document.getElementById("dashName");
        if (nameEl) nameEl.textContent = session.name ? session.name.split(" ")[0] : "User";
        var roleEl = document.getElementById("dashRoleBadge");
        if (roleEl) roleEl.innerHTML = "<i class='fas fa-user-graduate'></i> " + (session.role || "Learner");
        var statusEl = document.getElementById("dashStatus");
        if (statusEl) statusEl.textContent = "Active";
    },
    renderCourses: function(courses) {
        var container = document.getElementById("dashCoursesList");
        if (!container) return;
        if (!courses || courses.length === 0) {
            container.innerHTML =
                "<div class='dash-empty-state'>" +
                "<i class='fas fa-chalkboard-teacher'></i>" +
                "<p>No courses created yet. <a href='create-course.html' style='color:#2563eb;font-weight:600;'>Create your first course</a>!</p>" +
                "</div>";
            return;
        }
        container.innerHTML = courses.map(function(c) {
            var statusColor = { published: "#10b981", pending: "#f59e0b", rejected: "#ef4444", draft: "#6b7280" };
            var color = statusColor[c.status] || "#6b7280";
            var courseId = Utils.escapeHtml(String(c._id || c.id || ""));
            return "<div class='dash-course-card'>" +
                "<div class='dash-course-thumb'><i class='fas fa-graduation-cap'></i></div>" +
                "<div class='dash-course-info'>" +
                "<h4>" + Utils.escapeHtml(c.title || "Untitled") + "</h4>" +
                "<p>" + Utils.escapeHtml(c.category || "") + " • " + (c.studentCount || 0) + " students</p>" +
                "<span class='dash-course-status' style='color:" + color + ";'>" +
                "<i class='fas fa-circle' style='font-size:0.5rem;'></i> " +
                (c.status || "pending").charAt(0).toUpperCase() + (c.status || "pending").slice(1) +
                "</span>" +
                "</div>" +
                "<div class='dash-course-actions' style='display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;'>" +
                "<div style='font-weight:700;color:#2563eb;font-size:0.95rem;'>$" + parseFloat(c.price || 0).toFixed(2) + "</div>" +
                "<a href='create-course.html?courseId=" + courseId + "' " +
                "style='display:inline-flex;align-items:center;gap:0.3rem;padding:0.35rem 0.75rem;background:#eff6ff;color:#2563eb;border:1.5px solid #2563eb;border-radius:0.375rem;font-size:0.75rem;font-weight:600;text-decoration:none;transition:all 0.2s;' " +
                "onmouseover=\"this.style.background='#2563eb';this.style.color='white'\" " +
                "onmouseout=\"this.style.background='#eff6ff';this.style.color='#2563eb'\">" +
                "<i class='fas fa-edit'></i> Edit Course</a>" +
                "</div>" +
                "</div>";
        }).join("");
    },
    renderEnrolledCourses: function(courses) {
        var container = document.getElementById("dashCoursesList");
        var enrolledEl = document.getElementById("dashEnrolledCount");
        if (enrolledEl) enrolledEl.textContent = courses.length;
        if (!container) return;
        if (!courses || courses.length === 0) {
            container.innerHTML =
                "<div class='dash-empty-state'>" +
                "<i class='fas fa-book-open'></i>" +
                "<p>No courses yet. <a href='#courses'>Browse courses</a> to get started!</p>" +
                "</div>";
            return;
        }
        container.innerHTML = courses.map(function(c) {
            var progress = c.progress || 0;
            var isCompleted = progress >= 100 || c.completed;
            var progressColor = isCompleted ? "#10b981" : "#3b82f6";
            var courseId = Utils.escapeHtml(String(c._id || c.id || ""));
            var actionBtn = isCompleted
                ? "<a href='certificate.html?id=" + courseId + "' class='btn btn-sm btn-green dash-course-action-btn'><i class='fas fa-certificate'></i> Get Certificate</a>"
                : "<a href='course.html?id=" + courseId + "' class='btn btn-sm btn-primary dash-course-action-btn'><i class='fas fa-play-circle'></i> Continue Learning</a>";
            return "<div class='dash-course-card'>" +
                "<div class='dash-course-thumb' style='background:linear-gradient(135deg," + (isCompleted ? "#10b981,#059669" : "#3b82f6,#1d4ed8") + ");'>" +
                "<i class='fas " + (isCompleted ? "fa-check-circle" : "fa-play-circle") + "'></i></div>" +
                "<div class='dash-course-info'>" +
                "<h4>" + Utils.escapeHtml(c.title || "Untitled") + "</h4>" +
                "<p>" + Utils.escapeHtml(c.instructorName || "") + (c.category ? " • " + Utils.escapeHtml(c.category) : "") + "</p>" +
                "<div class='dash-progress-bar' title='" + progress + "% complete'>" +
                "<div class='dash-progress-fill' style='width:" + progress + "%;background:" + progressColor + ";'></div>" +
                "</div>" +
                "<span style='font-size:0.75rem;color:#64748b;'>" + progress + "% complete</span>" +
                "</div>" +
                "<div class='dash-course-actions'>" + actionBtn + "</div>" +
                "</div>";
        }).join("");
    },
    loadPaymentHistory: async function() {
        var container = document.getElementById("paymentHistoryList");
        if (!container) return;
        UIHelper.showLoading(container, "Loading payment history...");
        try {
            var data = await ApiService.getTransactions();
            var refundData = await ApiService.request("/payments/refund-requests", "GET").catch(function() { return { refunds: [] }; });
            this.renderPaymentHistory(data.transactions || [], refundData.refunds || []);
        } catch (e) {
            container.innerHTML = "<div class='dash-empty-state'><i class='fas fa-wifi-slash'></i><p>Could not load payments. Make sure the backend is running.</p></div>";
        }
    },
    renderPaymentHistory: function(transactions, refunds) {
        var container = document.getElementById("paymentHistoryList");
        if (!container) return;
        if (!transactions || transactions.length === 0) {
            container.innerHTML = "<div class='dash-empty-state'><i class='fas fa-receipt'></i><p>No payment history yet.</p></div>";
            return;
        }
        refunds = Array.isArray(refunds) ? refunds : [];
        var refundByTransaction = {};
        refunds.forEach(function(refund) { refundByTransaction[refund.transactionId] = refund; });
        var typeLabels = {
            course_purchase: "Course Purchase",
            withdrawal: "Withdrawal",
            deposit: "Deposit",
            referral_bonus: "Referral Bonus"
        };
        var statusColors = { completed: "#10b981", pending: "#f59e0b", failed: "#ef4444", cancelled: "#6b7280" };
        container.innerHTML =
            "<div class='payment-table-wrap'>" +
            "<table class='payment-table'>" +
            "<thead><tr>" +
            "<th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Refund</th>" +
            "</tr></thead>" +
            "<tbody>" +
            transactions.map(function(t) {
                var date = t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
                var label = typeLabels[t.type] || t.type || "Transaction";
                var courseName = (t.metadata && t.metadata.courseName) ? " — " + Utils.escapeHtml(t.metadata.courseName) : "";
                var amount = "$" + parseFloat(t.amount || 0).toFixed(2);
                var status = t.status || "pending";
                var statusColor = t.isSimulated ? "#2563eb" : (statusColors[status] || "#6b7280");
                var statusIcon = status === "completed" ? "fa-check-circle" : status === "pending" ? "fa-clock" : "fa-times-circle";
                var visibleStatus = t.isSimulated && status === "completed" ? "Successful (Simulated)" : status.charAt(0).toUpperCase() + status.slice(1);
                var simulationNote = t.isSimulated ? "<br><small style='color:#2563eb;'>Test record only; no funds transferred.</small>" : "";
                var refund = refundByTransaction[t.id || t._id];
                var refundAction = refund
                    ? "<span style='color:#64748b;font-size:.78rem;'>" + Utils.escapeHtml(String(refund.status).replace(/_/g, " ")) + "</span>"
                    : status === "completed" && t.type === "course_purchase" && !t.isSimulated
                        ? "<button type='button' class='payment-refund-request-btn' data-transaction-id='" + Utils.escapeHtml(String(t.id || t._id)) + "'>Request refund review</button>"
                        : (t.isSimulated && status === "completed" ? "<span style='color:#2563eb;font-size:.75rem;'>Simulation only</span>" : "—");
                return "<tr>" +
                    "<td class='pay-date'>" + date + "</td>" +
                    "<td class='pay-desc'>" + label + (t.isSimulated ? " (Simulated)" : "") + Utils.escapeHtml(courseName) + simulationNote + "</td>" +
                    "<td class='pay-amount'>" + amount + "</td>" +
                    "<td class='pay-status'><span style='color:" + statusColor + ";'><i class='fas " + statusIcon + "'></i> " +
                    visibleStatus + "</span></td>" +
                    "<td>" + refundAction + "</td>" +
                    "</tr>";
            }).join("") +
            "</tbody></table></div>";
        container.querySelectorAll(".payment-refund-request-btn").forEach(function(button) {
            button.addEventListener("click", function() { DashboardManager.requestCourseRefund(button.dataset.transactionId); });
        });
    },
    requestCourseRefund: async function(transactionId) {
        var reason = window.prompt("Why are you requesting a refund review?");
        if (!reason || !reason.trim()) return;
        var description = window.prompt("Add any details for the review (optional):") || "";
        try {
            await ApiService.request("/payments/refund-requests", "POST", { transactionId: transactionId, reason: reason.trim(), description: description.trim() });
            NotificationManager.add("Your refund request was recorded for review. Approval does not mean funds have been transferred.", "success");
            await this.loadPaymentHistory();
        } catch (error) {
            NotificationManager.add(error.message || "Could not submit refund request.", "error");
        }
    },
    prefillProfile: function(user) {
        var nameInput = document.getElementById("dashProfileName");
        var bioInput = document.getElementById("dashProfileBio");
        var skillsInput = document.getElementById("dashProfileSkills");
        var picInput = document.getElementById("dashProfilePic");
        if (nameInput) nameInput.value = user.name || "";
        if (bioInput) bioInput.value = user.bio || "";
        if (skillsInput) skillsInput.value = user.skills ? user.skills.join(", ") : "";
        if (picInput) picInput.value = user.profilePicture || "";
    },
    initTabs: function() {
        var tabs = document.querySelectorAll(".dash-tab");
        tabs.forEach(function(tab) {
            tab.addEventListener("click", function() {
                tabs.forEach(function(t) { t.classList.remove("active"); });
                tab.classList.add("active");
                var target = tab.getAttribute("data-dash");
                document.querySelectorAll(".dash-tab-content").forEach(function(c) { c.classList.remove("active"); });
                var content = document.getElementById("dashTab-" + target);
                if (content) content.classList.add("active");
                if (target === "payment-history") {
                    DashboardManager.loadPaymentHistory();
                }
            });
        });
    },
    initProfileEditToggle: function() {
        var toggleBtn = document.getElementById("profileEditToggleBtn");
        var cancelBtn = document.getElementById("profileEditCancelBtn");
        var editForm = document.getElementById("profileEditForm");
        if (toggleBtn && editForm) {
            toggleBtn.addEventListener("click", function() {
                editForm.classList.toggle("hidden");
                toggleBtn.innerHTML = editForm.classList.contains("hidden")
                    ? "<i class='fas fa-user-edit'></i> Edit Profile"
                    : "<i class='fas fa-times'></i> Cancel";
            });
        }
        if (cancelBtn && editForm) {
            cancelBtn.addEventListener("click", function() {
                editForm.classList.add("hidden");
                if (toggleBtn) toggleBtn.innerHTML = "<i class='fas fa-user-edit'></i> Edit Profile";
            });
        }
        var avatarEditBtn = document.getElementById("profileAvatarEditBtn");
        if (avatarEditBtn) {
            avatarEditBtn.addEventListener("click", function() {
                if (editForm) editForm.classList.remove("hidden");
                if (toggleBtn) toggleBtn.innerHTML = "<i class='fas fa-times'></i> Cancel";
                var picInput = document.getElementById("dashProfilePic");
                if (picInput) picInput.focus();
            });
        }
    },
    initRefreshPayments: function() {
        var btn = document.getElementById("refreshPaymentsBtn");
        if (btn) {
            btn.addEventListener("click", function() { DashboardManager.loadPaymentHistory(); });
        }
    },
    initProfileForm: function() {
        var form = document.getElementById("dashProfileForm");
        var msgEl = document.getElementById("dashProfileMsg");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var name = document.getElementById("dashProfileName").value.trim();
            var bio = document.getElementById("dashProfileBio").value.trim();
            var skillsRaw = document.getElementById("dashProfileSkills").value.trim();
            var skills = skillsRaw ? skillsRaw.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [];
            var profilePicture = document.getElementById("dashProfilePic") ? document.getElementById("dashProfilePic").value.trim() : "";
            UIHelper.showMessage(msgEl, "Saving...", "success");
            try {
                var updated = await ApiService.updateProfile({ name: name, bio: bio, skills: skills, profilePicture: profilePicture });
                var session = StorageManager.getUserSession();
                if (session) { session.name = name; StorageManager.saveUserSession(session); }
                NavbarUser.update();
                if (updated && updated.user) {
                    DashboardManager.user = Object.assign(DashboardManager.user || {}, updated.user);
                    DashboardManager.renderProfileOverview(DashboardManager.user);
                    DashboardManager.renderHeader(DashboardManager.user);
                }
                UIHelper.showMessage(msgEl, "Profile updated successfully!", "success");
                var editForm = document.getElementById("profileEditForm");
                var toggleBtn = document.getElementById("profileEditToggleBtn");
                if (editForm) editForm.classList.add("hidden");
                if (toggleBtn) toggleBtn.innerHTML = "<i class='fas fa-user-edit'></i> Edit Profile";
            } catch (err) {
                UIHelper.showMessage(msgEl, err.message, "error");
            }
        });
    },
    initPasswordForm: function() {
        var form = document.getElementById("dashPasswordForm");
        var msgEl = document.getElementById("dashPasswordMsg");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var current = document.getElementById("dashCurrentPwd").value;
            var newPwd = document.getElementById("dashNewPwd").value;
            var confirm = document.getElementById("dashConfirmPwd").value;
            if (newPwd !== confirm) { UIHelper.showMessage(msgEl, "Passwords do not match", "error"); return; }
            if (newPwd.length < 6) { UIHelper.showMessage(msgEl, "Password must be at least 6 characters", "error"); return; }
            UIHelper.showMessage(msgEl, "Updating...", "success");
            try {
                await ApiService.changePassword(current, newPwd);
                UIHelper.showMessage(msgEl, "Password updated successfully!", "success");
                form.reset();
            } catch (err) {
                UIHelper.showMessage(msgEl, err.message, "error");
            }
        });
    },
    initPhoneForm: function() {
        var form = document.getElementById("dashPhoneForm");
        var msgEl = document.getElementById("dashPhoneMsg");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var newPhone = document.getElementById("dashNewPhone").value.trim();
            if (!newPhone) { UIHelper.showMessage(msgEl, "Please enter a phone number", "error"); return; }
            UIHelper.showMessage(msgEl, "Updating phone...", "success");
            try {
                var updated = await ApiService.updateProfile({ phone: newPhone });
                if (updated && updated.user) {
                    DashboardManager.user = Object.assign(DashboardManager.user || {}, updated.user);
                    DashboardManager.renderProfileOverview(DashboardManager.user);
                }
                document.getElementById("dashPhoneConfirmPwd").value = "";
                UIHelper.showMessage(msgEl, "Phone number updated!", "success");
            } catch (err) {
                UIHelper.showMessage(msgEl, err.message, "error");
            }
        });
    },
    initCountryForm: function() {
        var form = document.getElementById("dashCountryForm");
        var msgEl = document.getElementById("dashCountryMsg");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var country = document.getElementById("dashNewCountry").value;
            if (!country) { UIHelper.showMessage(msgEl, "Please select a country", "error"); return; }
            UIHelper.showMessage(msgEl, "Saving...", "success");
            try {
                var updated = await ApiService.updateProfile({ country: country });
                if (updated && updated.user) {
                    DashboardManager.user = Object.assign(DashboardManager.user || {}, updated.user);
                    DashboardManager.renderProfileOverview(DashboardManager.user);
                }
                var session = StorageManager.getUserSession();
                if (session) { session.country = country; StorageManager.saveUserSession(session); }
                UIHelper.showMessage(msgEl, "Country updated!", "success");
            } catch (err) {
                UIHelper.showMessage(msgEl, err.message, "error");
            }
        });
    }
};

// ===== FORGOT PASSWORD MANAGER =====
var ForgotPasswordManager = {
    phone: "",
    init: function() {
        var modal = document.getElementById("forgotPasswordModal");
        var closeBtn = document.getElementById("closeForgotModal");
        var triggerLink = document.getElementById("forgotPasswordLink");
        var backBtn = document.getElementById("forgotBackBtn");
        var doneBtn = document.getElementById("forgotDoneBtn");

        if (triggerLink) {
            triggerLink.addEventListener("click", function(e) {
                e.preventDefault();
                ForgotPasswordManager.open();
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener("click", function() { ForgotPasswordManager.close(); });
        }
        if (modal) {
            modal.addEventListener("click", function(e) { if (e.target === modal) ForgotPasswordManager.close(); });
        }
        if (backBtn) {
            backBtn.addEventListener("click", function() { ForgotPasswordManager.showStep(1); });
        }
        if (doneBtn) {
            doneBtn.addEventListener("click", function() {
                ForgotPasswordManager.close();
                document.getElementById("login-register").scrollIntoView({ behavior: "smooth" });
            });
        }

        // Step 1 form
        var step1Form = document.getElementById("forgotPhoneForm");
        if (step1Form) {
            step1Form.addEventListener("submit", async function(e) {
                e.preventDefault();
                var phone = document.getElementById("forgotPhone").value.trim();
                var msgEl = document.getElementById("forgotStep1Msg");
                var btn = step1Form.querySelector("button[type=submit]");
                btn.disabled = true;
                btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Sending...";
                try {
                    await ApiService.forgotPassword(phone);
                    ForgotPasswordManager.phone = phone;
                    ForgotPasswordManager.showStep(2);
                } catch (err) {
                    UIHelper.showMessage(msgEl, err.message, "error");
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = "<i class='fas fa-paper-plane'></i> Send Reset Code";
                }
            });
        }

        // Step 2 form
        var step2Form = document.getElementById("forgotResetForm");
        if (step2Form) {
            step2Form.addEventListener("submit", async function(e) {
                e.preventDefault();
                var code = document.getElementById("forgotCode").value.trim();
                var newPwd = document.getElementById("forgotNewPwd").value;
                var confirmPwd = document.getElementById("forgotConfirmPwd").value;
                var msgEl = document.getElementById("forgotStep2Msg");
                if (newPwd !== confirmPwd) { UIHelper.showMessage(msgEl, "Passwords do not match", "error"); return; }
                if (newPwd.length < 6) { UIHelper.showMessage(msgEl, "Password must be at least 6 characters", "error"); return; }
                var btn = step2Form.querySelector("button[type=submit]");
                btn.disabled = true;
                btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Resetting...";
                try {
                    await ApiService.resetPassword(ForgotPasswordManager.phone, code, newPwd);
                    ForgotPasswordManager.showStep(3);
                } catch (err) {
                    UIHelper.showMessage(msgEl, err.message, "error");
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = "<i class='fas fa-shield-alt'></i> Reset Password";
                }
            });
        }
    },
    open: function() {
        this.showStep(1);
        document.getElementById("forgotPasswordModal").style.display = "flex";
        document.getElementById("forgotPhone").value = "";
        document.getElementById("forgotStep1Msg").textContent = "";
    },
    close: function() {
        document.getElementById("forgotPasswordModal").style.display = "none";
    },
    showStep: function(step) {
        ["forgotStep1", "forgotStep2", "forgotStep3"].forEach(function(id, i) {
            var el = document.getElementById(id);
            if (el) el.classList.toggle("hidden", i + 1 !== step);
        });
    }
};

// ===== NAVBAR USER STATE =====
var NavbarUser = {
    setPrivateLinks: function(user) {
        document.querySelectorAll(".nav-private").forEach(function(link) {
            link.classList.toggle("hidden", !user);
        });
        document.querySelectorAll(".nav-role-instructor").forEach(function(link) {
            var allowed = user && (user.role === "instructor" || user.role === "admin");
            link.classList.toggle("hidden", !allowed);
        });
        document.querySelectorAll(".nav-role-freelancer").forEach(function(link) {
            var allowed = user && (user.role === "freelancer" || user.role === "admin");
            link.classList.toggle("hidden", !allowed);
        });
        document.querySelectorAll(".nav-role-client").forEach(function(link) {
            var allowed = user && (user.role === "client" || user.accountType === "client" || user.role === "employer");
            link.classList.toggle("hidden", !allowed);
        });
    },
    update: async function() {
        var token = ApiService.getToken();
        var storedSession = StorageManager.getUserSession() || {};
        var badge = document.getElementById("navUserBadge");
        var authLink = document.getElementById("navAuthLink");
        var signupLink = document.getElementById("navGetStarted");
        var mobileLogin = document.getElementById("navDrawerLogin");
        var mobileSignup = document.getElementById("navDrawerGetStarted");
        var nameEl = document.getElementById("navUserName");

        var sessionUser = null;
        if (storedSession.loggedIn) {
            sessionUser = {
                name: storedSession.name || "User",
                role: storedSession.role || "user",
                email: storedSession.email || ""
            };
        } else if (token) {
            sessionUser = await ApiService.validateSession();
        }

        if (sessionUser && badge && authLink) {
            this.setPrivateLinks(sessionUser);
            badge.classList.remove("hidden");
            authLink.classList.add("hidden");
            if (signupLink) signupLink.classList.add("hidden");
            if (mobileLogin) mobileLogin.classList.add("hidden");
            if (mobileSignup) mobileSignup.classList.add("hidden");
            if (nameEl) nameEl.textContent = sessionUser.name ? sessionUser.name.split(" ")[0] : "User";
            return;
        }

        this.setPrivateLinks(null);
        if (badge && authLink) {
            badge.classList.add("hidden");
            authLink.classList.remove("hidden");
        }
        if (signupLink) signupLink.classList.remove("hidden");
        if (mobileLogin) mobileLogin.classList.remove("hidden");
        if (mobileSignup) mobileSignup.classList.remove("hidden");
        DashboardManager.hide();
    },
    init: function() {
        this.update();
        var logoutBtn = document.getElementById("navLogoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function() {
                ApiService.clearToken();
                NavbarUser.update();
                UIHelper.showMessage(document.getElementById("authMessage"), "Logged out successfully.", "success");
                window.location.href = "#login-register";
            });
        }
        var dashLink = document.getElementById("navDashLink");
        if (dashLink) {
            dashLink.addEventListener("click", function(e) {
                e.preventDefault();
                var user = ApiService.getUserSession ? ApiService.getUserSession() : null;
                if (!user) {
                    user = StorageManager.getUserSession && StorageManager.getUserSession() ? StorageManager.getUserSession() : null;
                }
                DashboardManager.redirectToDashboard(user || { role: "user" });
            });
        }
    }
};

var DashboardPage = {
    init: function() {
        if (!document.body.classList.contains("dashboard-page")) return;
        this.bindEvents();
        this.load();
    },
    bindEvents: function() {
        var save = document.getElementById("dashboardSaveProfileBtn");
        if (save) {
            save.addEventListener("click", async function() {
                var name = document.getElementById("dashProfileName").value.trim();
                var bio = document.getElementById("dashProfileBio").value.trim();
                var skills = document.getElementById("dashProfileSkills").value.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
                var profilePicture = document.getElementById("dashProfilePic").value.trim();
                var msg = document.getElementById("dashProfileMsg");
                try {
                    await ApiService.updateProfile({ name: name, bio: bio, skills: skills, profilePicture: profilePicture });
                    if (msg) {
                        msg.textContent = "Profile updated successfully.";
                        msg.className = "form-message success";
                    }
                    DashboardPage.load();
                } catch (error) {
                    if (msg) {
                        msg.textContent = error.message || "Could not update profile.";
                        msg.className = "form-message error";
                    }
                }
            });
        }

        var logout = document.getElementById("dashLogoutBtn");
        if (logout) {
            logout.addEventListener("click", function() {
                ApiService.clearToken();
                window.location.href = "index.html#login-register";
            });
        }
    },
    load: async function() {
        try {
            var user = await ApiService.validateSession();
            if (!user) {
                window.location.href = "index.html#login-register";
                return;
            }
            if (user.role === "instructor") {
                window.location.replace("instructor-dashboard.html");
                return;
            }
            if (user.role === "freelancer") {
                window.location.replace("freelancer-dashboard.html");
                return;
            }

            var name = user.name || "Learner";
            document.getElementById("dashName").textContent = name.split(" ")[0];
            document.getElementById("dashNameMain").textContent = name.split(" ")[0];
            document.getElementById("dashRoleBadge").innerHTML = "<i class='fas fa-user-graduate'></i> Learner";

            var enrolledResult = await ApiService.getEnrolledCourses().catch(function() { return { courses: [] }; });
            var courses = enrolledResult.courses || [];
            var completed = courses.filter(function(course) { return Number(course.progress || 0) >= 100 || course.completed; }).length;
            var hours = Math.round(courses.reduce(function(total, course) { return total + Number(course.progress || 0) * 0.8; }, 0));
            var skillList = ["Web Development", "UX Research", "Marketing", "Productivity", "Leadership"]; 
            if (user.skills && user.skills.length) skillList = user.skills.slice(0, 5);

            document.getElementById("dashEnrolledCount").textContent = String(courses.length || 0);
            document.getElementById("dashCompletedCount").textContent = String(completed || 0);
            document.getElementById("dashHoursCount").textContent = (hours || 0) + "h";
            document.getElementById("dashCertificatesCount").textContent = String(Math.min(3, completed || 0));

            var skillContainer = document.getElementById("dashboardSkillsList");
            if (skillContainer) {
                skillContainer.innerHTML = skillList.map(function(skill) {
                    return "<span class='dashboard-skill-pill'><i class='fas fa-check'></i> " + Utils.escapeHtml(skill) + "</span>";
                }).join("");
            }

            var progressSummary = document.getElementById("progressSummaryText");
            if (progressSummary) {
                progressSummary.textContent = completed + " of " + (courses.length || 0) + " courses completed. You are making steady progress.";
            }

            var list = document.getElementById("dashCoursesList");
            if (list) {
                if (!courses.length) {
                    list.innerHTML = "<div class='dashboard-empty-state'><i class='fas fa-book-open'></i><p>You have not enrolled in any courses yet.</p></div>";
                    return;
                }
                list.innerHTML = courses.slice(0, 4).map(function(course) {
                    var progress = Number(course.progress || 0);
                    var isDone = progress >= 100 || course.completed;
                    var action = isDone ? "View certificate" : "Continue";
                    var buttonClass = isDone ? "secondary" : "primary";
                    return "<article class='dashboard-course-card'>" +
                        "<div class='dashboard-course-card-top'>" +
                        "<div class='dashboard-course-thumb'><i class='fas " + (isDone ? "fa-check-circle" : "fa-play-circle") + "'></i></div>" +
                        "<div class='dashboard-course-info'>" +
                        "<h3>" + Utils.escapeHtml(course.title || "Course") + "</h3>" +
                        "<p>" + Utils.escapeHtml(course.instructorName || "SkillHub Instructor") + "</p>" +
                        "</div>" +
                        "</div>" +
                        "<div class='dashboard-progress-wrap'>" +
                        "<div class='dashboard-progress-bar'><div class='dashboard-progress-fill' style='width:" + Math.min(progress, 100) + "%'></div></div>" +
                        "<div class='dashboard-course-meta'><span>" + Math.min(progress, 100) + "% complete</span><span>" + (course.lessonsCompleted || 0) + " lessons</span></div>" +
                        "</div>" +
                        "<div class='dashboard-course-actions'>" +
                        "<button type='button' class='" + buttonClass + "'>" + action + "</button>" +
                        "<a href='course.html?id=" + encodeURIComponent(course.id || course._id || "") + "' class='secondary'>Details</a>" +
                        "</div>" +
                        "</article>";
                }).join("");
            }

            var nameField = document.getElementById("dashProfileName");
            if (nameField) nameField.value = name;
            var bioField = document.getElementById("dashProfileBio");
            if (bioField) bioField.value = user.bio || "";
            var skillsField = document.getElementById("dashProfileSkills");
            if (skillsField) skillsField.value = (user.skills || []).join(", ");
            var photoField = document.getElementById("dashProfilePic");
            if (photoField) photoField.value = user.profilePicture || "";

            var avatar = document.getElementById("dashAvatar");
            if (avatar) {
                if (user.profilePicture) {
                    avatar.innerHTML = "<img src='" + Utils.escapeHtml(user.profilePicture) + "' alt='Profile avatar' style='width:100%;height:100%;object-fit:cover;border-radius:50%;'>";
                } else {
                    avatar.innerHTML = "<span>" + (name || "U").split(" ").map(function(part) { return part[0]; }).join("").toUpperCase().slice(0,2) + "</span>";
                }
            }
        } catch (error) {
            var list = document.getElementById("dashCoursesList");
            if (list) {
                list.innerHTML = "<div class='dashboard-empty-state'><i class='fas fa-wifi-slash'></i><p>Could not load your learning dashboard right now.</p></div>";
            }
        }
    }
};

var AuthNavigation = {
    open: function(tabName, requestedRole) {
        if (tabName === "register" && ApiService.getToken()) {
            window.location.href = "dashboard.html";
            return;
        }
        var target = document.getElementById("login-register");
        var tab = document.querySelector(".auth-tab[data-tab='" + tabName + "']");
        var register = document.getElementById("registerForm");
        var roleStep = document.getElementById("signupRoleStep");
        var details = document.getElementById("signupDetails");
        if (tabName === "register" && register) {
            register.dataset.signupEntry = requestedRole ? "direct" : "chooser";
        }
        if (tab) tab.click();
        if (tabName === "register") {
            if (requestedRole && window.SignupRoleSelection) {
                window.SignupRoleSelection.select(requestedRole, true);
            } else {
                if (roleStep) roleStep.hidden = false;
                if (details) details.classList.add("hidden");
            }
        }
        if (target) {
            var navHeight = (document.querySelector(".navbar") || {}).offsetHeight || 0;
            window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navHeight, behavior: "smooth" });
        }
        var navLinks = document.getElementById("navLinks");
        var hamburger = document.getElementById("hamburger");
        var scrim = document.getElementById("navScrim");
        if (navLinks && navLinks.classList.contains("active")) {
            navLinks.classList.remove("active");
            if (hamburger) { hamburger.classList.remove("active"); hamburger.setAttribute("aria-expanded", "false"); }
            if (scrim) scrim.hidden = true;
            document.body.style.overflow = "";
        }
    },
    openRole: function(role) {
        this.open("register", role);
    }
};

// ===== HOMEPAGE HERO CAROUSEL =====
var HeroCarousel = {
    init: function() {
        var root = document.getElementById("homeCarousel");
        if (!root) return;

        var slides = Array.from(root.querySelectorAll(".hero-slide"));
        var previews = Array.from(root.querySelectorAll(".hero-preview"));
        var currentLabel = document.getElementById("heroCurrentSlide");
        var previous = document.getElementById("heroPrevious");
        var next = document.getElementById("heroNext");
        var pause = document.getElementById("heroPause");
        var activeIndex = 0;
        var timer = null;
        var paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var pointerStartX = 0;
        var pointerStartY = 0;

        function setSlide(index) {
            activeIndex = (index + slides.length) % slides.length;
            slides.forEach(function(slide, slideIndex) {
                var active = slideIndex === activeIndex;
                slide.classList.toggle("is-active", active);
                slide.setAttribute("aria-hidden", active ? "false" : "true");
                slide.inert = !active;
                if (active && slide.dataset.image) {
                    slide.style.setProperty("--slide-image", "url(\"" + slide.dataset.image.replace(/&amp;/g, "&") + "\")");
                } else {
                    slide.style.removeProperty("--slide-image");
                }
            });
            previews.forEach(function(preview, previewIndex) {
                var active = previewIndex === activeIndex;
                preview.classList.toggle("is-active", active);
                preview.setAttribute("aria-selected", active ? "true" : "false");
                preview.tabIndex = active ? 0 : -1;
            });
            root.dataset.accent = slides[activeIndex].dataset.accent || "learn";
            if (currentLabel) currentLabel.textContent = String(activeIndex + 1).padStart(2, "0");
        }

        function stopTimer() {
            window.clearInterval(timer);
            timer = null;
        }

        function startTimer() {
            stopTimer();
            if (!paused && !document.hidden) timer = window.setInterval(function() { setSlide(activeIndex + 1); }, 6500);
        }

        function setPaused(value) {
            paused = value;
            if (pause) {
                pause.setAttribute("aria-pressed", paused ? "true" : "false");
                pause.setAttribute("aria-label", paused ? "Resume automatic slides" : "Pause automatic slides");
                pause.innerHTML = paused ? '<i class="fas fa-play" aria-hidden="true"></i>' : '<i class="fas fa-pause" aria-hidden="true"></i>';
            }
            if (paused) stopTimer();
            else startTimer();
        }

        slides.forEach(function(slide) {
            slide.querySelectorAll("[data-hero-action]").forEach(function(link) {
                link.addEventListener("click", function(event) {
                    event.preventDefault();
                    var action = link.getAttribute("data-hero-action");
                    if (action === "show-courses") {
                        window.location.href = "courses.html";
                        return;
                    }
                    var targetId = action === "show-instructor" ? "courses" : "earn";
                    var target = document.getElementById(targetId);
                    if (target) {
                        var navHeight = (document.querySelector(".navbar") || {}).offsetHeight || 0;
                        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navHeight, behavior: "smooth" });
                    }
                    window.setTimeout(function() {
                        var buttonId = action === "show-instructor" ? "showInstructorFormBtn" : action === "show-freelancer-form" ? "showFreelancerFormBtn" : "hireFreelancerBtn";
                        var actionButton = document.getElementById(buttonId);
                        if (actionButton) actionButton.click();
                    }, 320);
                });
            });
        });

        previews.forEach(function(preview) {
            preview.addEventListener("click", function() { setSlide(Number(preview.dataset.goTo)); });
        });
        if (previous) previous.addEventListener("click", function() { setSlide(activeIndex - 1); });
        if (next) next.addEventListener("click", function() { setSlide(activeIndex + 1); });
        if (pause) pause.addEventListener("click", function() { setPaused(!paused); });

        ProjectInquiry.init(root);
        BusinessInquiry.init(root);

        root.addEventListener("keydown", function(event) {
            if (event.key === "ArrowLeft") { event.preventDefault(); setSlide(activeIndex - 1); }
            if (event.key === "ArrowRight") { event.preventDefault(); setSlide(activeIndex + 1); }
        });
        root.addEventListener("pointerdown", function(event) {
            pointerStartX = event.clientX;
            pointerStartY = event.clientY;
        }, { passive: true });
        root.addEventListener("pointerup", function(event) {
            var horizontalSwipe = event.clientX - pointerStartX;
            var verticalSwipe = event.clientY - pointerStartY;
            if (Math.abs(horizontalSwipe) > 55 && Math.abs(horizontalSwipe) > Math.abs(verticalSwipe) * 1.25) {
                setSlide(activeIndex + (horizontalSwipe < 0 ? 1 : -1));
            }
        }, { passive: true });
        root.addEventListener("mouseenter", stopTimer);
        root.addEventListener("mouseleave", startTimer);
        root.addEventListener("focusin", stopTimer);
        root.addEventListener("focusout", function(event) {
            if (!root.contains(event.relatedTarget)) startTimer();
        });
        document.addEventListener("visibilitychange", function() {
            if (document.hidden) stopTimer();
            else startTimer();
        });
        var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (motionQuery.addEventListener) motionQuery.addEventListener("change", function(event) { setPaused(event.matches); });

        setSlide(0);
        startTimer();
    }
};

var ProjectInquiry = {
    init: function(root) {
        var modal = document.getElementById("projectInquiry");
        var form = document.getElementById("projectInquiryForm");
        var closeButton = modal && modal.querySelector(".project-inquiry-close");
        var message = document.getElementById("projectInquiryMessage");
        if (!modal || !form) return;

        var opener = null;

        function close() {
            modal.hidden = true;
            document.body.classList.remove("project-inquiry-open");
            if (opener) opener.focus();
        }

        root.querySelectorAll("[data-open-project-inquiry]").forEach(function(link) {
            link.addEventListener("click", function(event) {
                event.preventDefault();
                opener = link;
                modal.hidden = false;
                document.body.classList.add("project-inquiry-open");
                if (message) {
                    message.textContent = "";
                    message.className = "project-inquiry-message";
                }
                window.requestAnimationFrame(function() {
                    var firstField = form.querySelector("input");
                    if (firstField) firstField.focus();
                });
            });
        });

        if (closeButton) closeButton.addEventListener("click", close);
        modal.addEventListener("click", function(event) {
            if (event.target === modal) close();
        });
        document.addEventListener("keydown", function(event) {
            if (!modal.hidden && event.key === "Escape") close();
        });

        form.addEventListener("submit", async function(event) {
            event.preventDefault();
            if (!form.reportValidity()) return;

            var data = new FormData(form);
            var submit = form.querySelector("[type=submit]");
            var payload = {
                name: String(data.get("name") || "").trim(),
                email: String(data.get("email") || "").trim(),
                phone: String(data.get("phone") || "").trim(),
                subject: "project",
                message: [
                    "Project inquiry",
                    "Skills/services needed: " + String(data.get("skills") || "").trim(),
                    "Budget: " + (String(data.get("budget") || "").trim() || "Not specified"),
                    "Timeline: " + (String(data.get("timeline") || "").trim() || "Not specified"),
                    "Project description: " + String(data.get("description") || "").trim()
                ].join("\n")
            };

            submit.disabled = true;
            if (message) {
                message.textContent = "Sending your project inquiry...";
                message.className = "project-inquiry-message";
            }
            try {
                var response = await fetch(CONFIG.API_BASE + "/contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                var result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || "Could not send your inquiry.");
                StorageManager.saveContactSubmission(payload);
                if (message) {
                    message.textContent = "Your project inquiry has been sent. The SkillHub team will follow up soon.";
                    message.className = "project-inquiry-message is-success";
                }
                form.reset();
            } catch (error) {
                if (message) {
                    message.textContent = error.message || "We could not send your inquiry. Please try again or contact the team directly.";
                    message.className = "project-inquiry-message is-error";
                }
            } finally {
                submit.disabled = false;
            }
        });
    }
};

var BusinessInquiry = {
    init: function(root) {
        var modal = document.getElementById("businessInquiry");
        var form = document.getElementById("businessInquiryForm");
        var closeButton = modal && modal.querySelector(".project-inquiry-close");
        var message = document.getElementById("businessInquiryMessage");
        if (!modal || !form) return;

        var opener = null;
        var serviceField = form.elements.service;

        function close() {
            modal.hidden = true;
            document.body.classList.remove("project-inquiry-open");
            if (opener) opener.focus();
        }

        root.querySelectorAll("[data-open-business-inquiry]").forEach(function(link) {
            link.addEventListener("click", function(event) {
                event.preventDefault();
                opener = link;
                modal.hidden = false;
                document.body.classList.add("project-inquiry-open");
                serviceField.value = link.getAttribute("data-business-service") || (link.getAttribute("data-business-intent") === "partnership" ? "Strategic partnership" : "");
                if (message) {
                    message.textContent = "";
                    message.className = "project-inquiry-message";
                }
                window.requestAnimationFrame(function() {
                    var firstField = form.querySelector("input");
                    if (firstField) firstField.focus();
                });
            });
        });

        if (closeButton) closeButton.addEventListener("click", close);
        modal.addEventListener("click", function(event) {
            if (event.target === modal) close();
        });
        document.addEventListener("keydown", function(event) {
            if (!modal.hidden && event.key === "Escape") close();
        });

        form.addEventListener("submit", async function(event) {
            event.preventDefault();
            if (!form.reportValidity()) return;

            var data = new FormData(form);
            var submit = form.querySelector("[type=submit]");
            var payload = {
                name: String(data.get("name") || "").trim(),
                email: String(data.get("email") || "").trim(),
                phone: String(data.get("phone") || "").trim(),
                subject: "business",
                message: [
                    "Business inquiry",
                    "Organization: " + String(data.get("organization") || "").trim(),
                    "Solution: " + String(data.get("service") || "").trim(),
                    "Team size: " + (String(data.get("teamSize") || "").trim() || "Not specified"),
                    "Timeline: " + (String(data.get("timeline") || "").trim() || "Not specified"),
                    "Details: " + String(data.get("description") || "").trim()
                ].join("\n")
            };

            submit.disabled = true;
            if (message) {
                message.textContent = "Sending your business inquiry...";
                message.className = "project-inquiry-message";
            }
            try {
                var response = await fetch(CONFIG.API_BASE + "/contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                var result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || "Could not send your inquiry.");
                StorageManager.saveContactSubmission(payload);
                if (message) {
                    message.textContent = "Your business inquiry has been sent. The SkillHub team will follow up soon.";
                    message.className = "project-inquiry-message is-success";
                }
                form.reset();
            } catch (error) {
                if (message) {
                    message.textContent = error.message || "We could not send your inquiry. Please try again or contact the team directly.";
                    message.className = "project-inquiry-message is-error";
                }
            } finally {
                submit.disabled = false;
            }
        });
    }
};

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", function() {
    HeroCarousel.init();
    CourseManager.init();
    FreelancerManager.init();
    FormHandlers.initInstructorForm();
    FormHandlers.initFreelancerForm();
    FormHandlers.initContactForm();
    FormHandlers.initNewsletterForm();
    FormHandlers.initLoginForm();
    FormHandlers.initRegisterForm();
    NavigationManager.init();
    AuthUI.init();
    ButtonHandlers.init();
    AnimationManager.init();
    NavbarUser.init();
    DashboardManager.init();
    ForgotPasswordManager.init();
    NotificationManager.init();
    StatsManager.load();

    var firstLoginRole = document.querySelector("#loginForm .role-btn");
    if (firstLoginRole) firstLoginRole.classList.add("active");
    var firstRegRole = document.querySelector("#registerForm .role-btn");
    if (firstRegRole) firstRegRole.classList.add("active");

    if (ApiService.getToken()) {
        ApiService.validateSession().then(function(user) {
            if (!user) {
                ApiService.clearToken();
                return;
            }
            if (window.location.pathname.split("/").pop() === "dashboard.html") {
                setTimeout(function() { DashboardPage.init(); }, 200);
            }
        });
    }

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("session") === "expired") {
        var msgEl = document.getElementById("authMessage");
        if (msgEl) {
            msgEl.textContent = "Your session has expired. Please log in again.";
            msgEl.className = "error";
            msgEl.style.display = "block";
        }
        setTimeout(function() {
            var loginSection = document.getElementById("login-register");
            if (loginSection) loginSection.scrollIntoView({ behavior: "smooth" });
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 300);
    }

    var _wakeupTimer = setTimeout(function() {
        var existing = document.getElementById("backendWakeupNotice");
        if (!existing) {
            var notice = document.createElement("div");
            notice.id = "backendWakeupNotice";
            notice.style.cssText = "position:fixed;bottom:1.25rem;left:50%;transform:translateX(-50%);background:#1e3a8a;color:white;padding:0.65rem 1.25rem;border-radius:2rem;font-size:0.82rem;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:0.5rem;";
            notice.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Server is starting up, please wait a moment…";
            document.body.appendChild(notice);
        }
    }, 4000);

    fetch((window.SKILLHUB_API_ORIGIN || "https://skillhub-backend-i3dr.onrender.com") + "/")
        .then(function(r) { return r.json(); })
        .then(function() {
            clearTimeout(_wakeupTimer);
            var notice = document.getElementById("backendWakeupNotice");
            if (notice) notice.remove();
        })
        .catch(function() {
            clearTimeout(_wakeupTimer);
            setTimeout(function() {
                var notice = document.getElementById("backendWakeupNotice");
                if (notice) notice.remove();
            }, 15000);
        });

    var copyright = document.querySelector(".copyright");
    if (copyright) {
        var currentYear = new Date().getFullYear();
        copyright.innerHTML = copyright.innerHTML.replace(/\d{4}(?=\s*<span class="copyright-highlight">)/, currentYear);
    }
});

window.addEventListener("beforeunload", function() { AnimationManager.cleanup(); });
