const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['shop_owner', 'job_seeker', 'admin'], required: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  profileImage: { type: String, default: '' },
  cacheBuster: { type: String, default: '' },
  bio: { type: String, default: '' },
  age: { type: Number, default: null },
  governorate: { type: String, required: true },
  city: { type: String, required: true },
  work_experience: { type: String, default: '' },
  desired_job_type: { type: String, default: '' },
  shop_name: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);