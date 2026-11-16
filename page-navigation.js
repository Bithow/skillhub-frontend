(function() {
    "use strict";

    var currentUrl = new URL(window.location.href);
    if (/\/(?:index(?:\.[^/]*)?)?$/.test(currentUrl.pathname)) return;

    var existingBack = document.querySelector(
        ".site-back-control, .learn-back, .catalogue-back, .back-link, .admin-back, .topbar-link[href*='index'], " +
        "a[href^='javascript:history.back'], #backBtn, .back-btn, .btn-back, [data-page-back]"
    );
    if (!existingBack) {
        existingBack = Array.from(document.querySelectorAll("a")).find(function(link) {
            return /^back\b/i.test(link.textContent.trim());
        });
    }
    if (existingBack) return;

    var referrer = document.referrer;
    var backUrl = "index.html";
    try {
        if (referrer && new URL(referrer).origin === currentUrl.origin && window.history.length > 1) backUrl = referrer;
    } catch (error) {}

    if (!document.getElementById("siteBackControlStyles")) {
        var style = document.createElement("style");
        style.id = "siteBackControlStyles";
        style.textContent = ".site-back-control{position:fixed;right:1rem;bottom:1rem;z-index:1200;display:inline-flex;min-height:42px;align-items:center;gap:.45rem;padding:.55rem .8rem;border:1px solid #d5dae2;border-radius:6px;background:#fff;color:#344054;box-shadow:0 3px 12px rgba(16,24,40,.12);font-family:inherit;font-size:.78rem;font-weight:650;text-decoration:none}.site-back-control:hover{border-color:#2563eb;color:#2563eb}.site-back-control:focus-visible{outline:3px solid rgba(37,99,235,.35);outline-offset:2px}";
        document.head.appendChild(style);
    }

    var back = document.createElement("a");
    back.className = "site-back-control";
    back.href = backUrl;
    back.innerHTML = "<i class=\"fas fa-arrow-left\" aria-hidden=\"true\"></i><span>Back</span>";
    back.setAttribute("aria-label", "Go back to the previous SkillHub page");
    document.body.appendChild(back);
})();
