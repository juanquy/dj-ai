/**
 * DJAI Advanced Audio Mixer
 * Implements real DJ-style beatmatching, harmonic mixing, and advanced transitions
 */
class AudioMixer {
  constructor() {
    // Track management
    this.tracks = [];
    this.transitions = [];
    this.currentTrackIndex = 0;
    this.totalDuration = 0;
    this.hasAdvancedAnalysis = false;
    
    // Web Audio API components
    this.audioContext = null;
    this.gainNodes = [];
    this.audioElements = [];
    this.filters = {
      lowEQ: [], 
      midEQ: [], 
      highEQ: []
    };
    
    // For pitch/tempo control
    this.soundTouchProcessors = [];
    this.tempoAdjustments = [];
    
    // Visualization
    this.analyserNode = null;
    this.visualizerData = null;
    this.visualizerCanvas = null;
    this.animationId = null;
    
    // State management
    this.isPlaying = false;
    this.isCrossfading = false;
    this.progressInterval = null;
    
    // Customizable settings
    this.defaultTransitionTime = 5000; // Default crossfade duration in ms
    this.beatmatchingEnabled = true;   // Enable/disable beatmatching
    this.autoHarmonicMixing = true;    // Auto-adjust EQ for key compatibility
  }
  
  /**
   * Initialize the mixer with mix data
   * @param {Object} mixData - Mix data from the server
   */
  initialize(mixData) {
    // Clean up previous instances
    this.stop();
    
    // Store mix data
    this.tracks = mixData.tracks;
    this.transitions = mixData.transitions;
    this.totalDuration = mixData.totalDuration;
    this.hasAdvancedAnalysis = mixData.hasAdvancedAnalysis || false;
    this.currentTrackIndex = 0;
    
    // Initialize Web Audio API context
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
    } else if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    // Create audio elements and processing nodes for each track
    this.createAudioElements();
    
    // Set up the visualizer
    this.setupVisualizer();
    
    // Make the audio nodes accessible for external visualizers
    this.makeAudioNodesPublic();
    
    // Create transition markers
    this.createTransitionMarkers();
    
    // Set up player controls
    this.setupPlayerControls();
    
    // Log initialization status
    console.log('Advanced AudioMixer initialized:', {
      tracks: this.tracks.length,
      advancedAnalysis: this.hasAdvancedAnalysis,
      beatmatching: this.beatmatchingEnabled
    });
    
    // Update player UI
    this.updatePlayerInfo();
    
