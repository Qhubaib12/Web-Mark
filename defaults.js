(function attachWebMarkDefaults(globalScope) {
  const SETTINGS_VERSION = 2;

  const WEB_MARK_DEFAULTS = {
    settingsVersion: SETTINGS_VERSION,
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
    screenshotType: 'visible',
    screenshotQuality: 'balanced',
    smartHeaderOffset: true
  };

  const normalizeSettings = (input = {}) => {
    const normalized = { ...WEB_MARK_DEFAULTS, ...input };
    normalized.settingsVersion = SETTINGS_VERSION;

    if (!['visible', 'fullpage'].includes(normalized.screenshotType)) {
      normalized.screenshotType = WEB_MARK_DEFAULTS.screenshotType;
    }

    if (!['fast', 'balanced', 'stable'].includes(normalized.screenshotQuality)) {
      normalized.screenshotQuality = WEB_MARK_DEFAULTS.screenshotQuality;
    }

    if (!['light', 'dark'].includes(normalized.theme)) {
      normalized.theme = WEB_MARK_DEFAULTS.theme;
    }

    normalized.smartHeaderOffset = Boolean(normalized.smartHeaderOffset);
    normalized.manualCountry = String(normalized.manualCountry || '');

    return normalized;
  };

  globalScope.WEB_MARK_SETTINGS_VERSION = SETTINGS_VERSION;
  globalScope.WEB_MARK_DEFAULTS = WEB_MARK_DEFAULTS;
  globalScope.WEB_MARK_NORMALIZE_SETTINGS = normalizeSettings;
})(typeof globalThis !== 'undefined' ? globalThis : window);
