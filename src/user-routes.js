/**
 * User authentication routes for DJAI
 */
const express = require('express');
const router = express.Router();
const { User, SavedMix } = require('./models/User');

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { name, email } = req.body;
    console.log('Register request received:', { name, email });

    // Basic validation
    if (!name || !email) {
      console.log('Registration error: Missing name or email');
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.log('User exists, updating login time for:', existingUser.email);
      // If user exists, just log them in and update last login time
      existingUser.lastLogin = new Date();
      await existingUser.save();
      
      req.session.userId = existingUser.id;
      req.session.name = existingUser.name;
      req.session.email = existingUser.email;
      req.session.isAdmin = existingUser.isAdmin || false;
      
      // Force session save before responding
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        console.log('Session saved successfully:', req.session);
        return res.json({ success: true, user: { 
          name: existingUser.name, 
          email: existingUser.email,
          isAdmin: existingUser.isAdmin
        }});
      });
    } else {
      // Create new user
      console.log('Creating new user:', email);
      const user = await User.create({ 
        name, 
        email,
        lastLogin: new Date()
      });

      // Set session
      req.session.userId = user.id;
      req.session.name = user.name;
      req.session.email = user.email;
      req.session.isAdmin = false;

      // Force session save before responding
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        console.log('Session saved successfully:', req.session);
        res.status(201).json({ success: true, user: { name: user.name, email: user.email } });
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      name: user.name,
      email: user.email,
      isPremium: user.isPremium,
      mixCount: user.mixCount,
      dateJoined: user.dateJoined
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Save a mix
router.post('/save-mix', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name, tracks, transitions, totalDuration } = req.body;

    // Basic validation
    if (!name || !tracks || !Array.isArray(tracks) || tracks.length < 2) {
      return res.status(400).json({ error: 'Invalid mix data' });
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has reached the free limit (5 mixes)
    const mixCount = await SavedMix.count({ where: { UserId: user.id } });
    if (!user.isPremium && mixCount >= 5) {
      return res.status(403).json({ error: 'Free users can save up to 5 mixes. Upgrade to premium for unlimited mixes.' });
    }

    // Add mix to user's saved mixes
    const savedMix = await SavedMix.create({
      name,
      tracks,
      transitions,
      totalDuration,
      UserId: user.id
    });

    // Increment mix count
    user.mixCount += 1;
    await user.save();

    res.status(201).json({ success: true, mixId: savedMix.id });
  } catch (error) {
    console.error('Error saving mix:', error);
    res.status(500).json({ error: 'Failed to save mix' });
  }
});

// Get saved mixes
router.get('/saved-mixes', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const savedMixes = await SavedMix.findAll({
      where: { UserId: user.id },
      order: [['createdAt', 'DESC']]
    });

    res.json(savedMixes);
  } catch (error) {
    console.error('Error fetching saved mixes:', error);
    res.status(500).json({ error: 'Failed to fetch saved mixes' });
  }
});

// Delete a saved mix
router.delete('/saved-mixes/:mixId', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findByPk(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find and remove the mix
    const mix = await SavedMix.findOne({
      where: { 
        id: req.params.mixId,
        UserId: user.id
      }
    });

    if (!mix) {
      return res.status(404).json({ error: 'Mix not found' });
    }

    await mix.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting mix:', error);
    res.status(500).json({ error: 'Failed to delete mix' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

module.exports = router;