    return this;
  }
  
  /**
   * Create audio elements and processing nodes for each track
   */
  createAudioElements() {
    // Clear previous audio elements and nodes
    this.gainNodes = [];
    this.audioElements = [];
    this.filters.lowEQ = [];
    this.filters.midEQ = [];
    this.filters.highEQ = [];
    this.soundTouchProcessors = [];
    this.tempoAdjustments = [];
    
    // Create an audio element and processing chain for each track
    this.tracks.forEach((track, index) => {
      // Create audio element
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      
      // Determine stream URL based on source
      const streamUrl = track.uploaded
        ? `/api/upload/stream/${track.id}`
        : `/api/soundcloud/stream/${track.id}`;
        
      audio.src = streamUrl;
      
      // Create Web Audio API nodes
      const source = this.audioContext.createMediaElementSource(audio);
      
      // Create 3-band EQ (low, mid, high)
      const lowEQ = this.audioContext.createBiquadFilter();
      const midEQ = this.audioContext.createBiquadFilter();
      const highEQ = this.audioContext.createBiquadFilter();
      
      // Configure filters
      lowEQ.type = 'lowshelf';
      lowEQ.frequency.value = 320;
      lowEQ.gain.value = 0;
      
      midEQ.type = 'peaking';
      midEQ.frequency.value = 1000;
      midEQ.Q.value = 0.5;
      midEQ.gain.value = 0;
      
      highEQ.type = 'highshelf';
      highEQ.frequency.value = 3200;
      highEQ.gain.value = 0;
      
      // Create gain node for volume control
      const gainNode = this.audioContext.createGain();
      
      // Connect the audio processing chain:
      // source -> lowEQ -> midEQ -> highEQ -> gain -> destination
      source.connect(lowEQ);
      lowEQ.connect(midEQ);
      midEQ.connect(highEQ);
      highEQ.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Set initial volume (only the first track starts at full volume)
      gainNode.gain.value = index === 0 ? 1 : 0;
      
      // Store references to all audio nodes
      this.audioElements.push(audio);
      this.gainNodes.push(gainNode);
      this.filters.lowEQ.push(lowEQ);
      this.filters.midEQ.push(midEQ);
      this.filters.highEQ.push(highEQ);
      
      // Create a placeholder for SoundTouch processor (for pitch/tempo adjustment)
      // Note: We create this on-demand when needed to save resources
      this.soundTouchProcessors.push(null);
      this.tempoAdjustments.push(1.0); // 1.0 = normal speed
      
      // Add improved error handling with automatic retry
      let audioLoadRetries = 0;
      const MAX_AUDIO_RETRIES = 3;
      
      const handleAudioError = (e) => {
        console.error(`Error loading track ${track.title}:`, e);
        
        if (audioLoadRetries < MAX_AUDIO_RETRIES) {
          audioLoadRetries++;
          document.getElementById('mix-info').textContent = `Retrying track ${track.title} (${audioLoadRetries}/${MAX_AUDIO_RETRIES})...`;
          
          // Wait before retry with increasing delay
          setTimeout(() => {
            console.log(`Retrying track ${track.id}, attempt ${audioLoadRetries}`);
            
            // Force reload stream URL by adding cache buster
            const cacheBuster = Date.now();
            const streamUrl = track.uploaded
              ? `/api/upload/stream/${track.id}?cb=${cacheBuster}`
              : `/api/soundcloud/stream/${track.id}?cb=${cacheBuster}`;
              
            audio.src = streamUrl;
            audio.load(); // Explicitly reload
            
            if (this.isPlaying && index === this.currentTrackIndex) {
              audio.play().catch(err => {
                console.error('Error during retry playback:', err);
              });
            }
          }, 1000 * Math.pow(2, audioLoadRetries - 1)); // Exponential backoff: 1s, 2s, 4s
        } else {
          document.getElementById('mix-info').textContent = `Error loading track: ${track.title}. Please try another track.`;
          
          // If this is the current track, try to skip to next
          if (index === this.currentTrackIndex && this.tracks.length > 1) {
            console.log("Auto-skipping to next track due to persistent errors");
            setTimeout(() => this.nextTrack(), 1000);
          }
        }
      };
      
      audio.addEventListener('error', handleAudioError);
      
      // Also catch other playback issues
      audio.addEventListener('stalled', () => {
        console.warn(`Playback stalled for track ${track.title}`);
        // Only treat as error if it stays stalled for 5+ seconds
        const stalledTimer = setTimeout(() => handleAudioError(new Error('Playback stalled')), 5000);
        audio.addEventListener('playing', () => clearTimeout(stalledTimer), {once: true});
      });
      
      // Set up transition to next track when this one reaches transition point
      audio.addEventListener('timeupdate', () => {
        if (index !== this.currentTrackIndex) return; // Only monitor current track
        
        // Find the transition for this track
        const transition = this.transitions.find(t => t.fromTrack === track.id);
        
        if (transition && !this.isCrossfading) {
          const currentTime = audio.currentTime * 1000; // Convert to ms
          const transitionPoint = transition.transitionPoint;
          
          // Start transition when we reach the transition point
          if (currentTime >= transitionPoint && currentTime < transitionPoint + 500) {
            this.isCrossfading = true;
            this.startAdvancedTransition(transition);
          }
        }
        
        // Update the progress bar
        this.updateProgress();
      });
      
      // Handle track end (fallback if transition doesn't work)
      audio.addEventListener('ended', () => {
        if (this.currentTrackIndex === index) {
          this.nextTrack();
        }
      });
    });
  }
  
  /**
   * Set up event listeners for player controls
   */
  setupPlayerControls() {
    const prevButton = document.getElementById('mix-prev');
    const playPauseButton = document.getElementById('mix-play-pause');
    const nextButton = document.getElementById('mix-next');
    
    // Enable buttons
    prevButton.disabled = false;
    playPauseButton.disabled = false;
    nextButton.disabled = false;
    
    // Clear previous event listeners (in case initialize is called multiple times)
    const newPrevButton = prevButton.cloneNode(true);
    const newPlayPauseButton = playPauseButton.cloneNode(true);
    const newNextButton = nextButton.cloneNode(true);
    
    prevButton.parentNode.replaceChild(newPrevButton, prevButton);
    playPauseButton.parentNode.replaceChild(newPlayPauseButton, playPauseButton);
    nextButton.parentNode.replaceChild(newNextButton, nextButton);
    
    // Set up new event listeners
    newPrevButton.addEventListener('click', () => this.previousTrack());
    newPlayPauseButton.addEventListener('click', () => this.togglePlayPause());
    newNextButton.addEventListener('click', () => this.nextTrack());
    
    // Set up the progress bar click handler for seeking
    const progressContainer = document.getElementById('progress-container');
    const newProgressContainer = progressContainer.cloneNode(true);
    progressContainer.parentNode.replaceChild(newProgressContainer, progressContainer);
    
    newProgressContainer.addEventListener('click', (e) => {
      if (!this.audioElements[this.currentTrackIndex]) return;
      
      // Calculate the click position as a percentage
      const rect = newProgressContainer.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      
      // Set the current time of the audio element
      const audio = this.audioElements[this.currentTrackIndex];
      audio.currentTime = clickPosition * audio.duration;
      
      // Update the progress bar
      this.updateProgress();
    });
    
    // Add EQ control sliders 
    this.createEQControls();
  }
  
  /**
   * Create EQ control sliders
   */
  createEQControls() {
    const mixControls = document.getElementById('mix-controls') || document.createElement('div');
    mixControls.id = 'mix-controls';
    mixControls.className = 'eq-controls';
    mixControls.innerHTML = `
      <div class="eq-sliders">
        <div class="eq-slider">
          <label>Low</label>
          <input type="range" id="eq-low" min="-12" max="12" value="0" class="slider">
        </div>
        <div class="eq-slider">
          <label>Mid</label>
          <input type="range" id="eq-mid" min="-12" max="12" value="0" class="slider">
        </div>
        <div class="eq-slider">
          <label>High</label>
          <input type="range" id="eq-high" min="-12" max="12" value="0" class="slider">
        </div>
      </div>
      <div class="tempo-control">
        <label>Tempo</label>
        <input type="range" id="tempo-slider" min="80" max="120" value="100" class="slider">
        <span id="tempo-value">100%</span>
      </div>
      <div class="beatmatch-toggle">
        <label>
          <input type="checkbox" id="beatmatch-toggle" ${this.beatmatchingEnabled ? 'checked' : ''}>
          Auto-Beatmatch
        </label>
      </div>
    `;
    
    // Add the controls to the player if not already there
    const mixPlayer = document.querySelector('.mix-player');
    if (!document.getElementById('mix-controls')) {
      mixPlayer.appendChild(mixControls);
    }
    
    // Add event listeners to EQ sliders
    document.getElementById('eq-low').addEventListener('input', (e) => {
      this.adjustEQ('low', parseFloat(e.target.value));
    });
    
    document.getElementById('eq-mid').addEventListener('input', (e) => {
      this.adjustEQ('mid', parseFloat(e.target.value));
    });
    
    document.getElementById('eq-high').addEventListener('input', (e) => {
      this.adjustEQ('high', parseFloat(e.target.value));
    });
    
    // Add event listener to tempo slider
    document.getElementById('tempo-slider').addEventListener('input', (e) => {
      const tempoPercent = parseInt(e.target.value);
      document.getElementById('tempo-value').textContent = `${tempoPercent}%`;
      this.adjustTempo(tempoPercent / 100);
    });
    
    // Add event listener to beatmatch toggle
    document.getElementById('beatmatch-toggle').addEventListener('change', (e) => {
      this.beatmatchingEnabled = e.target.checked;
      console.log(`Beatmatching ${this.beatmatchingEnabled ? 'enabled' : 'disabled'}`);
    });
  }
  
  /**
   * Adjust the EQ for the current track
   * @param {string} band - 'low', 'mid', or 'high'
   * @param {number} gain - Gain value in dB (-12 to +12)
   */
  adjustEQ(band, gain) {
    if (!this.audioContext || this.currentTrackIndex < 0) return;
    
    const index = this.currentTrackIndex;
    
    switch (band) {
      case 'low':
        this.filters.lowEQ[index].gain.value = gain;
        break;
      case 'mid':
        this.filters.midEQ[index].gain.value = gain;
        break;
      case 'high':
        this.filters.highEQ[index].gain.value = gain;
        break;
    }
  }
  
  /**
   * Adjust the tempo of the current track
   * @param {number} tempoRatio - Ratio to adjust tempo (0.8 to 1.2)
   */
  adjustTempo(tempoRatio) {
    // Store the adjustment for this track
    this.tempoAdjustments[this.currentTrackIndex] = tempoRatio;
    
    // If we're using SoundTouch, adjust the tempo directly
    if (this.soundTouchProcessors[this.currentTrackIndex]) {
      // This would update the SoundTouch processor's tempo
      // In a real implementation, this would adjust the pitch/time settings
      console.log(`Adjusting tempo to ${tempoRatio * 100}%`);
    } else {
      // Fallback to playbackRate if SoundTouch isn't available
      // Note: This changes both tempo and pitch, unlike real DJ software
      this.audioElements[this.currentTrackIndex].playbackRate = tempoRatio;
    }
  }
  
  /**
   * Set up audio visualizer
   */
  setupVisualizer() {
    // Set up audio analyser for visualization
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 1024; // Increased for better resolution for VJ visualizer
    this.visualizerData = new Uint8Array(this.analyserNode.frequencyBinCount);
    
    // Connect each gain node to the analyser (in parallel with destination)
    this.gainNodes.forEach(gainNode => {
      gainNode.connect(this.analyserNode);
    });
    
    // Set up canvas for visualization
    const visualizerElement = document.getElementById('mix-visualizer');
    visualizerElement.innerHTML = ''; // Clear previous visualizer
    
    this.visualizerCanvas = document.createElement('canvas');
    this.visualizerCanvas.width = visualizerElement.clientWidth;
    this.visualizerCanvas.height = 60;
    visualizerElement.appendChild(this.visualizerCanvas);
    
    // Start visualization
    this.drawVisualizer();
  }
  
  /**
   * Make audio nodes public for external visualizers
   */
  makeAudioNodesPublic() {
    // These properties are already defined in the class,
    // but this method serves as documentation that these
    // nodes are explicitly intended to be accessed by external
    // visualizers and other extensions.
    this.publicAudioContext = this.audioContext;
    this.publicAnalyserNode = this.analyserNode;
    
    // Log that nodes are available
    console.log('Audio nodes available for external visualizers');
  }
  
  /**
   * Draw the audio visualizer
   */
  drawVisualizer() {
    if (!this.analyserNode || !this.visualizerCanvas) return;
    
    const canvas = this.visualizerCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get frequency data
    this.analyserNode.getByteFrequencyData(this.visualizerData);
    
    // Draw the visualizer bars
    const barWidth = width / this.visualizerData.length;
    let x = 0;
    
    // Set gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#ff5500');
    gradient.addColorStop(1, '#ff8800');
    ctx.fillStyle = gradient;
    
    // Draw each bar
    for (let i = 0; i < this.visualizerData.length; i++) {
      const barHeight = (this.visualizerData[i] / 255) * height;
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }
    
    // Call next animation frame only if we're still playing
    if (this.isPlaying) {
      this.animationId = requestAnimationFrame(() => this.drawVisualizer());
    }
  }
  
  /**
   * Create visual markers for transitions in the timeline
   */
  createTransitionMarkers() {
    const container = document.getElementById('transition-markers');
    container.innerHTML = '';
    
    // Calculate total mix duration
    const totalDuration = this.totalDuration;
    
    // Create a marker for each transition
    this.transitions.forEach(transition => {
      // Find the track this transition is from
      const fromTrackIndex = this.tracks.findIndex(t => t.id === transition.fromTrack);
      
      if (fromTrackIndex >= 0) {
        // Calculate the position as percentage of total mix duration
        let currentPosition = 0;
        
        // Sum up durations of all tracks before this one
        for (let i = 0; i < fromTrackIndex; i++) {
          currentPosition += this.tracks[i].duration || 180000;
        }
        
        // Add the transition point to the current position
        currentPosition += transition.transitionPoint;
        
        const positionPercent = (currentPosition / totalDuration) * 100;
        
        // Create marker element
        const marker = document.createElement('div');
        marker.className = `transition-marker ${transition.transitionType}`;
        marker.style.left = `${positionPercent}%`;
        
        const transitionTime = this.formatDuration(currentPosition);
        marker.title = `${transition.transitionType} transition at ${transitionTime}`;
        
        // Add transition type icon
        const icon = document.createElement('span');
        icon.className = 'transition-icon';
        icon.textContent = this.getTransitionIcon(transition.transitionType);
        marker.appendChild(icon);
        
        container.appendChild(marker);
      }
    });
  }
  
  /**
   * Get an icon character representing the transition type
   * @param {string} transitionType - The type of transition
   * @return {string} Icon character
   */
  getTransitionIcon(transitionType) {
    const icons = {
      'beatmatch': '♫',
      'beatmatch_blend': '⟿',
      'beatmatch_fade': '🎧',
      'harmonic_fade': '♪',
      'tempo_adjust': '♩',
      'long_fade': '◎',
      'cut_eq': '✂️',
      'fade': '⏵'
    };
    
    return icons[transitionType] || '⏵';
  }
  
  /**
   * Start playback
   */
  play() {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.isPlaying = true;
    this.audioElements[this.currentTrackIndex].play();
    
    // Apply any stored tempo adjustment
    if (this.tempoAdjustments[this.currentTrackIndex] !== 1.0) {
      this.adjustTempo(this.tempoAdjustments[this.currentTrackIndex]);
    }
    
    // Update play/pause button
    const playPauseButton = document.getElementById('mix-play-pause');
    playPauseButton.querySelector('.player-icon').textContent = '⏸';
    
    // Start the visualizer
    this.drawVisualizer();
    
    // Update player info every second
    this.progressInterval = setInterval(() => this.updatePlayerInfo(), 1000);
    
    // Highlight current track in the track list
    this.updateCurrentTrackHighlight();
  }
  
  /**
   * Pause playback
   */
  pause() {
    this.isPlaying = false;
    this.audioElements[this.currentTrackIndex].pause();
    
    // Update play/pause button
    const playPauseButton = document.getElementById('mix-play-pause');
    playPauseButton.querySelector('.player-icon').textContent = '▶';
    
    // Stop the visualizer
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Clear progress interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
  
  /**
   * Toggle play/pause state
   */
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }
  
  /**
   * Stop playback and reset all audio
   */
  stop() {
    this.isPlaying = false;
    this.isCrossfading = false;
    
    // Stop and disconnect all audio elements
    if (this.audioElements) {
      this.audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
    
    // Clear the visualization
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Clear progress interval
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    
    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      // Just suspend instead of close to allow reuse
      this.audioContext.suspend();
    }
    
    // Reset UI
    const playPauseButton = document.getElementById('mix-play-pause');
    if (playPauseButton) {
      playPauseButton.querySelector('.player-icon').textContent = '▶';
    }
  }
  
  /**
   * Start advanced transition to the next track
   * @param {Object} transition - Transition data
   */
  startAdvancedTransition(transition) {
    const currentIndex = this.currentTrackIndex;
    const nextIndex = (currentIndex + 1) % this.tracks.length;
    
    // Get transition type and duration
    const transitionType = transition.transitionType || 'fade';
    const transitionDuration = transition.transitionDuration || this.defaultTransitionTime;
    
    console.log(`Starting ${transitionType} transition - duration: ${transitionDuration}ms`);
    
    // Start the next track
    this.audioElements[nextIndex].play();
    
    // Apply tempo adjustment if beatmatching is enabled and tracks have significant BPM difference
    if (this.beatmatchingEnabled && Math.abs(transition.bpmDifference) > 2) {
      this.prepareBeatsyncTransition(transition, currentIndex, nextIndex);
    }
    
    // Apply EQ adjustments based on key compatibility
    if (this.autoHarmonicMixing && transition.keyCompatibility) {
      this.prepareHarmonicTransition(transition, currentIndex, nextIndex);
    }
    
    // Perform volume fades with appropriate curves
    this.performVolumeTransition(transitionType, transitionDuration, currentIndex, nextIndex);
    
    // Wait for transition to complete, then update the current track
    setTimeout(() => {
      // Pause the previous track
      this.audioElements[currentIndex].pause();
      
      // Reset tempo and EQ
      this.resetTrackEffects(currentIndex);
      
      // Update the current track index
      this.currentTrackIndex = nextIndex;
      this.isCrossfading = false;
      
      // Update player UI
      this.updatePlayerInfo();
      
      // Highlight current track in the track list
      this.updateCurrentTrackHighlight();
    }, transitionDuration);
  }
  
  /**
   * Prepare beat synchronization for transition
   * @param {Object} transition - Transition data
   * @param {number} currentIndex - Current track index
   * @param {number} nextIndex - Next track index
   */
  prepareBeatsyncTransition(transition, currentIndex, nextIndex) {
    // Calculate tempo ratio to sync BPMs
    const currentBpm = transition.sourceBpm || 120;
    const nextBpm = transition.targetBpm || 120;
    
    // Gradually adjust tempo of the incoming track to match the outgoing track
    if (Math.abs(nextBpm - currentBpm) > 2) {
      const tempoRatio = currentBpm / nextBpm;
      
      // Apply tempo change to the incoming track
      this.tempoAdjustments[nextIndex] = tempoRatio;
      this.audioElements[nextIndex].playbackRate = tempoRatio;
      
      console.log(`Beatmatching: Adjusting incoming track tempo from ${nextBpm} to ${currentBpm} BPM`);
      
      // Schedule gradual return to normal tempo after transition
      const transitionDuration = transition.transitionDuration || this.defaultTransitionTime;
      
      // After half of the transition, start gradually returning to normal speed
      setTimeout(() => {
        // Gradually return to normal tempo over the second half of the transition
        const startValue = tempoRatio;
        const endValue = 1.0;
        const steps = 10;
        const interval = Math.floor(transitionDuration / 2 / steps);
        
        let step = 0;
        const adjustInterval = setInterval(() => {
          step++;
          if (step >= steps) {
            clearInterval(adjustInterval);
            this.audioElements[nextIndex].playbackRate = endValue;
            this.tempoAdjustments[nextIndex] = endValue;
          } else {
            const newRatio = startValue + (endValue - startValue) * (step / steps);
            this.audioElements[nextIndex].playbackRate = newRatio;
            this.tempoAdjustments[nextIndex] = newRatio;
          }
        }, interval);
      }, transitionDuration / 2);
    }
  }
  
  /**
   * Prepare harmonic mixing EQ adjustments
   * @param {Object} transition - Transition data
   * @param {number} currentIndex - Current track index
   * @param {number} nextIndex - Next track index
   */
  prepareHarmonicTransition(transition, currentIndex, nextIndex) {
    // Apply EQ adjustments based on key compatibility
    if (transition.keyCompatibility === 'clash') {
      // For clashing keys, reduce frequencies where clash occurs
      // This is a simplified approach - real DJ software would be more sophisticated
      this.filters.midEQ[nextIndex].gain.value = -3;
      console.log('Applying harmonic EQ adjustment for key clash');
    } else if (transition.keyCompatibility === 'compatible' || transition.keyCompatibility === 'perfect') {
      // For compatible keys, slight boost to emphasize harmony
      this.filters.highEQ[nextIndex].gain.value = 2;
      console.log('Applying harmonic EQ adjustment for compatible keys');
    }
  }
  
  /**
   * Perform volume transition between tracks
   * @param {string} transitionType - Type of transition
   * @param {number} duration - Transition duration in ms
   * @param {number} fromIndex - Current track index
   * @param {number} toIndex - Next track index
   */
  performVolumeTransition(transitionType, duration, fromIndex, toIndex) {
    const startTime = this.audioContext.currentTime;
    const endTime = startTime + (duration / 1000);
    
    // Different types of volume curves based on transition type
    switch (transitionType) {
      case 'beatmatch_blend':
      case 'beatmatch':
        // Equal power crossfade for beat-matched tracks
        this.equalPowerCrossfade(fromIndex, toIndex, startTime, endTime);
        break;
        
      case 'cut_eq':
        // Quick cut with EQ transition
        this.cutEQTransition(fromIndex, toIndex, startTime, duration / 1000);
        break;
        
      case 'long_fade':
        // Extra long linear fade
        this.linearCrossfade(fromIndex, toIndex, startTime, endTime);
        break;
        
      default:
        // Standard linear crossfade
        this.linearCrossfade(fromIndex, toIndex, startTime, endTime);
    }
  }
  
  /**
   * Perform equal power crossfade (better for beat-matched content)
   * @param {number} fromIndex - Index of track to fade out
   * @param {number} toIndex - Index of track to fade in
   * @param {number} startTime - Start time in audio context
   * @param {number} endTime - End time in audio context
   */
  equalPowerCrossfade(fromIndex, toIndex, startTime, endTime) {
    // Equal power crossfade uses square root curves
    // to maintain constant power during the crossfade
    const duration = endTime - startTime;
    
    // Set initial values
    this.gainNodes[fromIndex].gain.setValueAtTime(1, startTime);
    this.gainNodes[toIndex].gain.setValueAtTime(0, startTime);
    
    // Create fade curves
    for (let i = 0; i <= 100; i++) {
      const time = startTime + (i / 100) * duration;
      const fadeOutGain = Math.cos((i / 100) * Math.PI / 2);
      const fadeInGain = Math.sin((i / 100) * Math.PI / 2);
      
      this.gainNodes[fromIndex].gain.linearRampToValueAtTime(fadeOutGain, time);
      this.gainNodes[toIndex].gain.linearRampToValueAtTime(fadeInGain, time);
    }
  }
  
  /**
   * Perform linear crossfade
   * @param {number} fromIndex - Index of track to fade out
   * @param {number} toIndex - Index of track to fade in
   * @param {number} startTime - Start time in audio context
   * @param {number} endTime - End time in audio context
   */
  linearCrossfade(fromIndex, toIndex, startTime, endTime) {
    // Set initial values
    this.gainNodes[fromIndex].gain.setValueAtTime(1, startTime);
    this.gainNodes[toIndex].gain.setValueAtTime(0, startTime);
    
    // Create linear ramps
    this.gainNodes[fromIndex].gain.linearRampToValueAtTime(0, endTime);
    this.gainNodes[toIndex].gain.linearRampToValueAtTime(1, endTime);
  }
  
  /**
   * Perform a cut with EQ transition
   * @param {number} fromIndex - Index of track to fade out
   * @param {number} toIndex - Index of track to fade in
   * @param {number} startTime - Start time in audio context
   * @param {number} duration - Transition duration in seconds
   */
  cutEQTransition(fromIndex, toIndex, startTime, duration) {
    // First drop the high and mid frequencies of the outgoing track
    this.filters.highEQ[fromIndex].gain.setValueAtTime(0, startTime);
    this.filters.highEQ[fromIndex].gain.linearRampToValueAtTime(-12, startTime + duration * 0.25);
    
    this.filters.midEQ[fromIndex].gain.setValueAtTime(0, startTime);
    this.filters.midEQ[fromIndex].gain.linearRampToValueAtTime(-9, startTime + duration * 0.5);
    
    // Quickly bring in the new track at the halfway point
    this.gainNodes[toIndex].gain.setValueAtTime(0, startTime);
    this.gainNodes[toIndex].gain.linearRampToValueAtTime(0.7, startTime + duration * 0.5);
    this.gainNodes[toIndex].gain.linearRampToValueAtTime(1, startTime + duration);
    
    // Fade out the bass on old track last
    this.filters.lowEQ[fromIndex].gain.setValueAtTime(0, startTime + duration * 0.5);
    this.filters.lowEQ[fromIndex].gain.linearRampToValueAtTime(-12, startTime + duration * 0.75);
    
    // Finally fade out the volume of the old track
    this.gainNodes[fromIndex].gain.setValueAtTime(1, startTime + duration * 0.5);
    this.gainNodes[fromIndex].gain.linearRampToValueAtTime(0, startTime + duration);
  }
  
  /**
   * Reset all effects and adjustments on a track
   * @param {number} index - Track index
   */
  resetTrackEffects(index) {
    // Reset EQ
    this.filters.lowEQ[index].gain.value = 0;
    this.filters.midEQ[index].gain.value = 0;
    this.filters.highEQ[index].gain.value = 0;
    
    // Reset tempo
    this.audioElements[index].playbackRate = 1.0;
    this.tempoAdjustments[index] = 1.0;
    
    // Reset volume (to avoid surprise when next used)
    this.gainNodes[index].gain.value = 0;
  }
  
  /**
   * Skip to the next track
   */
  nextTrack() {
    if (this.tracks.length <= 1) return;
    
    // Immediately move to next track (no smooth transition)
    const currentIndex = this.currentTrackIndex;
    const nextIndex = (currentIndex + 1) % this.tracks.length;
    
    // Pause current track
    this.audioElements[currentIndex].pause();
    this.gainNodes[currentIndex].gain.value = 0;
    
    // Reset effects on current track
    this.resetTrackEffects(currentIndex);
    
    // Prepare next track
    this.audioElements[nextIndex].currentTime = 0;
    this.gainNodes[nextIndex].gain.value = 1;
    
    // Update the current track index
    this.currentTrackIndex = nextIndex;
    
    // Play if we were already playing
    if (this.isPlaying) {
      this.audioElements[nextIndex].play();
      // Apply any stored tempo adjustment
      if (this.tempoAdjustments[nextIndex] !== 1.0) {
        this.adjustTempo(this.tempoAdjustments[nextIndex]);
      }
    }
    
    // Update player UI
    this.updatePlayerInfo();
    
    // Highlight current track in the track list
    this.updateCurrentTrackHighlight();
  }
  
  /**
   * Skip to the previous track
   */
  previousTrack() {
    if (this.tracks.length <= 1) return;
    
    // If we're past the first 3 seconds of the track, just restart it
    if (this.audioElements[this.currentTrackIndex].currentTime > 3) {
      this.audioElements[this.currentTrackIndex].currentTime = 0;
      return;
    }
    
    // Otherwise, go to the previous track
    const currentIndex = this.currentTrackIndex;
    const prevIndex = (currentIndex - 1 + this.tracks.length) % this.tracks.length;
    
    // Pause current track
    this.audioElements[currentIndex].pause();
    this.gainNodes[currentIndex].gain.value = 0;
    
    // Reset effects on current track
    this.resetTrackEffects(currentIndex);
    
    // Prepare previous track
    this.audioElements[prevIndex].currentTime = 0;
    this.gainNodes[prevIndex].gain.value = 1;
    
    // Update the current track index
    this.currentTrackIndex = prevIndex;
    
    // Play if we were already playing
    if (this.isPlaying) {
      this.audioElements[prevIndex].play();
      // Apply any stored tempo adjustment
      if (this.tempoAdjustments[prevIndex] !== 1.0) {
        this.adjustTempo(this.tempoAdjustments[prevIndex]);
      }
    }
    
    // Update player UI
    this.updatePlayerInfo();
    
    // Highlight current track in the track list
    this.updateCurrentTrackHighlight();
  }
  
  /**
   * Update player information display
   */
  updatePlayerInfo() {
    const currentTrack = this.tracks[this.currentTrackIndex];
    const mixInfo = document.getElementById('mix-info');
    const currentPosition = document.getElementById('current-track-position');
    const currentDuration = document.getElementById('current-track-duration');
    
    // Update track info display
    mixInfo.textContent = `Playing: ${currentTrack.title} by ${currentTrack.user?.username || 'Unknown'}`;
    
    // Add BPM and key if available
    if (currentTrack.bpm || currentTrack.advancedAnalysis?.rhythm?.key) {
      const bpm = currentTrack.bpm || currentTrack.advancedAnalysis?.rhythm?.bpm || '?';
      const key = currentTrack.advancedAnalysis?.rhythm?.key || '?';
      const scale = currentTrack.advancedAnalysis?.rhythm?.scale || '';
      
      mixInfo.textContent += ` [${bpm} BPM, Key: ${key} ${scale}]`;
    }
    
    // Update time display
    const audio = this.audioElements[this.currentTrackIndex];
    const position = this.formatDuration(audio.currentTime * 1000);
    const duration = this.formatDuration(currentTrack.duration);
    
    currentPosition.textContent = position;
    currentDuration.textContent = duration;
    
    // Update standard audio element for browser controls
    const mixPlayer = document.getElementById('mix-player');
    mixPlayer.src = audio.src;
    
    // Sync the players if needed
    if (Math.abs(mixPlayer.currentTime - audio.currentTime) > 0.5) {
      mixPlayer.currentTime = audio.currentTime;
    }
    
    // Update EQ sliders to match current track
    this.updateEQSliders();
  }
  
  /**
   * Update EQ sliders to match the current track's settings
   */
  updateEQSliders() {
    if (!this.filters || this.currentTrackIndex < 0) return;
    
    const eqLow = document.getElementById('eq-low');
    const eqMid = document.getElementById('eq-mid');
    const eqHigh = document.getElementById('eq-high');
    const tempoSlider = document.getElementById('tempo-slider');
    
    if (eqLow) eqLow.value = this.filters.lowEQ[this.currentTrackIndex].gain.value;
    if (eqMid) eqMid.value = this.filters.midEQ[this.currentTrackIndex].gain.value;
    if (eqHigh) eqHigh.value = this.filters.highEQ[this.currentTrackIndex].gain.value;
    
    if (tempoSlider) {
      const tempoValue = Math.round(this.tempoAdjustments[this.currentTrackIndex] * 100);
      tempoSlider.value = tempoValue;
      document.getElementById('tempo-value').textContent = `${tempoValue}%`;
    }
  }
  
  /**
   * Update the progress bar
   */
  updateProgress() {
    const audio = this.audioElements[this.currentTrackIndex];
    const progressBar = document.getElementById('progress-bar');
    
    if (audio && progressBar) {
      const percent = (audio.currentTime / (audio.duration || 1)) * 100;
      progressBar.style.width = `${percent}%`;
    }
  }
  
  /**
   * Update the current track highlight in the track list
   */
  updateCurrentTrackHighlight() {
    // Remove highlight from all tracks
    const trackListItems = document.querySelectorAll('.mix-track-list ol li');
    trackListItems.forEach(item => item.classList.remove('current-track'));
    
    // Add highlight to current track
    if (trackListItems[this.currentTrackIndex]) {
      trackListItems[this.currentTrackIndex].classList.add('current-track');
    }
  }
  
  /**
   * Format duration in milliseconds to MM:SS
   * @param {number} ms - Duration in milliseconds
   * @return {string} Formatted duration
   */
  formatDuration(ms) {
    if (!ms) return 'Unknown';
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Export for use in the main application
window.AudioMixer = AudioMixer;