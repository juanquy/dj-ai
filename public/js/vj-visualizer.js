/**
 * DJAI VJ Visualizer
 * Implements modern video visualizations synchronized with audio
 */
class VJVisualizer {
  constructor(options = {}) {
    // Core properties
    this.audioContext = null;
    this.analyserNode = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasContext = null;
    this.overlayCanvas = null;
    this.overlayContext = null;
    this.aiVideoCanvas = null;  // For AI generated imagery
    this.aiVideoContext = null;
    this.animationId = null;
    this.isActive = false;
    this.videoFilter = null;
    
    // Audio analysis
    this.frequencyData = null;
    this.timeData = null;
    this.beatDetector = null;
    this.energyHistory = [];
    this.beatHistory = [];
    
    // Visual settings
    this.visualStyle = options.initialStyle || 'neon';
    this.intensity = options.initialIntensity || 0.7;
    this.quality = options.quality || 'auto';
    this.bpm = 120;
    
    // Content sources - using AI generation by default
    this.contentMode = 'ai-generate';
    this.lastContentUpdate = 0;
    this.contentUpdateInterval = options.contentUpdateInterval || 15000; // 15 seconds
    this.currentContentIndex = 0;
    this.contentCache = [];
    this.contentIsLoading = false;
    this.contentLoadFailed = false;
    this.cueNewContentOnBeat = options.cueNewContentOnBeat || true;
    this.useLTXVideo = options.useLTXVideo || true; // Use LTX for video generation
    
    // Media libraries
    this.videoLibrary = [
      '/videos/abstract_1.mp4',
      '/videos/grid_tunnel.mp4',
      '/videos/liquid_colors.mp4',
      '/videos/neon_city.mp4',
      '/videos/particle_flow.mp4',
      '/videos/retro_waves.mp4'
    ];
    
    // Unsplash collections by style
    this.unsplashCollections = {
      neon: 'neon-lights,cyberpunk,retrowave,synthwave',
      cyberpunk: 'cyberpunk,futuristic,neon-city,tech',
      retro: 'vintage,retro,retrowave,80s',
      pastel: 'pastel,soft-colors,dreamy,calm'
    };
    
    // AI prompt templates by style
    this.aiPromptTemplates = {
      neon: 'Create a {bpm} BPM {energyLevel} visualization with neon lights, cyberpunk aesthetics, glowing elements in {color1} and {color2}',
      cyberpunk: 'Generate a {bpm} BPM {energyLevel} futuristic cityscape with digital elements, cyberpunk style in {color1} and {color2}',
      retro: 'Design a {bpm} BPM {energyLevel} retro 80s synthwave sunset grid landscape in {color1} and {color2}',
      pastel: 'Create a {bpm} BPM {energyLevel} dreamy abstract fluid animation with pastel colors {color1} and {color2}'
    };
    
    // Color palettes
    this.colorPalettes = {
      neon: ['#FF00FF', '#00FFFF', '#FF00CC', '#00FFDD', '#FF33FF'],
      cyberpunk: ['#F72585', '#7209B7', '#3A0CA3', '#4361EE', '#4CC9F0'],
      retro: ['#FFF100', '#FF8C00', '#E81123', '#EC008C', '#68217A'],
      pastel: ['#FFD3DA', '#FFC3D8', '#FFBED1', '#FFBBD0', '#FFA9C6']
    };
    
    // References to the current color scheme
    this.currentColors = this.colorPalettes[this.visualStyle];
    
    // WebGL shader program
    this.shaderProgram = null;
    this.useShaders = options.useShaders || true;
    
    // Bind methods to maintain context
    this.draw = this.draw.bind(this);
    this.detectBeats = this.detectBeats.bind(this);
    this.initializeAudio = this.initializeAudio.bind(this);
    this.setupVisualElements = this.setupVisualElements.bind(this);
    this.switchVisualStyle = this.switchVisualStyle.bind(this);
    this.loadExternalContent = this.loadExternalContent.bind(this);
    this.generateAiContent = this.generateAiContent.bind(this);
    this.handleBeatContentUpdate = this.handleBeatContentUpdate.bind(this);
    this.initializeWebGL = this.initializeWebGL.bind(this);
  }
  
  /**
   * Initialize content sources and fetch initial content
   */
  async initializeContent() {
    console.log('Initializing content sources for VJ Visualizer');
    
    try {
      // Create videos directory if needed
      this.ensureVideoDirectory();
      
      // Pre-cache some content for immediate use
      await this.preloadContent();
      
      return true;
    } catch (error) {
      console.error('Error initializing content:', error);
      return false;
    }
  }
  
  /**
   * Ensure video directory exists and create API endpoints if needed
   */
  ensureVideoDirectory() {
    // Check if we're running in a browser or Node environment
    if (typeof window === 'undefined') {
      console.log('Server-side: Create /public/videos directory and API endpoints');
    } else {
      console.log('Client-side: Ensuring content APIs are available');
      
      // Create proxy endpoint for Unsplash if needed
      if (!window.VJVisualizerContentEndpoint) {
        window.VJVisualizerContentEndpoint = '/api/vj/content';
      }
    }
  }
  
  /**
   * Initialize the visualizer with audio context
   * @param {AudioContext} audioContext - Web Audio API context
   * @param {AnalyserNode} analyserNode - Pre-configured analyser node
   */
  initializeAudio(audioContext, analyserNode) {
    console.log('Initializing VJ Visualizer audio...');
    
    if (!audioContext) {
      console.error('No audio context provided for VJ visualizer');
      return false;
    }
    
    this.audioContext = audioContext;
    
    if (analyserNode) {
      // Use provided analyser node
      console.log('Using provided analyser node with FFT size:', analyserNode.fftSize);
      this.analyserNode = analyserNode;
    } else {
      // Create a new analyser node
      console.log('Creating new analyser node');
      this.analyserNode = audioContext.createAnalyser();
      this.analyserNode.fftSize = 1024;
      this.analyserNode.smoothingTimeConstant = 0.8;
    }
    
    // Create data arrays for analysis
    console.log('Creating frequency and time data arrays with size:', this.analyserNode.frequencyBinCount);
    this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.timeData = new Uint8Array(this.analyserNode.frequencyBinCount);
    
    // Force update the arrays to make sure they're initialized correctly
    try {
      this.analyserNode.getByteFrequencyData(this.frequencyData);
      this.analyserNode.getByteTimeDomainData(this.timeData);
      console.log('Successfully fetched initial audio data');
    } catch (err) {
      console.error('Error getting initial audio data:', err);
    }
    
    console.log('VJ Visualizer audio initialized with FFT size:', this.analyserNode.fftSize);
    return true;
  }
  
  /**
   * Initialize WebGL for advanced visual effects
   */
  initializeWebGL() {
    if (!this.canvasElement || !this.useShaders) return false;
    
    try {
      // Get WebGL context
      const gl = this.canvasElement.getContext('webgl') || 
                 this.canvasElement.getContext('experimental-webgl');
      
      if (!gl) {
        console.warn('WebGL not supported, falling back to canvas rendering');
        return false;
      }
      
      this.gl = gl;
      console.log('WebGL initialized for VJ Visualizer');
      
      // Load shaders from the visualizer-shaders.js file
      if (window.VISUALIZER_SHADERS) {
        // Initialize shader for the current visual style
        this.initializeShaderProgram(this.visualStyle);
        return true;
      } else {
        console.warn('Shader definitions not found');
        return false;
      }
    } catch (error) {
      console.error('Error initializing WebGL:', error);
      return false;
    }
  }
  
