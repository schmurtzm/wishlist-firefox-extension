/**
 * Content script for Wishlist Quick Add
 * Extracts information from the current page (title, images, price, description)
 */

(function() {
  'use strict';

  /**
   * Page parser to extract product information
   */
  class PageParser {
    constructor() {
      this.minRatio = 0.5;
      this.maxRatio = 2.0;
      this.minDimensionSize = 100;
    }

    /**
     * Parse the current page and return the extracted information
     */
    parseCurrentPage() {
      return {
        url: this.getCanonicalUrl(),
        title: this.getTitle(),
        description: this.getDescription(),
        images: this.getImages(),
        price: this.getPrice(),
        currency: this.getCurrency()
      };
    }

    /**
     * Get the canonical URL or the current URL
     */
    getCanonicalUrl() {
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && canonical.href) {
        return canonical.href;
      }
      const ogUrl = this.getMetaValue('og:url');
      if (ogUrl) {
        return ogUrl;
      }
      return document.URL;
    }

    /**
     * Get the product title
     */
    getTitle() {
      // Priority: og:title > h1 > title
      const ogTitle = this.getMetaValue('og:title');
      if (ogTitle) return this.cleanString(ogTitle);

      const productTitle = document.querySelector('[itemprop="name"]');
      if (productTitle) return this.cleanString(productTitle.textContent);

      const h1 = document.querySelector('h1');
      if (h1) return this.cleanString(h1.textContent);

      return this.cleanString(document.title);
    }

    /**
     * Get the description
     */
    getDescription() {
      const ogDesc = this.getMetaValue('og:description');
      if (ogDesc) return this.cleanString(ogDesc);

      const metaDesc = this.getMetaValue('description');
      if (metaDesc) return this.cleanString(metaDesc);

      const productDesc = document.querySelector('[itemprop="description"]');
      if (productDesc) return this.cleanString(productDesc.textContent);

      return '';
    }

    /**
     * Get images from the page
     */
    getImages() {
      // Amazon-specific extraction
      if (this.isAmazon()) {
        const amazonImages = this.getAmazonImages();
        if (amazonImages.length > 0) {
          return amazonImages;
        }
      }

      const images = [];
      const seenUrls = new Set();

      // Priority 1: og:image
      const ogImage = this.getMetaValue('og:image');
      if (ogImage) {
        const imgUrl = this.resolveUrl(ogImage);
        if (imgUrl && !seenUrls.has(imgUrl)) {
          images.push(imgUrl);
          seenUrls.add(imgUrl);
        }
      }

      // Priority 2: twitter:image
      const twitterImage = this.getMetaValue('twitter:image');
      if (twitterImage) {
        const imgUrl = this.resolveUrl(twitterImage);
        if (imgUrl && !seenUrls.has(imgUrl)) {
          images.push(imgUrl);
          seenUrls.add(imgUrl);
        }
      }

      // Priority 3: images with itemprop="image"
      const productImages = document.querySelectorAll('[itemprop="image"]');
      productImages.forEach(img => {
        const imgUrl = this.resolveUrl(img.src || img.content || img.href);
        if (imgUrl && !seenUrls.has(imgUrl)) {
          images.push(imgUrl);
          seenUrls.add(imgUrl);
        }
      });

      // Priority 4: all images from the page (filtered by size)
      const allImages = document.getElementsByTagName('img');
      const imgCandidates = [];

      for (const img of allImages) {
        if (!img.src || img.src.startsWith('data:')) continue;
        
        const imgUrl = this.resolveUrl(img.src);
        if (!imgUrl || seenUrls.has(imgUrl)) continue;

        const width = img.naturalWidth || img.scrollWidth || img.width || 0;
        const height = img.naturalHeight || img.scrollHeight || img.height || 0;
        
        if (width < this.minDimensionSize || height < this.minDimensionSize) continue;
        
        const ratio = width / height;
        if (ratio < this.minRatio || ratio > this.maxRatio) continue;

        imgCandidates.push({
          url: imgUrl,
          area: width * height
        });
      }

      // Sort by size (largest first)
      imgCandidates.sort((a, b) => b.area - a.area);
      
      for (const candidate of imgCandidates) {
        if (!seenUrls.has(candidate.url)) {
          images.push(candidate.url);
          seenUrls.add(candidate.url);
        }
      }

      return images;
    }

    /**
     * Get the price
     */
    getPrice() {
      // Amazon-specific detection
      if (this.isAmazon()) {
        const amazonPrice = this.getAmazonPrice();
        if (amazonPrice !== null) return amazonPrice;
      }

      // Schema.org price (content attribute has priority)
      const schemaPrice = document.querySelector('[itemprop="price"]');
      if (schemaPrice) {
        // Prefer the content attribute which is generally clean
        if (schemaPrice.content) {
          return this.parsePrice(schemaPrice.content);
        }
        const price = this.parsePrice(schemaPrice.textContent);
        if (price !== null) return price;
      }

      // JSON-LD
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLd) {
        try {
          const data = JSON.parse(script.textContent);
          const price = this.findPriceInJsonLd(data);
          if (price !== null) return price;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Meta product:price
      const metaPrice = this.getMetaValue('product:price:amount') || 
                        this.getMetaValue('og:price:amount');
      if (metaPrice) {
        return this.parsePrice(metaPrice);
      }

      // Heuristic search in the DOM
      const priceSelectors = [
        '.price', '.product-price', '.Price', '#price', 
        '[class*="price"]', '[class*="Price"]',
        '.amount', '.cost'
      ];

      for (const selector of priceSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const price = this.parsePrice(el.textContent);
          if (price !== null) return price;
        }
      }

      return null;
    }

    /**
     * Check if we are on Amazon
     */
    isAmazon() {
      return location.hostname.includes('amazon.');
    }

    /**
     * Amazon-specific price extraction
     * Amazon displays the price with separate spans for the integer and decimal parts
     */
    getAmazonPrice() {
      // Method 1: Price in the .a-offscreen span (accessible price) - most reliable
      const offscreenSelectors = [
        '#corePrice_feature_div .a-offscreen',
        '#corePriceDisplay_desktop_feature_div .a-offscreen',
        '.a-price[data-a-size="xl"] .a-offscreen',
        '.a-price[data-a-size="l"] .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '#priceblock_saleprice',
        '.a-price .a-offscreen'
      ];
      
      for (const selector of offscreenSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const price = this.parseAmazonPrice(el.textContent);
          if (price !== null) return price;
        }
      }

      // Method 2: Price in data attributes or hidden input
      const priceInput = document.querySelector('input[name="displayedPrice"]') ||
                         document.querySelector('#priceValue') ||
                         document.querySelector('[data-a-price]');
      if (priceInput) {
        const value = priceInput.value || priceInput.dataset.aPrice;
        if (value) {
          const price = this.parseAmazonPrice(value);
          if (price !== null) return price;
        }
      }

      // Method 3: Look for structured price with separate integer and fraction parts
      const priceWhole = document.querySelector('.a-price-whole, #priceblock_ourprice .a-price-whole, #corePrice_feature_div .a-price-whole');
      const priceFraction = document.querySelector('.a-price-fraction, #priceblock_ourprice .a-price-fraction, #corePrice_feature_div .a-price-fraction');
      
      if (priceWhole) {
        // Clean the integer part (remove thousands separators and trailing comma/dot)
        let whole = priceWhole.textContent.replace(/[^\d]/g, '');
        let fraction = priceFraction ? priceFraction.textContent.replace(/[^\d]/g, '') : '00';
        
        if (whole) {
          const price = parseFloat(`${whole}.${fraction}`);
          if (!isNaN(price)) return price;
        }
      }

      return null;
    }

    /**
     * Parse an Amazon price (handles US and EU formats)
     * US: $29.99 or $1,234.56
     * EU: 29,99 € or 1.234,56 €
     */
    parseAmazonPrice(priceStr) {
      if (!priceStr) return null;
      
      let cleaned = priceStr.toString().trim();
      
      // Detect format based on symbol or domain
      const isUSFormat = cleaned.includes('$') || 
                         location.hostname.includes('amazon.com') && !location.hostname.includes('.com.');
      
      // Remove currency symbols
      cleaned = cleaned.replace(/[^\d.,\s]/g, '').trim();
      
      if (!cleaned) return null;

      if (isUSFormat) {
        // US format: 1,234.56 -> comma = thousands, dot = decimal
        cleaned = cleaned.replace(/,/g, ''); // Remove commas (thousands)
      } else {
        // EU format: 1.234,56 -> dot = thousands, comma = decimal
        // Or simple format: 329,00
        if (/,\d{2}$/.test(cleaned)) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (/\.\d{2}$/.test(cleaned)) {
          // Already in correct format
          cleaned = cleaned.replace(/,/g, '');
        } else {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        }
      }

      const price = parseFloat(cleaned);
      return isNaN(price) ? null : price;
    }

    /**
     * Amazon-specific image extraction
     * Targets only the main product image, not related products
     */
    getAmazonImages() {
      const images = [];
      const seenUrls = new Set();

      /**
       * Convert an Amazon image URL to high resolution
       * Amazon URLs contain suffixes like ._AC_SX300_ that can be modified
       */
      const getHighResUrl = (url) => {
        if (!url) return null;
        // Remplacer les suffixes de taille par une version haute résolution
        // Pattern: ._XXX_SXnnn_ ou ._XXX_SYnnn_ ou ._SXnnn_ etc.
        return url
          .replace(/\._[A-Z]{2}_[A-Z]{2}\d+_\./, '._AC_SL1500_.')
          .replace(/\._[A-Z]{2}\d+_\./, '._AC_SL1500_.')
          .replace(/\._S[XY]\d+_\./, '._AC_SL1500_.');
      };

      // Method 1: Main image in the viewer (landingImage)
      const landingImage = document.querySelector('#landingImage, #imgBlkFront, #ebooksImgBlkFront');
      if (landingImage) {
        // Look for high resolution image in data-old-hires or data-a-dynamic-image
        let imgUrl = landingImage.getAttribute('data-old-hires');
        
        if (!imgUrl) {
          // data-a-dynamic-image contient un JSON avec différentes tailles
          const dynamicImage = landingImage.getAttribute('data-a-dynamic-image');
          if (dynamicImage) {
            try {
              const imgData = JSON.parse(dynamicImage);
              // Prendre l'URL avec la plus grande résolution
              const urls = Object.keys(imgData);
              if (urls.length > 0) {
                // Trier par taille (largeur * hauteur)
                urls.sort((a, b) => {
                  const [wa, ha] = imgData[a];
                  const [wb, hb] = imgData[b];
                  return (wb * hb) - (wa * ha);
                });
                imgUrl = urls[0]; // Plus grande image
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }

        if (!imgUrl) {
          imgUrl = getHighResUrl(landingImage.src);
        }

        if (imgUrl && !seenUrls.has(imgUrl)) {
          images.push(imgUrl);
          seenUrls.add(imgUrl);
        }
      }

      // Method 2: Thumbnails from the product gallery (altImages)
      const thumbnailContainer = document.querySelector('#altImages, #imageBlock_feature_div');
      if (thumbnailContainer) {
        const thumbnails = thumbnailContainer.querySelectorAll('img[src*="/images/I/"]');
        for (const thumb of thumbnails) {
          let imgUrl = getHighResUrl(thumb.src);
          
          // Ignore video images (play button overlay)
          if (imgUrl && imgUrl.includes('_play-button')) continue;
          
          if (imgUrl && !seenUrls.has(imgUrl)) {
            images.push(imgUrl);
            seenUrls.add(imgUrl);
          }
          
          // Limit to 5 images max to avoid excess
          if (images.length >= 5) break;
        }
      }

      // Method 3: Fallback to og:image if nothing found
      if (images.length === 0) {
        const ogImage = this.getMetaValue('og:image');
        if (ogImage) {
          const imgUrl = getHighResUrl(ogImage);
          if (imgUrl) {
            images.push(imgUrl);
          }
        }
      }

      return images;
    }

    /**
     * Get the currency
     */
    getCurrency() {
      // Amazon-specific detection
      if (this.isAmazon()) {
        const amazonCurrency = this.getAmazonCurrency();
        if (amazonCurrency) return amazonCurrency;
      }

      // Schema.org
      const schemaCurrency = document.querySelector('[itemprop="priceCurrency"]');
      if (schemaCurrency) {
        return schemaCurrency.content || schemaCurrency.textContent;
      }

      // Meta
      const metaCurrency = this.getMetaValue('product:price:currency') || 
                           this.getMetaValue('og:price:currency');
      if (metaCurrency) return metaCurrency;

      // JSON-LD
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLd) {
        try {
          const data = JSON.parse(script.textContent);
          const currency = this.findCurrencyInJsonLd(data);
          if (currency) return currency;
        } catch (e) {
          // Ignore parse errors
        }
      }

      return 'EUR'; // Default
    }

    /**
     * Detect currency on Amazon based on domain and displayed symbols
     */
    getAmazonCurrency() {
      const hostname = location.hostname;
      
      // Domain -> currency mapping
      const domainCurrencyMap = {
        'amazon.com': 'USD',
        'amazon.co.uk': 'GBP',
        'amazon.de': 'EUR',
        'amazon.fr': 'EUR',
        'amazon.it': 'EUR',
        'amazon.es': 'EUR',
        'amazon.nl': 'EUR',
        'amazon.be': 'EUR',
        'amazon.ca': 'CAD',
        'amazon.com.au': 'AUD',
        'amazon.co.jp': 'JPY',
        'amazon.cn': 'CNY',
        'amazon.in': 'INR',
        'amazon.com.br': 'BRL',
        'amazon.com.mx': 'MXN',
        'amazon.pl': 'PLN',
        'amazon.se': 'SEK',
        'amazon.sg': 'SGD',
        'amazon.ae': 'AED',
        'amazon.sa': 'SAR',
        'amazon.com.tr': 'TRY'
      };

      // Search by domain
      for (const [domain, currency] of Object.entries(domainCurrencyMap)) {
        if (hostname.includes(domain)) {
          return currency;
        }
      }

      // Fallback: detect symbol in displayed price
      const priceElement = document.querySelector('.a-price-symbol, #priceblock_ourprice, #corePrice_feature_div .a-offscreen');
      if (priceElement) {
        const text = priceElement.textContent;
        if (text.includes('$')) return 'USD';
        if (text.includes('£')) return 'GBP';
        if (text.includes('€')) return 'EUR';
        if (text.includes('¥')) return 'JPY';
      }

      return null;
    }

    /**
     * Find the price in a JSON-LD object
     */
    findPriceInJsonLd(data) {
      if (!data) return null;

      if (Array.isArray(data)) {
        for (const item of data) {
          const price = this.findPriceInJsonLd(item);
          if (price !== null) return price;
        }
        return null;
      }

      if (data.offers) {
        return this.findPriceInJsonLd(data.offers);
      }

      if (data.price !== undefined) {
        return this.parsePrice(String(data.price));
      }

      return null;
    }

    /**
     * Find the currency in a JSON-LD object
     */
    findCurrencyInJsonLd(data) {
      if (!data) return null;

      if (Array.isArray(data)) {
        for (const item of data) {
          const currency = this.findCurrencyInJsonLd(item);
          if (currency) return currency;
        }
        return null;
      }

      if (data.offers) {
        return this.findCurrencyInJsonLd(data.offers);
      }

      if (data.priceCurrency) {
        return data.priceCurrency;
      }

      return null;
    }

    /**
     * Parse a price string and return a number
     */
    parsePrice(priceStr) {
      if (!priceStr) return null;
      
      // Clean the string
      let cleaned = priceStr.toString()
        .replace(/[^\d.,\s-]/g, '') // Remove everything except digits, dots, commas
        .trim();

      if (!cleaned) return null;

      // Detect duplicated prices (e.g., "329,00329" or "189,99189")
      // Pattern: number + decimal separator + 2 digits + repetition of the number
      const duplicatePattern = /^(\d+)[.,](\d{2})(\d+)$/;
      const duplicateMatch = cleaned.match(duplicatePattern);
      if (duplicateMatch) {
        const [, intPart, decPart, suffix] = duplicateMatch;
        // Check if the suffix is the start of the price (Amazon duplication pattern)
        if (intPart.startsWith(suffix) || suffix.startsWith(intPart)) {
          cleaned = `${intPart}.${decPart}`;
          return parseFloat(cleaned);
        }
      }

      // Handle European (1 234,56) and American (1,234.56) formats
      // If contains a comma followed by 2 digits at the end, it's probably the decimal separator
      if (/,\d{2}$/.test(cleaned)) {
        cleaned = cleaned.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/\s/g, '').replace(/,/g, '');
      }

      const price = parseFloat(cleaned);
      return isNaN(price) ? null : price;
    }

    /**
     * Get the value of a meta tag
     */
    getMetaValue(name) {
      const metas = document.getElementsByTagName('meta');
      for (const meta of metas) {
        if (meta.getAttribute('property') === name || 
            meta.getAttribute('name') === name) {
          return meta.content;
        }
      }
      return null;
    }

    /**
     * Resolve a relative URL to an absolute URL
     */
    resolveUrl(url) {
      if (!url || !url.trim()) return null;
      
      url = url.trim();

      // Already an absolute URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      // Protocol-relative URL
      if (url.startsWith('//')) {
        return location.protocol + url;
      }

      // Relative URL
      try {
        return new URL(url, location.href).href;
      } catch (e) {
        return null;
      }
    }

    /**
     * Clean a string
     */
    cleanString(str) {
      if (!str) return '';
      return str.trim()
        .replace(/\s+/g, ' ')
        .replace(/[\n\r\t]/g, ' ');
    }
  }

  // Create the parser instance
  const parser = new PageParser();

  // Listen for messages from the popup
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageInfo') {
      try {
        const pageInfo = parser.parseCurrentPage();
        sendResponse({ success: true, data: pageInfo });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    return true; // Keep the channel open for async sendResponse
  });
})();
