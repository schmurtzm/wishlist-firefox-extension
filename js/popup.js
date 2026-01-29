/**
 * Popup script for Wishlist Quick Add
 * Handles the user interface and sending to the Wishlist API
 */

(function() {
  'use strict';

  // Application state
  let state = {
    config: {
      serverUrl: '',
      apiKey: '',
      lists: []
    },
    currentItem: {
      url: '',
      title: '',
      description: '',
      images: [],
      price: null,
      currency: 'EUR',
      selectedImageIndex: 0
    },
    selectedListId: ''
  };

  // DOM elements
  const elements = {};

  /**
   * Initialization on DOM load
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
    
    // Load configuration
    const configLoaded = await loadConfig();
    
    if (!configLoaded) {
      showPage('config-page');
      return;
    }

    // Extract information from the current page
    await extractPageInfo();
  });

  /**
   * Initialize references to DOM elements
   */
  function initElements() {
    elements.loadingPage = document.getElementById('loading-page');
    elements.itemPage = document.getElementById('item-page');
    elements.successPage = document.getElementById('success-page');
    elements.errorPage = document.getElementById('error-page');
    elements.configPage = document.getElementById('config-page');
    
    elements.loaderText = document.getElementById('loader-text');
    
    elements.itemForm = document.getElementById('item-form');
    elements.titleInput = document.getElementById('title');
    elements.priceInput = document.getElementById('price');
    elements.currencySelect = document.getElementById('currency');
    elements.noteInput = document.getElementById('note');
    elements.listSelect = document.getElementById('list-select');
    elements.refreshListsBtn = document.getElementById('refresh-lists-btn');
    elements.selectedImageInput = document.getElementById('selected-image');
    
    elements.previewImage = document.getElementById('preview-image');
    elements.noImage = document.getElementById('no-image');
    elements.imageCounter = document.getElementById('image-counter');
    elements.prevImageBtn = document.getElementById('prev-image');
    elements.nextImageBtn = document.getElementById('next-image');
    
    elements.addButton = document.getElementById('add-button');
    elements.addButtonText = document.getElementById('add-button-text');
    elements.openWishlistBtn = document.getElementById('open-wishlist');
    elements.openSelectedListBtn = document.getElementById('open-selected-list-btn');
    elements.openOptionsLink = document.getElementById('open-options');
    
    elements.successMessage = document.getElementById('success-message');
    elements.viewListBtn = document.getElementById('view-list');
    elements.closePopupBtn = document.getElementById('close-popup');
    
    elements.errorMessage = document.getElementById('error-message');
    elements.retryBtn = document.getElementById('retry-button');
    elements.configBtn = document.getElementById('config-button');
    
    elements.openConfigBtn = document.getElementById('open-config');
  }

  /**
   * Initialize event listeners
   */
  function initEventListeners() {
    // Image navigation
    elements.prevImageBtn.addEventListener('click', () => navigateImages(-1));
    elements.nextImageBtn.addEventListener('click', () => navigateImages(1));
    
    // Form
    elements.itemForm.addEventListener('submit', handleSubmit);
    
    // Buttons
    elements.openWishlistBtn.addEventListener('click', openWishlist);
    elements.openOptionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      openOptions();
    });
    
    elements.viewListBtn.addEventListener('click', viewList);
    elements.closePopupBtn.addEventListener('click', () => window.close());
    
    elements.retryBtn.addEventListener('click', () => extractPageInfo());
    elements.configBtn.addEventListener('click', openOptions);
    
    elements.openConfigBtn.addEventListener('click', openOptions);
    
    // Refresh lists button
    elements.refreshListsBtn.addEventListener('click', refreshLists);
    
    // Open selected list button
    elements.openSelectedListBtn.addEventListener('click', openSelectedList);
  }

  /**
   * Load the configuration from storage
   */
  async function loadConfig() {
    try {
      const result = await browser.storage.local.get(['serverUrl', 'apiKey', 'lists', 'defaultListId']);
      
      state.config.serverUrl = result.serverUrl || '';
      state.config.apiKey = result.apiKey || '';
      state.config.lists = result.lists || [];
      state.selectedListId = result.defaultListId || '';
      
      // Check that the configuration is valid
      if (!state.config.serverUrl || !state.config.apiKey || state.config.lists.length === 0) {
        return false;
      }
      
      // Populate the dropdown list
      populateListSelect();
      
      return true;
    } catch (error) {
      console.error('Error while loading configuration:', error);
      return false;
    }
  }

  /**
   * Refresh lists from the API
   */
  async function refreshLists() {
    if (!state.config.serverUrl || !state.config.apiKey) {
      return;
    }
    
    // Button animation
    elements.refreshListsBtn.disabled = true;
    elements.refreshListsBtn.classList.add('spinning');
    
    try {
      const response = await fetch(`${state.config.serverUrl}/api/v1/lists`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${state.config.apiKey}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        state.config.lists = data.lists || [];
        
        // Save the new lists
        await browser.storage.local.set({ lists: state.config.lists });
        
        // Refresh the dropdown
        populateListSelect();
      }
    } catch (error) {
      console.error('Error while refreshing lists:', error);
    } finally {
      elements.refreshListsBtn.disabled = false;
      elements.refreshListsBtn.classList.remove('spinning');
    }
  }

  /**
   * Populate the list dropdown
   */
  function populateListSelect() {
    elements.listSelect.innerHTML = '';
    
    for (const list of state.config.lists) {
      const option = document.createElement('option');
      option.value = list.id;
      const listName = list.name || (window.i18n ? window.i18n.getMessage('unnamedList') : 'Unnamed list');
      const groupName = (list.groupName && list.groupName.toLowerCase() !== 'default') ? ` (${list.groupName})` : '';
      option.textContent = `${listName}${groupName}`;
      elements.listSelect.appendChild(option);
    }
    
    if (state.selectedListId) {
      elements.listSelect.value = state.selectedListId;
    }
  }

  /**
   * Extract information from the current page
   */
  async function extractPageInfo() {
    showPage('loading-page');
    setLoaderText(window.i18n ? window.i18n.getMessage('extractingInfo') : 'Extracting information...');
    
    try {
      // Get the active tab
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error(window.i18n ? window.i18n.getMessage('noActiveTab') : 'No active tab found');
      }
      
      const tab = tabs[0];
      
      // Inject and execute the content script if necessary
      let response;
      try {
        response = await browser.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
      } catch (e) {
        // The content script may not be loaded, inject it
        await browser.tabs.executeScript(tab.id, { file: 'js/content.js' });
        response = await browser.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
      }
      
      if (!response.success) {
        throw new Error(response.error || (window.i18n ? window.i18n.getMessage('extractionError') : 'Extraction error'));
      }
      
      // Update the state with the extracted data
      const data = response.data;
      state.currentItem = {
        url: data.url || tab.url,
        title: data.title || '',
        description: data.description || '',
        images: data.images || [],
        price: data.price,
        currency: data.currency || 'EUR',
        selectedImageIndex: 0
      };
      
      // Display the data in the form
      updateFormWithItemData();
      showPage('item-page');
      
    } catch (error) {
      console.error('Error during extraction:', error);
      showError(window.i18n ? window.i18n.getMessage('extractionError') : 'Could not extract information from this page.');
    }
  }

  /**
   * Update the form with item data
   */
  function updateFormWithItemData() {
    elements.titleInput.value = state.currentItem.title;
    elements.noteInput.value = state.currentItem.description;
    
    if (state.currentItem.price !== null) {
      elements.priceInput.value = state.currentItem.price;
    }
    
    elements.currencySelect.value = state.currentItem.currency;
    
    // Update the image display
    updateImageDisplay();
  }

  /**
   * Update the current image display
   */
  function updateImageDisplay() {
    const images = state.currentItem.images;
    const index = state.currentItem.selectedImageIndex;
    
    if (images.length === 0) {
      elements.previewImage.style.display = 'none';
      elements.noImage.style.display = 'flex';
      elements.imageCounter.textContent = '0/0';
      elements.selectedImageInput.value = '';
      elements.prevImageBtn.disabled = true;
      elements.nextImageBtn.disabled = true;
    } else {
      elements.previewImage.src = images[index];
      elements.previewImage.style.display = 'block';
      elements.noImage.style.display = 'none';
      elements.imageCounter.textContent = `${index + 1}/${images.length}`;
      elements.selectedImageInput.value = images[index];
      elements.prevImageBtn.disabled = images.length <= 1;
      elements.nextImageBtn.disabled = images.length <= 1;
    }
  }

  /**
   * Navigate between images
   */
  function navigateImages(direction) {
    const images = state.currentItem.images;
    if (images.length <= 1) return;
    
    let newIndex = state.currentItem.selectedImageIndex + direction;
    
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    
    state.currentItem.selectedImageIndex = newIndex;
    updateImageDisplay();
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(event) {
    event.preventDefault();
    
    const listId = elements.listSelect.value;
    if (!listId) {
      alert(window.i18n ? window.i18n.getMessage('pleaseSelectList') : 'Please select a list');
      return;
    }
    
    // Set button to loading state
    elements.addButton.disabled = true;
    elements.addButtonText.textContent = window.i18n ? window.i18n.getMessage('adding') : 'Adding...';
    
    try {
      // Prepare data for the API
      const itemData = {
        listId: listId,
        name: elements.titleInput.value.trim(),
        url: state.currentItem.url,
        note: elements.noteInput.value.trim() || null,
        imageUrl: elements.selectedImageInput.value || null,
        quantity: 1,
        mostWanted: false
      };
      
      // Add price if present
      const priceValue = parseFloat(elements.priceInput.value);
      if (!isNaN(priceValue) && priceValue > 0) {
        itemData.price = priceValue;
        itemData.currency = elements.currencySelect.value;
      }
      
      // Call the API
      const response = await fetch(`${state.config.serverUrl}/api/v1/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(itemData)
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Save the list as default
        await browser.storage.local.set({ defaultListId: listId });
        
        // Display success
        const listName = state.config.lists.find(l => l.id === listId)?.name || 'list';
        elements.successMessage.textContent = window.i18n 
          ? window.i18n.getMessage('itemAdded', { name: itemData.name, list: listName })
          : `"${itemData.name}" has been added to "${listName}"!`;
        
        showPage('success-page');
      } else if (response.status === 401) {
        showError(window.i18n ? window.i18n.getMessage('errorInvalidKey') : 'Invalid or expired API key.');
      } else if (response.status === 403) {
        showError(window.i18n ? window.i18n.getMessage('errorNoPermission') : 'You do not have permission to add to this list.');
      } else if (response.status === 404) {
        showError(window.i18n ? window.i18n.getMessage('errorListNotFound') : 'List not found. It may have been deleted.');
      } else {
        const error = await response.json().catch(() => ({}));
        showError(window.i18n 
          ? window.i18n.getMessage('errorAddingItem', { error: error.error || response.statusText })
          : `Error adding item: ${error.error || response.statusText}`);
      }
      
    } catch (error) {
      console.error('Error while adding:', error);
      showError(window.i18n ? window.i18n.getMessage('errorNetworkPopup') : 'Could not contact the server.');
    } finally {
      elements.addButton.disabled = false;
      elements.addButtonText.textContent = window.i18n ? window.i18n.getMessage('addToList') : 'Add to list';
    }
  }

  /**
   * Open the Wishlist page
   */
  function openWishlist() {
    if (state.config.serverUrl) {
      // Open /lists directly to avoid login redirect issues
      browser.tabs.create({ url: `${state.config.serverUrl}/lists` });
    }
  }

  /**
   * Open the currently selected list in the dropdown
   */
  function openSelectedList() {
    const listId = elements.listSelect.value;
    if (state.config.serverUrl && listId) {
      // Use /go route to automatically switch group if needed
      browser.tabs.create({ url: `${state.config.serverUrl}/lists/${listId}/go` });
    }
  }

  /**
   * Open the current list
   */
  function viewList() {
    const listId = elements.listSelect.value || state.selectedListId;
    if (state.config.serverUrl && listId) {
      // Use /go route to automatically switch group if needed
      browser.tabs.create({ url: `${state.config.serverUrl}/lists/${listId}/go` });
    } else if (state.config.serverUrl) {
      browser.tabs.create({ url: state.config.serverUrl });
    }
    window.close();
  }

  /**
   * Open the options page
   */
  function openOptions() {
    browser.runtime.openOptionsPage();
  }

  /**
   * Display a specific page
   */
  function showPage(pageId) {
    const pages = ['loading-page', 'item-page', 'success-page', 'error-page', 'config-page'];
    
    for (const id of pages) {
      const page = document.getElementById(id);
      if (page) {
        page.classList.toggle('hidden', id !== pageId);
      }
    }
  }

  /**
   * Update the loader text
   */
  function setLoaderText(text) {
    elements.loaderText.textContent = text;
  }

  /**
   * Display an error
   */
  function showError(message) {
    elements.errorMessage.textContent = message;
    showPage('error-page');
  }

})();
