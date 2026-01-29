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
    elements.defaultList = document.getElementById('default-list');
    elements.languageSelect = document.getElementById('language-select');
    elements.saveBtn = document.getElementById('save-btn');
    elements.testBtn = document.getElementById('test-btn');
    elements.fetchListsBtn = document.getElementById('fetch-lists-btn');
    elements.openAccountLink = document.getElementById('open-account-link');
    elements.statusMessage = document.getElementById('status-message');
  }

  /**
   * Initialize event listeners
   */
  function initEventListeners() {
    elements.saveBtn.addEventListener('click', saveConfig);
    elements.testBtn.addEventListener('click', testConnection);
    elements.fetchListsBtn.addEventListener('click', fetchLists);
    elements.toggleKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    elements.openAccountLink.addEventListener('click', openAccountPage);
    elements.languageSelect.addEventListener('change', handleLanguageChange);
  }

  /**
   * Load the configuration
   */
  async function loadConfig() {
    try {
      const result = await browser.storage.local.get(['serverUrl', 'apiKey', 'lists', 'defaultListId', 'language']);
      
      elements.serverUrl.value = result.serverUrl || '';
      elements.apiKey.value = result.apiKey || '';
      lists = result.lists || [];
      
      // Set language selector
      elements.languageSelect.value = result.language || 'auto';
      
      renderLists();
      updateDefaultListSelect(result.defaultListId);
      
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
      updateDefaultListSelect();
      
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
   * Update the default list selection
   */
  function updateDefaultListSelect(currentDefault = null) {
    const current = currentDefault || elements.defaultList.value;
    
    elements.defaultList.innerHTML = `<option value="">${__('selectNone')}</option>`;
    
    for (const list of lists) {
      const option = document.createElement('option');
      option.value = list.id;
      const listName = list.name || __('unnamedList');
      const groupName = (list.groupName && list.groupName.toLowerCase() !== 'default') ? ` (${list.groupName})` : '';
      option.textContent = `${listName}${groupName}`;
      elements.defaultList.appendChild(option);
    }
    
    if (current && lists.find(l => l.id === current)) {
      elements.defaultList.value = current;
    }
  }

  /**
   * Save the configuration
   */
  async function saveConfig() {
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
    
    try {
      await browser.storage.local.set({
        serverUrl,
        apiKey,
        lists,
        defaultListId: elements.defaultList.value
      });
      
      showStatus(__('configSaved'), 'success');
    } catch (error) {
      console.error('Error while saving:', error);
      showStatus(__('configSaveError'), 'error');
    }
  }

  /**
   * Test the connection to the server with the API
   */
  async function testConnection() {
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
        showStatus(__('connectionSuccess', { count: data.lists?.length || 0 }), 'success');
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
   * Fetch lists from the API
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
        updateDefaultListSelect();
        
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
