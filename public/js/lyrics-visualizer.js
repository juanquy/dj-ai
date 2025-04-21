/**
 * DJAI Lyrics Visualizer
 * Displays lyrics synchronized with tracks, can be overlaid on videos
 */
class LyricsVisualizer {
  constructor(options = {}) {
    // Core elements
    this.container = options.container || document.createElement('div');
    this.lyricsElement = null;
    this.currentTrack = null;
    this.lyrics = null;
    this.visible = options.visible !== undefined ? options.visible : true;
    this.currentTime = 0;
    this.duration = 0;
    this.animationId = null;
    this.lastLyricUpdateTime = 0;
    this.updateInterval = options.updateInterval || 500; // Update lyrics every 500ms
    
    // Style settings
    this.textColor = options.textColor || '#ffffff';
    this.fontSize = options.fontSize || '1.5rem';
    this.fontFamily = options.fontFamily || '"Montserrat", sans-serif';
    this.textShadow = options.textShadow || '0 0 8px rgba(0, 0, 0, 0.8)';
    this.backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.5)';
    this.position = options.position || 'bottom'; // 'top', 'bottom', 'middle'
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the visualizer
   */
  init() {
    // Create lyrics container
    this.lyricsElement = document.createElement('div');
    this.lyricsElement.className = 'lyrics-container';
    
    // Add styles
    this.lyricsElement.style.position = 'absolute';
    this.lyricsElement.style.zIndex = '10';
    this.lyricsElement.style.width = '100%';
    this.lyricsElement.style.padding = '1rem';
    this.lyricsElement.style.textAlign = 'center';
    this.lyricsElement.style.transition = 'opacity 0.5s ease';
    this.lyricsElement.style.color = this.textColor;
    this.lyricsElement.style.fontSize = this.fontSize;
    this.lyricsElement.style.fontFamily = this.fontFamily;
    this.lyricsElement.style.textShadow = this.textShadow;
    this.lyricsElement.style.backgroundColor = this.backgroundColor;
    this.lyricsElement.style.opacity = this.visible ? '1' : '0';
    
    // Set position
    switch (this.position) {
      case 'top':
        this.lyricsElement.style.top = '0';
        break;
      case 'middle':
        this.lyricsElement.style.top = '50%';
        this.lyricsElement.style.transform = 'translateY(-50%)';
        break;
      case 'bottom':
      default:
        this.lyricsElement.style.bottom = '0';
        break;
    }
    
    // Add to container
    this.container.appendChild(this.lyricsElement);
    
    // Set initial content
    this.updateLyricsDisplay('Ready for lyrics...');
  }
  
  /**
   * Update the lyrics display
   * @param {string} text - Text to display
   */
  updateLyricsDisplay(text) {
    if (!this.lyricsElement) return;
    
    const lines = text.split('\n');
    const htmlContent = lines.map(line => `<div>${line || '&nbsp;'}</div>`).join('');
    this.lyricsElement.innerHTML = htmlContent;
  }
  
  /**
   * Set lyrics for a track
   * @param {Object} track - Track data
   * @param {string} lyrics - Full lyrics text
   */
  setLyrics(track, lyrics) {
    this.currentTrack = track;
    this.lyrics = lyrics;
    
    if (!lyrics || lyrics.trim().length === 0) {
      this.updateLyricsDisplay('No lyrics available');
      return;
    }
    
    // Initial update
    this.updateCurrentLyrics();
  }
  
  /**
   * Update lyrics based on current time
   */
  updateCurrentLyrics() {
    if (!this.lyrics || !this.currentTrack) return;
    
    const now = Date.now();
    // Only update if enough time has passed since last update
    if (now - this.lastLyricUpdateTime < this.updateInterval) return;
    
    this.lastLyricUpdateTime = now;
    
    // Simple approach: divide lyrics into sections based on song progress
    const progress = this.currentTime / (this.duration || 1);
    
    const lines = this.lyrics.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return;
    
    const index = Math.min(Math.floor(progress * lines.length), lines.length - 1);
    
    // Get a window of lines around current position
    const windowSize = 4; // Show 4 lines at a time
    const start = Math.max(0, index - 1);
    const end = Math.min(lines.length, start + windowSize);
    
    const currentLyrics = lines.slice(start, end).join('\n');
    this.updateLyricsDisplay(currentLyrics);
  }
  
  /**
   * Set the current playback time
   * @param {number} time - Current time in seconds
   * @param {number} duration - Total duration in seconds
   */
  updateTime(time, duration) {
    this.currentTime = time;
    this.duration = duration;
    this.updateCurrentLyrics();
  }
  
  /**
   * Start the lyrics visualizer
   */
  start() {
    if (this.animationId) return;
    
    this.lyricsElement.style.opacity = '1';
    this.visible = true;
    
    // Start update loop
    const update = () => {
      this.updateCurrentLyrics();
      this.animationId = requestAnimationFrame(update);
    };
    
    this.animationId = requestAnimationFrame(update);
  }
  
  /**
   * Stop the lyrics visualizer
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  /**
   * Toggle lyrics visibility
   */
  toggleVisibility() {
    this.visible = !this.visible;
    this.lyricsElement.style.opacity = this.visible ? '1' : '0';
  }
  
  /**
   * Set position of lyrics overlay
   * @param {string} position - 'top', 'middle', or 'bottom'
   */
  setPosition(position) {
    this.position = position;
    
    // Reset all position properties
    this.lyricsElement.style.top = '';
    this.lyricsElement.style.bottom = '';
    this.lyricsElement.style.transform = '';
    
    // Set new position
    switch (position) {
      case 'top':
        this.lyricsElement.style.top = '0';
        break;
      case 'middle':
        this.lyricsElement.style.top = '50%';
        this.lyricsElement.style.transform = 'translateY(-50%)';
        break;
      case 'bottom':
      default:
        this.lyricsElement.style.bottom = '0';
        break;
    }
  }
  
  /**
   * Set style properties
   * @param {Object} styleOptions - Style options
   */
  setStyle(styleOptions) {
    if (styleOptions.textColor) {
      this.textColor = styleOptions.textColor;
      this.lyricsElement.style.color = this.textColor;
    }
    
    if (styleOptions.fontSize) {
      this.fontSize = styleOptions.fontSize;
      this.lyricsElement.style.fontSize = this.fontSize;
    }
    
    if (styleOptions.backgroundColor) {
      this.backgroundColor = styleOptions.backgroundColor;
      this.lyricsElement.style.backgroundColor = this.backgroundColor;
    }
    
    if (styleOptions.fontFamily) {
      this.fontFamily = styleOptions.fontFamily;
      this.lyricsElement.style.fontFamily = this.fontFamily;
    }
  }
}

// Make it globally available
window.LyricsVisualizer = LyricsVisualizer;