import nodemailer from "nodemailer";

const sendEmailToCreator = async (options) => {
  // Prefer env vars in production
  const password = process.env.SMTP_PASSWORD;
  
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: "support@chomske.com",
      pass: password,
    },
  });

  // ---- Derive/Defaults ----
  const {
    to,
    creator_name = "there",
    selected_date, // string or ISO – we'll try to format
    selected_timeSlot,
    subject = "Booking Confirmation",
    // Optional extras (safe defaults)
    service_title = "Consultation",
    meeting_link,
    manage_url = "https://chomske.com/booking/details/customer",
    support_email = "support@chomske.com",
    logo_url = "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
    brand_name = "MyHandle",
    brand_url = "https://chomske.com",
    venue = "Online",
    timezone = "IST",
    booking_id, // if you have one; otherwise we generate
  } = options || {};

  // Date formatting (best effort, falls back to raw)
  const tryFormatDate = (d) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d || "";
      return dt.toLocaleDateString("en-IN", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return d || "";
    }
  };

  const prettyDate = tryFormatDate(selected_date);
  const prettyTime = selected_timeSlot ? `${selected_timeSlot} ${timezone}` : "";
  const safeBookingId =
    booking_id || `BK${Math.floor(100000 + Math.random() * 900000)}`;

  const mailOptions = {
    from: `"${brand_name}" <support@chomske.com>`,
    to,
    subject,
    html: `
<!DOCTYPE html>
<html lang="en" style="margin:0;padding:0;">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${subject}</title>
  <style>
    /* Client resets */
    body,table,td,a{ -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td{ mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img{ -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
    body{ margin:0; padding:0; width:100% !important; height:100% !important; background:#f5f7fb; }
    table{ border-collapse:collapse !important; }
    /* Container */
    .container{ max-width:640px; width:100%; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(16,24,40,0.08); }
    /* Spacing helpers */
    .px-24{ padding-left:24px; padding-right:24px; }
    .py-32{ padding-top:32px; padding-bottom:32px; }
    .py-24{ padding-top:24px; padding-bottom:24px; }
    .pt-24{ padding-top:24px; }
    .pb-24{ padding-bottom:24px; }
    .pb-8{ padding-bottom:8px; }
    /* Typography */
    .h1{ font-size:24px; line-height:1.25; font-weight:700; color:#0f172a; letter-spacing:-0.3px; }
    .sub{ font-size:15px; line-height:1.6; color:#475569; }
    .label{ font-size:12px; font-weight:700; text-transform:uppercase; color:#94a3b8; letter-spacing:.6px; }
    .val{ font-size:15px; color:#0f172a; font-weight:600; }
    .muted{ font-size:13px; color:#64748b; }
    /* Badge */
    .badge{ width:64px; height:64px; border-radius:999px; background:#10b981; text-align:center; }
    /* Card */
    .card{ padding: 12px; }
    /* CTA */
    .btn{ display:inline-block; padding:14px 28px; font-weight:700; text-decoration:none; border-radius:10px; background:linear-gradient(135deg,#6366f1 0%, #7c3aed 100%); color:#fff; box-shadow:0 10px 24px rgba(99,102,241,.3); }
    .btn:active{ transform:translateY(1px); }
    /* Header gradient */
    .header{ background:#f8fafc; }
    .footer{ background:#f8fafc; }
    /* Two columns */
    .grid{ width:100%; }
    .col{ vertical-align:top; }
    @media only screen and (max-width:600px){
      .px-24{ padding-left:18px !important; padding-right:18px !important; }
      .py-32{ padding-top:24px !important; padding-bottom:24px !important; }
      .h1{ font-size:22px !important; }
    }
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container">
          <!-- Header -->
          <tr>
            <td class="header" style="padding:28px;">
              <table role="presentation" width="100%">
                <tr>
                  <td align="center">
                    <a href="${brand_url}" style="text-decoration:none;">
                      <img src="${logo_url}" alt="${brand_name} Logo" width="120" height="auto" style="border-radius:8px; opacity:.95;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title block -->
          <tr>
            <td class="px-24 py-32" align="center">
              <table role="presentation" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:20px;">
                    <table role="presentation" class="badge" align="center">
                      <tr><td align="center" valign="middle" style="font-size:30px; color:#fff;">✓</td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" class="h1" style="padding-bottom:8px;">
                    Booking Confirmed
                  </td>
                </tr>
                <tr>
                  <td align="center" class="sub">
                    Hi ${creator_name}, a new ${service_title.toLowerCase()} has been scheduled to you.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Details card -->
          <tr>
            <td class="px-24">
              <table role="presentation" width="100%" class="card px-24 py-24">
                <tr>
                  <td style="padding-bottom:16px;">
                    <div class="label">Booking ID</div>
                    <div class="val">${safeBookingId}</div>
                  </td>
                </tr>

                <tr>
                  <td>
                    <table role="presentation" width="100%" class="grid" cellspacing="0" cellpadding="0">
                      <tr>
                        <td class="col" width="50%" style="padding-right:12px;">
                          <div class="label">Date</div>
                          <div class="val">${prettyDate || "-"}</div>
                        </td>
                        <td class="col" width="50%" style="padding-left:12px;">
                          <div class="label">Time</div>
                          <div class="val">${prettyTime || "-"}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr><td style="height:12px;"></td></tr>

                <tr>
                  <td>
                    <div class="label">Service</div>
                    <div class="val">${service_title}</div>
                  </td>
                </tr>

                <tr><td style="height:12px;"></td></tr>

                <tr>
                  <td>
                    <div class="label">Venue</div>
                    <div class="val">${venue}</div>
                  </td>
                </tr>

                ${
                  meeting_link
                    ? `
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td>
                    <div class="label">Meeting Link</div>
                    <a href="${meeting_link}" class="val" style="color:#6366f1; text-decoration:none;">Join the meeting →</a>
                  </td>
                </tr>`
                    : ""
                }
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td class="px-24 py-32" align="center">
              <a href="${manage_url}" class="btn">Manage Consultations</a>
            </td>
          </tr>

          <!-- Help text -->
          <tr>
            <td class="px-24 pb-24">
              <div class="sub" style="text-align:center;">
                Need to reschedule or have a question? Reply to this email or contact <a href="mailto:${support_email}" style="color:#6366f1; text-decoration:none;">${support_email}</a>.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer px-24 py-24" align="center" style="border-top:1px solid #e2e8f0;">
              <div class="muted">© ${new Date().getFullYear()} ${brand_name}. All rights reserved.</div>
              <div class="muted" style="margin-top:6px;">
                <a href="${brand_url}/privacy-policy" style="color:#94a3b8; text-decoration:none;">Privacy</a> •
                <a href="${brand_url}/terms" style="color:#94a3b8; text-decoration:none;">Terms</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };

  await transporter.sendMail(mailOptions);
};

export default sendEmailToCreator;

