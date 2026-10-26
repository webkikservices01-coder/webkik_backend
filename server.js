// const express = require('express');
// const nodemailer = require('nodemailer');
// const cors = require('cors');
// require('dotenv').config();

// const app = express();

// app.use(express.json());
// app.use(cors({
//     origin: '*', 
//     methods: ['POST']
// }));

// // --- 1. CONTACT PAGE ENDPOINT ---
// app.post('/api/contact', async (req, res) => {
//   const { name, email, phone, company, message } = req.body;

//   try {
//     const transporter = nodemailer.createTransport({
//       host: 'smtp.gmail.com',
//       port: 587,
//       secure: false,
//       auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
//       tls: { rejectUnauthorized: false }
//     });

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: process.env.EMAIL_USER, 
//       subject: `🔥 New Lead: ${name} ${company ? `from ${company}` : ''}`,
//       html: `
//         <!DOCTYPE html>
//         <html>
//         <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 20px; margin: 0;">
//           <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
//             <div style="background-color: #ea0b60; padding: 25px 20px; text-align: center;">
//               <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">Webkik Contact Form 🚀</h2>
//             </div>
//             <div style="padding: 30px;">
//               <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; width: 120px; color: #64748b; font-weight: 600;">Name</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${name}</td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Email</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Phone</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;"><a href="tel:${phone}" style="color: #0f172a;">${phone}</a></td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Company</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${company || 'N/A'}</td></tr>
//               </table>
//               <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px;">
//                 <h4 style="margin-top: 0; margin-bottom: 10px; color: #334155; font-size: 12px; text-transform: uppercase;">Message</h4>
//                 <p style="margin: 0; color: #334155; line-height: 1.6; white-space: pre-wrap;">${message}</p>
//               </div>
//             </div>
//           </div>
//         </body>
//         </html>
//       `,
//     };

//     await transporter.sendMail(mailOptions);
//     res.status(200).json({ success: true, message: 'Email sent successfully!' });
//   } catch (error) {
//     console.error("Contact Email Error:", error);
//     res.status(500).json({ success: false, message: 'Something went wrong.' });
//   }
// });


// // --- 2. CAREER PAGE ENDPOINT (NEW) ---
// app.post('/api/career', async (req, res) => {
//   // Career page fields
//   const { name, email, role, type, portfolio, message } = req.body;

//   try {
//     const transporter = nodemailer.createTransport({
//       host: 'smtp.gmail.com',
//       port: 587,
//       secure: false,
//       auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
//       tls: { rejectUnauthorized: false }
//     });

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: process.env.EMAIL_USER, 
//       subject: `💼 Job Application: ${name} applied for ${role}`,
//       html: `
//         <!DOCTYPE html>
//         <html>
//         <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 20px; margin: 0;">
//           <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            
//             <div style="background-color: #10b981; padding: 25px 20px; text-align: center;">
//               <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">New Job Application 💼</h2>
//               <p style="color: #ecfdf5; font-size: 14px; margin: 5px 0 0 0;">Someone wants to join Webkik!</p>
//             </div>
            
//             <div style="padding: 30px;">
//               <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; width: 130px; color: #64748b; font-weight: 600;">Applicant Name</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: bold;">${name}</td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Email</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Position</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #ea0b60; font-weight: bold;">${role}</td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Job Type</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${type}</td></tr>
//                 <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Portfolio/Link</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;">${portfolio ? `<a href="${portfolio}" target="_blank" style="color: #2563eb;">View Portfolio ↗</a>` : 'Not provided'}</td></tr>
//               </table>

//               <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px;">
//                 <h4 style="margin-top: 0; margin-bottom: 10px; color: #334155; font-size: 12px; text-transform: uppercase;">Why hire me?</h4>
//                 <p style="margin: 0; color: #334155; line-height: 1.6; white-space: pre-wrap;">${message || 'No additional message provided.'}</p>
//               </div>
//             </div>
//           </div>
//         </body>
//         </html>
//       `,
//     };

//     await transporter.sendMail(mailOptions);
//     res.status(200).json({ success: true, message: 'Application submitted successfully!' });
//   } catch (error) {
//     console.error("Career Email Error:", error);
//     res.status(500).json({ success: false, message: 'Something went wrong.' });
//   }
// });

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });








const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST']
}));

// Reusable Transporter Setup
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  tls: { rejectUnauthorized: false }
});

// --- AI VOICE / VIDEO CALLS (chatbot) ---
require('./aiCall')(app, transporter);


// --- 1. CONTACT PAGE ENDPOINT ---
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, company, message } = req.body;

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CONTACT_RECEIVER, // <-- Yahan contact wale email pe jayega
      subject: `🔥 New Lead: ${name} ${company ? `from ${company}` : ''}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <div style="background-color: #ea0b60; padding: 25px 20px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">Webkik Contact Form 🚀</h2>
            </div>
            <div style="padding: 30px;">
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; width: 120px; color: #64748b; font-weight: 600;">Name</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${name}</td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Email</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Phone</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;"><a href="tel:${phone}" style="color: #0f172a;">${phone}</a></td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Company</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${company || 'N/A'}</td></tr>
              </table>
              <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; color: #334155; font-size: 12px; text-transform: uppercase;">Message</h4>
                <p style="margin: 0; color: #334155; line-height: 1.6; white-space: pre-wrap;">${message}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error("Contact Email Error:", error);
    res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
});


// --- 2. CAREER PAGE ENDPOINT ---
app.post('/api/career', async (req, res) => {
  const { name, email, role, type, portfolio, message } = req.body;

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.CAREER_RECEIVER, // <-- Yahan automatic career/HR wale email pe jayega
      subject: `💼 Job Application: ${name} applied for ${role}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; padding: 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            
            <div style="background-color: #10b981; padding: 25px 20px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">New Job Application 💼</h2>
              <p style="color: #ecfdf5; font-size: 14px; margin: 5px 0 0 0;">Someone wants to join Webkik!</p>
            </div>
            
            <div style="padding: 30px;">
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; width: 130px; color: #64748b; font-weight: 600;">Applicant Name</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: bold;">${name}</td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Email</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;"><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Position</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #ea0b60; font-weight: bold;">${role}</td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Job Type</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;">${type}</td></tr>
                <tr><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">Portfolio/Link</td><td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;">${portfolio ? `<a href="${portfolio}" target="_blank" style="color: #2563eb;">View Portfolio ↗</a>` : 'Not provided'}</td></tr>
              </table>

              <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px;">
                <h4 style="margin-top: 0; margin-bottom: 10px; color: #334155; font-size: 12px; text-transform: uppercase;">Why hire me?</h4>
                <p style="margin: 0; color: #334155; line-height: 1.6; white-space: pre-wrap;">${message || 'No additional message provided.'}</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: 'Application submitted successfully!' });
  } catch (error) {
    console.error("Career Email Error:", error);
    res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});