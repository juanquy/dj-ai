/**
 * Global Theme Switcher for DJAI
 * This script handles theme switching across the application
 */

// Initialize the theme system
const themeManager = {
  // Theme options
  themes: {
    light: {
      name: 'light',
      icon: '☀️',
      metaColor: '#ff5500'
    },
    dark: {
      name: 'dark',
      icon: '🌙',
      metaColor: '#121212'
    }
  },
  
  // Set current theme
  currentTheme: 'light',
  
  // Initialize theme system
  init: function() {
    console.log('Theme manager initializing');
    
    // Set initial theme from saved preference or system preference
    this.loadSavedTheme();
    
    // Set up event listeners once DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
      this.setupThemeToggle();
      
      // Listen for system preference changes
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
          if (!localStorage.getItem('theme')) { // Only auto-switch if user hasn't explicitly set a preference
            this.applyTheme(e.matches ? 'dark' : 'light');
          }
        });
      }
    });
  },
  
  // Load saved theme from localStorage or use system preference
  loadSavedTheme: function() {
    // First check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const themeParam = urlParams.get('theme');
    
    if (themeParam === 'dark' || themeParam === 'light') {
      this.applyTheme(themeParam);
      return;
    }
    
    // Then check localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.applyTheme(savedTheme);
      return;
    }
    
    // Then check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.applyTheme('dark');
      return;
    }
    
    // Default to light theme
    this.applyTheme('light');
  },
  
  // Apply theme to document
  applyTheme: function(themeName) {
    if (!this.themes[themeName]) {
      console.error('Invalid theme:', themeName);
      return;
    }
    
    console.log('Applying theme:', themeName);
    
    // Set the theme attribute on both html and body elements for maximum compatibility
    document.documentElement.setAttribute('data-theme', themeName);
    document.body.setAttribute('data-theme', themeName);
    
    // Store current theme
    this.currentTheme = themeName;
    
    // Store the theme preference in localStorage
    localStorage.setItem('theme', themeName);
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', this.themes[themeName].metaColor);
    }
    
    // Update toggle state if it exists
    this.updateToggleState();
  },
  
  // Toggle between light and dark themes
  toggleTheme: function() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
  },
  
  // Set up theme toggle button
  setupThemeToggle: function() {
    const themeToggle = document.getElementById('theme-toggle');
    
    if (themeToggle) {
      console.log('Setting up theme toggle button');
      
      // Update toggle state based on current theme
      this.updateToggleState();
      
      // Add event listener
      themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        this.applyTheme(newTheme);
      });
    } else {
      console.log('Theme toggle button not found on this page');
    }
  },
  
  // Update toggle state based on current theme
  updateToggleState: function() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.checked = (this.currentTheme === 'dark');
    }
  }
};

// Initialize theme system immediately
themeManager.init();