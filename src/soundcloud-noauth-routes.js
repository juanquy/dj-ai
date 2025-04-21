/**
 * SoundCloud No-Auth Routes for DJAI
 * Routes that don't require official API credentials
 */

const express = require('express');
const https = require('https');
const SoundCloudNoAuth = require('./soundcloud-noauth');

const router = express.Router();
const sc = new SoundCloudNoAuth();

// Initialize client on startup
sc.initialize().catch(err => console.error('Error initializing SoundCloud No-Auth client:', err));

// Search for tracks
router.get('/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const tracks = await sc.search(query, parseInt(limit));
    res.json(tracks);
  } catch (error) {
    console.error('Error searching tracks:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get track details
router.get('/track/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    const track = await sc.getTrack(trackId);
    res.json(track);
  } catch (error) {
    console.error('Error getting track details:', error);
    res.status(500).json({ error: 'Failed to get track details' });
  }
});

// Stream a track
router.get('/stream/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    
    // Get direct stream URL
    const streamUrl = await sc.getStreamUrl(trackId);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Handle range requests
    const range = req.headers.range;
    
    // Add agent options to prevent socket hangups
    const requestOptions = {
      headers: range ? { 'Range': range } : {},
      agent: new https.Agent({ 
        keepAlive: true,
        timeout: 60000,
        maxSockets: 10,
        maxFreeSockets: 5,
        scheduling: 'fifo'
      })
    };
    
    // Proxy the audio stream with error handling
    const streamReq = https.get(streamUrl, requestOptions, (streamRes) => {
      // Copy headers from SoundCloud response
      res.status(streamRes.statusCode);
      
      if (streamRes.headers['content-length']) {
        res.setHeader('Content-Length', streamRes.headers['content-length']);
      }
      
      if (streamRes.headers['content-range']) {
        res.setHeader('Content-Range', streamRes.headers['content-range']);
      }
      
      if (streamRes.headers['accept-ranges']) {
        res.setHeader('Accept-Ranges', streamRes.headers['accept-ranges']);
      }
      
      // Pipe the stream to the response with error handling
      streamRes.pipe(res).on('error', (err) => {
        console.error('Error piping stream data:', err);
        // Only send error if headers haven't been sent
        if (!res.headersSent) {
          res.status(500).send('Stream error');
        }
      });
      
      // Handle stream end events
      streamRes.on('end', () => {
        if (!res.finished) {
          res.end();
        }
      });
    });
    
    // Track retries
    const MAX_RETRIES = 5; // Increased from 3 to 5
    let retryCount = 0;
    
    // Handle request errors with retry logic
    streamReq.on('error', (err) => {
      console.error('Error streaming from SoundCloud:', err);
      
      // Handle more network-specific errors with retry logic
      if ((err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || 
           err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND' ||
           err.code === 'EPIPE') && retryCount < MAX_RETRIES) {
        
        retryCount++;
        console.log(`Network error (${err.code}) while streaming track ${trackId}. Retry attempt ${retryCount}/${MAX_RETRIES}`);
        
        // Retry with exponential backoff
        setTimeout(() => {
          try {
            // Create a new stream request with new agent
            const retryOptions = {
              headers: range ? { 'Range': range } : {},
              agent: new https.Agent({ 
                keepAlive: true,
                timeout: 60000,
                maxSockets: 10,
                maxFreeSockets: 5,
                scheduling: 'fifo'
              })
            };
            
            const retryReq = https.get(streamUrl, retryOptions, (streamRes) => {
              // Copy response handling from the original request
              res.status(streamRes.statusCode);
              
              if (streamRes.headers['content-length']) {
                res.setHeader('Content-Length', streamRes.headers['content-length']);
              }
              
              if (streamRes.headers['content-range']) {
                res.setHeader('Content-Range', streamRes.headers['content-range']);
              }
              
              if (streamRes.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', streamRes.headers['accept-ranges']);
              }
              
              // Pipe with error handling
              streamRes.pipe(res).on('error', (pipeErr) => {
                console.error('Error piping retry stream data:', pipeErr);
                if (!res.headersSent) {
                  res.status(500).send('Stream error during retry');
                }
              });
              
              // Handle stream end
              streamRes.on('end', () => {
                if (!res.finished) {
                  res.end();
                }
              });
            });
            
            // Set timeout for retry request - increased from 120s to 180s
            retryReq.setTimeout(180000, () => {
              console.error('Retry stream request timeout');
              retryReq.destroy();
              if (!res.headersSent) {
                res.status(504).send('Stream request timeout during retry');
              }
            });
            
            // Handle retry request errors
            retryReq.on('error', (retryErr) => {
              console.error(`Retry attempt ${retryCount} failed:`, retryErr);
              if (!res.headersSent) {
                res.status(500).send('Error streaming track after retry');
              }
            });
            
            // Handle client disconnect during retry
            req.on('close', () => {
              retryReq.destroy();
            });
            
          } catch (retryError) {
            console.error('Error during retry attempt:', retryError);
            if (!res.headersSent) {
              res.status(500).send('Server error during retry');
            }
          }
        }, Math.pow(1.5, retryCount) * 1000); // Modified backoff: 1.5s, 2.25s, 3.4s, 5.1s, 7.6s
      } else {
        // No more retries or different error
        if (!res.headersSent) {
          res.status(500).send('Error streaming track');
        }
      }
    });
    
    // Handle client disconnect
    req.on('close', () => {
      streamReq.destroy();
    });
    
    // Set a more generous timeout (3 minutes)
    streamReq.setTimeout(180000, () => {
      console.error('Stream request timeout');
      streamReq.destroy();
      if (!res.headersSent) {
        res.status(504).send('Stream request timeout');
      }
    });
  } catch (error) {
    console.error('Error in stream endpoint:', error);
    if (!res.headersSent) {
      res.status(500).send('Server error');
    }
  }
});

// Resolve a SoundCloud URL to track data
router.get('/resolve', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const trackData = await sc.resolveUrl(url);
    res.json(trackData);
  } catch (error) {
    console.error('Error resolving URL:', error);
    res.status(500).json({ error: 'Failed to resolve URL' });
  }
});

// Generate a mix from track IDs
router.post('/generate-mix', async (req, res) => {
  try {
    const { trackIds } = req.body;
    
    if (!Array.isArray(trackIds) || trackIds.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 track IDs' });
    }
    
    const mixData = await sc.generateMix(trackIds);
    res.json(mixData);
  } catch (error) {
    console.error('Error generating mix:', error);
    res.status(500).json({ error: 'Failed to generate mix' });
  }
});

module.exports = router;