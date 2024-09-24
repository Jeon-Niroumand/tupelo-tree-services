const axios = require('axios') //for handling form reCAPTCHA
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const auth = require('./auth');
const { downloadFile, uploadFile, handleFileUpdate, getAuthClient } = require('./uploadFile');
const dotenv = require('dotenv');
require('dotenv').config(); // To manage sensitive info like email credentials
const { body, validationResult } = require("express-validator");
const os = require('os');
const app = express();

// Validation middleware
const alphaErr = "must only contain letters.";
const lengthErr = "must be between 1 and 30 characters.";
const emailErr = "must be a valid email address.";
const bioErr = "must be less than 250 characters.";

const validateUser = [
  body("full-name").trim()
    .isLength({min:1, max:30}).withMessage(`Name ${lengthErr}`)
    .matches(/^[A-Za-z\s]+$/).withMessage('Name must be alphabetic.'),

  body("email-address").trim()
    .isEmail().withMessage(`Email ${emailErr}`)
    .normalizeEmail(),

  body("message").trim()
    .isLength({ min: 0, max: 250 }).withMessage(`Message ${bioErr}`)
];

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Set static folder for serving CSS, JS, images
app.use(express.static(path.join(__dirname, 'public')));

// Express middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.render('index', { 
      errors: null,   // No errors initially
      formData: {},    // Empty form data initially
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY // Pass the reCAPTCHA site key
  });
});

// Route to render contact page and pass the reCAPTCHA Site Key
app.get('/contact', (req, res) => {
  res.render('contact', {
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY // Pass the reCAPTCHA site key to the frontend
  });
});

// Handle form submission (POST)
app.post('/contact', validateUser, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      // Render the form with validation errors, and set a flag to scroll to the contact section
    return res.status(422).render('index', { 
      errors: errors.array(),
      formData: req.body,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      scrollToContact: true // Add this flag to indicate that the page should scroll to contact
    });
  }

  // Verify reCAPTCHA response
  const recaptchaResponse = req.body['g-recaptcha-response'];
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaResponse}`;

  try {
    const verification = await axios.post(verificationUrl);
    if (!verification.data.success) {
      return res.status(400).send('reCAPTCHA verification failed. Please try again.');
    }

    const { 'full-name': name, 'email-address': email, message } = req.body;
  
    // Setup Nodemailer transport
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      }
    });

    // Mail options
    const mailOptions = {
      from: email,
      to: process.env.EMAIL_USER,
      subject: 'New Contact Form Submission - tupelotree.services',
      text: `You have a new message from: \n
             Name: ${name} \n
             Email: ${email} \n
             Message: "${message.replace(/"/g, '""')}"`
    };

    // Create data to append to CSV
    const data = `${name},${email},"${message.replace(/"/g, '""')}"\n`;
    const csvFile = path.join(__dirname, './contacts.csv'); // Use os.tmpdir() for a writable temporary path (fixes bug caused by docker deployment)
    if (!fs.existsSync(path.dirname(csvFile))) {
      fs.mkdirSync(path.dirname(csvFile), { recursive: true });
    }
    
    // Append data to local CSV
    fs.appendFileSync(csvFile, data);

    // Send email and then handle file upload
    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        console.log('Email User:', process.env.EMAIL_USER);
        console.log('Email Pass:', process.env.EMAIL_PASS);
        console.log('Email error:', error);
        return res.status(500).send('Something went wrong.');
      } else {
        console.log('Email sent:', info.response);
  
        // Download existing Google Drive file, append data, and re-upload
        try {
          const googleDriveFileId = '1B6yrswba-UE_10E8OQuHwbCB4rFJyz8c';  // Replace with your actual file ID
          const newData = `${name},${email},"${message.replace(/"/g, '""')}"\n`;
        
          // Handle download, append, and upload
          await handleFileUpdate(googleDriveFileId, newData);
        
          res.status(200).send('Thank you for your message. We will get back to you soon.');
        } catch (err) {
          console.log('Error updating Google Drive file:', err);
          res.status(500).send('Error uploading file.');
        } 
      }
    });
  } catch (err) {
    console.log('Error verifying reCAPTCHA or sending email:', err);
    res.status(500).send('Something went wrong.');
  }
});

// Start server
const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});