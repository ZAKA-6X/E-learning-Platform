const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");
const twilio = require("twilio");

// Twilio config from .env
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function generatePassword(length = 8) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const filePath = path.join(__dirname, "../uploads", req.file.filename);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    for (let row of rawData) {
      const name = (row.name || "").toString().trim();
      const prenom = (row.prename || "").toString().trim();
      const school = (row.school || "").toString().trim();
      const phone = (row["phone whatsapp"] || "").toString().trim();

      if (!name || !prenom || !school || !phone) {
        console.warn(
          `Skipping row due to missing data: ${JSON.stringify(row)}`
        );
        continue;
      }

      const email = `${name}.${prenom}@${school}.clicaed`.toLowerCase();
      const password = generatePassword();

      await pool.query(
        "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",
        [`${name} ${prenom}`, email, password]
      );

      // Send WhatsApp message
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${phone}`,
        body: `Hello ${prenom},\nYour account has been created:\nEmail: ${email}\nPassword: ${password}`,
      });

      console.log(`User ${name} ${prenom} added and WhatsApp sent to ${phone}`);
    }

    fs.unlinkSync(filePath);

    res
      .status(200)
      .json({ message: "Users imported and WhatsApp sent successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error processing file" });
  }
};
