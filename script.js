// SkillHub Frontend - Version 3.0 - Connected to Backend API
// Last updated: deployed to Netlify

// ===== CURRENCY UTILITY =====
var CurrencyUtil = {
    // All prices in DB are in USD
    // Rates: 1 USD = X local currency
    rates: {
        UG: { code: "UGX", symbol: "UGX", rate: 3500, name: "Uganda" },
        ET: { code: "ETB", symbol: "ETB", rate: 175,  name: "Ethiopia" },
        SS: { code: "SSP", symbol: "SSP", rate: 5400, name: "South Sudan" },
        KE: { code: "KES", symbol: "KES", rate: 120,  name: "Kenya" }
    },
    getUserCountry: function() {
        var session = JSON.parse(localStorage.getItem("skillhub_user") || "{}");
        return session.country || null;
    },
    // Display price in USD on cards
    displayUSD: function(usdPrice) {
        return "$" + parseFloat(usdPrice).toFixed(2);
    },
    // Convert USD to local currency for payment
    toLocal: function(usdPrice, countryCode) {
        var r = this.rates[countryCode];
        if (!r) return { amount: usdPrice, display: "$" + parseFloat(usdPrice).toFixed(2), code: "USD" };
        var localAmt = Math.round(usdPrice * r.rate);
        return { amount: localAmt, display: localAmt.toLocaleString() + " " + r.code, code: r.code };
    },
    // Get payment URL with country-converted price
    paymentUrl: function(name, usdPrice, type, id) {
        var country = this.getUserCountry();
        var local = this.toLocal(usdPrice, country);
        return "payment.html?name=" + encodeURIComponent(name) +
            "&price=" + usdPrice +
            "&type=" + (type || "course") +
            "&id=" + (id || "") +
            "&country=" + (country || "") +
            "&localAmount=" + local.amount +
            "&localCode=" + local.code;
    }
};

// ===== CONFIG =====
// Auto-detect if running on localhost or a real device/network
var CONFIG = {
    ADMIN_WHATSAPP: "256783999418",
    BUSINESS_WHATSAPP: "256783999418",
    API_BASE: "https://skillhub-backend-i3dr.onrender.com/api",
    TOKEN_KEY: "skillhub_token",
    SESSION_KEY: "skillhub_user",
    NEWSLETTER_KEY: "skillhub_newsletter",
    CONTACT_KEY: "skillhub_contacts",
    MSG_TIMEOUT: 5000,
    FORM_DELAY: 3000
};

// ===== UTILITIES =====
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

// ===== API SERVICE =====
var ApiService = {
    getToken: function() {
        return localStorage.getItem(CONFIG.TOKEN_KEY);
    },
    setToken: function(token) {
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
    },
    clearToken: function() {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.SESSION_KEY);
    },
    request: async function(endpoint, method, body) {
        var headers = { "Content-Type": "application/json" };
        var token = this.getToken();
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }
        var options = { method: method || "GET", headers: headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            var res = await fetch(CONFIG.API_BASE + endpoint, options);
            var data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Request failed");
            }
            return data;
        } catch (err) {
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
            if (extraData.hourlyRate) body.hourlyRate = Number(extraData.hourlyRate);
            if (extraData.portfolio) body.portfolio = extraData.portfolio;
            if (extraData.profilePicture) body.profilePicture = extraData.profilePicture;
            if (extraData.bio) body.bio = extraData.bio;
            if (extraData.expertise) body.expertise = extraData.expertise;
        }
        var data = await this.request("/auth/register", "POST", body);
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
        window.open("https://wa.me/" + clean + "?text=" + encodeURIComponent(message), "_blank");
    },
    sendToAdmin: function(msg) { this.sendToNumber(CONFIG.ADMIN_WHATSAPP, msg); },
    sendToBusiness: function(msg) { this.sendToNumber(CONFIG.BUSINESS_WHATSAPP, msg); },
    notifyNewInstructor: function(name, skill, phone) {
        this.sendToAdmin("NEW INSTRUCTOR:\nName: " + name + "\nSkill: " + skill + "\nPhone: " + phone);
    },
    notifyNewFreelancer: function(name, skill, phone) {
        this.sendToAdmin("NEW FREELANCER:\nName: " + name + "\nSkill: " + skill + "\nPhone: " + phone);
    },
    courseInquiry: function(title, price, instructor, phone) {
        var msg = "Hi, I want to buy \"" + title + "\" for " + price + " ETB by " + instructor + ". Please guide me.";
        this.sendToNumber(phone || CONFIG.ADMIN_WHATSAPP, msg);
    },
    contactFreelancer: function(name, phone, skill) {
        var msg = "Hi " + name + ", I found you on SkillHub (" + skill + "). I want to hire you!";
        this.sendToNumber(phone, msg);
    },
    generalCourseInquiry: function() {
        this.sendToAdmin("Hello, I want to buy a course on SkillHub. Please share available courses.");
    },
    submitContactForm: function(name, email, phone, subject, message) {
        var subjects = {
            course: "Course Inquiry",
            instructor: "Become Instructor",
            freelancer: "Freelancer Registration",
            support: "Technical Support",
            other: "Other"
        };
        var msg = "*SkillHub Contact*\nName: " + name + "\nEmail: " + email + "\nPhone: " + (phone || "N/A") + "\nSubject: " + (subjects[subject] || subject) + "\nMessage: " + message;
        this.sendToBusiness(msg);
    }
};