  /**
   * Initialize shader program for a specific visual style
   * @param {string} style - The visual style name
   */
  initializeShaderProgram(style) {
    if (!this.gl || !window.VISUALIZER_SHADERS) return false;
    
    try {
      const gl = this.gl;
      const shaders = window.VISUALIZER_SHADERS;
      
      // Get vertex shader source
      const vertexSource = shaders.basicVertex;
      
      // Get fragment shader based on style
      let fragmentSource;
      switch (style) {
        case 'neon':
          fragmentSource = shaders.neonFragment;
          break;
        case 'cyberpunk':
          fragmentSource = shaders.cyberpunkFragment;
          break;
        case 'retro':
          fragmentSource = shaders.retroFragment;
          break;
        case 'pastel':
          fragmentSource = shaders.pastelFragment;
          break;
        default:
          fragmentSource = shaders.neonFragment;
      }
      
      // Compile shaders
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      
      if (!vertexShader || !fragmentShader) {
        return false;
      }
      
      // Create shader program
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Unable to initialize shader program:', gl.getProgramInfoLog(program));
        return false;
      }
      
      // Store shader program
      this.shaderProgram = program;
      
      // Set up buffers and attributes
      this.setupShaderBuffers();
      
      return true;
    } catch (error) {
      console.error('Error initializing shader program:', error);
      return false;
    }
  }
  
  /**
   * Compile a shader
   * @param {number} type - Shader type
   * @param {string} source - Shader source code
   * @return {WebGLShader} Compiled shader
   */
  compileShader(type, source) {
    if (!this.gl) return null;
    
    const gl = this.gl;
    const shader = gl.createShader(type);
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  /**
   * Set up WebGL buffers and attributes
   */
  setupShaderBuffers() {
    if (!this.gl || !this.shaderProgram) return;
    
    const gl = this.gl;
    const program = this.shaderProgram;
    
    // Create a buffer for vertex positions
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
    // Set up a rectangle covering the entire canvas
    const positions = [
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0
    ];
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    // Set up texture coordinates
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    
    const texCoords = [
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      1.0, 1.0
    ];
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    
    // Store attribute locations
    this.shaderAttribs = {
      position: gl.getAttribLocation(program, 'aVertexPosition'),
      texCoord: gl.getAttribLocation(program, 'aTextureCoord')
    };
    
    // Store uniform locations
    this.shaderUniforms = {
      time: gl.getUniformLocation(program, 'uTime'),
      resolution: gl.getUniformLocation(program, 'uResolution'),
      bassEnergy: gl.getUniformLocation(program, 'uBassEnergy'),
      intensity: gl.getUniformLocation(program, 'uIntensity')
    };
    
    // Store buffers
    this.shaderBuffers = {
      position: positionBuffer,
      texCoord: texCoordBuffer
    };
  }
  
  /**
   * Set up the visual elements (video and canvas)
   * @param {HTMLElement} containerElement - Container for the visualizer
   */
  setupVisualElements(containerElement) {
    if (!containerElement) {
      console.error('No container element provided for VJ visualizer');
      return false;
    }
    
    // Clear container
    containerElement.innerHTML = '';
    
    // Set container styles
    containerElement.style.position = 'relative';
    containerElement.style.overflow = 'hidden';
    containerElement.style.backgroundColor = '#000';
    
    // Create video element for background videos/images
    this.videoElement = document.createElement('video');
    this.videoElement.className = 'vj-background-video';
    this.videoElement.autoplay = true;
    this.videoElement.loop = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoElement.crossOrigin = 'anonymous';
    // Add better buffering support for videos
    this.videoElement.preload = 'auto';
    this.videoElement.autobuffer = true;
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.setAttribute('webkit-playsinline', '');
    this.videoElement.setAttribute('preload', 'auto');
    // Set buffer size to help with video playback
    this.videoElement.bufferTime = 3.0; // Buffer 3 seconds before playing
    // Styling
    this.videoElement.style.position = 'absolute';
    this.videoElement.style.top = '0';
    this.videoElement.style.left = '0';
    this.videoElement.style.width = '100%';
    this.videoElement.style.height = '100%';
    this.videoElement.style.objectFit = 'cover';
    this.videoElement.style.opacity = '0.9'; // Increased from 0.7 for better visibility
    this.videoElement.style.filter = 'saturate(1.5)';
    this.videoElement.style.transform = 'translate(-50%, -50%)';
    this.videoElement.style.left = '50%';
    this.videoElement.style.top = '50%';
    this.videoElement.style.transition = 'filter 0.5s ease'; // Smooth filter transitions
    
    // Create canvas for effects overlays
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.className = 'vj-effects-canvas';
    this.canvasElement.style.position = 'absolute';
    this.canvasElement.style.top = '50%';
    this.canvasElement.style.left = '50%';
    this.canvasElement.style.transform = 'translate(-50%, -50%)';
    this.canvasElement.style.width = '100%';
    this.canvasElement.style.height = '100%';
    this.canvasElement.style.zIndex = '1';
    this.canvasElement.style.mixBlendMode = 'lighten';
    
    // Create overlay canvas for beat-reactive effects
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'vj-overlay-canvas';
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '50%';
    this.overlayCanvas.style.left = '50%';
    this.overlayCanvas.style.transform = 'translate(-50%, -50%)';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.zIndex = '2';
    this.overlayCanvas.style.mixBlendMode = 'screen';
    
    // Create AI video canvas (for generated content)
    this.aiVideoCanvas = document.createElement('canvas');
    this.aiVideoCanvas.className = 'vj-ai-canvas';
    this.aiVideoCanvas.style.position = 'absolute';
    this.aiVideoCanvas.style.top = '50%';
    this.aiVideoCanvas.style.left = '50%';
    this.aiVideoCanvas.style.transform = 'translate(-50%, -50%)';
    this.aiVideoCanvas.style.width = '100%';
    this.aiVideoCanvas.style.height = '100%';
    this.aiVideoCanvas.style.zIndex = '0';
    this.aiVideoCanvas.style.opacity = '0'; // Start hidden, fade in when content is ready
    this.aiVideoCanvas.style.transition = 'opacity 1s ease';
    
    // Add elements to container
    containerElement.appendChild(this.videoElement);
    containerElement.appendChild(this.aiVideoCanvas);
    containerElement.appendChild(this.canvasElement);
    containerElement.appendChild(this.overlayCanvas);
    
    // Initialize canvas contexts
    this.canvasContext = this.canvasElement.getContext('2d');
    this.overlayContext = this.overlayCanvas.getContext('2d');
    this.aiVideoContext = this.aiVideoCanvas.getContext('2d');
    
    // Set canvas size based on container
    this.resizeCanvases();
    
    // Add resize handler
    window.addEventListener('resize', () => this.resizeCanvases());
    
    // Add controls overlay with additional options
    this.addControls(containerElement);
    
    console.log('VJ Visualizer UI elements created');
    
    // Initialize WebGL if supported
    if (this.useShaders) {
      this.initializeWebGL();
    }
    
    // Initialize and load content
    this.initializeContent().then(() => {
      // Load initial content
      this.loadContent({ force: true });
    });
    
    return true;
  }
  
  /**
   * Add user controls for the visualizer
   * @param {HTMLElement} containerElement - Container for the controls
   */
  addControls(containerElement) {
    // Create controls container
    const controlsElement = document.createElement('div');
    controlsElement.className = 'vj-controls';
    controlsElement.style.position = 'absolute';
    controlsElement.style.bottom = '10px';
    controlsElement.style.right = '10px';
    controlsElement.style.zIndex = '10';
    controlsElement.style.background = 'rgba(0,0,0,0.5)';
    controlsElement.style.borderRadius = '4px';
    controlsElement.style.padding = '8px';
    controlsElement.style.display = 'flex';
    controlsElement.style.gap = '8px';
    controlsElement.style.flexWrap = 'wrap';
    
    // Style toggle button
    const styleButton = document.createElement('button');
    styleButton.textContent = 'Style';
    styleButton.title = 'Change visual style';
    styleButton.className = 'vj-control-button';
    styleButton.style.background = '#333';
    styleButton.style.color = '#fff';
    styleButton.style.border = 'none';
    styleButton.style.borderRadius = '3px';
    styleButton.style.padding = '5px 8px';
    styleButton.style.cursor = 'pointer';
    styleButton.style.fontSize = '12px';
    
    // Content toggle button
    const contentButton = document.createElement('button');
    contentButton.textContent = 'Next';
    contentButton.title = 'Change visual content';
    contentButton.className = 'vj-control-button';
    contentButton.style.cssText = styleButton.style.cssText;
    
    // Default to AI-generated content only
    this.contentMode = 'ai-generate';
    
    // Add a LTX video generation button
    const ltxButton = document.createElement('button');
    ltxButton.textContent = 'LTX';
    ltxButton.title = 'Generate dynamic video using LTX';
    ltxButton.className = 'vj-control-button';
    ltxButton.style.cssText = styleButton.style.cssText;
    
    // LTX toggle switch
    const ltxContainer = document.createElement('div');
    ltxContainer.style.display = 'flex';
    ltxContainer.style.alignItems = 'center';
    
    const ltxCheckbox = document.createElement('input');
    ltxCheckbox.type = 'checkbox';
    ltxCheckbox.id = 'ltx-toggle';
    ltxCheckbox.checked = this.useLTXVideo;
    ltxCheckbox.style.margin = '0 5px 0 0';
    
    const ltxLabel = document.createElement('label');
    ltxLabel.htmlFor = 'ltx-toggle';
    ltxLabel.textContent = 'Use LTX';
    ltxLabel.style.color = '#fff';
    ltxLabel.style.fontSize = '12px';
    
    ltxContainer.appendChild(ltxCheckbox);
    ltxContainer.appendChild(ltxLabel);
    
    // Intensity slider
    const intensityContainer = document.createElement('div');
    intensityContainer.style.display = 'flex';
    intensityContainer.style.alignItems = 'center';
    
    const intensityLabel = document.createElement('span');
    intensityLabel.textContent = 'FX';
    intensityLabel.style.color = '#fff';
    intensityLabel.style.fontSize = '12px';
    intensityLabel.style.marginRight = '5px';
    
    const intensitySlider = document.createElement('input');
    intensitySlider.type = 'range';
    intensitySlider.min = '0';
    intensitySlider.max = '100';
    intensitySlider.value = this.intensity * 100;
    intensitySlider.style.width = '60px';
    intensitySlider.style.height = '10px';
    
    intensityContainer.appendChild(intensityLabel);
    intensityContainer.appendChild(intensitySlider);
    
    // Beat-sync toggle
    const beatSyncContainer = document.createElement('div');
    beatSyncContainer.style.display = 'flex';
    beatSyncContainer.style.alignItems = 'center';
    
    const beatSyncCheckbox = document.createElement('input');
    beatSyncCheckbox.type = 'checkbox';
    beatSyncCheckbox.id = 'beat-sync-toggle';
    beatSyncCheckbox.checked = this.cueNewContentOnBeat;
    beatSyncCheckbox.style.margin = '0 5px 0 0';
    
    const beatSyncLabel = document.createElement('label');
    beatSyncLabel.htmlFor = 'beat-sync-toggle';
    beatSyncLabel.textContent = 'Beat Sync';
    beatSyncLabel.style.color = '#fff';
    beatSyncLabel.style.fontSize = '12px';
    
    beatSyncContainer.appendChild(beatSyncCheckbox);
    beatSyncContainer.appendChild(beatSyncLabel);
    
    // Add event listeners
    styleButton.addEventListener('click', () => {
      const styles = Object.keys(this.colorPalettes);
      const currentIndex = styles.indexOf(this.visualStyle);
      const nextIndex = (currentIndex + 1) % styles.length;
      this.switchVisualStyle(styles[nextIndex]);
    });
    
    contentButton.addEventListener('click', () => {
      this.loadContent({ force: true });
    });
    
    ltxButton.addEventListener('click', () => {
      // Show loading indicator in help text
      if (this.helpTextElement) {
        this.helpTextElement.textContent = 'Generating LTX video...';
      }
      
      // Generate new LTX video content
      this.generateLTXContent().then(videoContent => {
        if (videoContent) {
          // Immediately show the LTX content
          this.applyVideoContent(videoContent);
          if (this.helpTextElement) {
            this.helpTextElement.textContent = `LTX video generated: ${videoContent.prompt.substring(0, 30)}...`;
          }
        } else {
          if (this.helpTextElement) {
            this.helpTextElement.textContent = 'LTX video generation failed';
          }
        }
      }).catch(err => {
        console.error('Error generating LTX video:', err);
        if (this.helpTextElement) {
          this.helpTextElement.textContent = 'LTX video generation error';
        }
      });
    });
    
    ltxCheckbox.addEventListener('change', (e) => {
      this.useLTXVideo = e.target.checked;
      if (this.helpTextElement) {
        this.helpTextElement.textContent = `LTX video generation ${this.useLTXVideo ? 'enabled' : 'disabled'}`;
      }
    });
    
    intensitySlider.addEventListener('input', (e) => {
      this.intensity = parseFloat(e.target.value) / 100;
    });
    
    beatSyncCheckbox.addEventListener('change', (e) => {
      this.cueNewContentOnBeat = e.target.checked;
    });
    
    // Add controls to the container
    controlsElement.appendChild(styleButton);
    controlsElement.appendChild(contentButton);
    controlsElement.appendChild(ltxButton);
    controlsElement.appendChild(ltxContainer);
    controlsElement.appendChild(intensityContainer);
    controlsElement.appendChild(beatSyncContainer);
    
    // Add help text
    const helpText = document.createElement('div');
    helpText.className = 'vj-help-text';
    helpText.textContent = this.contentMode === 'local' ? 
      'Using fallback mode - add videos to /public/videos/' : 
      `Using ${this.contentMode} content with LTX video generation ${this.useLTXVideo ? 'enabled' : 'disabled'}`;
    helpText.style.position = 'absolute';
    helpText.style.bottom = '50px';
    helpText.style.right = '10px';
    helpText.style.color = '#fff';
    helpText.style.fontSize = '10px';
    helpText.style.padding = '3px 5px';
    helpText.style.backgroundColor = 'rgba(0,0,0,0.5)';
    helpText.style.borderRadius = '2px';
    this.helpTextElement = helpText;
    
    // Add to main container
    containerElement.appendChild(controlsElement);
    containerElement.appendChild(helpText);
  }
  
  /**
   * Resize canvas to match container size
   */
  resizeCanvases() {
    if (!this.canvasElement || !this.overlayCanvas) return;
    
    const container = this.canvasElement.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Set actual canvas dimensions (for rendering)
    this.canvasElement.width = width;
    this.canvasElement.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    
    console.log(`VJ Visualizer resized to ${width}x${height}`);
  }
  
  /**
   * Preload initial content for the visualizer
   */
  async preloadContent() {
    // Start with at least 5 pieces of content
    const initialLoadCount = 5;
    
    console.log(`Preloading ${initialLoadCount} content items for ${this.contentMode} mode`);
    
    try {
      // Fetch different content based on selected mode
      switch (this.contentMode) {
        case 'unsplash':
          await this.preloadUnsplashImages(initialLoadCount);
          break;
        case 'pexels':
          await this.preloadPexelsContent(initialLoadCount);
          break;
        case 'ai-generate':
          await this.preloadAiContent(initialLoadCount);
          break;
        case 'local':
          // Explicitly load local videos
          this.preloadLocalVideos();
          break;
        default:
          // Fallback to videos as default
          console.log('Unknown content mode, defaulting to local videos');
          this.contentMode = 'local';
          this.preloadLocalVideos();
      }
      
      // If we have no content after trying the selected mode, fall back to local videos
      if (this.contentCache.length === 0) {
        console.log('No content loaded, falling back to local videos');
        this.contentMode = 'local';
        this.preloadLocalVideos();
      }
      
      console.log(`Preloaded ${this.contentCache.length} content items successfully for mode: ${this.contentMode}`);
      return true;
    } catch (error) {
      console.error('Error preloading content:', error);
      // Fallback to local video library if external content fails
      console.log('Error handling: falling back to local videos');
      this.contentMode = 'local';
      this.preloadLocalVideos();
      return false;
    }
  }
  
  /**
   * Preload content from Unsplash API
   * @param {number} count - Number of images to preload
   */
  async preloadUnsplashImages(count) {
    // Safety check to avoid excessive API calls
    if (this.contentIsLoading) return;
    this.contentIsLoading = true;
    
    try {
      const style = this.visualStyle;
      const query = this.unsplashCollections[style] || 'abstract,neon';
      
      // Use a client-side proxy to avoid exposing API keys
      const endpoint = `${window.VJVisualizerContentEndpoint}/unsplash?query=${encodeURIComponent(query)}&count=${count}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch Unsplash images: ${response.status}`);
      
      const data = await response.json();
      
      // Process and store images in cache
      if (data && Array.isArray(data) && data.length > 0) {
        data.forEach(image => {
          this.contentCache.push({
            type: 'image',
            source: 'unsplash',
            url: image.urls.regular, // Use regular size for performance
            fullUrl: image.urls.full,
            id: image.id,
            color: image.color || this.currentColors[0],
            aspectRatio: image.width / image.height,
            author: image.user?.name || 'Unsplash Artist'
          });
        });
        
        // Update help text to reflect content source
        if (this.helpTextElement) {
          this.helpTextElement.textContent = `Using ${this.contentMode} content - ${data.length} images loaded`;
        }
      } else {
        throw new Error('No images returned from Unsplash');
      }
    } catch (error) {
      console.error('Error fetching Unsplash images:', error);
      this.contentLoadFailed = true;
      // Fall back to local videos
      this.preloadLocalVideos();
    } finally {
      this.contentIsLoading = false;
    }
  }
  
  /**
   * Preload content from Pexels API
   * @param {number} count - Number of videos/images to preload
   */
  async preloadPexelsContent(count) {
    // Safety check to avoid excessive API calls
    if (this.contentIsLoading) return;
    this.contentIsLoading = true;
    
    try {
      const style = this.visualStyle;
      // Generate appropriate search terms based on style
      let query;
      switch (style) {
        case 'neon':
          query = 'neon,lights,abstract,cyberpunk';
          break;
        case 'cyberpunk':
          query = 'cyberpunk,futuristic,technology,digital';
          break;
        case 'retro':
          query = 'retro,vintage,80s,synthwave';
          break;
        case 'pastel':
          query = 'pastel,soft,gentle,abstract';
          break;
        default:
          query = 'abstract,visualization,colorful';
      }
      
      // Use a client-side proxy to avoid exposing API keys
      const endpoint = `${window.VJVisualizerContentEndpoint}/pexels?query=${encodeURIComponent(query)}&count=${count}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch Pexels content: ${response.status}`);
      
      const data = await response.json();
      let contentCount = 0;
      
      // Process and store content in cache
      if (data && Array.isArray(data.videos) && data.videos.length > 0) {
        // Prefer video files from Pexels
        data.videos.forEach(video => {
          // Get the HD or SD video file
          const videoFile = video.video_files ? (
            video.video_files.find(f => f.quality === 'hd') || 
            video.video_files.find(f => f.quality === 'sd') ||
            video.video_files[0]
          ) : null;
                           
          if (videoFile) {
            this.contentCache.push({
              type: 'video',
              source: 'pexels',
              url: videoFile.link,
              id: video.id,
              width: videoFile.width,
              height: videoFile.height,
              author: video.user?.name || 'Pexels Creator'
            });
            contentCount++;
          }
        });
      } else if (data && Array.isArray(data.photos) && data.photos.length > 0) {
        // Fallback to photos if no videos
        data.photos.forEach(photo => {
          this.contentCache.push({
            type: 'image',
            source: 'pexels',
            url: photo.src.large, // Use large size for performance
            fullUrl: photo.src.original,
            id: photo.id,
            width: photo.width,
            height: photo.height,
            author: photo.photographer || 'Pexels Photographer'
          });
          contentCount++;
        });
      } else {
        throw new Error('No content returned from Pexels');
      }
      
      // Update help text to reflect content source
      if (this.helpTextElement && contentCount > 0) {
        const contentType = data.videos && data.videos.length > 0 ? 'videos' : 'images';
        this.helpTextElement.textContent = `Using ${this.contentMode} content - ${contentCount} ${contentType} loaded`;
      }
    } catch (error) {
      console.error('Error fetching Pexels content:', error);
      this.contentLoadFailed = true;
      // Fall back to local videos
      this.preloadLocalVideos();
    } finally {
      this.contentIsLoading = false;
    }
  }
  
  /**
   * Preload AI generated content
   * @param {number} count - Number of images to preload
   */
  async preloadAiContent(count) {
    // Safety check to avoid excessive API calls
    if (this.contentIsLoading) return;
    this.contentIsLoading = true;
    
    try {
      // Try to load a few AI images for different visual styles
      const styles = Object.keys(this.aiPromptTemplates);
      let loadedContent = 0;
      let loadedVideoContent = 0;
      
      // Create one image for each style
      for (let i = 0; i < Math.min(count, styles.length); i++) {
        const style = styles[i];
        // Alternate between generating AI images and LTX videos for variety
        if (i % 2 === 0) {
          const result = await this.generateAiContent(style);
          if (result) {
            loadedContent++;
            console.log(`Successfully preloaded AI generated image for style: ${style}`);
          }
        } else {
          const videoResult = await this.generateLTXContent(style);
          if (videoResult) {
            loadedVideoContent++;
            console.log(`Successfully preloaded LTX video for style: ${style}`);
          }
        }
      }
      
      // Update help text to reflect content status
      if (this.helpTextElement) {
        if (loadedContent > 0 || loadedVideoContent > 0) {
          const contentDescription = [];
          if (loadedContent > 0) contentDescription.push(`${loadedContent} AI images`);
          if (loadedVideoContent > 0) contentDescription.push(`${loadedVideoContent} LTX videos`);
          this.helpTextElement.textContent = `Using AI generated content - ${contentDescription.join(', ')} created`;
        } else {
          this.helpTextElement.textContent = `AI content generation active`;
        }
      }
      
      console.log(`Loaded ${loadedContent} AI generated images and ${loadedVideoContent} LTX videos`);
    } catch (error) {
      console.error('Error preloading AI content:', error);
      this.contentLoadFailed = true;
    } finally {
      this.contentIsLoading = false;
    }
  }
  
  /**
   * Generate content using AI image generation
   * @param {string} forceStyle - Optional style to use instead of current style
   * @return {Object} Generated content info or null if failed
   */
  async generateAiContent(forceStyle) {
    try {
      // Create a prompt based on current audio features and style
      const style = forceStyle || this.visualStyle;
      const template = this.aiPromptTemplates[style] || this.aiPromptTemplates.neon;
      
      // Get energy level descriptor based on bass energy
      let energyLevel = 'moderate';
      const energy = this.getAverageEnergy();
      if (energy > 0.7) energyLevel = 'high-energy';
      else if (energy < 0.3) energyLevel = 'ambient';
      
      // Fill template with current audio features
      const colors = this.colorPalettes[style] || this.currentColors;
      const prompt = template
        .replace('{bpm}', this.bpm)
        .replace('{energyLevel}', energyLevel)
        .replace('{color1}', colors[0])
        .replace('{color2}', colors[1] || colors[0]);
      
      console.log(`Generating AI content with prompt: ${prompt} for style: ${style}`);
      
      // Call the AI generation endpoint through a proxy to avoid exposing API keys
      const endpoint = `${window.VJVisualizerContentEndpoint}/ai-generate`;
      console.log(`Sending request to: ${endpoint}`);
      
      const requestData = { prompt, style };
      console.log('Request data:', requestData);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        console.error(`AI generation failed with status: ${response.status}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`AI generation failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('API response data:', data);
      
      if (data && data.url) {
        console.log(`Received AI generated content:`, data);
        
        // Check if the image URL is a data URL or a relative path
        if (!data.url.startsWith('data:') && !data.url.startsWith('http')) {
          console.log('Converting relative path to absolute URL');
          // Convert relative path to absolute URL
          const baseUrl = window.location.origin;
          data.url = `${baseUrl}${data.url}`;
          console.log('Updated URL:', data.url);
        }
        
        const contentItem = {
          type: 'image',
          source: 'ai',
          url: data.url,
          id: `ai-${Date.now()}`,
          prompt: data.prompt || prompt,
          timestamp: Date.now(),
          width: data.width || 1024,
          height: data.height || 1024,
          style: style
        };
        
        // Add to cache
        this.contentCache.push(contentItem);
        
        // Load the image to verify it works
        const testImage = new Image();
        testImage.onload = () => console.log('Image loaded successfully:', data.url);
        testImage.onerror = (e) => console.error('Error loading image:', e);
        testImage.src = data.url;
        
        return contentItem;
      } else {
        console.error('No URL in AI generation response', data);
        throw new Error('No URL in AI generation response');
      }
    } catch (error) {
      console.error('Error generating AI content:', error);
      return null;
    }
  }
  
  /**
   * Generate video content using LTX (Latent Transformer for Video Generation)
   * @param {string} forceStyle - Optional style to use instead of current style
   * @return {Object} Generated video content info or null if failed
   */
  async generateLTXContent(forceStyle) {
    if (this.contentIsLoading) return null;
    this.contentIsLoading = true;
    
    try {
      // Create a prompt based on current audio features and style
      const style = forceStyle || this.visualStyle;
      const template = this.aiPromptTemplates[style] || this.aiPromptTemplates.neon;
      
      // Get energy level descriptor based on bass energy
      let energyLevel = 'moderate';
      const energy = this.getAverageEnergy();
      if (energy > 0.7) energyLevel = 'high-energy';
      else if (energy < 0.3) energyLevel = 'ambient';
      
      // Get current audio features from beat detector and analyzer
      const audioFeatures = {
        bpm: this.bpm,
        energy: energy,
        bassEnergy: this.detectBeats().bassEnergy,
        frequencyProfile: this.getFrequencyProfile()
      };
      
      // Fill template with current audio features
      const colors = this.colorPalettes[style] || this.currentColors;
      const prompt = template
        .replace('{bpm}', this.bpm)
        .replace('{energyLevel}', energyLevel)
        .replace('{color1}', colors[0])
        .replace('{color2}', colors[1] || colors[0]);
      
      console.log(`Generating LTX video content with prompt: ${prompt} for style: ${style}`);
      
      // Call the LTX generation endpoint through a proxy to avoid exposing API keys
      const endpoint = `${window.VJVisualizerContentEndpoint}/ltx-generate`;
      console.log(`Sending request to: ${endpoint}`);
      
      const requestData = { prompt, style, audioFeatures };
      console.log('Request data:', requestData);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        console.error(`LTX video generation failed with status: ${response.status}`);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`LTX video generation failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('LTX API response data:', data);
      
      if (data && data.url) {
        console.log(`Received LTX generated video:`, data);
        
        // Check if the video URL is a relative path
        if (!data.url.startsWith('http')) {
          console.log('Converting relative path to absolute URL');
          // Convert relative path to absolute URL
          const baseUrl = window.location.origin;
          data.url = `${baseUrl}${data.url}`;
          console.log('Updated URL:', data.url);
        }
        
        // Create a content item for the video
        const contentItem = {
          type: 'video',
          source: 'ltx',
          url: data.url,
          keyframe: data.keyframe, // Store keyframe image for thumbnail
          id: `ltx-${Date.now()}`,
          prompt: data.prompt || prompt,
          timestamp: Date.now(),
          width: data.width || 576,
          height: data.height || 320,
          style: style,
          bpm: data.bpm || this.bpm,
          energyLevel: data.energyLevel || energyLevel
        };
        
        // Add to cache
        this.contentCache.push(contentItem);
        
        // Preload the video to ensure it works
        const testVideo = document.createElement('video');
        testVideo.muted = true;
        testVideo.preload = 'auto';
        testVideo.autobuffer = true;
        testVideo.onloadeddata = () => console.log('LTX video loaded successfully:', data.url);
        testVideo.onerror = (e) => console.error('Error loading LTX video:', e);
        testVideo.src = data.url;
        testVideo.load();
        
        return contentItem;
      } else {
        console.error('No URL in LTX video generation response', data);
        throw new Error('No URL in LTX video generation response');
      }
    } catch (error) {
      console.error('Error generating LTX video content:', error);
      return null;
    } finally {
      this.contentIsLoading = false;
    }
  }
  
  /**
   * Get frequency profile for LTX prompt generation
   * @return {Object} Frequency profile with bass, mid, and high energy values
   */
  getFrequencyProfile() {
    if (!this.frequencyData) return { bass: 0.5, mid: 0.5, high: 0.5 };
    
    // Calculate energy in different frequency bands
    const bassSum = this.frequencyData.slice(0, 10).reduce((sum, val) => sum + val, 0);
    const midSum = this.frequencyData.slice(10, 100).reduce((sum, val) => sum + val, 0);
    const highSum = this.frequencyData.slice(100).reduce((sum, val) => sum + val, 0);
    
    // Normalize to 0-1 range
    return {
      bass: bassSum / (255 * 10),
      mid: midSum / (255 * 90),
      high: highSum / (255 * (this.frequencyData.length - 100))
    };
  }
  
  /**
   * Calculate average audio energy
   * @return {number} Average energy value 0-1
   */
  getAverageEnergy() {
    if (!this.energyHistory || this.energyHistory.length === 0) return 0.5;
    return this.energyHistory.reduce((sum, e) => sum + e, 0) / this.energyHistory.length;
  }
  
  /**
   * Preload local video files as fallback
   */
  preloadLocalVideos() {
    // Clear existing content cache when switching to local mode
    this.contentCache = [];
    
    console.log('Loading local video library');
    
    // Verify the available video files
    console.log('Local video library contains:', this.videoLibrary);
    
    // Ensure we have video formats that will work for all browsers
    const isWebMSupported = !!document.createElement('video').canPlayType('video/webm');
    const isOGGSupported = !!document.createElement('video').canPlayType('video/ogg');
    const isMP4Supported = !!document.createElement('video').canPlayType('video/mp4');
    
    console.log(`Browser video support - WebM: ${isWebMSupported}, OGG: ${isOGGSupported}, MP4: ${isMP4Supported}`);
    
    // Make sure all video paths are absolute
    const fixedVideoLibrary = this.videoLibrary.map(videoUrl => {
      if (videoUrl && !videoUrl.startsWith('http') && !videoUrl.startsWith('/')) {
        return '/' + videoUrl;
      }
      return videoUrl;
    });
    
    console.log('Using absolute video paths:', fixedVideoLibrary);
    
    // Add available videos from library to cache
    fixedVideoLibrary.forEach((videoUrl, index) => {
      // Check if the video format is supported by this browser
      const extension = videoUrl.split('.').pop().toLowerCase();
      let supported = true;
      
      if (extension === 'webm' && !isWebMSupported) supported = false;
      if (extension === 'ogv' && !isOGGSupported) supported = false;
      if (extension === 'mp4' && !isMP4Supported) supported = false;
      
      if (supported) {
        this.contentCache.push({
          type: 'video',
          source: 'local',
          url: videoUrl,
          id: `local-${index}`,
          fallback: false, // Set to false to ensure they're treated as real videos
          width: 1920,
          height: 1080
        });
        
        console.log(`Added video to cache: ${videoUrl}`);
      } else {
        console.warn(`Skipping unsupported video format: ${videoUrl}`);
      }
    });
    
    // Log the loaded videos
    console.log('Added videos to content cache:', this.contentCache);
    
    // If we still have no videos, create color gradients as ultimate fallback
    if (this.contentCache.length === 0) {
      console.warn('No video files found in library, creating fallback gradients');
      this.createFallbackGradients();
    }
    
    // Update the help text to show we're using local videos
    if (this.helpTextElement) {
      this.helpTextElement.textContent = `Using local videos - ${this.contentCache.length} items loaded`;
    }
    
    // Set content mode to local
    this.contentMode = 'local';
    
    // Pre-load the first video file to verify it works
    if (this.contentCache.length > 0 && this.contentCache[0].type === 'video') {
      const testVideo = document.createElement('video');
      testVideo.muted = true;
      testVideo.preload = 'auto';
      testVideo.autobuffer = true;
      
      // Add proper event listeners for testing video playback
      testVideo.onloadeddata = () => {
        console.log('Test video loaded data successfully:', this.contentCache[0].url);
        // Immediately apply this video to the visualizer
        this.loadContent({ force: true });
      };
      
      testVideo.oncanplaythrough = () => console.log('Test video can play through:', this.contentCache[0].url);
      
      testVideo.onerror = (e) => {
        console.error('Test video loading error:', e);
        console.log('Video error details:', {
          code: testVideo.error ? testVideo.error.code : 'unknown',
          message: testVideo.error ? testVideo.error.message : 'unknown',
          url: this.contentCache[0].url
        });
        
        // If we can't load the video, remove it from the cache and try the next one
        this.contentCache.shift();
        
        if (this.contentCache.length > 0) {
          console.log('Trying next video in cache');
          this.loadContent({ force: true });
        } else {
          console.warn('No more videos to try, creating fallback gradients');
          this.createFallbackGradients();
          this.loadContent({ force: true });
        }
      };
      
      // Start loading the video
      console.log('Testing video load:', this.contentCache[0].url);
      testVideo.src = this.contentCache[0].url;
      testVideo.load();
    } else {
      console.warn('No videos available, using fallback content');
      this.createFallbackGradients();
      this.loadContent({ force: true });
    }
  }
  
  /**
   * Create fallback gradient backgrounds if no other content is available
   */
  createFallbackGradients() {
    console.log('Creating fallback gradient backgrounds');
    
    Object.keys(this.colorPalettes).forEach(style => {
      const colors = this.colorPalettes[style];
      
      this.contentCache.push({
        type: 'gradient',
        source: 'generated',
        style: style,
        colors: colors,
        id: `gradient-${style}`,
        fallback: true
      });
    });
    
    // Update the help text to show we're using gradient fallbacks
    if (this.helpTextElement) {
      this.helpTextElement.textContent = `Using fallback gradient effects - no content available`;
    }
  }
  
  /**
   * Load content for display
   * @param {Object} options - Options for content loading
   */
  async loadContent(options = {}) {
    // Determine if we need new content
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastContentUpdate;
    const forcedUpdate = options.force === true;
    const needsUpdate = forcedUpdate || timeSinceLastUpdate > this.contentUpdateInterval;
    
    if (!needsUpdate && this.contentCache.length > 0) return;
    
    // Refresh cache occasionally
    if (needsUpdate) {
      this.lastContentUpdate = now;
      
      // If cache is getting low, fetch more content in background
      if (this.contentCache.length < 3 && !this.contentIsLoading) {
        this.loadExternalContent().catch(err => {
          console.error('Background content load failed:', err);
        });
      }
    }
    
    console.log('Loading content from cache with', this.contentCache.length, 'items in mode:', this.contentMode);
    
    // Check if we have any content
    if (this.contentCache.length === 0) {
      console.error('No content in cache, attempting to load local videos');
      this.contentMode = 'local';
      this.preloadLocalVideos();
      
      // If still no content, apply fallback
      if (this.contentCache.length === 0) {
        console.error('Failed to load any content, applying fallback');
        this.applyFallbackContent();
        return;
      }
    }
    
    // Try to prioritize video content for initial loading
    let content;
    
    // On first load or forced update, try to find a video
    if (forcedUpdate && this.contentMode === 'local') {
      // Find the first video in the cache
      content = this.contentCache.find(item => item.type === 'video');
      if (content) {
        console.log('Found video content for initial load:', content);
      }
    }
    
    // If no specific content was selected, get the next item
    if (!content) {
      content = this.getNextContentItem();
    }
    
    if (!content) {
      console.error('No content available to display after selection');
      this.applyFallbackContent();
      return;
    }
    
    // Apply content based on type
    try {
      console.log(`Applying ${content.type} content from ${content.source}:`, content);
      
      switch (content.type) {
        case 'video':
          this.applyVideoContent(content);
          break;
        case 'image':
          this.applyImageContent(content);
          break;
        case 'gradient':
          this.applyGradientContent(content);
          break;
        default:
          throw new Error(`Unknown content type: ${content.type}`);
      }
      
      // Apply visual style filters
      this.applyVisualStyleFilters();
      
      // Apply beat-reactive filters
      if (options.beatTriggered) {
        this.applyBeatVisualEffect();
      }
      
      console.log(`Loaded ${content.type} content from ${content.source}: ${content.url}`);
    } catch (error) {
      console.error('Error applying content:', error);
      // Apply fallback gradient as last resort
      this.applyFallbackContent();
    }
  }
  
  /**
   * Handle beat-synchronized content updates
   * @param {Object} beatInfo - Beat detection information
   */
  handleBeatContentUpdate(beatInfo) {
    // Only update on strong beats if enabled
    if (!this.cueNewContentOnBeat) return;
    
    // Check if it's a strong beat with heightened threshold for better sync
    if (beatInfo.isBeat && beatInfo.energy > 0.7) {
      // Limit updates to avoid too frequent changes - longer interval for video playback
      const minTimeBetweenBeats = 15000; // minimum 15 seconds between content changes for videos to play properly
      const now = Date.now();
      
      if (now - this.lastContentUpdate > minTimeBetweenBeats) {
        console.log('Beat detected, triggering content update with energy:', beatInfo.energy);
        
        // Apply visual effect immediately to respond to the beat
        this.applyBeatVisualEffect();
        
        // On strong beats, occasionally generate a new LTX video based on current audio
        // but don't wait for it to complete before showing something
        if (this.useLTXVideo && Math.random() < 0.33) { // 1/3 chance to generate a new video
          console.log('Strong beat detected, generating new LTX video in background');
          this.generateLTXContent().then(videoContent => {
            if (videoContent) {
              console.log('LTX video generated, will be used in next content update');
              // Video will be used in next rotation since it's added to contentCache
            }
          }).catch(err => {
            console.error('Error generating LTX video on beat:', err);
          });
        }
        
        // Load new content on strong beat
        this.loadContent({ force: true, beatTriggered: true });
        
        // Apply an immediate video sync - pulse the video element
        if (this.videoElement) {
          // Add a temporary pulse effect
          const originalFilter = this.videoElement.style.filter;
          this.videoElement.style.filter = originalFilter + ' brightness(1.3)';
          
          // Reset filter after a short time
          setTimeout(() => {
            if (this.videoElement) {
              this.videoElement.style.filter = originalFilter;
            }
          }, 200);
        }
      }
    }
  }
  
  /**
   * Get the next content item from cache
   * @return {Object} Content item
   */
  getNextContentItem() {
    if (this.contentCache.length === 0) {
      // Try to create fallback content
      this.createFallbackGradients();
      if (this.contentCache.length === 0) return null;
    }
    
    // Increment and wrap index
    this.currentContentIndex = (this.currentContentIndex + 1) % this.contentCache.length;
    return this.contentCache[this.currentContentIndex];
  }
  
  /**
   * Load content from external sources (Unsplash, Pexels, etc)
   */
  async loadExternalContent() {
    if (this.contentIsLoading) return;
    
    try {
      switch (this.contentMode) {
        case 'unsplash':
          await this.preloadUnsplashImages(3);
          break;
        case 'pexels':
          await this.preloadPexelsContent(3);
          break;
        case 'ai-generate':
          await this.generateAiContent();
          break;
      }
    } catch (error) {
      console.error('Error loading external content:', error);
    }
  }
  
  /**
   * Apply video content to the visualizer
   * @param {Object} content - Video content item
   */
  applyVideoContent(content) {
    if (!this.videoElement) {
      console.error('No video element available');
      return;
    }
    
    // Reset background color and gradient
    this.videoElement.style.backgroundColor = '';
    this.videoElement.style.backgroundImage = '';
    
    // Debug the video content
    console.log('Applying video content:', content);
    
    // Set buffering properties on the video element
    this.videoElement.preload = 'auto';
    this.videoElement.autobuffer = true;
    
    // Remove any previous event listeners
    const videoEl = this.videoElement;
    const newVideoEl = videoEl.cloneNode(true);
    if (videoEl.parentNode) {
      videoEl.parentNode.replaceChild(newVideoEl, videoEl);
      this.videoElement = newVideoEl;
    }
    
    // Clear any previous errors and add new error handling
    console.log('Setting up video error handling');
    this.videoElement.onerror = (e) => {
      console.error('Video loading error:', e);
      // Fall back to a color background on error
      this.videoElement.style.backgroundColor = this.currentColors[0];
      this.helpTextElement.textContent = 'Video error - using fallback';
    };
    
    // Load the video - don't treat local videos as fallback
    if (content.source === 'local') {
      // Check if the URL is absolute or needs to be made absolute
      let videoUrl = content.url;
      if (videoUrl && !videoUrl.startsWith('http') && !videoUrl.startsWith('/')) {
        videoUrl = '/' + videoUrl;
      }
      
      // For local videos, load and play the video
      console.log(`Loading local video: ${videoUrl}`);
      
      // Show loading state
      if (this.helpTextElement) {
        this.helpTextElement.textContent = `Loading local video: ${videoUrl.split('/').pop()}`;
      }
      
      // Set source and load
      this.videoElement.src = videoUrl;
      this.videoElement.load();
      
      // Add event listeners
      this.videoElement.onloadeddata = () => {
        console.log('Video loaded successfully');
        if (this.helpTextElement) {
          this.helpTextElement.textContent = `Playing: ${videoUrl.split('/').pop()}`;
        }
        this.videoElement.play().catch(err => {
          console.error('Error playing video after load:', err);
        });
      };
      
      this.videoElement.oncanplaythrough = () => {
        console.log('Video can play through');
        this.videoElement.play().catch(err => {
          console.error('Error playing video after canplaythrough:', err);
        });
      };
      
    } else if (content.fallback) {
      // For actual fallback, use a colored background
      console.log(`Using fallback for video: ${content.url}`);
      this.videoElement.src = ''; // Clear source
      this.videoElement.style.backgroundColor = this.currentColors[0];
      
      if (this.helpTextElement) {
        this.helpTextElement.textContent = 'Using color fallback (no video available)';
      }
      
    } else {
      // Load external video with proper buffering
      console.log(`Loading external video: ${content.url}`);
      
      if (this.helpTextElement) {
        this.helpTextElement.textContent = `Loading video from ${content.source}...`;
      }
      
      this.videoElement.src = content.url;
      this.videoElement.load();
      
      // Add a buffering event handler
      this.videoElement.oncanplaythrough = () => {
        console.log('Video can play through now');
        if (this.helpTextElement) {
          this.helpTextElement.textContent = `Playing ${content.source} video`;
        }
        this.videoElement.play().catch(err => {
          console.error('Error playing video:', err);
        });
      };
    }
    
    // If the video hasn't started playing within 5 seconds, apply fallback
    const fallbackTimer = setTimeout(() => {
      if (this.videoElement.paused && content.source !== 'fallback') {
        console.warn('Video failed to play within timeout, applying fallback');
        this.videoElement.style.backgroundColor = this.currentColors[0];
        if (this.helpTextElement) {
          this.helpTextElement.textContent = 'Video timeout - using fallback';
        }
      }
    }, 5000);
    
    // Clean up timer when video plays
    this.videoElement.onplaying = () => {
      clearTimeout(fallbackTimer);
      console.log('Video started playing');
    };
  }
  
  /**
   * Apply image content to the visualizer 
   * @param {Object} content - Image content item
   */
  applyImageContent(content) {
    if (!this.videoElement) return;
    
    // Reset video source
    this.videoElement.src = '';
    
    console.log('Applying AI generated image content:', content);
    
    // Create a preloaded image to ensure content loads correctly
    const img = new Image();
    img.onload = () => {
      console.log('Image loaded successfully in applyImageContent:', content.url);
      
      // For images, use background-image
      this.videoElement.style.backgroundImage = `url('${content.url}')`;
      this.videoElement.style.backgroundSize = 'cover';
      this.videoElement.style.backgroundPosition = 'center';
      
      // Set base filter
      this.videoElement.style.filter = 'none';
      
      // Fade in with animation
      this.videoElement.style.opacity = '0';
      setTimeout(() => {
        this.videoElement.style.opacity = '0.9';
      }, 50);
      
      // Get dominant color if available
      let dominantColor = content.color || this.currentColors[0];
      this.dominantColor = dominantColor;
      
      // Show the AI content
      if (this.helpTextElement) {
        if (content.source === 'ai') {
          this.helpTextElement.textContent = `AI Generated: ${content.prompt?.substring(0, 50)}${content.prompt?.length > 50 ? '...' : ''}`;
        } else {
          this.helpTextElement.textContent = `Image: ${content.source}`;
        }
      }
    };
    
    img.onerror = (e) => {
      console.error('Error loading image in applyImageContent:', e);
      console.log('Falling back to color background');
      // Fallback to a color if the image fails to load
      this.videoElement.style.backgroundImage = '';
      this.videoElement.style.backgroundColor = this.currentColors[0];
      
      if (this.helpTextElement) {
        this.helpTextElement.textContent = `Using color fallback - image load failed`;
      }
    };
    
    // Start loading the image
    img.src = content.url;
  }
  
  /**
   * Apply gradient content to the visualizer
   * @param {Object} content - Gradient content item
   */
  applyGradientContent(content) {
    if (!this.videoElement) return;
    
    // Reset video source
    this.videoElement.src = '';
    
    // Get colors from content or current palette
    const colors = content.colors || this.currentColors;
    
    // Create a gradient
    const angle = Math.floor(Math.random() * 360);
    let gradient;
    
    if (Math.random() > 0.5) {
      // Linear gradient
      gradient = `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1] || colors[0]})`;
    } else {
      // Radial gradient
      gradient = `radial-gradient(circle, ${colors[0]}, ${colors[1] || colors[0]})`;
    }
    
    this.videoElement.style.backgroundImage = gradient;
  }
  
  /**
   * Apply visual style filters based on current style
   */
  applyVisualStyleFilters() {
    if (!this.videoElement) return;
    
    let filterValue = '';
    
    switch (this.visualStyle) {
      case 'neon':
        filterValue = 'saturate(1.5) hue-rotate(90deg) brightness(0.7)';
        break;
      case 'cyberpunk':
        filterValue = 'saturate(1.8) hue-rotate(180deg) contrast(1.1)';
        break;
      case 'retro':
        filterValue = 'sepia(0.5) hue-rotate(320deg) saturate(1.7)';
        break;
      case 'pastel':
        filterValue = 'brightness(1.2) contrast(0.9) saturate(0.8)';
        break;
      default:
        filterValue = 'none';
    }
    
    this.videoFilter = filterValue;
    this.videoElement.style.filter = filterValue;
  }
  
  /**
   * Apply a visual effect when a beat is detected
   */
  applyBeatVisualEffect() {
    if (!this.videoElement || !this.videoFilter) return;
    
    // Create a momentary filter change on beat
    const originalFilter = this.videoFilter;
    const beatFilter = `${originalFilter} brightness(1.5)`;
    
    this.videoElement.style.filter = beatFilter;
    
    // Reset filter after a short time
    setTimeout(() => {
      if (this.videoElement) {
        this.videoElement.style.filter = originalFilter;
      }
    }, 100);
  }
  
  /**
   * Apply fallback content as last resort
   */
  applyFallbackContent() {
    if (!this.videoElement) return;
    
    // Reset video source
    this.videoElement.src = '';
    
    // Use a solid color as absolute fallback
    this.videoElement.style.backgroundImage = '';
    this.videoElement.style.backgroundColor = this.currentColors[0];
    
    // Apply a filter for some visual interest
    const filters = [
      'hue-rotate(45deg)',
      'saturate(1.5) contrast(1.1)',
      'brightness(0.8) contrast(1.2)',
      'sepia(0.3) hue-rotate(180deg)'
    ];
    
    const randomFilter = filters[Math.floor(Math.random() * filters.length)];
    this.videoElement.style.filter = randomFilter;
    this.videoFilter = randomFilter;
  }
  
  /**
   * Change the visual style/color scheme
   * @param {string} styleName - Name of the style to switch to
   */
  switchVisualStyle(styleName) {
    if (!this.colorPalettes[styleName]) {
      console.error(`Visual style "${styleName}" not found`);
      return;
    }
    
    this.visualStyle = styleName;
    this.currentColors = this.colorPalettes[styleName];
    
    console.log(`Switched to visual style: ${styleName}`);
    
    // Update video filter based on style
    switch(styleName) {
      case 'neon':
        this.videoElement.style.filter = 'saturate(1.5) hue-rotate(90deg) brightness(0.7)';
        break;
      case 'cyberpunk':
        this.videoElement.style.filter = 'saturate(1.8) hue-rotate(180deg) contrast(1.1)';
        break;
      case 'retro':
        this.videoElement.style.filter = 'sepia(0.5) hue-rotate(320deg) saturate(1.7)';
        break;
      case 'pastel':
        this.videoElement.style.filter = 'brightness(1.2) contrast(0.9) saturate(0.8)';
        break;
      default:
        this.videoElement.style.filter = 'none';
    }
  }
  
  /**
   * Start the visualizer
   */
  start() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.animationId = requestAnimationFrame(this.draw);
    
    if (this.videoElement && this.videoElement.paused) {
      this.videoElement.play().catch(err => {
        console.error('Error playing video:', err);
        // Add a placeholder for video play error
        this.videoElement.style.backgroundColor = '#111';
      });
    }
    
    console.log('VJ Visualizer started');
    return true;
  }
  
  /**
   * Stop the visualizer
   */
  stop() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    if (this.videoElement) {
      this.videoElement.pause();
    }
    
    console.log('VJ Visualizer stopped');
    return true;
  }
  
  /**
   * Main drawing function called on each animation frame
   */
  draw() {
    if (!this.isActive) {
      console.log('Visualizer not active, skipping draw');
      return;
    }
    
    if (!this.analyserNode) {
      console.error('No analyser node available for drawing');
      this.animationId = requestAnimationFrame(this.draw);
      return;
    }
    
    if (!this.canvasElement || !this.canvasContext) {
      console.error('Canvas not available for drawing');
      this.animationId = requestAnimationFrame(this.draw);
      return;
    }
    
    try {
      // Get audio data
      this.analyserNode.getByteFrequencyData(this.frequencyData);
      this.analyserNode.getByteTimeDomainData(this.timeData);
      
      // Check if we have any audio data
      const hasAudioData = this.frequencyData.some(value => value > 0);
      if (!hasAudioData) {
        // Use some fake data for testing if no real audio data
        if (Math.random() < 0.05) {
          console.log('No audio data detected, using test pattern');
        }
        
        // Fill frequency data with a test pattern
        const time = Date.now() / 1000;
        for (let i = 0; i < this.frequencyData.length; i++) {
          const value = 80 + 20 * Math.sin(time + i * 0.1) + 10 * Math.sin(time * 0.5 + i * 0.05);
          this.frequencyData[i] = Math.min(255, Math.max(0, value));
        }
      }
      
      // Detect beats
      const beatInfo = this.detectBeats();
      
      // Check if we need to update content on strong beats
      if (beatInfo.isBeat) {
        this.handleBeatContentUpdate(beatInfo);
      }
      
      // Clear canvases
      this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      if (this.overlayContext) {
        this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      }
      
      // Draw using WebGL if available and enabled
      if (this.gl && this.shaderProgram && this.useShaders) {
        this.drawWithWebGL(beatInfo);
      } else {
        // Otherwise fall back to canvas drawing
        this.drawWithCanvas(beatInfo);
      }
      
      // Common beat visualization on overlay canvas
      if (beatInfo.isBeat && this.overlayContext) {
        this.drawBeatFlash(beatInfo.energy);
      }
    } catch (err) {
      console.error('Error in visualizer draw loop:', err);
    }
    
    // Request next frame
    this.animationId = requestAnimationFrame(this.draw);
  }
  
  /**
   * Draw with WebGL shaders for better performance
   * @param {Object} beatInfo - Beat detection information
   */
  drawWithWebGL(beatInfo) {
    if (!this.gl || !this.shaderProgram || !this.shaderBuffers) return;
    
    const gl = this.gl;
    const program = this.shaderProgram;
    
    // Use our shader program
    gl.useProgram(program);
    
    // Set up viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    // Clear canvas
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Set up position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shaderBuffers.position);
    gl.vertexAttribPointer(
      this.shaderAttribs.position,
      2,          // 2 components per vertex
      gl.FLOAT,   // data is 32bit floats
      false,      // don't normalize
      0,          // stride (0 = auto)
      0           // offset into buffer
    );
    gl.enableVertexAttribArray(this.shaderAttribs.position);
    
    // Set up texture coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shaderBuffers.texCoord);
    gl.vertexAttribPointer(
      this.shaderAttribs.texCoord,
      2,          // 2 components per vertex
      gl.FLOAT,   // data is 32bit floats
      false,      // don't normalize
      0,          // stride (0 = auto)
      0           // offset into buffer
    );
    gl.enableVertexAttribArray(this.shaderAttribs.texCoord);
    
    // Set uniforms
    gl.uniform1f(this.shaderUniforms.time, performance.now() / 1000);
    gl.uniform2f(this.shaderUniforms.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.shaderUniforms.bassEnergy, beatInfo.bassEnergy);
    gl.uniform1f(this.shaderUniforms.intensity, this.intensity);
    
    // Draw the rectangle
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  
  /**
   * Draw with canvas 2D context
   * @param {Object} beatInfo - Beat detection information
   */
  drawWithCanvas(beatInfo) {
    // Draw audio-reactive effects based on the current style
    switch(this.visualStyle) {
      case 'neon':
        this.drawNeonEffects(beatInfo);
        break;
      case 'cyberpunk':
        this.drawCyberpunkEffects(beatInfo);
        break;
      case 'retro':
        this.drawRetroEffects(beatInfo);
        break;
      case 'pastel':
        this.drawPastelEffects(beatInfo);
        break;
      default:
        this.drawDefaultEffects(beatInfo);
    }
  }
  
  /**
   * Detect beats in the audio signal
   * @return {Object} Beat detection information
   */
  detectBeats() {
    // Calculate energy in the lower frequency bands (bass)
    let bassEnergy = 0;
    const bassRange = 10; // First 10 frequency bins (bass frequencies)
    
    for (let i = 0; i < bassRange; i++) {
      bassEnergy += this.frequencyData[i];
    }
    
    // Normalize the energy value
    bassEnergy = bassEnergy / (255 * bassRange);
    
    // Keep a history of energy values
    this.energyHistory.push(bassEnergy);
    if (this.energyHistory.length > 30) {
      this.energyHistory.shift();
    }
    
    // Calculate the average energy
    const avgEnergy = this.energyHistory.reduce((sum, e) => sum + e, 0) / this.energyHistory.length;
    
    // Beat detection - energy significantly higher than the running average
    const beatThreshold = 1.3; // Adjust this value to change sensitivity
    const isBeat = bassEnergy > avgEnergy * beatThreshold && bassEnergy > 0.2;
    
    // If it's a beat, add to beat history
    if (isBeat) {
      const now = Date.now();
      this.beatHistory.push(now);
      
      // Keep only the last 10 beats
      if (this.beatHistory.length > 10) {
        this.beatHistory.shift();
      }
      
      // Calculate BPM if we have enough beats
      if (this.beatHistory.length >= 4) {
        const intervals = [];
        for (let i = 1; i < this.beatHistory.length; i++) {
          intervals.push(this.beatHistory[i] - this.beatHistory[i-1]);
        }
        
        // Calculate average beat interval
        const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
        this.bpm = Math.round(60000 / avgInterval); // Convert to BPM
        
        // Sanity check - BPM should be in a reasonable range (40-220)
        if (this.bpm < 40 || this.bpm > 220) {
          this.bpm = 120; // Reset to default if out of range
        }
      }
    }
    
    // Get overall sound energy (0-1)
    let totalEnergy = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      totalEnergy += this.frequencyData[i];
    }
    totalEnergy = totalEnergy / (255 * this.frequencyData.length);
    
    return {
      isBeat,
      energy: totalEnergy,
      bassEnergy,
      bpm: this.bpm
    };
  }
  
  /**
   * Draw a flash effect when a beat is detected
   * @param {number} energy - Energy level to determine flash intensity
   */
  drawBeatFlash(energy) {
    const ctx = this.overlayContext;
    const width = this.overlayCanvas.width;
    const height = this.overlayCanvas.height;
    
    // Create a radial gradient for the flash
    const gradientSize = Math.max(width, height) * (0.8 + energy * 0.5);
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, gradientSize
    );
    
    // Get the primary color from the current palette
    const baseColor = this.currentColors[0];
    
    // Set gradient colors with transparency
    gradient.addColorStop(0, baseColor + '60'); // Semi-transparent
    gradient.addColorStop(0.7, baseColor + '10'); // More transparent
    gradient.addColorStop(1, baseColor + '00'); // Fully transparent
    
    // Draw the flash
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  
  /**
   * Draw neon style effects
   * @param {Object} beatInfo - Beat detection information
   */
  drawNeonEffects(beatInfo) {
    const ctx = this.canvasContext;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const intensity = this.intensity;
    
    // Number of particles based on quality and energy
    const particleCount = Math.floor(50 * intensity * (1 + beatInfo.energy));
    
    // Draw neon waves
    ctx.lineWidth = 2 + beatInfo.energy * 3;
    
    // Draw multiple lines with different colors from the palette
    for (let c = 0; c < 3; c++) {
      const color = this.currentColors[c % this.currentColors.length];
      ctx.strokeStyle = color;
      ctx.beginPath();
      
      // Create a wave pattern based on audio data
      const sliceWidth = width / this.timeData.length;
      let x = 0;
      
      for (let i = 0; i < this.timeData.length; i++) {
        const v = this.timeData[i] / 128.0; // normalize to 0-2
        const y = v * height / 2;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        
        x += sliceWidth;
      }
      
      ctx.stroke();
      
      // Offset for next line
      ctx.translate(0, 10);
    }
    
    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Draw neon particles
    for (let i = 0; i < particleCount; i++) {
      const colorIndex = i % this.currentColors.length;
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 1 + Math.random() * 3 * intensity;
      
      // Create a particle glow effect
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
      gradient.addColorStop(0, this.currentColors[colorIndex]);
      gradient.addColorStop(0.5, this.currentColors[colorIndex] + '40');
      gradient.addColorStop(1, this.currentColors[colorIndex] + '00');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw frequency bars with glow effect
    const barWidth = width / (this.frequencyData.length / 2);
    const barMaxHeight = height * 0.7;
    
    ctx.save();
    
    // Add shadow for glow effect
    ctx.shadowBlur = 15 * intensity;
    ctx.shadowColor = this.currentColors[0];
    
    // Draw bars
    for (let i = 0; i < this.frequencyData.length / 2; i++) {
      const barHeight = (this.frequencyData[i] / 255) * barMaxHeight * intensity;
      const x = i * barWidth;
      const y = height - barHeight;
      
      // Alternate colors
      ctx.fillStyle = this.currentColors[i % this.currentColors.length];
      
      // Draw rect with rounded corners for neon effect
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth - 1, barHeight, 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Draw cyberpunk style effects
   * @param {Object} beatInfo - Beat detection information
   */
  drawCyberpunkEffects(beatInfo) {
    const ctx = this.canvasContext;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const intensity = this.intensity;
    
    // Grid parameters
    const gridRows = 10;
    const gridCols = 20;
    const cellWidth = width / gridCols;
    const cellHeight = height / gridRows;
    
    // Perspective vanishing point
    const vpX = width / 2;
    const vpY = height / 2;
    
    // Calculate phase based on time and beat
    const now = Date.now() / 1000;
    const beatPhase = beatInfo.isBeat ? Math.random() * Math.PI : 0;
    const phase = now + beatPhase;
    
    // Draw grid
    ctx.strokeStyle = this.currentColors[0];
    ctx.lineWidth = 1.5 * intensity;
    
    // Draw grid with perspective distortion
    ctx.beginPath();
    
    // Horizontal lines
    for (let row = 0; row <= gridRows; row++) {
      const y = row * cellHeight;
      const distortionY = Math.sin(phase + row * 0.2) * 10 * beatInfo.energy;
      
      ctx.moveTo(0, y + distortionY);
      
      // Add points with distortion based on audio
      for (let col = 0; col <= gridCols; col++) {
        const x = col * cellWidth;
        const freqIndex = Math.floor(col / gridCols * this.frequencyData.length);
        const audioHeight = (this.frequencyData[freqIndex] / 255) * 20 * intensity;
        ctx.lineTo(x, y + distortionY + audioHeight);
      }
    }
    
    // Vertical lines
    for (let col = 0; col <= gridCols; col++) {
      const x = col * cellWidth;
      const distortionX = Math.sin(phase + col * 0.2) * 10 * beatInfo.energy;
      
      ctx.moveTo(x + distortionX, 0);
      
      // Add points with distortion based on audio
      for (let row = 0; row <= gridRows; row++) {
        const y = row * cellHeight;
        const freqIndex = Math.floor(row / gridRows * this.frequencyData.length);
        const audioWidth = (this.frequencyData[freqIndex] / 255) * 20 * intensity;
        ctx.lineTo(x + distortionX + audioWidth, y);
      }
    }
    
    // Draw the grid with glow effect
    ctx.shadowColor = this.currentColors[0];
    ctx.shadowBlur = 10 * intensity;
    ctx.stroke();
    
    // Draw reactive shapes at certain grid intersections
    for (let col = 0; col < gridCols; col += 4) {
      for (let row = 0; row < gridRows; row += 2) {
        const x = col * cellWidth;
        const y = row * cellHeight;
        const freqIndex = Math.floor((col / gridCols + row / gridRows) * 0.5 * this.frequencyData.length);
        const value = this.frequencyData[freqIndex] / 255;
        
        if (value > 0.5) {
          const size = value * 15 * intensity;
          ctx.fillStyle = this.currentColors[Math.floor(Math.random() * this.currentColors.length)];
          
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    // Add a beat-reactive scanline effect
    if (beatInfo.energy > 0.5) {
      ctx.fillStyle = this.currentColors[1] + '40';
      const scanlineHeight = 2;
      const scanlineCount = 10;
      const scanlineSpacing = height / scanlineCount;
      
      for (let i = 0; i < scanlineCount; i++) {
        const y = i * scanlineSpacing + (phase * 100) % scanlineSpacing;
        ctx.fillRect(0, y, width, scanlineHeight);
      }
    }
  }
  
  /**
   * Draw retro style effects
   * @param {Object} beatInfo - Beat detection information
   */
  drawRetroEffects(beatInfo) {
    const ctx = this.canvasContext;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const intensity = this.intensity;
    
    // Calculate sun position and size based on audio
    const sunRadius = 50 + beatInfo.bassEnergy * 100 * intensity;
    const sunX = width / 2;
    const sunY = height * 0.7;
    
    // Draw retrowave sun
    const gradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
    gradient.addColorStop(0, this.currentColors[0]);
    gradient.addColorStop(0.7, this.currentColors[1]);
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw laser grid horizon
    ctx.strokeStyle = this.currentColors[2];
    ctx.lineWidth = 2 * intensity;
    
    // Draw perspective grid lines
    const horizonY = height * 0.6;
    const gridLines = 20;
    const spacing = width / gridLines;
    
    ctx.beginPath();
    
    // Vertical grid lines with perspective
    for (let i = 0; i <= gridLines; i++) {
      const x = i * spacing;
      const topY = horizonY;
      
      // Audio-reactive displacement
      const freqIndex = Math.floor(i / gridLines * this.frequencyData.length);
      const displacement = (this.frequencyData[freqIndex] / 255) * 30 * intensity;
      
      ctx.moveTo(x, topY - displacement);
      ctx.lineTo(x < width/2 ? 0 : width, height);
    }
    
    // Horizontal grid lines
    const horizontalLines = 10;
    for (let i = 0; i <= horizontalLines; i++) {
      const progress = i / horizontalLines;
      const y = horizonY + (height - horizonY) * progress;
      
      // Make lines thicker near horizon for perspective effect
      ctx.lineWidth = 2 * intensity * (1 - progress);
      
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    
    ctx.stroke();
    
    // Draw stars/particles in the sky
    const starCount = 50 * intensity;
    
    ctx.fillStyle = '#FFF';
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * horizonY * 0.8;
      const size = 1 + Math.random() * 2;
      
      // Pulse stars with the beat
      const pulseFactor = beatInfo.isBeat ? 1.5 : 1;
      
      ctx.beginPath();
      ctx.arc(x, y, size * pulseFactor, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw a mountain silhouette
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    
    // Create mountain peaks
    const peaks = 10;
    const peakWidth = width / peaks;
    
    for (let i = 0; i <= peaks; i++) {
      const x = i * peakWidth;
      const freqIndex = Math.floor(i / peaks * this.frequencyData.length / 2);
      const peakHeight = (this.frequencyData[freqIndex] / 255) * horizonY * 0.5 * intensity;
      
      ctx.lineTo(x, horizonY - peakHeight);
    }
    
    ctx.lineTo(width, horizonY);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Draw pastel style effects
   * @param {Object} beatInfo - Beat detection information
   */
  drawPastelEffects(beatInfo) {
    const ctx = this.canvasContext;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const intensity = this.intensity;
    
    // Draw soft circular gradients that move with the music
    const circleCount = 5;
    
    for (let i = 0; i < circleCount; i++) {
      // Use frequency data to position circles
      const freqIndex = Math.floor(i / circleCount * this.frequencyData.length);
      const freqValue = this.frequencyData[freqIndex] / 255;
      
      // Calculate position
      const angle = (i / circleCount) * Math.PI * 2 + (Date.now() / 2000);
      const distance = 100 + freqValue * 100 * intensity;
      const x = width / 2 + Math.cos(angle) * distance;
      const y = height / 2 + Math.sin(angle) * distance;
      
      // Calculate size based on bass energy
      const size = (50 + beatInfo.bassEnergy * 100) * intensity;
      
      // Create soft gradient
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, this.currentColors[i % this.currentColors.length] + 'CC');
      gradient.addColorStop(0.6, this.currentColors[i % this.currentColors.length] + '40');
      gradient.addColorStop(1, 'transparent');
      
      // Draw circle
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw floating bubbles
    const bubbleCount = 20 * intensity;
    
    for (let i = 0; i < bubbleCount; i++) {
      // Use time and index to create movement
      const time = Date.now() / 1000;
      const angle = time * 0.5 + i * 0.2;
      const x = width / 2 + Math.cos(angle) * width * 0.4;
      const y = height / 2 + Math.sin(angle * 0.7) * height * 0.3;
      
      // Use audio data to determine size
      const freqIndex = Math.floor((i / bubbleCount) * this.frequencyData.length);
      const freqValue = this.frequencyData[freqIndex] / 255;
      const size = (5 + freqValue * 15) * intensity;
      
      // Determine color
      const colorIndex = i % this.currentColors.length;
      ctx.fillStyle = this.currentColors[colorIndex] + '80'; // Semi-transparent
      
      // Draw bubble
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Add highlight
      ctx.fillStyle = '#FFFFFF60';
      ctx.beginPath();
      ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw flowing waves
    ctx.strokeStyle = this.currentColors[0] + '40';
    ctx.lineWidth = 4 * intensity;
    
    const waveCount = 3;
    for (let w = 0; w < waveCount; w++) {
      const yOffset = height * (w + 1) / (waveCount + 1);
      const phaseOffset = w * Math.PI / 3;
      
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const progress = x / width;
        const freqIndex = Math.floor(progress * this.frequencyData.length);
        const amplitude = (this.frequencyData[freqIndex] / 255) * 50 * intensity;
        
        const time = Date.now() / 1000;
        const y = yOffset + Math.sin(time * 2 + progress * 10 + phaseOffset) * amplitude;
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }
  
  /**
   * Draw default effects if no style is selected
   * @param {Object} beatInfo - Beat detection information
   */
  drawDefaultEffects(beatInfo) {
    const ctx = this.canvasContext;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    
    // Simply draw frequency bars
    const barWidth = width / this.frequencyData.length;
    
    ctx.fillStyle = '#FF5500';
    
    for (let i = 0; i < this.frequencyData.length; i++) {
      const barHeight = (this.frequencyData[i] / 255) * height * 0.7;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
  }
}

// Export for use in the main application
window.VJVisualizer = VJVisualizer;