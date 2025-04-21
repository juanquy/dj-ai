/**
 * DJAI Visualizer Shaders
 * WebGL shader library for VJ visuals
 */

// Basic shaders library for WebGL effects
window.VISUALIZER_SHADERS = {
  // Standard vertex shader for most effects
  basicVertex: `
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    
    varying vec2 vTextureCoord;
    
    void main() {
      gl_Position = vec4(aVertexPosition, 0.0, 1.0);
      vTextureCoord = aTextureCoord;
    }
  `,
  
  // Fragment shader for neon glow effect
  neonFragment: `
    precision mediump float;
    
    uniform float uTime;
    uniform vec2 uResolution;
    uniform sampler2D uSampler;
    uniform float uBassEnergy;
    uniform float uIntensity;
    
    varying vec2 vTextureCoord;
    
    void main() {
      vec2 uv = vTextureCoord;
      vec2 center = vec2(0.5, 0.5);
      
      // Distortion based on bass energy
      float distAmt = 0.1 * uBassEnergy * uIntensity;
      vec2 dist = uv - center;
      float distLength = length(dist);
      
      // Apply distortion
      uv += dist * sin(distLength * 20.0 - uTime) * distAmt;
      
      // Color cycling
      float cycle = sin(uTime * 0.5) * 0.5 + 0.5;
      
      // Create glow
      float glow = max(0.0, 1.0 - length(uv - center) * 2.0);
      glow = pow(glow, 3.0) * 2.0 * uIntensity;
      
      // Create base color
      vec3 col = mix(
        vec3(1.0, 0.2, 0.8),  // Pink
        vec3(0.2, 0.4, 1.0),  // Blue
        cycle
      );
      
      // Add energy-reactive bloom
      col += vec3(glow) * uBassEnergy;
      
      // Grid effect
      vec2 grid = abs(fract(uv * 10.0) - 0.5);
      float gridPattern = smoothstep(0.45, 0.5, max(grid.x, grid.y));
      col += gridPattern * col * uBassEnergy;
      
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  
  // Fragment shader for cyberpunk grid effect
  cyberpunkFragment: `
    precision mediump float;
    
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBassEnergy;
    uniform float uIntensity;
    
    varying vec2 vTextureCoord;
    
    void main() {
      vec2 uv = vTextureCoord;
      
      // Grid parameters
      float gridSize = 20.0 + sin(uTime * 0.2) * 5.0;
      float lineWidth = 0.02 * uIntensity;
      
      // Distort UV based on energy
      uv.y += sin(uv.x * 10.0 + uTime) * 0.02 * uBassEnergy;
      
      // Create grid pattern
      vec2 grid = abs(fract(uv * gridSize) - 0.5);
      float gridPattern = smoothstep(0.5 - lineWidth, 0.5, max(grid.x, grid.y));
      
      // Grid color cycling
      vec3 gridCol = mix(
        vec3(0.2, 0.8, 1.0), // Cyan
        vec3(1.0, 0.3, 0.8), // Pink
        sin(uTime * 0.3) * 0.5 + 0.5
      );
      
      // Distance from center for vignette
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(uv, center);
      
      // Vignette effect
      float vignette = smoothstep(0.8, 0.2, dist);
      
      // Combine effects
      vec3 col = gridCol * gridPattern * (uBassEnergy + 0.5) * vignette;
      
      // Add scanlines based on energy
      float scanline = sin(uv.y * uResolution.y * 0.5 - uTime * 10.0) * 0.5 + 0.5;
      col *= mix(1.0, scanline, 0.1 + uBassEnergy * 0.2);
      
      // Add reactive glow
      col += gridCol * gridPattern * uBassEnergy * 2.0 * uIntensity;
      
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  
  // Fragment shader for retro sun effect
  retroFragment: `
    precision mediump float;
    
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBassEnergy;
    uniform float uIntensity;
    
    varying vec2 vTextureCoord;
    
    void main() {
      vec2 uv = vTextureCoord;
      
      // Move sun position based on time and energy
      float sunY = 0.6 + sin(uTime * 0.2) * 0.05;
      vec2 sunPos = vec2(0.5, sunY);
      
      // Sun glow
      float sun = distance(uv, sunPos);
      sun = smoothstep(0.3 * uIntensity, 0.0, sun);
      
      // Sun color gradient
      vec3 sunColor = mix(
        vec3(1.0, 0.2, 0.1), // Reddish
        vec3(1.0, 0.7, 0.0), // Yellow
        sun
      );
      
      // Grid horizon
      float horizon = sunPos.y;
      float grid = 0.0;
      
      // Only draw grid below horizon
      if (uv.y > horizon) {
        // Calculate perspective grid
        vec2 gridUV = uv - vec2(0.5, horizon);
        gridUV.y = 0.1 / gridUV.y;
        gridUV.x *= gridUV.y * 1.0;
        
        // Create grid lines
        vec2 gridPattern = abs(fract(gridUV * 10.0) - 0.5);
        grid = smoothstep(0.05, 0.06, min(gridPattern.x, gridPattern.y));
        
        // Make grid fade in distance
        grid *= smoothstep(5.0, 0.3, gridUV.y);
      }
      
      // Background gradient
      vec3 bgColor = mix(
        vec3(0.0, 0.0, 0.2), // Dark blue
        vec3(0.9, 0.2, 0.5), // Pink
        smoothstep(1.0, 0.0, uv.y)
      );
      
      // Combine elements
      vec3 col = mix(bgColor, sunColor, sun);
      
      // Add grid with energy-reactive color
      vec3 gridColor = mix(
        vec3(0.9, 0.2, 0.9), // Purple
        vec3(0.0, 0.8, 0.9), // Cyan
        sin(uTime * 0.3) * 0.5 + 0.5
      );
      
      col = mix(col, gridColor, grid * uIntensity);
      
      // Add energy-reactive pulsing
      col *= 0.8 + uBassEnergy * 0.5;
      
      // Add reactive stars
      if (uv.y < horizon && fract(uv.x * 50.0 + uv.y * 30.0 + uTime) < 0.02 * uBassEnergy) {
        col += vec3(1.0) * uIntensity;
      }
      
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  
  // Fragment shader for pastel flow effect
  pastelFragment: `
    precision mediump float;
    
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uBassEnergy;
    uniform float uIntensity;
    
    varying vec2 vTextureCoord;
    
    // Simplex noise function
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                 -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
    
    void main() {
      vec2 uv = vTextureCoord;
      
      // Adjust UV for aspect ratio
      uv.x *= uResolution.x / uResolution.y;
      
      // Create flowing noise patterns
      float time = uTime * 0.2;
      float speed = 0.5 + uBassEnergy * 0.5;
      
      // Multiple layers of noise
      float n1 = snoise(uv * 1.5 + time * speed);
      float n2 = snoise(uv * 3.0 - time * speed * 0.8);
      float n3 = snoise(uv * 0.8 + time * speed * 0.3);
      
      // Combine noise layers
      float noise = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
      noise = (noise + 1.0) * 0.5; // Normalize to 0.0-1.0
      
      // Create pastel gradient
      vec3 color1 = vec3(0.95, 0.8, 0.9); // Light pink
      vec3 color2 = vec3(0.8, 0.9, 1.0);  // Light blue
      vec3 color3 = vec3(0.9, 1.0, 0.8);  // Light green
      
      // Mix colors based on noise and time
      vec3 col = mix(color1, color2, noise);
      col = mix(col, color3, sin(uTime * 0.1) * 0.5 + 0.5);
      
      // Add energy-reactive brightness
      col = mix(col, vec3(1.0), uBassEnergy * 0.3 * uIntensity);
      
      // Add subtle noise variation
      float detail = snoise(uv * 10.0 + time * 2.0) * 0.1 * uIntensity;
      col += detail;
      
      // Add bubbles
      for (int i = 0; i < 5; i++) {
        float t = time + float(i) * 1.0;
        vec2 bubblePos = vec2(
          0.5 + sin(t * 0.4) * 0.4,
          0.5 + cos(t * 0.3) * 0.4
        );
        
        float bubbleSize = 0.05 + sin(t) * 0.02 + uBassEnergy * 0.05;
        float bubble = smoothstep(bubbleSize, bubbleSize - 0.01, distance(uv, bubblePos));
        
        col = mix(col, vec3(1.0), bubble * 0.3 * uIntensity);
      }
      
      gl_FragColor = vec4(col, 1.0);
    }
  `
};