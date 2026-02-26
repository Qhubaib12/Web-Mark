(function attachWebMarkDefaults(globalScope) {
  const WEB_MARK_DEFAULTS = {
    enabled: true,
    showUrl: true,
    showDate: true,
    showTime: true,
    showCountry: true,
    showIp: false,
    showViewport: false,
    showUserAgent: false,
    timezone: 'auto',
    manualCountry: '',
    theme: 'light',
    screenshotType: 'visible'
  };

  globalScope.WEB_MARK_DEFAULTS = WEB_MARK_DEFAULTS;
})(typeof globalThis !== 'undefined' ? globalThis : window);
