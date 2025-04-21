/**
 * DJAI Lyrics Video Manager
 * Manages real-time video generation and mixing based on lyrics
 */
class LyricsVideoManager {
  constructor(options = {}) {
    // Configuration
    this.segmentPollingInterval = options.pollingInterval || 500; // ms
    this.preloadSegmentCount = options.preloadSegmentCount || 3;
    this.transitionDuration = options.transitionDuration || 500; // ms
    this.useFadeTransition = options.useFadeTransition !== undefined ? options.useFadeTransition : true;
    this.beatSyncTransitions = options.beatSyncTransitions !== undefined ? options.beatSyncTransitions : true;
    
    // State
    this.isActive = false;
    this.isInitialized = false;
    this.currentTrackId = null;
    this.currentTrackData = null;
    this.currentTime = 0;
    this.currentVideoElement = null;
    this.nextVideoElement = null;
    this.currentSegment = null;
    this.segmentHistory = [];
    this.audioFeatures = {};
    this.pollingTimer = null;
    this.lastBeatTime = 0;
    this.beatsPerMinute = 120;
    
    // Container element
    this.container = options.container || document.createElement('div');
    this.container.classList.add('lyrics-video-container');
    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';
    
    // Video elements
    this.setupVideoElements();
    
    // Track current audio information
    this.analyser = null;
    this.beatDetector = null;
    
    // Callbacks
    this.onSegmentChange = options.onSegmentChange || null;
    this.onError = options.onError || null;
  }
  
  /**
   * Set up video elements for smooth transitions
   */
  setupVideoElements() {
    // Clear container
    this.container.innerHTML = '';
    
    // Create two video elements for smooth transitions
    this.currentVideoElement = document.createElement('video');
    this.nextVideoElement = document.createElement('video');
    
    // Configure video elements
    [this.currentVideoElement, this.nextVideoElement].forEach((videoEl, index) => {
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.className = 'lyrics-video';
      videoEl.style.position = 'absolute';
      videoEl.style.top = '0';
      videoEl.style.left = '0';
      videoEl.style.width = '100%';
      videoEl.style.height = '100%';
      videoEl.style.objectFit = 'cover';
      videoEl.style.transition = `opacity ${this.transitionDuration}ms ease-in-out`;
      
      // Set initial state
      if (index === 0) {
        videoEl.style.opacity = '1';
      } else {
        videoEl.style.opacity = '0';
      }
      
      // Add to container
      this.container.appendChild(videoEl);
      
      // Add error handling
      videoEl.addEventListener('error', (e) => {
        console.error('Video error:', e);
        if (this.onError) {
          this.onError(e);
        }
      });
    });
  }
  
