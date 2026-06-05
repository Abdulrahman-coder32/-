import crypto from "crypto";
global.crypto = crypto;
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');

const Message = require('./models/Message');
const Application = require('./models/Application');
const Notification = require('./models/Notification');

dotenv.config();

const app = express();
const server = http.createServer(app);

// ================= ALLOWED ORIGINS =================
const allowedOrigins = [
  'https://sahlawork.org',
  'https://www.sahlawork.org',
  'http://localhost:4200'
];

// ================= SOCKET =================
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);

// ================= MIDDLEWARE =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// ================= ROOT ROUTE =================
app.get('/', (req, res) => {
  res.send('✅ SahlaWork API is running');
});

// ================= ROUTES =================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

// ================= SOCKET AUTH =================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// ================= SOCKET MAIN =================
io.on('connection', (socket) => {
  console.log('🟢 Connected:', socket.user.id);

  // كل مستخدم ينضم لـ room باسم الـ ID بتاعه عشان يستقبل الإشعارات
  socket.join(socket.user.id.toString());

  // ✅ تصليح: اسم الـ event يتطابق مع الـ client (join_chat)
  socket.on('join_chat', (applicationId) => {
    if (applicationId) {
      socket.join(applicationId);
      console.log(`📥 ${socket.user.id} joined chat: ${applicationId}`);
    }
  });

  socket.on('leave_chat', (applicationId) => {
    if (applicationId) {
      socket.leave(applicationId);
    }
  });

  // ================= SEND MESSAGE VIA SOCKET =================
  // ملاحظة: الرسائل بتتبعت من REST API في الغالب
  // هنا backup لو حد بعت عبر socket مباشرة
  socket.on('send_message', async ({ application_id, message }) => {
    if (!message?.trim() || !application_id) return;

    try {
      const newMsg = await Message.create({
        application_id,
        sender_id: socket.user.id,
        type: 'text',
        message: message.trim(),
        timestamp: new Date()
      });

      const populated = await Message.findById(newMsg._id)
        .populate('sender_id', 'name profileImage cacheBuster');

      // ✅ تصليح: اسم الـ event = new_message (يتطابق مع الـ client)
      io.to(application_id).emit('new_message', populated);

      await sendMessageNotification(io, application_id, socket.user.id, populated);

    } catch (err) {
      console.error('❌ Socket send_message Error:', err);
      socket.emit('message_error', { msg: 'فشل إرسال الرسالة' });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.user.id);
  });
});

// ================= HELPER: إرسال إشعار رسالة جديدة =================
// بيتستخدم من Socket ومن REST API (messages route)
async function sendMessageNotification(io, application_id, senderId, populatedMessage) {
  try {
    const appData = await Application.findById(application_id)
      .populate('job_id', 'owner_id shop_name')
      .populate('seeker_id', 'name');

    if (!appData) return;

    const ownerId = appData.job_id?.owner_id?.toString();
    const seekerId = appData.seeker_id?._id?.toString();

    if (!ownerId || !seekerId) return;

    const recipientId = senderId.toString() === ownerId ? seekerId : ownerId;
    const senderName = populatedMessage.sender_id?.name || 'مستخدم';

    // ✅ منع تكرار الإشعار: شيك لو في إشعار غير مقروء لنفس المحادثة خلال آخر دقيقة
    const recentNotif = await Notification.findOne({
      user_id: recipientId,
      type: 'new_message',
      application_id,
      read: false,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) }
    });

    let notification;
    if (recentNotif) {
      // حدّث الإشعار الموجود بدل ما تعمل واحد جديد
      recentNotif.message = `رسالة جديدة من ${senderName}`;
      recentNotif.createdAt = new Date();
      await recentNotif.save();
      notification = recentNotif;
    } else {
      notification = await Notification.create({
        user_id: recipientId,
        type: 'new_message',
        message: `رسالة جديدة من ${senderName}`,
        application_id,
        read: false,
        createdAt: new Date()
      });
    }

    // حساب الـ unread للـ Application
    const isRecipientOwner = recipientId === ownerId;
    const unreadField = isRecipientOwner ? 'unreadCounts.owner' : 'unreadCounts.seeker';
    const updatedApp = await Application.findByIdAndUpdate(
      application_id,
      {
        $inc: { [unreadField]: 1 },
        lastMessage: populatedMessage.message || '[ملف مرفق]',
        lastTimestamp: new Date()
      },
      { new: true }
    );

    const unreadCount = isRecipientOwner
      ? updatedApp?.unreadCounts?.owner || 0
      : updatedApp?.unreadCounts?.seeker || 0;

    const unreadNotifCount = await Notification.countDocuments({
      user_id: recipientId,
      read: false
    });

    // ✅ تصليح: كل أسماء الـ events تتطابق مع الـ client
    io.to(recipientId).emit('new_notification', {
      ...notification.toObject(),
      unreadCount: unreadNotifCount
    });

    io.to(recipientId).emit('unread_update', {
      application_id,
      unreadCount
    });

    io.to(recipientId).emit('chat_list_update', {
      application_id,
      lastMessage: populatedMessage.message || '[ملف مرفق]',
      lastTimestamp: new Date(),
      unreadCount,
      otherUser: {
        profileImage: populatedMessage.sender_id?.profileImage || null
      }
    });

  } catch (err) {
    console.error('❌ sendMessageNotification Error:', err);
  }
}

// ✅ export عشان messages route تستخدمه
module.exports.sendMessageNotification = sendMessageNotification;

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
