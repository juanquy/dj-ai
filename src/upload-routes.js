/**
 * File upload routes for DJAI
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mm = require('music-metadata');

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userDir = path.join(__dirname, '../uploads', String(req.session.userId));
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    // Use original filename but make it safe
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, Date.now() + '-' + safeFilename);
  }
});

// File filter to accept only audio files
const fileFilter = (req, file, cb) => {
  // Accept only audio files
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'), false);
  }
};

// Configure multer
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload route
router.post('/track', upload.single('track'), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Parse audio metadata
    const metadata = await mm.parseFile(req.file.path);
    
    // Extract BPM if available, or estimate
    let bpm = null;
    if (metadata.common && metadata.common.bpm) {
      bpm = parseFloat(metadata.common.bpm);
    }
    
    // Create track info
    const trackInfo = {
      id: path.basename(req.file.path),
      title: metadata.common.title || req.file.originalname,
      artist: metadata.common.artist || req.session.name,
      album: metadata.common.album || 'Unknown Album',
      duration: metadata.format.duration * 1000, // Convert to milliseconds
      bpm: bpm,
      user: {
        username: req.session.name
      },
      uploaded: true,
      uploadDate: new Date(),
      fileSize: req.file.size,
      filePath: req.file.path
    };
    
    // Return track info to client
    res.status(201).json(trackInfo);
    
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get user's uploaded tracks
router.get('/tracks', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const userDir = path.join(__dirname, '../uploads', String(req.session.userId));
    
    // Check if directory exists
    if (!fs.existsSync(userDir)) {
      return res.json([]);
    }
    
    // Read all files in directory
    const files = fs.readdirSync(userDir);
    
    // Get metadata for each file
    const trackPromises = files.map(async (filename) => {
      const filePath = path.join(userDir, filename);
      const stats = fs.statSync(filePath);
      
      try {
        const metadata = await mm.parseFile(filePath);
        
        return {
          id: filename,
          title: metadata.common.title || filename,
          artist: metadata.common.artist || req.session.name,
          album: metadata.common.album || 'Unknown Album',
          duration: metadata.format.duration * 1000, // Convert to milliseconds
          bpm: metadata.common.bpm ? parseFloat(metadata.common.bpm) : null,
          user: {
            username: req.session.name
          },
          uploaded: true,
          uploadDate: stats.mtime,
          fileSize: stats.size,
          filePath
        };
      } catch (err) {
        console.error(`Error parsing metadata for ${filePath}:`, err);
        return {
          id: filename,
          title: filename,
          artist: req.session.name,
          uploaded: true,
          duration: 0,
          user: {
            username: req.session.name
          },
          uploadDate: stats.mtime,
          fileSize: stats.size,
          filePath
        };
      }
    });
    
    const tracks = await Promise.all(trackPromises);
    res.json(tracks);
    
  } catch (error) {
    console.error('Error fetching uploaded tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Stream an uploaded track
router.get('/stream/:trackId', (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const trackId = req.params.trackId;
    const filePath = path.join(__dirname, '../uploads', String(req.session.userId), trackId);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Get file stats
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    
    // Set common headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Handle range requests (for seeking)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate range request
      if (start >= fileSize || end >= fileSize) {
        // Return the 416 Range Not Satisfiable if the range is invalid
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      
      // Create stream with error handling
      const fileStream = fs.createReadStream(filePath, { start, end });
      
      // Handle stream errors
      fileStream.on('error', (err) => {
        console.error(`Error streaming file ${filePath}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream track' });
        }
      });
      
      // Handle client disconnect
      req.on('close', () => {
        fileStream.destroy();
      });
      
      // Pipe the file stream to the response
      fileStream.pipe(res).on('error', (err) => {
        console.error('Error piping file stream:', err);
      });
    } else {
      // No range requested, send entire file
      res.status(200);
      res.setHeader('Content-Length', fileSize);
      
      // Create stream with error handling
      const fileStream = fs.createReadStream(filePath);
      
      // Handle stream errors
      fileStream.on('error', (err) => {
        console.error(`Error streaming file ${filePath}:`, err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream track' });
        }
      });
      
      // Handle client disconnect
      req.on('close', () => {
        fileStream.destroy();
      });
      
      // Pipe the file stream to the response
      fileStream.pipe(res).on('error', (err) => {
        console.error('Error piping file stream:', err);
      });
    }
  } catch (error) {
    console.error('Error streaming track:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream track' });
    }
  }
});

// Delete an uploaded track
router.delete('/track/:trackId', (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const trackId = req.params.trackId;
    const filePath = path.join(__dirname, '../uploads', String(req.session.userId), trackId);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Delete file
    fs.unlinkSync(filePath);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting track:', error);
    res.status(500).json({ error: 'Failed to delete track' });
  }
});

module.exports = router;