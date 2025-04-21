require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SequelizeStore = require('express-session-sequelize')(session.Store);
const path = require('path');
const fs = require('fs');
const sequelize = require('./database');
const userRoutes = require('./user-routes');
const uploadRoutes = require('./upload-routes');
const soundcloudNoAuthRoutes = require('./soundcloud-noauth-routes');
const adminRoutes = require('./admin-routes');
const vjApiRoutes = require('./vj-api-routes');

// Initialize the database models
require('./models/User');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies - IMPORTANT: This must be before any routes
app.use(express.json());

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  next();
});

// Set up session middleware with Sequelize store
app.use(session({
  secret: process.env.SESSION_SECRET || 'djai-secret',
  resave: false,
  saveUninitialized: true,
  store: new SequelizeStore({
    db: sequelize,
  }),
  cookie: {
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    httpOnly: true,
    secure: false // Set to true if using HTTPS
  }
}));

// Set up view engine
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, '../public')));

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Register routes
app.use('/api/user', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/soundcloud', soundcloudNoAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vj', vjApiRoutes);

// Authentication middleware for API routes
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Home page - Check if user is logged in
app.get('/', async (req, res) => {
  // Check URL parameters for direct login
  if (req.query.name && req.query.email) {
    try {
      console.log('Direct login attempt from URL params:', { 
        name: req.query.name, 
        email: req.query.email 
      });
      
      const { User } = require('./models/User');
      
      // Check if user already exists
      let user = await User.findOne({ where: { email: req.query.email } });
      
      // Create new user if doesn't exist
      if (!user) {
        console.log('Creating new user from URL params:', req.query.email);
        user = await User.create({
          name: req.query.name,
          email: req.query.email,
          lastLogin: new Date()
        });
      } else {
        // Update existing user's last login
        console.log('User exists, updating login time for:', user.email);
        user.lastLogin = new Date();
        await user.save();
      }
      
      // Set session data
      req.session.userId = user.id;
      req.session.name = user.name;
      req.session.email = user.email;
      req.session.isAdmin = user.isAdmin || false;
      
      // Save session and redirect to home page without parameters
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Redirect to clean URL
      console.log('Login successful, redirecting to clean URL');
      return res.redirect('/');
    } catch (error) {
      console.error('Error handling direct login:', error);
      // Continue to render page normally
    }
  }
  
  // Normal page render
  const isAuthenticated = !!req.session.userId;
  const userName = req.session.name || '';
  const isAdmin = req.session.isAdmin || false;
  
  console.log('Home page request, session:', { 
    isAuthenticated, 
    userId: req.session.userId,
    userName: req.session.name,
    isAdmin: req.session.isAdmin
  });
  
  res.render('index', { 
    isAuthenticated,
    userName,
    isAdmin,
    provider: 'soundcloud-noauth' // Default provider
  });
});

// Admin dashboard - Requires admin user
app.get('/admin', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  
  try {
    const { User } = require('./models/User');
    const user = await User.findByPk(req.session.userId);
    
    if (!user || !user.isAdmin) {
      return res.redirect('/');
    }
    
    res.render('admin', {
      userName: user.name
    });
  } catch (error) {
    console.error('Error accessing admin page:', error);
    res.redirect('/');
  }
});

// Admin setup page - First time setup
app.get('/admin-setup', async (req, res) => {
  try {
    const { User } = require('./models/User');
    const adminExists = await User.findOne({ where: { isAdmin: true } });
    
    // If admin already exists, redirect to login
    if (adminExists) {
      return res.redirect('/');
    }
    
    res.render('admin-setup', {
      title: 'DJAI Admin Setup'
    });
  } catch (error) {
    console.error('Error accessing admin setup:', error);
    res.redirect('/');
  }
});

// Error route
app.get('/error', (req, res) => {
  res.render('error', { message: 'An error occurred' });
});

// Handle 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'Server error' });
});

// Sync database models before starting server
sequelize
  .sync()
  .then(() => {
    console.log('Database models synchronized');
    
    // Start server - listen on all network interfaces
    app.listen(PORT, '0.0.0.0', () => {
      // Get local IP address for easy access
      const { networkInterfaces } = require('os');
      const nets = networkInterfaces();
      const localIPs = [];
      
      // Collect all non-internal IPv4 addresses
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          // Skip over non-IPv4 and internal (e.g. 127.0.0.1) addresses
          if (net.family === 'IPv4' && !net.internal) {
            localIPs.push(net.address);
          }
        }
      }
      
      console.log(`\n===== DJAI Server Started =====`);
      console.log(`Local access: http://localhost:${PORT}`);
      
      if (localIPs.length > 0) {
        console.log(`\nLAN access (for other devices on your network):`);
        localIPs.forEach(ip => {
          console.log(`http://${ip}:${PORT}`);
        });
      }
      
      console.log(`\nUse Ctrl+C to stop the server`);
      console.log(`===============================\n`);
    });
  })
  .catch(err => {
    console.error('Database sync error:', err);
  });