  /**
   * Initialize with track data
   * @param {Object} trackData - Track information
   * @param {Object} audioContext - Web Audio context
   * @param {Object} analyserNode - Audio analyser node
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(trackData, audioContext, analyserNode) {
    if (!trackData || !trackData.id) {
      console.error('Invalid track data for lyrics video manager');
      return false;
    }
    
    try {
      this.currentTrackId = trackData.id;
      this.currentTrackData = trackData;
      this.isInitialized = false;
      this.currentTime = 0;
      this.segmentHistory = [];
      
      console.log(`Initializing lyrics video manager for track: ${trackData.title}`);
      
      // Set up audio analysis
      if (audioContext && analyserNode) {
        this.initializeAudioAnalysis(audioContext, analyserNode);
      }
      
      // Initialize buffer on the server
      const endpoint = '/api/vj/content/lyrics-buffer/init';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: this.currentTrackId,
          trackData: this.currentTrackData,
          audioFeatures: this.audioFeatures
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initialize lyrics buffer: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`Lyrics buffer initialized with ${data.segmentCount} segments`);
        this.isInitialized = true;
        
        // Start polling for segments
        this.startPolling();
        
        return true;
      } else {
        console.error('Failed to initialize lyrics buffer:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error initializing lyrics video manager:', error);
      if (this.onError) {
        this.onError(error);
      }
      return false;
    }
  }
  
  /**
   * Initialize audio analysis
   * @param {Object} audioContext - Web Audio context 
   * @param {Object} analyserNode - Audio analyser node
   */
  initializeAudioAnalysis(audioContext, analyserNode) {
    if (!audioContext || !analyserNode) return;
    
    this.analyser = analyserNode;
    
    // IMPORTANT: We should not disconnect or reconnect audio nodes here
    // as it might interfere with the main audio routing
    console.log("LyricsVideoManager: Initializing audio analysis with existing audio nodes");
    
    // Create a simple beat detector that only observes - doesn't modify the audio graph
    this.beatDetector = {
      dataArray: new Uint8Array(analyserNode.frequencyBinCount),
      lastVolume: 0,
      threshold: 1.5, // Adjust based on sensitivity needed
      minInterval: 250, // Minimum ms between beats to prevent false positives
      
      update: () => {
        try {
          analyserNode.getByteFrequencyData(this.beatDetector.dataArray);
          
          // Focus on bass frequencies (adjust these indexes based on your FFT size)
          const bassSum = this.beatDetector.dataArray.slice(0, 10).reduce((acc, val) => acc + val, 0);
          const currentVolume = bassSum / 10;
          
          // Detect significant increase in volume
          const now = Date.now();
          if (currentVolume > this.beatDetector.lastVolume * this.beatDetector.threshold && 
              now - this.lastBeatTime > this.beatDetector.minInterval) {
            this.lastBeatTime = now;
            this.beatsPerMinute = 60000 / (now - this.lastBeatTime);
            
            // If beat sync is enabled, this is a good time to change segments
            if (this.beatSyncTransitions && this.segmentHistory.length > 1) {
              this.checkForSegmentTransition(true); // Force transition on beat
            }
          }
          
          this.beatDetector.lastVolume = currentVolume;
          
          // Update audio features for next segment request
          this.updateAudioFeatures();
        } catch (err) {
          console.error("Error in beat detector update:", err);
        }
      }
    };
    
    console.log("LyricsVideoManager: Audio analysis initialized successfully");
  }
  
  /**
   * Update audio features based on current analysis
   */
  updateAudioFeatures() {
    if (!this.analyser) return;
    
    const dataArray = this.beatDetector.dataArray;
    if (!dataArray || dataArray.length === 0) return;
    
    // Calculate energy values for different frequency bands
    const bassEnd = Math.floor(dataArray.length * 0.1);
    const midEnd = Math.floor(dataArray.length * 0.5);
    
    // Bass energy (0-10% of frequencies)
    const bassSum = dataArray.slice(0, bassEnd).reduce((acc, val) => acc + val, 0);
    const bassEnergy = bassSum / (bassEnd * 255);
    
    // Mid energy (10-50% of frequencies)
    const midSum = dataArray.slice(bassEnd, midEnd).reduce((acc, val) => acc + val, 0);
    const midEnergy = midSum / ((midEnd - bassEnd) * 255);
    
    // High energy (50-100% of frequencies)
    const highSum = dataArray.slice(midEnd).reduce((acc, val) => acc + val, 0);
    const highEnergy = highSum / ((dataArray.length - midEnd) * 255);
    
    // Overall energy
    const totalEnergy = (bassEnergy + midEnergy + highEnergy) / 3;
    
    this.audioFeatures = {
      energy: totalEnergy,
      bassEnergy,
      midEnergy,
      highEnergy,
      bpm: this.beatsPerMinute || this.currentTrackData?.bpm || 120
    };
  }
  
  /**
   * Start polling for video segments
   */
  startPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    
    this.isActive = true;
    
    // Initial fetch immediately
    this.fetchCurrentSegment();
    
