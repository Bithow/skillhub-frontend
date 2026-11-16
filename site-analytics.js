(function() {
    var base = window.SKILLHUB_API_BASE || 'https://skillhub-backend-i3dr.onrender.com/api';
    var path = window.location.pathname || '/';
    if (/\/admin(?:\.html)?$/i.test(path)) return;

    var visitorKey;
    try {
        visitorKey = sessionStorage.getItem('skillhub_visitor_key');
        if (!visitorKey) {
            visitorKey = window.crypto && typeof window.crypto.randomUUID === 'function'
                ? window.crypto.randomUUID().replace(/-/g, '')
                : Math.random().toString(36).slice(2) + Date.now().toString(36);
            sessionStorage.setItem('skillhub_visitor_key', visitorKey);
        }
    } catch (error) {
        return;
    }

    var width = Math.min(window.innerWidth || 0, screen.width || 0);
    var deviceType = width && width < 600 ? 'mobile' : width && width < 1024 ? 'tablet' : 'desktop';
    var referrer = '';
    try {
        var referrerUrl = document.referrer ? new URL(document.referrer) : null;
        if (referrerUrl) referrer = referrerUrl.hostname.slice(0, 120);
    } catch (error) {}

    fetch(base + '/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorKey: visitorKey, path: path.slice(0, 300), deviceType: deviceType, referrer: referrer }),
        keepalive: true
    }).catch(function() {});
})();
