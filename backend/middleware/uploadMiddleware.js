// backend/middleware/uploadMiddleware.js
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    files: 10,                  // up to 10 files
    fileSize: 25 * 1024 * 1024, // 25MB each
  },
});

module.exports = {
  // Expect multiple files in the field "media"
  uploadMediaArray: upload.array('media', 10),
  // If you prefer fields style:
  uploadMediaFields: upload.fields([{ name: 'media', maxCount: 10 }]),
};
