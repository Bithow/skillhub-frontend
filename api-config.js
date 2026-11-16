(function() {
    var host = window.location.hostname;
    var isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    var configured = window.SKILLHUB_API_ORIGIN;
    var origin = configured || (isLocal ? 'http://localhost:5000' : 'https://skillhub-backend-c3n9.onrender.com');
    window.SKILLHUB_API_ORIGIN = origin.replace(/\/$/, '');
    window.SKILLHUB_API_BASE = window.SKILLHUB_API_ORIGIN + '/api';
})();
