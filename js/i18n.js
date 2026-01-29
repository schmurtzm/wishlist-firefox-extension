// i18n utility functions for Firefox extension

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt'];

// Current language and loaded messages
let currentLanguage = null;
let loadedMessages = null;

/**
 * Get the user's selected language or browser default
 */
async function getSelectedLanguage() {
  try {
    const result = await browser.storage.local.get(['language']);
    return result.language || 'auto';
  } catch (e) {
    return 'auto';
  }
}

/**
 * Get the effective language code
 */
async function getEffectiveLanguage() {
  const selected = await getSelectedLanguage();
  
  if (selected === 'auto') {
    // Use browser's UI language
    const browserLang = browser.i18n.getUILanguage().split('-')[0];
    return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : 'en';
  }
  
  return SUPPORTED_LANGUAGES.includes(selected) ? selected : 'en';
}

/**
 * Load messages for a specific language
 */
async function loadMessages(lang) {
  if (currentLanguage === lang && loadedMessages) {
    return loadedMessages;
  }
  
  try {
    const url = browser.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    loadedMessages = await response.json();
    currentLanguage = lang;
    return loadedMessages;
  } catch (e) {
    console.error(`Failed to load messages for ${lang}:`, e);
    // Fallback to English
    if (lang !== 'en') {
      return loadMessages('en');
    }
    return {};
  }
}

/**
 * Initialize i18n with the selected language
 */
async function initI18n() {
  const lang = await getEffectiveLanguage();
  await loadMessages(lang);
  return lang;
}

/**
 * Get a translated message by key
 * @param {string} key - The message key
 * @param {Object} substitutions - Optional substitutions for placeholders
 * @returns {string} The translated message
 */
function getMessage(key, substitutions = {}) {
  let message = null;
  
  // Try loaded messages first (for manual language override)
  if (loadedMessages && loadedMessages[key]) {
    message = loadedMessages[key].message;
  }
  
  // Fallback to browser.i18n (uses browser language)
  if (!message) {
    message = browser.i18n.getMessage(key);
  }
  
  // If no translation found, return the key
  if (!message) {
    console.warn(`Missing translation for key: ${key}`);
    return key;
  }
  
  // Replace {placeholder} with values
  for (const [placeholder, value] of Object.entries(substitutions)) {
    message = message.replace(`{${placeholder}}`, value);
  }
  
  return message;
}

/**
 * Apply translations to all elements with data-i18n attributes
 */
function applyTranslations() {
  // Translate text content
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translated = getMessage(key);
    if (translated && translated !== key) {
      element.textContent = translated;
    }
  });
  
  // Translate HTML content (for elements with <strong>, etc.)
  document.querySelectorAll('[data-i18n-html]').forEach(element => {
    const key = element.getAttribute('data-i18n-html');
    const translated = getMessage(key);
    if (translated && translated !== key) {
      element.innerHTML = translated;
    }
  });
  
  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const translated = getMessage(key);
    if (translated && translated !== key) {
      element.placeholder = translated;
    }
  });
  
  // Translate titles
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    const translated = getMessage(key);
    if (translated && translated !== key) {
      element.title = translated;
    }
  });
}

/**
 * Set the language preference
 */
async function setLanguage(lang) {
  await browser.storage.local.set({ language: lang });
  if (lang !== 'auto') {
    await loadMessages(lang);
  } else {
    const effectiveLang = await getEffectiveLanguage();
    await loadMessages(effectiveLang);
  }
}

/**
 * Get available languages
 */
function getAvailableLanguages() {
  return SUPPORTED_LANGUAGES;
}

/**
 * Get current language
 */
function getCurrentLanguage() {
  return currentLanguage;
}

// Export for use in other scripts
window.i18n = {
  getMessage,
  applyTranslations,
  initI18n,
  setLanguage,
  getSelectedLanguage,
  getEffectiveLanguage,
  getAvailableLanguages,
  getCurrentLanguage,
  SUPPORTED_LANGUAGES
};