// ===== STORAGE =====
var StorageManager = {
    get: function(key, def) {
        var d = localStorage.getItem(key);
        return d ? JSON.parse(d) : (def !== undefined ? def : null);
    },
    set: function(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
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
            if (data.courses && data.courses.length > 0) {
                this.courses = data.courses.map(function(c) {
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
        var token = localStorage.getItem("skillhub_token");
        modalBody.innerHTML =
            "<h2 style='font-size:1.5rem;margin-bottom:1rem;'>" + Utils.escapeHtml(course.title) + "</h2>" +
            "<p style='margin-bottom:0.5rem;'><strong>Instructor:</strong> " + Utils.escapeHtml(course.instructorName) + "</p>" +
            "<p style='margin-bottom:1rem;'><strong>Description:</strong> " + Utils.escapeHtml(course.description) + "</p>" +
            "<p style='font-size:1.75rem;font-weight:bold;color:#10b981;margin-bottom:0.5rem;'>" + CurrencyUtil.displayUSD(course.price) + "</p>" +
            (CurrencyUtil.getUserCountry() && CurrencyUtil.rates[CurrencyUtil.getUserCountry()]
                ? "<p style='font-size:0.875rem;color:#64748b;margin-bottom:1.5rem;'>≈ " + CurrencyUtil.toLocal(course.price, CurrencyUtil.getUserCountry()).display + "</p>"
                : "<p style='margin-bottom:1.5rem;'></p>") +
            (token
                ? "<a href='course.html?id=" + Utils.escapeHtml(String(course.id)) + "' class='btn btn-blue btn-full' style='display:block;text-align:center;text-decoration:none;margin-bottom:0.75rem;'><i class='fas fa-play-circle'></i> View Course Content</a>"
                : "") +
            "<a href='" + CurrencyUtil.paymentUrl(course.title, course.price, "course", course.id) + "' class='btn btn-green btn-full' style='display:block;text-align:center;text-decoration:none;'><i class='fas fa-credit-card'></i> Buy This Course</a>";
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
    init: function() {},
    loadFromAPI: async function() {
        var container = document.getElementById("freelancerProfilesList");
        UIHelper.showLoading(container, "Loading freelancers...");
        try {
            var data = await ApiService.getFreelancers({ limit: 50 });
            if (data.freelancers && data.freelancers.length > 0) {
                this.freelancers = data.freelancers.map(function(f) {
                    return {
                        id: f._id,
                        name: f.userId ? f.userId.name : "Freelancer",
                        skill: f.skills ? f.skills.join(", ") : "",
                        portfolio: f.portfolio && f.portfolio[0] ? f.portfolio[0].projectUrl : "",
                        phone: f.userId ? f.userId.phone : "",
                        services: f.title || "Freelance services",
                        hourlyRate: f.hourlyRate || 0,
                        bio: f.userId ? f.userId.bio : "",
                        profilePicture: f.userId ? f.userId.profilePicture : null,
                        rating: f.rating || 0,
                        completedJobs: f.completedJobs || 0,
                        availability: f.availability || "available",
                        isVerified: f.isVerified || false,
                        experience: f.experience || "junior"
                    };
                });
            } else {
                // Database empty — show sample freelancers
                this.freelancers = [
                    { id: "1", name: "Helen G.", skill: "Web Development", portfolio: "https://github.com/helen", phone: "+251922334455", services: "React, Node.js, API integration, Full-stack apps" },
                    { id: "2", name: "Samuel K.", skill: "Graphic Design", portfolio: "https://behance.net/samuel", phone: "+251933445566", services: "Logo Design, Branding, Flyers, Social Media Graphics" },
                    { id: "3", name: "Ruth M.", skill: "Content Writing", portfolio: "https://linkedin.com/in/ruth", phone: "+251944556677", services: "SEO Articles, Blog Posts, Copywriting, Editing" }
                ];
            }
        } catch (err) {
            console.warn("Using sample freelancers:", err.message);
            this.freelancers = [
                { id: "1", name: "Helen G.", skill: "Web Development", portfolio: "https://github.com/helen", phone: "+251922334455", services: "React, Node.js, API integration" },
                { id: "2", name: "Samuel K.", skill: "Graphic Design", portfolio: "https://behance.net/samuel", phone: "+251933445566", services: "Logo Design, Branding, Social Media" },
                { id: "3", name: "Ruth M.", skill: "Content Writing", portfolio: "https://linkedin.com/in/ruth", phone: "+251944556677", services: "SEO Articles, Blog Posts, Copywriting" }
            ];
        }
    },
    render: function(filterSkill) {
        filterSkill = filterSkill || "";
        var container = document.getElementById("freelancerProfilesList");
        if (!container) return;
        var filtered = this.freelancers.slice();
        if (filterSkill.trim()) {
            filtered = filtered.filter(function(f) { return f.skill.toLowerCase().includes(filterSkill.toLowerCase()); });
        }
        if (filtered.length === 0) {
            container.innerHTML = "<div style='text-align:center;padding:3rem;grid-column:1/-1;'>No freelancers found" + (filterSkill ? " matching \"" + Utils.escapeHtml(filterSkill) + "\"" : "") + "</div>";
            return;
        }
        container.innerHTML = filtered.map(function(f) {
            var initials = (f.name || "F").split(" ").map(function(n){ return n[0]; }).join("").toUpperCase().slice(0,2);
            var avatarHtml = f.profilePicture
                ? "<img src='" + Utils.escapeHtml(f.profilePicture) + "' alt='" + Utils.escapeHtml(f.name) + "'>"
                : "<span>" + initials + "</span>";
            var availClass = { available:"avail-green", busy:"avail-yellow", not_available:"avail-red", looking:"avail-blue" }[f.availability] || "avail-green";
            var availLabel = { available:"Available", busy:"Busy", not_available:"Unavailable", looking:"Open to Work" }[f.availability] || "Available";
            var verifiedBadge = f.isVerified ? "<span class='verified-badge'><i class='fas fa-check-circle'></i> Verified</span>" : "";
            var skillTags = (f.skill || "").split(",").slice(0,4).map(function(s){ return "<span class='fl-skill-tag'>" + Utils.escapeHtml(s.trim()) + "</span>"; }).join("");
            var rateDisplay = f.hourlyRate ? CurrencyUtil.displayUSD(f.hourlyRate) + "/hr" : "";
            var portfolio = f.portfolio ? "<a href='" + Utils.escapeHtml(f.portfolio) + "' target='_blank' rel='noopener' class='fl-portfolio-link'><i class='fas fa-external-link-alt'></i> Portfolio</a>" : "";
            var rating = f.rating ? "<span class='fl-rating'><i class='fas fa-star'></i> " + parseFloat(f.rating).toFixed(1) + "</span>" : "";
            var jobs = f.completedJobs ? "<span class='fl-jobs'><i class='fas fa-briefcase'></i> " + f.completedJobs + " jobs</span>" : "";
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
                            (rateDisplay ? "<span class='fl-rate'>" + rateDisplay + "</span>" : "") +
                        "</div>" +
                    "</div>" +
                "</div>" +
                (f.bio ? "<p class='fl-bio'>" + Utils.escapeHtml(f.bio.slice(0, 100)) + (f.bio.length > 100 ? "…" : "") + "</p>" : "") +
                "<div class='fl-skills-row'>" + skillTags + "</div>" +
                "<div class='fl-stats-row'>" + rating + jobs + portfolio + "</div>" +
                "<div class='fl-actions'>" +
                    "<button class='fl-btn-msg contact-freelancer-btn' data-name='" + Utils.escapeHtml(f.name) + "' data-phone='" + Utils.escapeHtml(f.phone) + "' data-skill='" + Utils.escapeHtml(f.skill) + "' data-userid='" + Utils.escapeHtml(String(f.id || "")) + "'>" +
                        "<i class='fab fa-whatsapp'></i> Message" +
                    "</button>" +
                    "<a href='" + CurrencyUtil.paymentUrl("Hire: " + f.name, f.hourlyRate || 0, "freelance", f.id) + "' class='fl-btn-hire'>" +
                        "<i class='fas fa-handshake'></i> Hire" +
                    "</a>" +
                "</div>" +
            "</div>";
        }).join("");
        container.querySelectorAll(".contact-freelancer-btn").forEach(function(btn) {
            btn.addEventListener("click", function() {
                MessagingManager.open(btn.dataset.name, btn.dataset.phone, btn.dataset.skill, btn.dataset.userid);
            });
        });
    },
    showHire: async function() {
        UIHelper.hideAllContainers();
        document.getElementById("freelancerHireContainer").classList.remove("hidden");
        await this.loadFromAPI();
        this.render();
    },
    filter: function(skill) { this.currentFilter = skill; this.render(skill); },
    resetFilter: function() { this.currentFilter = ""; this.render(); }
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
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            var name = document.getElementById("freeName").value.trim();
            var skill = document.getElementById("freeSkill").value.trim();
            var phone = document.getElementById("freePhone").value.trim();
            var msgEl = document.getElementById("freelancerSuccessMsg");
            WhatsAppService.notifyNewFreelancer(name, skill, phone);
            UIHelper.showMessage(msgEl, "Registered! Admin will review and contact you via WhatsApp.", "success");
            form.reset();
            setTimeout(function() { document.getElementById("freelancerFormCard").classList.add("hidden"); }, CONFIG.FORM_DELAY);
        });
    },
    initContactForm: function() {
        var form = document.getElementById("contactForm");
        var msgEl = document.getElementById("contactFormMessage");
        if (!form) return;
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            var name = document.getElementById("contactName").value.trim();
            var email = document.getElementById("contactEmail").value.trim();
            var phone = document.getElementById("contactPhone").value.trim();
            var subject = document.getElementById("contactSubject").value;
            var message = document.getElementById("contactMessage").value.trim();
            if (!name || !email || !subject || !message) { UIHelper.showMessage(msgEl, "Please fill in all required fields", "error"); return; }
            if (!email.includes("@")) { UIHelper.showMessage(msgEl, "Please enter a valid email address", "error"); return; }
            WhatsAppService.submitContactForm(name, email, phone, subject, message);
            StorageManager.saveContactSubmission({ name: name, email: email, phone: phone, subject: subject, message: message });
            UIHelper.showMessage(msgEl, "Message sent! Redirecting to WhatsApp...", "success");
            form.reset();
        });
    },
    initNewsletterForm: function() {
        var form = document.getElementById("newsletterForm");
        var msgEl = document.getElementById("newsletterMessage");
        if (!form) return;
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            var email = document.getElementById("newsletterEmail").value.trim();
            if (!email || !email.includes("@")) { UIHelper.showMessage(msgEl, "Please enter a valid email address", "error"); return; }
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
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
            var email = document.getElementById("loginEmail").value.trim();
            var password = document.getElementById("loginPassword").value;
            var rememberMe = document.getElementById("rememberMe").checked;
            if (!email || !password) { UIHelper.showMessage(msgEl, "Please fill in all fields", "error"); return; }
            UIHelper.showMessage(msgEl, "Logging in...", "success");
            try {
                var data = await ApiService.login(email, password);
                StorageManager.saveUserSession({ email: email, name: data.user.name, role: data.user.role, loggedIn: true, rememberMe: rememberMe, country: data.user.country });
                UIHelper.showMessage(msgEl, "Welcome back, " + data.user.name + "!", "success");
                NavbarUser.update();
                NotificationManager.add("Welcome back, " + data.user.name + "!", "success", "Login Successful");
                form.reset();
                setTimeout(function() { DashboardManager.show(); }, 800);
            } catch (err) { UIHelper.showMessage(msgEl, err.message, "error"); }
        });
    },
    initRegisterForm: function() {
        var form = document.getElementById("registerFormElement");
        var msgEl = document.getElementById("authMessage");
        if (!form) return;
        form.addEventListener("submit", async function(e) {
            e.preventDefault();
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
            var roleMap = { learner: "user", instructor: "instructor", freelancer: "freelancer" };
            var backendRole = roleMap[role] || "user";
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
                // Save country to session
                StorageManager.saveUserSession({ email: email, name: fullName, role: backendRole, country: country, loggedIn: false });
                form.reset();
                document.getElementById("freelancerExtraFields").classList.add("hidden");
                document.getElementById("instructorExtraFields").classList.add("hidden");
                // Show welcome modal
                WelcomeManager.show(fullName, role);
                setTimeout(function() {
                    var loginTab = document.querySelector(".auth-tab[data-tab='login']");
                    if (loginTab) loginTab.click();
                    document.getElementById("loginEmail").value = email;
                }, 2500);
            } catch (err) { UIHelper.showMessage(msgEl, err.message, "error"); }
        });
    }
};

