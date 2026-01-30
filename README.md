# Wishlist Quick Add - Firefox Extension

Firefox extension to quickly add items to your Wishlist instance from any website.


## Features

- 🔍 Automatic extraction of product information (title, price, images)
- 🛒 Special support for Amazon (price, images, currency)
- 📋 Destination list selection
- 🖼️ Navigate between multiple images
- ✏️ Edit information before adding
- 🔐 Secure authentication via API key

## Installation

1. Open Firefox Nightly and go to `about:debugging`
2. Click on "This Firefox" then "Load Temporary Add-on..."
3. Select the `manifest.json` file

> **Note:** The Wishlist server must have the API enabled. See https://github.com/cmintey/wishlist/pull/636

## Configuration

1. Click on the extension icon then "Options" (or right-click > "Options")
2. Enter your Wishlist server URL (e.g., `https://wishlist.example.com`)
3. Generate an API key:
   - Log in to Wishlist
   - Go to **Account** → **API Keys**
   - Click on **Create API key**
   - Copy the generated key
4. Paste the key in the extension
5. Click "Fetch my lists"
6. Choose a default list (optional)
7. Save

## Usage

1. Navigate to a product on any e-commerce website
2. Click on the extension icon
3. Information is automatically extracted
4. Edit if necessary (title, price, image)
5. Choose the destination list
6. Click "Add to list"

## Screenshots

<img width="245" height="775" alt="image" src="https://github.com/user-attachments/assets/c8e0409e-93f1-484f-b9d8-ddd25225dacf" />
  
<img width="310" height="785" alt="image" src="https://github.com/user-attachments/assets/babcd131-0d9d-4e1c-a129-68cb3d48aa7d" />


## Website Support

The extension works on most e-commerce sites thanks to Open Graph and Schema.org metadata extraction.

### Sites with optimized support:
- Amazon (FR, DE, ES, IT, UK, US) - price, images, currency
- Sites with Open Graph tags
- Sites with Schema.org Product

## Development

### File Structure

```
extension_firefox_wishlist/
├── manifest.json          # Firefox configuration
├── popup.html             # Popup interface
├── options.html           # Options page
├── css/
│   └── style.css         # Styles
├── js/
│   ├── popup.js          # Popup logic
│   ├── options.js        # Options logic
│   └── content.js        # Extraction script
└── icons/                 # Icons
```

### Compilation and Testing

No compilation needed, the extension uses vanilla JavaScript.

To test:
1. Load the extension in `about:debugging`
2. Open the browser console to see logs
3. Modify files and reload the extension

## License

MIT