    // Then start polling
    this.pollingTimer = setInterval(() => {
      this.fetchCurrentSegment();
    }, this.segmentPollingInterval);
  }
  
  /**
   * Stop polling and clear resources
   */
  stop() {
    this.isActive = false;
    
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    // Pause videos
    if (this.currentVideoElement) {
      this.currentVideoElement.pause();
    }
    
    if (this.nextVideoElement) {
      this.nextVideoElement.pause();
    }
  }
  
  /**
   * Fetch the current video segment based on playback time
   */
  async fetchCurrentSegment() {
    if (!this.isInitialized || !this.isActive || !this.currentTrackId) return;
    
    try {
      // Update beat detection
      if (this.beatDetector) {
        this.beatDetector.update();
      }
      
      const endpoint = '/api/vj/content/lyrics-buffer/segment';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackId: this.currentTrackId,
          currentTime: this.currentTime,
          audioFeatures: this.audioFeatures
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch segment: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.segment) {
        this.processNewSegment(data.segment);
      }
    } catch (error) {
      console.error('Error fetching segment:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }
  
  /**
   * Process a new segment and update videos if needed
   * @param {Object} segmentData - Video segment data
   */
  processNewSegment(segmentData) {
    if (!segmentData || !segmentData.url) return;
    
    // Add to history if new
    const isNewSegment = !this.currentSegment || 
      (this.currentSegment.url !== segmentData.url);
    
    if (isNewSegment) {
      // Store current segment
      this.segmentHistory.push(segmentData);
      
      // Keep history limited
      if (this.segmentHistory.length > 10) {
        this.segmentHistory.shift();
      }
      
      // Check if we should switch videos
      this.checkForSegmentTransition();
    }
  }
  
  /**
   * Check if we should transition to a new video segment
   * @param {boolean} forceTransition - Force transition regardless of timing
   */
  checkForSegmentTransition(forceTransition = false) {
    // No need to transition if we only have one segment
    if (this.segmentHistory.length <= 1) return;
    
    // Get the latest segment
    const latestSegment = this.segmentHistory[this.segmentHistory.length - 1];
    
    // If this is a new segment or force transition is requested
    if ((this.currentSegment?.url !== latestSegment.url) || forceTransition) {
      this.transitionToNewVideo(latestSegment);
    }
  }
  
  /**
   * Transition to a new video
   * @param {Object} newSegment - New segment data
   */
  transitionToNewVideo(newSegment) {
    if (!newSegment || !newSegment.url) return;
    
    // Set as current segment
    this.currentSegment = newSegment;
    
    // Prepare the next video with the new segment
    this.nextVideoElement.src = newSegment.url;
    this.nextVideoElement.load();
    
    // When ready, perform the transition
    this.nextVideoElement.oncanplay = () => {
      // Start playing the next video
      this.nextVideoElement.play()
        .then(() => {
          // Perform crossfade transition
          this.nextVideoElement.style.opacity = '1';
          this.currentVideoElement.style.opacity = '0';
          
          // After transition completes, swap the elements
          setTimeout(() => {
            // Swap video elements
            const temp = this.currentVideoElement;
            this.currentVideoElement = this.nextVideoElement;
            this.nextVideoElement = temp;
            
            // Reset the next video element
            this.nextVideoElement.style.opacity = '0';
            
            // Notify of segment change
            if (this.onSegmentChange) {
              this.onSegmentChange(newSegment);
            }
          }, this.transitionDuration);
        })
        .catch(err => {
          console.error('Error playing next video:', err);
        });
    };
  }
  
  /**
   * Update current playback time
   * @param {number} time - Current time in seconds
   */
  updateTime(time) {
    this.currentTime = time * 1000; // Convert to milliseconds
  }
  
  /**
   * Set current track data and reinitialize
   * @param {Object} trackData - Track information
   * @param {Object} audioContext - Web Audio context
   * @param {Object} analyserNode - Audio analyser node
   */
  async setTrack(trackData, audioContext, analyserNode) {
    if (this.currentTrackId === trackData.id) {
      // Already initialized for this track
      return;
    }
    
    // Stop current polling
    this.stop();
    
    // Initialize with new track
    return this.initialize(trackData, audioContext, analyserNode);
  }
}

// Export for global use
window.LyricsVideoManager = LyricsVideoManager;