// ===== ANIMATIONS =====
var animationIntervals = [];
var AnimationManager = {
    init: function() { this.initCounters(); this.initScrollReveal(); this.initGlowEffect(); },
    initCounters: function() {
        var counters = document.querySelectorAll(".about-stats .stat-number");
        if (!counters.length) return;
        var animated = false;
        var self = this;
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting && !animated) {
                    counters.forEach(function(counter) { self.animateCounter(counter, parseInt(counter.getAttribute("data-count"), 10)); });
                    animated = true;
                    observer.disconnect();
                }
            });
        }, { threshold: 0.5 });
        observer.observe(counters[0]);
    },
    animateCounter: function(element, target) {
        var start = 0;
        var increment = target / (2000 / 16);
        var timer = setInterval(function() {
            start += increment;
            if (start >= target) { element.textContent = target; clearInterval(timer); }
            else { element.textContent = Math.floor(start); }
        }, 16);
        animationIntervals.push(timer);
    },
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
        this.initHamburgerMenu();
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
    initHamburgerMenu: function() {
        var hamburger = document.getElementById("hamburger");
        var navLinks = document.getElementById("navLinks");
        if (!hamburger || !navLinks) return;
        function toggleMenu() {
            hamburger.classList.toggle("active");
            navLinks.classList.toggle("active");
            document.body.style.overflow = navLinks.classList.contains("active") ? "hidden" : "";
        }
        hamburger.addEventListener("click", toggleMenu);
        document.querySelectorAll(".nav-link").forEach(function(link) {
            link.addEventListener("click", function() { if (navLinks.classList.contains("active")) toggleMenu(); });
        });
        document.addEventListener("keydown", function(e) { if (e.key === "Escape" && navLinks.classList.contains("active")) toggleMenu(); });
        window.addEventListener("resize", Utils.debounce(function() { if (window.innerWidth > 968 && navLinks.classList.contains("active")) toggleMenu(); }, 200));
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
        var platforms = { facebook: "https://facebook.com/skillhub", twitter: "https://twitter.com/skillhub", instagram: "https://instagram.com/skillhub", linkedin: "https://linkedin.com/company/skillhub", youtube: "https://youtube.com/skillhub" };
        document.querySelectorAll(".social-link, .social-icon").forEach(function(link) {
            link.addEventListener("click", function(e) {
                e.preventDefault();
                var platform = Object.keys(platforms).find(function(p) { return link.classList.contains(p); });
                if (platform) window.open(platforms[platform], "_blank");
            });
        });
    },
    initContactClickHandlers: function() {
        var wa = document.querySelector(".contact-item.whatsapp");
        if (wa) wa.addEventListener("click", function() { WhatsAppService.sendToBusiness("Hello SkillHub! I have a question."); });
        var em = document.querySelector(".contact-item.email");
        if (em) em.addEventListener("click", function() { window.location.href = "mailto:hello@skillhub.com"; });
        var loc = document.querySelector(".contact-item.location");
        if (loc) loc.addEventListener("click", function() { window.open("https://maps.google.com/?q=Ethiopia", "_blank"); });
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
        document.querySelectorAll("#registerForm .role-btn").forEach(function(btn) {
            btn.addEventListener("click", function() {
                document.querySelectorAll("#registerForm .role-btn").forEach(function(b) { b.classList.remove("active"); });
                btn.classList.add("active");
                var role = btn.getAttribute("data-role-reg");
                document.getElementById("regSelectedRole").value = role;
                // Show/hide extra fields based on role
                document.getElementById("freelancerExtraFields").classList.toggle("hidden", role !== "freelancer");
                document.getElementById("instructorExtraFields").classList.toggle("hidden", role !== "instructor");
            });
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
        if (heroGetStarted) heroGetStarted.addEventListener("click", function(e) {
            e.preventDefault();
            var session = StorageManager.getUserSession();
            if (session && session.loggedIn) { DashboardManager.show(); }
            else { var target = document.getElementById("login-register"); if (target) { var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0; window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" }); } }
        });
        var heroExploreCourses = document.getElementById("heroExploreCourses");
        if (heroExploreCourses) heroExploreCourses.addEventListener("click", function(e) {
            e.preventDefault();
            var target = document.getElementById("courses");
            if (target) { var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0; window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" }); }
        });

        // ── Courses section ───────────────────────────────────────────
        var showInstructorBtn = document.getElementById("showInstructorFormBtn");
        if (showInstructorBtn) showInstructorBtn.addEventListener("click", function() {
            var session = StorageManager.getUserSession();
            if (session && session.loggedIn) {
                // Already logged in — go to dashboard
                DashboardManager.show();
                NotificationManager.add("To become an instructor, update your role in Settings.", "info");
            } else {
                // Not logged in — redirect to register with instructor pre-selected
                var target = document.getElementById("login-register");
                if (target) { var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0; window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" }); }
                // Pre-select instructor role in register tab
                setTimeout(function() {
                    var regTab = document.querySelector(".auth-tab[data-tab='register']");
                    if (regTab) regTab.click();
                    var instrBtn = document.querySelector("#registerForm .role-btn[data-role-reg='instructor']");
                    if (instrBtn) instrBtn.click();
                }, 400);
            }
        });

        var buyCourseBtn = document.getElementById("buyCourseRedirectBtn");
        if (buyCourseBtn) buyCourseBtn.addEventListener("click", function() { WhatsAppService.generalCourseInquiry(); });

        var viewCoursesBtn = document.getElementById("viewCoursesBtn");
        if (viewCoursesBtn) viewCoursesBtn.addEventListener("click", function() { CourseManager.showView(); });

        // ── Earn section ──────────────────────────────────────────────
        var showFreelancerBtn = document.getElementById("showFreelancerFormBtn");
        if (showFreelancerBtn) showFreelancerBtn.addEventListener("click", function() {
            var session = StorageManager.getUserSession();
            if (session && session.loggedIn) {
                DashboardManager.show();
                NotificationManager.add("To become a freelancer, update your role in Settings.", "info");
            } else {
                var target = document.getElementById("login-register");
                if (target) { var navH = (document.querySelector(".navbar") || {}).offsetHeight || 0; window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: "smooth" }); }
                setTimeout(function() {
                    var regTab = document.querySelector(".auth-tab[data-tab='register']");
                    if (regTab) regTab.click();
                    var freeBtn = document.querySelector("#registerForm .role-btn[data-role-reg='freelancer']");
                    if (freeBtn) freeBtn.click();
                }, 400);
            }
        });

        var hireBtn = document.getElementById("hireFreelancerBtn");
        if (hireBtn) hireBtn.addEventListener("click", function() { FreelancerManager.showHire(); });

        var filterBtn = document.getElementById("filterSkillBtn");
        if (filterBtn) filterBtn.addEventListener("click", function() { FreelancerManager.filter(document.getElementById("skillFilterInput").value); });

        var resetBtn = document.getElementById("resetFilterBtn");
        if (resetBtn) resetBtn.addEventListener("click", function() { document.getElementById("skillFilterInput").value = ""; FreelancerManager.resetFilter(); });

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
        this.notifications = JSON.parse(localStorage.getItem("skillhub_notifs") || "[]");
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
                    { label: "View Profile", icon: "fa-user", href: "#dashboard", cls: "btn-secondary-outline" }
                ]
            },
            instructor: {
                icon: "fa-chalkboard-teacher",
                title: "Welcome, Instructor " + name + "! 👨‍🏫",
                subtitle: "Your application is under review.",
                msg: "Our admin team will review your instructor application within 24 hours. You'll receive a WhatsApp notification once approved.",
                actions: [
                    { label: "View Dashboard", icon: "fa-th-large", href: "#dashboard", cls: "btn-primary" },
                    { label: "Explore Platform", icon: "fa-compass", href: "#how-it-works", cls: "btn-secondary-outline" }
                ]
            },
            freelancer: {
                icon: "fa-laptop-code",
                title: "Welcome, " + name + "! 💼",
                subtitle: "Your freelancer profile is pending review.",
                msg: "Admin will verify your profile within 24 hours. Once approved, clients can find and hire you directly.",
                actions: [
                    { label: "View Dashboard", icon: "fa-th-large", href: "#dashboard", cls: "btn-primary" },
                    { label: "Browse Freelancers", icon: "fa-users", href: "#earn", cls: "btn-secondary-outline" }
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
    open: function(name, phone, skill, userId) {
        // If we have a userId, open the internal chat page
        if (userId) {
            window.location.href = 'chat.html?userId=' + encodeURIComponent(userId) + '&userName=' + encodeURIComponent(name);
            return;
        }
        // Fallback: open chat page without userId (user can search)
        var token = localStorage.getItem('skillhub_token');
        if (token) {
            window.location.href = 'chat.html';
        } else {
            // Not logged in — redirect to login first
            var target = document.getElementById('login-register');
            if (target) {
                var navH = (document.querySelector('.navbar') || {}).offsetHeight || 0;
                window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - navH, behavior: 'smooth' });
            }
            NotificationManager.add('Please log in to send messages.', 'info');
        }
    }
};

// ===== REAL-TIME STATS =====
var StatsManager = {
    defaults: { totalUsers: 1000, totalCourses: 500, totalFreelancers: 100 },
    heroTargets: null,
    load: async function() {
        try {
            var data = await ApiService.getStats();
            if (data && data.success && data.stats) {
                this.updateAll(data.stats.totalUsers, data.stats.totalCourses, data.stats.totalFreelancers);
            }
        } catch (e) {
            // Keep defaults — already rendered
        }
    },
    updateAll: function(users, courses, freelancers) {
        // Hero stats
        var heroStats = document.querySelectorAll(".hero-stats .stat-number");
        if (heroStats[0]) heroStats[0].textContent = courses + "+";
        if (heroStats[1]) heroStats[1].textContent = users + "+";
        if (heroStats[2]) heroStats[2].textContent = Math.round(courses / 10) + "+";

        // About section animated counters
        var aboutCounters = document.querySelectorAll(".about-stats .stat-number");
        if (aboutCounters[0]) aboutCounters[0].setAttribute("data-count", courses);
        if (aboutCounters[1]) aboutCounters[1].setAttribute("data-count", users);
        if (aboutCounters[2]) aboutCounters[2].setAttribute("data-count", Math.round(courses / 10));
        if (aboutCounters[3]) aboutCounters[3].setAttribute("data-count", freelancers);

        // Auth section stats
        var authStats = document.querySelectorAll(".auth-info .stat-number");
        if (authStats[0]) authStats[0].textContent = courses + "+";
        if (authStats[1]) authStats[1].textContent = users + "+";
        if (authStats[2]) authStats[2].textContent = Math.round(courses / 10) + "+";
    }
};

// ===== DASHBOARD MANAGER =====
var DashboardManager = {
    user: null,
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
        var section = document.getElementById("dashboard");
        if (!section) return;
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
        if (walletEl) walletEl.textContent = (user.walletBalance || 0) + " ETB";
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
                "<p>No courses created yet. Start creating your first course!</p>" +
                "</div>";
            return;
        }
        container.innerHTML = courses.map(function(c) {
            var statusColor = { published: "#10b981", pending: "#f59e0b", rejected: "#ef4444", draft: "#6b7280" };
            var color = statusColor[c.status] || "#6b7280";
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
                "<div class='dash-course-price'>" + (c.price || 0) + " ETB</div>" +
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
            this.renderPaymentHistory(data.transactions || []);
        } catch (e) {
            container.innerHTML = "<div class='dash-empty-state'><i class='fas fa-wifi-slash'></i><p>Could not load payments. Make sure the backend is running.</p></div>";
        }
    },
    renderPaymentHistory: function(transactions) {
        var container = document.getElementById("paymentHistoryList");
        if (!container) return;
        if (!transactions || transactions.length === 0) {
            container.innerHTML = "<div class='dash-empty-state'><i class='fas fa-receipt'></i><p>No payment history yet.</p></div>";
            return;
        }
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
            "<th>Date</th><th>Description</th><th>Amount</th><th>Status</th>" +
            "</tr></thead>" +
            "<tbody>" +
            transactions.map(function(t) {
                var date = t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
                var label = typeLabels[t.type] || t.type || "Transaction";
                var courseName = (t.metadata && t.metadata.courseName) ? " — " + Utils.escapeHtml(t.metadata.courseName) : "";
                var amount = (t.amount || 0).toLocaleString() + " ETB";
                var status = t.status || "pending";
                var statusColor = statusColors[status] || "#6b7280";
                var statusIcon = status === "completed" ? "fa-check-circle" : status === "pending" ? "fa-clock" : "fa-times-circle";
                return "<tr>" +
                    "<td class='pay-date'>" + date + "</td>" +
                    "<td class='pay-desc'>" + label + Utils.escapeHtml(courseName) + "</td>" +
                    "<td class='pay-amount'>" + amount + "</td>" +
                    "<td class='pay-status'><span style='color:" + statusColor + ";'><i class='fas " + statusIcon + "'></i> " +
                    status.charAt(0).toUpperCase() + status.slice(1) + "</span></td>" +
                    "</tr>";
            }).join("") +
            "</tbody></table></div>";
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
    update: function() {
        var user = StorageManager.getUserSession();
        var badge = document.getElementById("navUserBadge");
        var authLink = document.getElementById("navAuthLink");
        var nameEl = document.getElementById("navUserName");
        if (user && user.loggedIn && badge && authLink) {
            badge.classList.remove("hidden");
            authLink.classList.add("hidden");
            if (nameEl) nameEl.textContent = user.name ? user.name.split(" ")[0] : "User";
        } else if (badge && authLink) {
            badge.classList.add("hidden");
            authLink.classList.remove("hidden");
            DashboardManager.hide();
        }
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
                DashboardManager.show();
            });
        }
    }
};

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", function() {
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

    var savedUser = StorageManager.getUserSession();
    if (savedUser && savedUser.loggedIn) {
        setTimeout(function() { DashboardManager.show(); }, 500);
    }

    // Wake up Render backend (free tier sleeps after inactivity)
    fetch("https://skillhub-backend-i3dr.onrender.com/health")
        .then(function(r) { return r.json(); })
        .then(function(d) { console.log("Backend ready:", d.status); })
        .catch(function() { console.warn("Backend warming up..."); });

    var copyright = document.querySelector(".copyright");
    if (copyright) { copyright.innerHTML = copyright.innerHTML.replace("2025", new Date().getFullYear()); }
});

window.addEventListener("beforeunload", function() { AnimationManager.cleanup(); });
