const express = require('express');
const router = express.Router();

// test route
router.get('/', (req, res) => {
  res.json({ message: 'Auth route working' });
});

module.exports = router;