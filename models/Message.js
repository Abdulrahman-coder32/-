const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  application_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, default: '' },
  type: { type: String, enum: ['text', 'image', 'audio', 'file'], default: 'text' },
  url: { type: String, default: '' },
  filename: { type: String, default: '' },
  size: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now }
});

messageSchema.index({ application_id: 1 });

module.exports = mongoose.model('Message', messageSchema);