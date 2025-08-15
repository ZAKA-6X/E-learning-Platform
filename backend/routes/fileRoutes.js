const express = require('express');
const router = express.Router();
const { uploadExcel } = require('../controllers/fileController');
const upload = require('../middleware/uploadMiddleware');

router.post('/upload', upload.single('file'), uploadExcel);

module.exports = router;
