const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const Application = require('../models/Application');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// ======= Cloudinary Config =======
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ======= Multer (memory storage) =======
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ======= Helper: التحقق من صلاحية المستخدم =======
async function verifyAccess(applicationId, userId) {
  const app = await Application.findById(applicationId)
    .populate('job_id', 'owner_id')
    .populate('seeker_id', '_id');

  if (!app) return null;

  const ownerId = app.job_id?.owner_id?.toString();
  const seekerId = app.seeker_id?._id?.toString();

  if (userId !== ownerId && userId !== seekerId) return null;
  if (app.status !== 'accepted') return null;

  return app;
}

// ======= GET /messages/unread-count =======
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const applications = await Application.find({ status: 'accepted' })
      .populate('job_id', 'owner_id')
      .lean();

    const userApplications = applications.filter(app => {
      const ownerId = app.job_id?.owner_id?.toString();
      const seekerId = app.seeker_id?.toString();
      return userId === ownerId || userId === seekerId;
    });

    let totalUnread = 0;
    userApplications.forEach(app => {
      const ownerId = app.job_id?.owner_id?.toString();
      const isOwner = userId === ownerId;
      totalUnread += isOwner
        ? (app.unreadCounts?.owner || 0)
        : (app.unreadCounts?.seeker || 0);
    });

    res.json({ count: totalUnread });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ msg: 'خطأ في حساب الرسائل الغير مقروءة' });
  }
});

// ======= GET /messages/:applicationId =======
router.get('/:applicationId', auth, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;

    const app = await verifyAccess(applicationId, userId);
    if (!app) return res.status(403).json({ msg: 'غير مصرح بالوصول لهذه المحادثة' });

    const messages = await Message.find({ application_id: applicationId })
      .sort({ timestamp: 1 })
      .populate('sender_id', 'name profileImage cacheBuster')
      .lean();

    res.json(messages);
  } catch (err) {
    console.error('GET messages error:', err);
    res.status(500).json({ msg: 'خطأ في جلب الرسائل' });
  }
});

