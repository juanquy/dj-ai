/**
 * SoundCloud No-Auth Module for DJAI
 * Alternative approach that doesn't require API credentials
 */
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Path for caching client ID
const CACHE_FILE = path.join(__dirname, '.soundcloud_client_id_cache');
// Default fallback client ID
const DEFAULT_CLIENT_ID = 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';

class SoundCloudNoAuth {
  constructor() {
    this.clientId = null;
    this.initialized = false;
    this.clientIdExpiryTime = null; // Time when the client ID should be refreshed
  }

  /**
   * Initialize the client by extracting or loading a client ID
   */
  async initialize() {
    if (this.initialized && this.clientId && this.clientIdExpiryTime && Date.now() < this.clientIdExpiryTime) {
      return;
    }
    
    try {
      // Try to get cached client ID first
      if (fs.existsSync(CACHE_FILE)) {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        
        // If cache is valid and not expired
        if (cacheData.clientId && cacheData.expiryTime && Date.now() < cacheData.expiryTime) {
          this.clientId = cacheData.clientId;
          this.clientIdExpiryTime = cacheData.expiryTime;
          this.initialized = true;
          console.log('Using cached SoundCloud client ID:', this.clientId);
          return;
        }
      }
    } catch (e) {
      console.error('Error reading cached client ID:', e);
    }
    
    // Extract new client ID
    await this.extractClientId();
    this.initialized = true;
  }

  /**
   * Extract client ID from SoundCloud's web player
   */
  async extractClientId() {
    try {
      console.log('Extracting SoundCloud client ID...');
      
      // Fetch the SoundCloud homepage
      const response = await fetch('https://soundcloud.com/');
      const html = await response.text();
      
      // Find all script URLs
      const scriptMatches = html.match(/<script crossorigin src="([^"]+)"/g) || [];
      
      for (const scriptTag of scriptMatches) {
        const match = scriptTag.match(/<script crossorigin src="([^"]+)"/);
        if (!match) continue;
        
        const scriptUrl = match[1];
        
        try {
          // Fetch each script and look for client_id
          const scriptResponse = await fetch(scriptUrl);
          const scriptContent = await scriptResponse.text();
          
          const clientIdMatch = scriptContent.match(/client_id:"([a-zA-Z0-9]{32})"/);
          if (clientIdMatch) {
            this.clientId = clientIdMatch[1];
            
            // Set expiry to 12 hours from now
            this.clientIdExpiryTime = Date.now() + (12 * 60 * 60 * 1000);
            
            // Cache the client ID
            try {
              fs.writeFileSync(CACHE_FILE, JSON.stringify({
                clientId: this.clientId,
                expiryTime: this.clientIdExpiryTime
              }));
            } catch (e) {
              console.error('Error caching client ID:', e);
            }
            
            console.log('Successfully extracted SoundCloud client ID:', this.clientId);
            return this.clientId;
          }
        } catch (err) {
          console.error(`Error fetching script ${scriptUrl}:`, err);
        }
      }
      
