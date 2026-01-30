/**
 * Options page script for Wishlist Quick Add
 * Uses the API with API key authentication
 */

(function() {
  'use strict';

  // State
  let lists = [];
  let apiKeyVisible = false;

  // DOM elements
  const elements = {};

  // i18n helper
  function __(key, substitutions = {}) {
    if (window.i18n) {
      return window.i18n.getMessage(key, substitutions);
    }
    return key;
  }

  /**
   * Initialization
   */
  document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n with the selected language
    if (window.i18n && window.i18n.initI18n) {
      await window.i18n.initI18n();
    }
    
    // Apply i18n translations
    if (window.i18n) {
      window.i18n.applyTranslations();
    }
    
    initElements();
    initEventListeners();
    await loadConfig();
  });

  /**
   * Initialize references to elements
   */
  function initElements() {
    elements.serverUrl = document.getElementById('server-url');
    elements.apiKey = document.getElementById('api-key');
    elements.toggleKeyBtn = document.getElementById('toggle-key-btn');
    elements.listsContainer = document.getElementById('lists-container');
    elements.listsCount = document.getElementById('lists-count');
    elements.languageSelect = document.getElementById('language-select');
    elements.saveBtn = document.getElementById('save-btn');
    elements.openAccountLink = document.getElementById('open-account-link');
    elements.statusMessage = document.getElementById('status-message');
  }

  /**
   * Initialize event listeners
   */
  function initEventListeners() {
    elements.saveBtn.addEventListener('click', saveAndConnect);
    elements.toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    elements.openAccountLink.addEventListener('click', openAccountPage);
    elements.languageSelect.addEventListener('change', handleLanguageChange);
  }

  /**
   * Load the configuration
   */
  async function loadConfig() {
    try {
      const result = await browser.storage.local.get(['serverUrl', 'apiKey', 'lists', 'language']);
      
      elements.serverUrl.value = result.serverUrl || '';
      elements.apiKey.value = result.apiKey || '';
      lists = result.lists || [];
      
      // Set language selector
      elements.languageSelect.value = result.language || 'auto';
      
      renderLists();
      
    } catch (error) {
      console.error('Error while loading:', error);
      showStatus(__('configSaveError'), 'error');
    }
  }

  /**
   * Handle language change
   */
  async function handleLanguageChange() {
    const lang = elements.languageSelect.value;
    
    if (window.i18n && window.i18n.setLanguage) {
      await window.i18n.setLanguage(lang);
      window.i18n.applyTranslations();
      
      // Re-render dynamic content
      renderLists();
      
      showStatus(__('languageChanged'), 'info');
    }
  }

  /**
   * Toggle API key visibility
   */
  function toggleApiKeyVisibility() {
    apiKeyVisible = !apiKeyVisible;
    elements.apiKey.type = apiKeyVisible ? 'text' : 'password';
    elements.toggleKeyBtn.textContent = apiKeyVisible ? '🙈' : '👁️';
  }

  /**
   * Open the account page in Wishlist
   */
  function openAccountPage(e) {
    e.preventDefault();
    const serverUrl = elements.serverUrl.value.trim();
    if (serverUrl) {
      browser.tabs.create({ url: `${serverUrl}/account` });
    } else {
      showStatus(__('enterServerUrl'), 'error');
    }
  }

  /**
   * Display the lists
   */
  function renderLists() {
    // Update list count
    elements.listsCount.textContent = `(${lists.length})`;
    
    if (lists.length === 0) {
      elements.listsContainer.innerHTML = `
        <div class="empty-state">
          ${__('configureConnection')}
        </div>
      `;
      return;
    }
    
    elements.listsContainer.innerHTML = '';
    
    for (const list of lists) {
      const item = document.createElement('div');
      item.className = 'list-item';
      const listName = list.name || __('unnamedList');
      const groupName = (list.groupName && list.groupName.toLowerCase() !== 'default') ? list.groupName : '';
      const metaText = groupName 
        ? `${groupName} • ${list.itemCount || 0} ${__('articles')}`
        : `${list.itemCount || 0} ${__('articles')}`;
      item.innerHTML = `
        <span class="list-icon">📋</span>
        <div class="list-info">
          <div class="list-name">${escapeHtml(listName)}</div>
          <div class="list-meta">${metaText}</div>
        </div>
        <button type="button" class="list-open-btn" data-list-id="${list.id}">🔗 ${__('openList')}</button>
      `;
      elements.listsContainer.appendChild(item);
    }
    
    // Add click handlers for open buttons
    elements.listsContainer.querySelectorAll('.list-open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const listId = e.target.dataset.listId;
        const serverUrl = elements.serverUrl.value.trim();
        if (serverUrl && listId) {
          // Use /go route to automatically switch group if needed
          browser.tabs.create({ url: `${serverUrl}/lists/${listId}/go` });
        }
      });
    });
  }

  /**
   * Save and connect - saves config, tests connection, and fetches lists
   */
  async function saveAndConnect() {
    let serverUrl = elements.serverUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();
    
    if (!serverUrl) {
      showStatus(__('enterServerUrl'), 'error');
      return;
    }
    
    if (!apiKey) {
      showStatus(__('enterApiKey'), 'error');
      return;
    }
    
    // Remove trailing slash if present
    if (serverUrl.endsWith('/')) {
      serverUrl = serverUrl.slice(0, -1);
    }
    
    // Save config first
    try {
      await browser.storage.local.set({
        serverUrl,
        apiKey
      });
    } catch (error) {
      console.error('Error while saving:', error);
      showStatus(__('configSaveError'), 'error');
      return;
    }
    
    // Test connection and fetch lists
    showStatus(__('testingConnection'), 'info');
    
    try {
      const response = await fetch(`${serverUrl}/api/v1/lists`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        lists = data.lists || [];
        
        // Save lists to storage
        await browser.storage.local.set({ lists });
        
        renderLists();
        
        showStatus(__('connectionSuccessListsFetched', { count: lists.length }), 'success');
      } else if (response.status === 401) {
        showStatus(__('connectionErrorInvalidKey'), 'error');
      } else {
        const error = await response.json().catch(() => ({}));
        showStatus(__('connectionErrorServer', { error: error.error || response.statusText }), 'error');
      }
      
    } catch (error) {
      console.error('Connection error:', error);
      showStatus(__('connectionErrorNetwork'), 'error');
    }
  }

  /**
   * Fetch lists from the API (used for refresh)
   */
  async function fetchLists() {
    let serverUrl = elements.serverUrl.value.trim();
    const apiKey = elements.apiKey.value.trim();
    
    if (!serverUrl) {
      showStatus(__('enterServerUrl'), 'error');
      return;
    }
    
    if (!apiKey) {
      showStatus(__('enterApiKey'), 'error');
      return;
    }
    
    if (serverUrl.endsWith('/')) {
      serverUrl = serverUrl.slice(0, -1);
    }
    
    showStatus(__('fetchingLists'), 'info');
    
    try {
      const response = await fetch(`${serverUrl}/api/v1/lists`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        lists = data.lists || [];
        
        renderLists();
        
        showStatus(__('listsFetched', { count: lists.length }), 'success');
      } else if (response.status === 401) {
        showStatus(__('connectionErrorInvalidKey'), 'error');
      } else {
        const error = await response.json().catch(() => ({}));
        showStatus(__('connectionErrorServer', { error: error.error || response.statusText }), 'error');
      }
      
    } catch (error) {
      console.error('Error:', error);
      showStatus(__('connectionErrorNetwork'), 'error');
    }
  }

  /**
   * Display a status message
   */
  function showStatus(message, type) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type}`;
    
    // Hide after 5 seconds for success and info
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (elements.statusMessage.textContent === message) {
          elements.statusMessage.className = 'status-message';
        }
      }, 5000);
    }
  }

  /**
   * Escape HTML characters
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
