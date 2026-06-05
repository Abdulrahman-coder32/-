const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  type: {
    type: String,
    required: true,
    index: true
  },

  message: {
    type: String,
    required: true
  },

  application_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    index: true
  },

  read: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Export model
module.exports = mongoose.model('Notification', NotificationSchema);