      // Fallback to default if extraction fails
      console.log('Extraction failed, using default client ID');
      this.clientId = DEFAULT_CLIENT_ID;
      this.clientIdExpiryTime = Date.now() + (1 * 60 * 60 * 1000); // Only cache default for 1 hour
      return this.clientId;
      
    } catch (error) {
      console.error('Error extracting client ID:', error);
      this.clientId = DEFAULT_CLIENT_ID;
      this.clientIdExpiryTime = Date.now() + (1 * 60 * 60 * 1000);
      return this.clientId;
    }
  }

  /**
   * Search for tracks on SoundCloud
   */
  async search(query, limit = 10) {
    await this.initialize();
    
    try {
      const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${this.clientId}&limit=${limit}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Client ID might be invalid, try to extract a new one
          await this.extractClientId();
          // Retry with new client ID
          return this.search(query, limit);
        }
        throw new Error(`Search failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Format tracks to match app's expected format
      return data.collection.map(track => ({
        id: track.id,
        title: track.title,
        duration: track.duration,
        bpm: track.bpm || null,
        user: {
          username: track.user?.username || 'Unknown artist'
        },
        artwork_url: track.artwork_url,
        permalink_url: track.permalink_url,
        genre: track.genre
      }));
    } catch (error) {
      console.error('Error searching tracks:', error);
      throw error;
    }
  }

  /**
   * Get track details by ID
   */
  async getTrack(trackId) {
    await this.initialize();
    
    try {
      const url = `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${this.clientId}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Client ID might be invalid, try to extract a new one
          await this.extractClientId();
          // Retry with new client ID
          return this.getTrack(trackId);
        }
        throw new Error(`Failed to get track with status ${response.status}`);
      }
      
      const track = await response.json();
      return track;
    } catch (error) {
      console.error(`Error fetching track ${trackId}:`, error);
      throw error;
    }
  }

  /**
   * Get stream URL for a track
   */
  async getStreamUrl(trackId) {
    await this.initialize();
    
    try {
      const trackData = await this.getTrack(trackId);
      
      if (trackData && trackData.media && trackData.media.transcodings) {
        // Find stream options prioritizing progressive MP3 streams
        const streamOptions = [
          // First priority: Progressive MP3 (best for stable streaming)
          trackData.media.transcodings.find(
            t => t.format.protocol === 'progressive' && t.format.mime_type === 'audio/mpeg'
          ),
          // Second priority: Any MP3
          trackData.media.transcodings.find(
            t => t.format.mime_type === 'audio/mpeg'
          ),
          // Third priority: Progressive of any format
          trackData.media.transcodings.find(
            t => t.format.protocol === 'progressive'
          ),
          // Fallback: Any available transcoding
          trackData.media.transcodings[0]
        ].filter(Boolean)[0]; // Get first non-null option
        
        if (streamOptions && streamOptions.url) {
          const MAX_ATTEMPTS = 3;
          
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
              // Add timeout and retry options to fetch
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
              
              const response = await fetch(`${streamOptions.url}?client_id=${this.clientId}`, {
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
              });
              
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                  // Client ID might be invalid, try to extract a new one
                  await this.extractClientId();
                  // Restart from beginning with new client ID
                  return this.getStreamUrl(trackId);
                }
                
                if (attempt < MAX_ATTEMPTS - 1) {
                  console.log(`Attempt ${attempt + 1} failed with status ${response.status}, retrying...`);
                  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                  continue;
                }
                
                throw new Error(`Failed to get stream URL with status ${response.status}`);
              }
              
              const streamData = await response.json();
              if (streamData && streamData.url) {
                console.log(`Successfully obtained stream URL for track ${trackId}`);
                return streamData.url;
              }
              
              throw new Error('Stream URL not found in response');
            } catch (fetchError) {
              if (fetchError.name === 'AbortError') {
                console.log(`Fetch timeout on attempt ${attempt + 1}, retrying...`);
                if (attempt === MAX_ATTEMPTS - 1) {
                  throw new Error('Stream URL fetch timed out after multiple attempts');
                }
              } else if (attempt === MAX_ATTEMPTS - 1) {
                throw fetchError;
              }
              
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
          }
        }
      }
      
      throw new Error('Could not get stream URL - no suitable transcodings found');
    } catch (error) {
      console.error(`Error getting stream URL for track ${trackId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve a SoundCloud URL to track data
   */
  async resolveUrl(url) {
    await this.initialize();
    
    try {
      const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${this.clientId}`;
      const response = await fetch(resolveUrl);
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Client ID might be invalid, try to extract a new one
          await this.extractClientId();
          // Retry with new client ID
          return this.resolveUrl(url);
        }
        throw new Error(`Failed to resolve URL with status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check if it's a track (not a playlist, user, etc.)
      if (data.kind !== 'track') {
        throw new Error('URL does not point to a track');
      }
      
      return data;
    } catch (error) {
      console.error('Error resolving URL:', error);
      throw error;
    }
  }

  /**
   * Estimate BPM based on genre if not available
   */
  estimateBpm(track) {
    const genre = (track.genre || '').toLowerCase();
    
    if (genre.includes('house')) return 128;
    if (genre.includes('techno')) return 130;
    if (genre.includes('drum') && genre.includes('bass')) return 174;
    if (genre.includes('dubstep')) return 140;
    if (genre.includes('hip') || genre.includes('rap')) return 95;
    if (genre.includes('trap')) return 140;
    if (genre.includes('ambient')) return 85;
    return 120; // Default BPM
  }

  /**
   * Generate a mix from track IDs
   */
  async generateMix(trackIds) {
    await this.initialize();
    
    try {
      // Get track details for all IDs
      const tracks = await Promise.all(
        trackIds.map(id => this.getTrack(id))
      );
      
      // Add BPM estimation if not available
      const analyzedTracks = tracks.map(track => ({
        ...track,
        bpm: track.bpm || this.estimateBpm(track),
        analyzed: true
      }));
      
      // Sort by BPM for optimal mix order
      const orderedTracks = [...analyzedTracks].sort((a, b) => {
        const aBpm = a.bpm || 120;
        const bBpm = b.bpm || 120;
        return aBpm - bBpm;
      });
      
      // Generate transition points
      const transitions = [];
      for (let i = 0; i < orderedTracks.length - 1; i++) {
        const currentTrack = orderedTracks[i];
        const nextTrack = orderedTracks[i + 1];
        
        // Calculate transition point at 80% of track duration
        const currentDuration = currentTrack.duration || 180000;
        const transitionPoint = Math.floor(currentDuration * 0.8);
        
        transitions.push({
          fromTrack: currentTrack.id,
          toTrack: nextTrack.id,
          transitionPoint,
          bpmDifference: (nextTrack.bpm || 120) - (currentTrack.bpm || 120)
        });
      }
      
      return {
        tracks: orderedTracks,
        transitions,
        totalDuration: orderedTracks.reduce((total, track) => total + (track.duration || 180000), 0)
      };
    } catch (error) {
      console.error('Error generating mix:', error);
      throw error;
    }
  }
}

module.exports = SoundCloudNoAuth;