// ======= POST /messages — رسالة نصية =======
router.post('/', auth, async (req, res) => {
  try {
    const { application_id, message } = req.body;
    const userId = req.user.id;

    if (!application_id || !message?.trim()) {
      return res.status(400).json({ msg: 'بيانات ناقصة' });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({ msg: 'الرسالة طويلة جدًا (الحد الأقصى 2000 حرف)' });
    }

    const app = await verifyAccess(application_id, userId);
    if (!app) return res.status(403).json({ msg: 'غير مصرح بإرسال رسائل في هذه المحادثة' });

    const newMsg = await Message.create({
      application_id,
      sender_id: userId,
      type: 'text',
      message: message.trim(),
      timestamp: new Date()
    });

    const populated = await Message.findById(newMsg._id)
      .populate('sender_id', 'name profileImage cacheBuster');

    const ownerId = app.job_id?.owner_id?.toString();
    const isOwner = userId === ownerId;
    const unreadField = isOwner ? 'unreadCounts.seeker' : 'unreadCounts.owner';

    await Application.findByIdAndUpdate(application_id, {
      $inc: { [unreadField]: 1 }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(application_id).emit('new_message', populated);

      try {
        // ✅ تصليح: require('../index') بدل require('../server')
        const { sendMessageNotification } = require('../index');
        await sendMessageNotification(io, application_id, userId, populated);
      } catch (notifErr) {
        console.error('Notification error (non-fatal):', notifErr.message);
      }

      const receiverId = isOwner
        ? app.seeker_id?._id?.toString()
        : app.job_id?.owner_id?.toString();

      if (receiverId) {
        const receiverApps = await Application.find({ status: 'accepted' })
          .populate('job_id', 'owner_id').lean();

        const receiverFiltered = receiverApps.filter(a => {
          const aOwnerId = a.job_id?.owner_id?.toString();
          const aSeekerId = a.seeker_id?.toString();
          return receiverId === aOwnerId || receiverId === aSeekerId;
        });

        let totalUnread = 0;
        receiverFiltered.forEach(a => {
          const aOwnerId = a.job_id?.owner_id?.toString();
          const isReceiverOwner = receiverId === aOwnerId;
          totalUnread += isReceiverOwner
            ? (a.unreadCounts?.owner || 0)
            : (a.unreadCounts?.seeker || 0);
        });

        io.to(receiverId).emit('unread_update', { count: totalUnread });
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error('POST message error:', err);
    res.status(500).json({ msg: 'خطأ في إرسال الرسالة' });
  }
});

// ======= POST /messages/media — رفع ملف/صورة/صوت =======
router.post('/media', auth, upload.single('file'), async (req, res) => {
  try {
    const { application_id, type, filename } = req.body;
    const userId = req.user.id;

    if (!application_id || !req.file) {
      return res.status(400).json({ msg: 'بيانات ناقصة' });
    }

    const validTypes = ['image', 'audio', 'file'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ msg: 'نوع الملف غير مدعوم' });
    }

    const app = await verifyAccess(application_id, userId);
    if (!app) return res.status(403).json({ msg: 'غير مصرح بإرسال ملفات في هذه المحادثة' });

    const uploadResult = await new Promise((resolve, reject) => {
      const folder = type === 'image' ? 'sahlawork/images'
        : type === 'audio' ? 'sahlawork/audio'
        : 'sahlawork/files';

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: type === 'audio' ? 'video' : type === 'image' ? 'image' : 'raw',
          public_id: `${Date.now()}-${filename || req.file.originalname}`
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    const cloudResult = uploadResult;

    const newMsg = await Message.create({
      application_id,
      sender_id: userId,
      type,
      message: filename || req.file.originalname || `[${type}]`,
      url: cloudResult.secure_url,
      filename: filename || req.file.originalname,
      size: req.file.size,
      timestamp: new Date()
    });

    const populated = await Message.findById(newMsg._id)
      .populate('sender_id', 'name profileImage cacheBuster');

    const ownerId = app.job_id?.owner_id?.toString();
    const isOwner = userId === ownerId;
    const unreadField = isOwner ? 'unreadCounts.seeker' : 'unreadCounts.owner';

    await Application.findByIdAndUpdate(application_id, {
      $inc: { [unreadField]: 1 }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(application_id).emit('new_message', populated);

      try {
        // ✅ تصليح: require('../index') بدل require('../server')
        const { sendMessageNotification } = require('../index');
        await sendMessageNotification(io, application_id, userId, populated);
      } catch (notifErr) {
        console.error('Media notification error (non-fatal):', notifErr.message);
      }
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error('POST media error:', err);
    res.status(500).json({ msg: 'خطأ في رفع الملف' });
  }
});

// ======= PATCH /messages/:applicationId/mark-read =======
router.patch('/:applicationId/mark-read', auth, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;

    const app = await Application.findById(applicationId)
      .populate('job_id', 'owner_id')
      .populate('seeker_id', '_id');

    if (!app) return res.status(404).json({ msg: 'المحادثة غير موجودة' });

    const ownerId = app.job_id?.owner_id?.toString();
    const seekerId = app.seeker_id?._id?.toString();
    const isOwner = userId === ownerId;

    if (userId !== ownerId && userId !== seekerId) {
      return res.status(403).json({ msg: 'غير مصرح' });
    }

    const unreadField = isOwner ? 'unreadCounts.owner' : 'unreadCounts.seeker';

    await Application.findByIdAndUpdate(applicationId, {
      $set: { [unreadField]: 0 }
    });

    const io = req.app.get('io');
    if (io) {
      const allApps = await Application.find({ status: 'accepted' })
        .populate('job_id', 'owner_id').lean();

      const userApps = allApps.filter(a => {
        const aOwnerId = a.job_id?.owner_id?.toString();
        const aSeekerId = a.seeker_id?.toString();
        return userId === aOwnerId || userId === aSeekerId;
      });

      let totalUnread = 0;
      userApps.forEach(a => {
        const aOwnerId = a.job_id?.owner_id?.toString();
        const isUserOwner = userId === aOwnerId;
        totalUnread += isUserOwner
          ? (a.unreadCounts?.owner || 0)
          : (a.unreadCounts?.seeker || 0);
      });

      io.to(userId).emit('unread_update', { count: totalUnread });
    }

    res.json({ msg: 'تم التحديث' });
  } catch (err) {
    console.error('mark-read error:', err);
    res.status(500).json({ msg: 'خطأ في تحديث حالة القراءة' });
  }
});

module.exports = router;