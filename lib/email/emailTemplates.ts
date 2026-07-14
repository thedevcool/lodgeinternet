/**
 * Base email template with consistent styling
 */
export function getEmailTemplate(content: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lodge Internet</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #f5f5f7;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 32px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
      color: #1d1d1f;
      line-height: 1.6;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: #0071e3;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #0077ed;
    }
    .footer {
      background-color: #f5f5f7;
      padding: 30px;
      text-align: center;
      color: #86868b;
      font-size: 14px;
    }
    .footer a {
      color: #0071e3;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: #d2d2d7;
      margin: 30px 0;
    }
    .content img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 12px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Lodge Internet</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Lodge Internet. All rights reserved.</p>
      <p>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}">Visit our store</a> | 
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/support">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Lodge Internet specific email template
 */
export function getLodgeInternetEmailTemplate(content: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lodge Internet</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #f5f5f7;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 32px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
      color: #1d1d1f;
      line-height: 1.6;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      margin: 20px 0;
    }
    .button:hover {
      opacity: 0.9;
    }
    .footer {
      background-color: #f5f5f7;
      padding: 30px;
      text-align: center;
      color: #86868b;
      font-size: 14px;
    }
    .footer a {
      color: #0071e3;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background-color: #d2d2d7;
      margin: 30px 0;
    }
    .content img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 12px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Lodge Internet</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Lodge Internet</p>
      <p>© ${new Date().getFullYear()} Davo-Nexus Limited. All rights reserved.</p>
      <p>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}">Lodge Internet</a> | 
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/support">Contact support</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Welcome email template
 */
export function getWelcomeEmail(userName: string, userEmail: string) {
  const content = `
    <h2>Welcome to Lodge Internet! 🎉</h2>
    <p>Hi ${userName},</p>
    <p>Thank you for joining Lodge Internet! We're excited to have you as part of our community.</p>
    <p>You now have access to:</p>
    <ul>
      <li>Exclusive deals and promotions</li>
      <li>Early access to new products</li>
      <li>Order tracking and history</li>
      <li>Personalized recommendations</li>
    </ul>
    <div class="divider"></div>
    <h3>Stay Connected</h3>
    <p>Would you like to receive promotional emails about new products, special offers, and exclusive deals?</p>
    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/settings/email-preferences?email=${encodeURIComponent(userEmail)}&promo=yes" class="button">Yes, send me promotions</a>
    <br/>
    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/settings/email-preferences?email=${encodeURIComponent(userEmail)}&promo=no" style="color: #86868b; font-size: 14px; text-decoration: none;">No thanks, just order updates</a>
    <div class="divider"></div>
    <p>If you have any questions, feel free to reach out to our support team.</p>
    <p>Happy shopping!<br/>The Davo-Nexus Limited Team</p>
  `;
  return getEmailTemplate(content);
}

/**
 * Payment success email template
 */
export function getPaymentSuccessEmail(orderDetails: {
  orderId: string;
  customerName: string;
  items: Array<{ productName: string; quantity: number; price: number }>;
  total: number;
  deliveryMethod: string;
  deliveryFee: number;
  shippingAddress: string;
}) {
  const itemsHtml = orderDetails.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f5f5f7;">
          ${item.productName} × ${item.quantity}
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f5f5f7; text-align: right;">
          ₦${item.price.toLocaleString()}
        </td>
      </tr>
    `,
    )
    .join("");

  const content = `
    <h2>Payment Successful! ✅</h2>
    <p>Hi ${orderDetails.customerName},</p>
    <p>Thank you for your order! Your payment has been processed successfully.</p>
    
    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #86868b;">Order Number</p>
      <p style="margin: 0; font-size: 24px; font-weight: 600;">#${orderDetails.orderId}</p>
    </div>

    <h3>Order Summary</h3>
    <table style="width: 100%; border-collapse: collapse;">
      ${itemsHtml}
      <tr>
        <td style="padding: 10px 0;">Delivery Fee</td>
        <td style="padding: 10px 0; text-align: right;">₦${orderDetails.deliveryFee.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding: 15px 0; font-weight: 600; font-size: 18px;">Total</td>
        <td style="padding: 15px 0; font-weight: 600; font-size: 18px; text-align: right;">₦${orderDetails.total.toLocaleString()}</td>
      </tr>
    </table>

    <div class="divider"></div>

    <h3>Delivery Information</h3>
    <p><strong>Method:</strong> ${orderDetails.deliveryMethod === "door-to-door" ? "Door-to-Door Delivery" : "Station Pickup"}</p>
    <p><strong>Address:</strong> ${orderDetails.shippingAddress}</p>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/orders" class="button">Track Your Order</a>

    <p>We'll send you another email when your order ships.</p>
    <p>Thank you for shopping with us!<br/>The Davo-Nexus Limited Team</p>
  `;
  return getEmailTemplate(content);
}

/**
 * Order status update email template
 */
export function getOrderStatusEmail(orderDetails: {
  orderId: string;
  customerName: string;
  status: string;
  statusMessage: string;
  trackingInfo?: string;
}) {
  const statusEmoji =
    {
      packing: "📦",
      "on-the-way": "🚚",
      "delivered-station": "🏪",
      "delivered-doorstep": "✅",
    }[orderDetails.status] || "📦";

  const content = `
    <h2>Order Update ${statusEmoji}</h2>
    <p>Hi ${orderDetails.customerName},</p>
    <p>${orderDetails.statusMessage}</p>
    
    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #86868b;">Order Number</p>
      <p style="margin: 0; font-size: 24px; font-weight: 600;">#${orderDetails.orderId}</p>
    </div>

    ${
      orderDetails.trackingInfo
        ? `
      <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: 600;">Tracking Information</p>
        <p style="margin: 0;">${orderDetails.trackingInfo}</p>
      </div>
    `
        : ""
    }

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/orders" class="button">View Order Details</a>

    <p>If you have any questions, please contact our support team.</p>
    <p>Best regards,<br/>The Davo-Nexus Limited Team</p>
  `;
  return getEmailTemplate(content);
}

/**
 * Password reset email template
 */
export function getPasswordResetEmail(userName: string, resetToken: string) {
  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password?token=${resetToken}`;

  const content = `
    <h2>Password Reset Request 🔐</h2>
    <p>Hi ${userName},</p>
    <p>We received a request to reset your password for your Lodge Internet account.</p>
    <p>Click the button below to create a new password:</p>
    
    <a href="${resetUrl}" class="button">Reset Your Password</a>
    
    <p style="color: #86868b; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
    
    <div class="divider"></div>
    
    <p><strong>Didn't request a password reset?</strong></p>
    <p>If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
    
    <p>For security, never share this email or link with anyone.</p>
    <p>Best regards,<br/>The Davo-Nexus Limited Team</p>
  `;
  return getEmailTemplate(content);
}

/**
 * Back in stock notification email
 */
export function getBackInStockEmail(
  customerName: string,
  product: {
    name: string;
    price: number;
    image: string;
    url: string;
  },
) {
  const content = `
    <h2>Back in Stock! 🎉</h2>
    <p>Hi ${customerName},</p>
    <p>Great news! A product you're interested in is back in stock:</p>
    
    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <img src="${product.image}" alt="${product.name}" style="max-width: 200px; border-radius: 8px;"/>
      <h3 style="margin: 15px 0 5px 0;">${product.name}</h3>
      <p style="font-size: 24px; font-weight: 600; color: #0071e3; margin: 10px 0;">₦${product.price.toLocaleString()}</p>
    </div>
    
    <p>Hurry! Products can sell out fast.</p>
    <a href="${product.url}" class="button">Shop Now</a>
    
    <p>Happy shopping!<br/>The Davo-Nexus Limited Team</p>
  `;
  return getEmailTemplate(content);
}

/**
 * Coming soon / countdown email
 */
export function getComingSoonEmail(
  customerName: string,
  product: {
    name: string;
    price: number;
    image: string;
    availableDate: Date;
    url: string;
  },
) {
  const daysUntilAvailable = Math.ceil(
    (product.availableDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const content = `
    <h2>Coming Soon! ⏳</h2>
    <p>Hi ${customerName},</p>
    <p>An exciting new product is coming to Lodge Internet:</p>
    
    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <img src="${product.image}" alt="${product.name}" style="max-width: 200px; border-radius: 8px;"/>
      <h3 style="margin: 15px 0 5px 0;">${product.name}</h3>
      <p style="font-size: 24px; font-weight: 600; color: #0071e3; margin: 10px 0;">₦${product.price.toLocaleString()}</p>
      <div style="background-color: #fff; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 0; font-size: 14px; color: #86868b;">Available in</p>
        <p style="margin: 5px 0 0 0; font-size: 32px; font-weight: 600;">${daysUntilAvailable} days</p>
      </div>
    </div>
    
    <p>Be ready! We'll notify you when it's available.</p>
    <a href="${product.url}" class="button">Learn More</a>
    
    <p>Stay tuned!<br/>The Davo-Nexus Limited Team</p>
  `;
  return getEmailTemplate(content);
}

/**
 * Promotional email template (for admin)
 */
export function getPromotionalEmail(content: {
  title: string;
  message: string;
  ctaText?: string;
  ctaUrl?: string;
  imageUrl?: string;
}) {
  const emailContent = `
    <h2>${content.title}</h2>
    
    ${content.imageUrl ? `<img src="${content.imageUrl}" alt="${content.title}" style="max-width: 100%; border-radius: 8px; margin: 20px 0;"/>` : ""}
    
    <div style="font-size: 16px; line-height: 1.8;">
      ${content.message}
    </div>
    
    ${content.ctaText && content.ctaUrl ? `<a href="${content.ctaUrl}" class="button">${content.ctaText}</a>` : ""}
    
    <div class="divider"></div>
    
    <p style="font-size: 14px; color: #86868b;">
      You're receiving this email because you opted in to promotional emails from Lodge Internet.<br/>
      <a href="${process.env.NEXT_PUBLIC_BASE_URL}/settings/email-preferences" style="color: #0071e3;">Manage email preferences</a>
    </p>
  `;
  return getEmailTemplate(emailContent);
}

/**
 * Feedback notification email template (for admin)
 */
export function getFeedbackNotificationEmail(feedback: {
  name: string;
  email: string;
  planName: string;
  type: "review" | "complaint";
  rating?: number;
  message: string;
  submittedAt: string;
}) {
  const typeEmoji = feedback.type === "review" ? "⭐" : "⚠️";
  const typeColor = feedback.type === "review" ? "#10b981" : "#ef4444";
  const typeBgColor = feedback.type === "review" ? "#d1fae5" : "#fee2e2";

  const ratingHtml =
    feedback.type === "review" && feedback.rating
      ? `
      <div style="margin: 15px 0;">
        <p style="margin: 0 0 5px 0; font-size: 14px; color: #86868b;">Rating</p>
        <p style="margin: 0; font-size: 24px;">${"⭐".repeat(feedback.rating)}${"☆".repeat(5 - feedback.rating)}</p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: #86868b;">${feedback.rating} out of 5 stars</p>
      </div>
    `
      : "";

  const emailContent = `
    <div style="background-color: ${typeBgColor}; padding: 20px; border-radius: 8px; border-left: 4px solid ${typeColor}; margin-bottom: 30px;">
      <h2 style="margin: 0; color: ${typeColor};">
        ${typeEmoji} New ${feedback.type === "review" ? "Review" : "Complaint"} Received
      </h2>
    </div>

    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Customer Information</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Name:</td>
          <td style="padding: 8px 0; font-weight: 600;">${feedback.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${feedback.email}" style="color: #0071e3;">${feedback.email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Plan:</td>
          <td style="padding: 8px 0; font-weight: 600;">${feedback.planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Submitted:</td>
          <td style="padding: 8px 0;">${new Date(feedback.submittedAt).toLocaleString()}</td>
        </tr>
      </table>
      ${ratingHtml}
    </div>

    <div style="background-color: #ffffff; border: 2px solid #d2d2d7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Message</h3>
      <p style="margin: 0; white-space: pre-wrap; line-height: 1.6;">${feedback.message}</p>
    </div>

    <div class="divider"></div>

    <p style="font-size: 14px; color: #86868b;">
      ${feedback.type === "review" ? "Consider responding to this positive feedback to build customer relationships." : "Please review and address this complaint as soon as possible."}
    </p>
    
    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/data-codes" class="button">View in Admin Dashboard</a>
  `;
  return getEmailTemplate(emailContent);
}

/**
 * Lodge Internet device code purchase email (for customer)
 */
export function getDeviceCodeEmail(details: {
  customerEmail: string;
  planName: string;
  usersCount: number;
  duration: string;
  price: number;
  code: string;
  hostel?: string;
  hostelPassword?: string;
}) {
  const content = `
    <h2>Your Lodge Internet Access Code 🔐</h2>
    <p>Hi there,</p>
    <p>Thank you for your purchase${details.hostel ? ` at <strong>${details.hostel}</strong>` : ""}! Here's your internet access code for <strong>${details.planName}</strong>.</p>
    
    <div style="background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%); padding: 30px; border-radius: 16px; margin: 30px 0; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 14px; opacity: 0.9;">Your Access Code</p>
      <div style="background-color: rgba(255, 255, 255, 0.95); padding: 20px; border-radius: 12px; margin: 15px 0;">
        <p style="margin: 0; font-size: 36px; font-weight: 700; font-family: 'Courier New', monospace; color: #1d1d1f; letter-spacing: 4px;">
          ${details.code}
        </p>
      </div>
      <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 14px; opacity: 0.9;">Keep this code safe and secure</p>
    </div>

    <div style="background-color: #f5f5f7; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Plan Details</h3>
      <table style="width: 100%;">
${
  details.hostel
    ? `        <tr>
          <td style="padding: 10px 0; color: #86868b;">Hostel:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.hostel}</td>
        </tr>`
    : ""
}
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Plan:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.planName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Devices:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.usersCount} Device${details.usersCount > 1 ? "s" : ""}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Duration:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.duration}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Amount Paid:</td>
          <td style="padding: 10px 0; font-weight: 600; font-size: 18px; text-align: right; color: #0071e3;">₦${details.price.toLocaleString()}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #e8f5e9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #10b981;">
      <h3 style="margin: 0 0 10px 0; color: #065f46;">📱 How to Use Your Code</h3>
      <ol style="margin: 10px 0; padding-left: 20px; color: #065f46;">
        <li style="margin: 8px 0;">Connect to the Lodge Internet network</li>
        <li style="margin: 8px 0;">Open your browser and enter the access code above</li>
        <li style="margin: 8px 0;">Start browsing immediately!</li>
      </ol>
    </div>
${
  details.hostelPassword
    ? `
    <div style="background-color: #eef2ff; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #6366f1;">
      <h3 style="margin: 0 0 10px 0; color: #3730a3;">🔑 Network Login Password</h3>
      <p style="margin: 0 0 8px 0; color: #3730a3; line-height: 1.6;">After connecting to the Lodge Internet network, you'll be prompted to log in. Use the password below:</p>
      <div style="background-color: #ffffff; padding: 14px 20px; border-radius: 8px; text-align: center; border: 2px solid #c7d2fe;">
        <span style="font-size: 22px; font-weight: 700; font-family: 'Courier New', monospace; color: #4338ca; letter-spacing: 3px;">${details.hostelPassword}</span>
      </div>
      <p style="margin: 10px 0 0 0; color: #3730a3; font-size: 13px; line-height: 1.6;">After connecting, you'll be prompted to input your voucher code above.</p>
    </div>
`
    : ""
}
    <div class="divider"></div>

    <p><strong>Important Notes:</strong></p>
    <ul style="color: #86868b; line-height: 1.8;">
      <li>This code is valid for ${details.usersCount} device${details.usersCount > 1 ? "s" : ""} simultaneously</li>
      <li>Do not share this code with others</li>
      <li>Save this email for your records</li>
    </ul>

    <p>Need help? Contact our support team anytime.</p>
    <p>Enjoy your internet!<br/>Lodge Internet Team</p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * Admin notification when a data code is purchased
 */
export function getCodePurchaseAdminNotification(details: {
  customerEmail: string;
  planName: string;
  usersCount: number;
  price: number;
  hostel: string;
  paymentRef: string;
  /** The code that was issued to the customer — kept for dispute resolution. */
  claimedCode?: string;
}) {
  const codeBlock = details.claimedCode
    ? `
    <div style="background-color: #ecfdf5; border: 1px solid #6ee7b7; padding: 18px 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0; color: #065f46; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Code Issued to Customer</p>
      <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; color: #065f46; letter-spacing: 1px; word-break: break-all;">${details.claimedCode}</p>
      <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px;">Kept on file for dispute resolution — do not share unless verifying ownership.</p>
    </div>
    `
    : "";

  const content = `
    <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; border-left: 4px solid #22c55e; margin-bottom: 30px;">
      <h2 style="margin: 0; color: #166534;">🔐 New Data Code Purchase</h2>
    </div>

    <p>A new data code has been purchased and delivered to the customer.</p>

    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Purchase Details</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Hostel:</td>
          <td style="padding: 8px 0; font-weight: 600;">${details.hostel}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Customer Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${details.customerEmail}" style="color: #0071e3;">${details.customerEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Plan:</td>
          <td style="padding: 8px 0; font-weight: 600;">${details.planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Devices:</td>
          <td style="padding: 8px 0; font-weight: 600;">${details.usersCount} Device${details.usersCount > 1 ? "s" : ""}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Amount:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0071e3;">₦${details.price.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Payment Ref:</td>
          <td style="padding: 8px 0; font-family: 'Courier New', monospace; font-size: 12px;">${details.paymentRef}</td>
        </tr>
      </table>
    </div>

    ${codeBlock}

    <p style="color: #86868b; font-size: 13px;">This is an automated notification. View full purchase logs in the admin dashboard.</p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * TV Unlimited subscription created email (for customer)
 */
export function getTVSubscriptionCreatedEmail(details: {
  customerName: string;
  customerEmail: string;
  planName: string;
  duration: number;
  price: number;
  paymentRef: string;
}) {
  const content = `
    <h2>TV Unlimited Subscription Created! 📺</h2>
    <p>Hi ${details.customerName},</p>
    <p>Thank you for subscribing to <strong>${details.planName}</strong>! Your payment has been confirmed.</p>
    
    <div style="background: linear-gradient(135deg, #60a5fa 0%, #c084fc 100%); padding: 30px; border-radius: 16px; margin: 30px 0; text-align: center;">
      <div style="background-color: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #86868b;">Subscription Status</p>
        <div style="display: inline-flex; align-items: center; gap: 10px; background-color: #fff3cd; padding: 12px 24px; border-radius: 20px; border: 2px solid #ffc107;">
          <span style="font-size: 24px;">⏳</span>
          <span style="font-weight: 600; color: #856404; font-size: 16px;">Pending Activation</span>
        </div>
      </div>
    </div>

    <div style="background-color: #f5f5f7; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Subscription Details</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Plan:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.planName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Duration:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.duration} Days</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Amount Paid:</td>
          <td style="padding: 10px 0; font-weight: 600; font-size: 18px; text-align: right; color: #0071e3;">₦${details.price.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Payment Ref:</td>
          <td style="padding: 10px 0; font-family: 'Courier New', monospace; font-size: 12px; text-align: right;">${details.paymentRef}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #fff3cd; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #ffc107;">
      <h3 style="margin: 0 0 10px 0; color: #856404;">⏳ What happens next?</h3>
      <p style="margin: 0; color: #856404; line-height: 1.6;">
        Our administrator will activate your subscription shortly. You'll receive another email once your subscription is active and ready to use.
      </p>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard" class="button">View Dashboard</a>

    <div class="divider"></div>

    <p>You can track your subscription status anytime in your dashboard.</p>
    <p>Thank you for choosing TV Unlimited!<br/>Lodge Internet Team</p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * TV Unlimited subscription activated email (for customer)
 */
export function getTVSubscriptionActivatedEmail(details: {
  customerName: string;
  planName: string;
  duration: number;
  activatedAt: string;
  expiresAt: string;
}) {
  const expiryDate = new Date(details.expiresAt);
  const formattedExpiry = expiryDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const content = `
    <h2>Your TV Subscription is Now Active! ✅</h2>
    <p>Hi ${details.customerName},</p>
    <p>Great news! Your <strong>${details.planName}</strong> subscription has been activated and is ready to use.</p>
    
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 16px; margin: 30px 0; text-align: center;">
      <div style="background-color: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #86868b;">Subscription Status</p>
        <div style="display: inline-flex; align-items: center; gap: 10px; background-color: #d1fae5; padding: 12px 24px; border-radius: 20px; border: 2px solid #10b981;">
          <span style="font-size: 24px;">✅</span>
          <span style="font-weight: 600; color: #065f46; font-size: 16px;">Active</span>
        </div>
      </div>
    </div>

    <div style="background-color: #f5f5f7; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Subscription Details</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Plan:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.planName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Duration:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${details.duration} Days</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Activated:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right;">${new Date(details.activatedAt).toLocaleDateString()}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #86868b;">Expires:</td>
          <td style="padding: 10px 0; font-weight: 600; text-align: right; color: #0071e3;">${formattedExpiry}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #e8f5e9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #10b981;">
      <h3 style="margin: 0 0 10px 0; color: #065f46;">📺 Start Watching Now</h3>
      <p style="margin: 0; color: #065f46; line-height: 1.6;">
        Your TV service is now active and ready to stream. Enjoy unlimited access to all your favorite content!
      </p>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard" class="button">View Dashboard</a>

    <div class="divider"></div>

    <p>We'll send you a reminder before your subscription expires.</p>
    <p>Enjoy your viewing experience!<br/>Lodge Internet Team</p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * TV Unlimited subscription expiring soon email (for customer)
 */
export function getTVSubscriptionExpiringSoonEmail(details: {
  customerName: string;
  planName: string;
  expiresAt: string;
}) {
  const expiryDate = new Date(details.expiresAt);
  const formattedExpiry = expiryDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeUntilExpiry = Math.ceil(
    (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60),
  );

  const content = `
    <h2>Your TV Subscription Expires Soon ⏰</h2>
    <p>Hi ${details.customerName},</p>
    <p>This is a friendly reminder that your <strong>${details.planName}</strong> subscription will expire in approximately <strong>${timeUntilExpiry} hours</strong>.</p>
    
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 16px; margin: 30px 0; text-align: center;">
      <div style="background-color: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #86868b;">Expiry Date</p>
        <p style="margin: 0; font-size: 24px; font-weight: 700; color: #92400e;">
          ${formattedExpiry}
        </p>
      </div>
    </div>

    <div style="background-color: #fff3cd; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #ffc107;">
      <h3 style="margin: 0 0 10px 0; color: #856404;">Don't miss out!</h3>
      <p style="margin: 0; color: #856404; line-height: 1.6;">
        Renew your subscription now to continue enjoying uninterrupted TV service. The renewal process is quick and easy.
      </p>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}" class="button">Renew Subscription</a>

    <div class="divider"></div>

    <p>Have questions? Our support team is always here to help.</p>
    <p>Best regards,<br/>Lodge Internet Team</p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * TV Unlimited subscription expired email (for customer)
 */
export function getTVSubscriptionExpiredEmail(details: {
  customerName: string;
  planName: string;
  expiredAt: string;
}) {
  const content = `
    <h2>Your TV Subscription Has Expired</h2>
    <p>Hi ${details.customerName},</p>
    <p>Your <strong>${details.planName}</strong> subscription has expired as of ${new Date(details.expiredAt).toLocaleDateString()}.</p>
    
    <div style="background-color: #fee2e2; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #ef4444;">
      <h3 style="margin: 0 0 10px 0; color: #991b1b;">⚠️ Service Inactive</h3>
      <p style="margin: 0; color: #991b1b; line-height: 1.6;">
        Your TV service is currently inactive. Renew your subscription to restore access immediately.
      </p>
    </div>

    <div style="background-color: #f5f5f7; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Why Renew?</h3>
      <ul style="margin: 10px 0; padding-left: 20px; line-height: 1.8;">
        <li>Resume watching instantly</li>
        <li>No interruption in your viewing experience</li>
        <li>Keep your account and preferences</li>
        <li>Access to all premium content</li>
      </ul>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}" class="button">Renew Now</a>

    <div class="divider"></div>

    <p>We'd love to have you back! If you have any questions, please reach out to our support team.</p>
    <p>Best regards,<br/>Lodge Internet Team</p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * TV Unlimited new subscription notification email (for admin)
 */
export function getTVSubscriptionAdminNotification(details: {
  customerName: string;
  customerEmail: string;
  macAddress: string;
  planName: string;
  duration: number;
  price: number;
  paymentRef: string;
  subscriptionId: string;
}) {
  const content = `
    <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 30px;">
      <h2 style="margin: 0; color: #1e40af;">📺 New TV Subscription Purchase</h2>
    </div>

    <p>A new TV Unlimited subscription has been purchased and is pending activation.</p>

    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Customer Information</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Name:</td>
          <td style="padding: 8px 0; font-weight: 600;">${details.customerName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${details.customerEmail}" style="color: #0071e3;">${details.customerEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">TV MAC Address:</td>
          <td style="padding: 8px 0; font-family: 'Courier New', monospace; font-size: 14px;">${details.macAddress}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #f5f5f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1d1d1f;">Subscription Details</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Plan:</td>
          <td style="padding: 8px 0; font-weight: 600;">${details.planName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Duration:</td>
          <td style="padding: 8px 0; font-weight: 600;">${details.duration} Days</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Amount:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0071e3;">₦${details.price.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Payment Ref:</td>
          <td style="padding: 8px 0; font-family: 'Courier New', monospace; font-size: 12px;">${details.paymentRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #86868b;">Subscription ID:</td>
          <td style="padding: 8px 0; font-family: 'Courier New', monospace; font-size: 12px;">${details.subscriptionId}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #fff3cd; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #ffc107;">
      <h3 style="margin: 0 0 10px 0; color: #856404;">⏳ Action Required</h3>
      <p style="margin: 0; color: #856404; line-height: 1.6;">
        Please review and activate this subscription from the TV Users admin panel. The customer is waiting for activation.
      </p>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/tv-users" class="button">Go to TV Users Panel</a>

    <div class="divider"></div>

    <p style="font-size: 14px; color: #86868b;">
      This is an automated notification from the Lodge Internet system.
    </p>
  `;
  return getEmailTemplate(content);
}

// ── Split Partner Report Email ────────────────────────────────────────────────

export interface SplitEmailData {
  hostel: string;
  dateFrom: string;
  dateTo: string;
  isOpen: boolean;
  adminPercent: number;
  partnerPercent: number;
  totalRevenue: number;
  maintenancePct: number;
  paystackPct: number;
  maintenanceDeduction: number;
  paystackDeduction: number;
  splittableRevenue: number;
  adminShare: number;
  partnerShare: number;
  transactionCount: number;
  notes?: string;
  createdAt: string;
}

export interface SplitEmailRow {
  date: string;
  planName: string;
  planType: string;
  email: string;
  ref: string;
  price: number;
  adminShare: number;
  partnerShare: number;
}

export function getVerificationCodeEmail(details: {
  code: string;
  email: string;
}) {
  const content = `
    <h2 style="color: #1d1d1f; margin: 0 0 10px;">Verify Your Email</h2>
    <p style="color: #3c3c3e; font-size: 15px;">
      Use the code below to verify your Lodge Internet account.
    </p>

    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 28px; text-align: center; margin: 24px 0;">
      <p style="color: #e0e7ff; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">Your Verification Code</p>
      <p style="color: #ffffff; font-size: 36px; font-weight: 800; letter-spacing: 8px; margin: 0; font-family: monospace;">${details.code}</p>
    </div>

    <p style="color: #6e6e73; font-size: 13px; margin-top: 16px;">
      This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.
    </p>
  `;

  return getLodgeInternetEmailTemplate(content);
}

export function getPasswordResetCodeEmail(details: {
  code: string;
  email: string;
}) {
  const content = `
    <h2 style="color: #1d1d1f; margin: 0 0 10px;">Reset Your Password</h2>
    <p style="color: #3c3c3e; font-size: 15px;">
      We received a request to reset the password for your Lodge Internet account.
    </p>

    <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); border-radius: 16px; padding: 28px; text-align: center; margin: 24px 0;">
      <p style="color: #dbeafe; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px;">Password Reset Code</p>
      <p style="color: #ffffff; font-size: 36px; font-weight: 800; letter-spacing: 8px; margin: 0; font-family: monospace;">${details.code}</p>
    </div>

    <p style="color: #6e6e73; font-size: 13px; margin-top: 16px;">
      This code expires in <strong>10 minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your account is secure.
    </p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

export function getWelcomeAccountEmail(details: {
  displayName: string;
  hostel: string;
}) {
  const content = `
    <h2 style="color: #1d1d1f; margin: 0 0 10px;">Welcome to Lodge Internet!</h2>
    <p style="color: #3c3c3e; font-size: 15px;">
      Hi <strong>${details.displayName}</strong>, your account has been verified and is ready to use.
    </p>

    <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px; font-size: 13px; color: #6e6e73; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Hostel</p>
      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #1d1d1f;">${details.hostel}</p>
    </div>

    <p style="color: #3c3c3e; font-size: 14px;">
      You can now sign in anytime to view your purchases, access codes, and buy new plans — all from your personalized dashboard.
    </p>
  `;

  return getLodgeInternetEmailTemplate(content);
}

export function getSplitPartnerEmail(
  split: SplitEmailData,
  transactions: SplitEmailRow[],
  periodLabel: string,
): string {
  const fmt = (n: number) =>
    "\u20a6" + n.toLocaleString("en-NG", { minimumFractionDigits: 0 });

  const periodStr = split.isOpen
    ? `From ${split.dateFrom} (Ongoing)`
    : split.dateTo
      ? `${split.dateFrom} \u2192 ${split.dateTo}`
      : split.dateFrom;

  const splittablePct = 100 - split.maintenancePct - split.paystackPct;

  const txnRows = transactions
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#3c3c3e;white-space:nowrap;">${t.date}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#1d1d1f;font-weight:500;">${t.planName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#3c3c3e;max-width:150px;overflow:hidden;text-overflow:ellipsis;">${t.email || "\u2014"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;color:#1d1d1f;text-align:right;white-space:nowrap;">${fmt(t.price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:700;color:#1e40af;text-align:right;white-space:nowrap;">${fmt(t.adminShare)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:700;color:#6d28d9;text-align:right;white-space:nowrap;">${fmt(t.partnerShare)}</td>
      </tr>`,
    )
    .join("");

  const content = `
    <div style="background:linear-gradient(135deg,#60a5fa 0%,#a78bfa 100%);border-radius:16px;padding:24px 28px;margin-bottom:28px;">
      <p style="margin:0;color:#e0e7ff;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Revenue Split Report</p>
      <h2 style="margin:6px 0 2px;color:#fff;font-size:26px;font-weight:800;">${split.hostel}</h2>
      <p style="margin:0;color:#ddd6fe;font-size:14px;">${periodLabel || periodStr}</p>
    </div>

    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 16px;background:#f0fdf4;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#16a34a;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Transactions</p>
          <p style="margin:5px 0 0;font-size:22px;font-weight:800;color:#15803d;">${split.transactionCount}</p>
        </td>
        <td style="padding:14px 16px;background:#f8faff;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Gross Revenue</p>
          <p style="margin:5px 0 0;font-size:22px;font-weight:800;color:#1d1d1f;">${fmt(split.totalRevenue)}</p>
        </td>
        <td style="padding:14px 16px;background:#eff6ff;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#1d4ed8;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Splittable (${splittablePct}%)</p>
          <p style="margin:5px 0 0;font-size:22px;font-weight:800;color:#1e40af;">${fmt(split.splittableRevenue)}</p>
        </td>
        <td style="padding:14px 16px;background:#f5f3ff;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#6d28d9;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Your Share (${split.partnerPercent}%)</p>
          <p style="margin:5px 0 0;font-size:22px;font-weight:800;color:#4c1d95;">${fmt(split.partnerShare)}</p>
        </td>
      </tr>
    </table>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#92400e;">Revenue Breakdown</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#374151;">Gross Revenue</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#1d1d1f;text-align:right;">${fmt(split.totalRevenue)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#d97706;">&minus; Maintenance fee (${split.maintenancePct}%)</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#d97706;text-align:right;">&minus;${fmt(split.maintenanceDeduction)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#d97706;">&minus; Paystack processing fee (${split.paystackPct}%)</td>
          <td style="padding:5px 0;font-size:13px;font-weight:600;color:#d97706;text-align:right;">&minus;${fmt(split.paystackDeduction)}</td>
        </tr>
        <tr style="border-top:2px solid #fde68a;">
          <td style="padding:10px 0 6px;font-size:14px;font-weight:700;color:#065f46;">= Available to Split (${splittablePct}%)</td>
          <td style="padding:10px 0 6px;font-size:14px;font-weight:800;color:#065f46;text-align:right;">${fmt(split.splittableRevenue)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0 4px;font-size:13px;color:#6d28d9;font-weight:600;">&rarr; Your Share (${split.partnerPercent}% of splittable)</td>
          <td style="padding:6px 0 4px;font-size:13px;font-weight:700;color:#4c1d95;text-align:right;">${fmt(split.partnerShare)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#9ca3af;">&rarr; Admin Share (${split.adminPercent}% of splittable)</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#9ca3af;text-align:right;">${fmt(split.adminShare)}</td>
        </tr>
      </table>
    </div>

    ${split.notes ? `<div style="background:#f9fafb;border-radius:10px;padding:14px 18px;margin-bottom:24px;border-left:3px solid #a78bfa;"><p style="margin:0;font-size:13px;color:#374151;"><strong>Notes:</strong> ${split.notes}</p></div>` : ""}

    <h3 style="font-size:15px;font-weight:700;color:#1d1d1f;margin:0 0 12px;">Transaction Detail (${transactions.length})</h3>
    <div style="overflow-x:auto;border-radius:12px;border:1px solid #e5e7eb;">
      <table style="width:100%;border-collapse:collapse;font-family:inherit;">
        <thead>
          <tr style="background:#f5f5f7;">
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Plan</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Email</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Amount</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Admin (${split.adminPercent}%)</th>
            <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#6d28d9;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Partner (${split.partnerPercent}%)</th>
          </tr>
        </thead>
        <tbody>${txnRows}</tbody>
      </table>
    </div>

    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">
        Generated on ${new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })} by Lodge Internet Admin.
        ${split.isOpen ? "This is an ongoing split \u2014 figures shown reflect the selected period." : ""}
      </p>
    </div>
  `;

  return getLodgeInternetEmailTemplate(content);
}

/**
 * Unfulfilled purchase admin alert — fires when a customer pays but we can't
 * deliver a code (stockout, missing plan, etc). Designed to get an admin's
 * attention fast so the customer can be made whole.
 */
export function getDeliveryFailedAdminNotification({
  customerEmail,
  planName,
  hostel,
  paymentRef,
  reason,
}: {
  customerEmail: string;
  planName: string;
  hostel: string;
  paymentRef: string;
  reason: "no_stock" | "plan_missing" | "unknown";
}) {
  const reasonLabel =
    reason === "no_stock"
      ? "No codes available in inventory for this hostel + plan"
      : reason === "plan_missing"
        ? "Plan record could not be found"
        : "Unknown delivery failure";

  const content = `
    <div style="background-color:#fee2e2;padding:20px;border-radius:8px;border-left:4px solid #dc2626;margin-bottom:30px;">
      <h2 style="margin:0;color:#991b1b;">⚠️ Unfulfilled Purchase — Action Required</h2>
    </div>

    <p style="color:#1d1d1f;line-height:1.6;">
      A customer's payment was confirmed but a code could not be delivered. Please reconcile this purchase as soon as possible.
    </p>

    <div style="background-color:#f5f5f7;padding:20px;border-radius:8px;margin:20px 0;">
      <table style="width:100%;">
        <tr>
          <td style="padding:8px 0;color:#86868b;">Customer:</td>
          <td style="padding:8px 0;"><a href="mailto:${customerEmail}" style="color:#0071e3;">${customerEmail}</a></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Hostel:</td>
          <td style="padding:8px 0;font-weight:600;">${hostel}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Plan:</td>
          <td style="padding:8px 0;font-weight:600;">${planName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Payment Ref:</td>
          <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:13px;">${paymentRef}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Reason:</td>
          <td style="padding:8px 0;color:#dc2626;font-weight:600;">${reasonLabel}</td>
        </tr>
      </table>
    </div>

    <div style="background-color:#fff7ed;border-left:4px solid #f59e0b;padding:15px 18px;border-radius:0 8px 8px 0;margin:20px 0;">
      <p style="margin:0;color:#92400e;line-height:1.6;font-size:14px;">
        <strong>What to do:</strong> Verify the payment in Paystack, top up inventory for this hostel + plan, then manually deliver the code to the customer (or issue a refund if they prefer).
      </p>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/transactions" class="button">Open Transactions Panel</a>

    <div class="divider"></div>

    <p style="font-size:14px;color:#86868b;">
      This is an automated alert from the Lodge Internet system.
    </p>
  `;
  return getEmailTemplate(content);
}

/**
 * TV MAC address updated — sent to the customer when they change their MAC.
 */
export function getTVMacAddressUpdatedEmail({
  customerName,
  planName,
  macAddress,
}: {
  customerName: string;
  planName: string;
  macAddress: string;
}) {
  const content = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1d1d1f;">
      TV MAC Address Updated
    </h2>
    <p style="color:#3d3d3f;line-height:1.6;margin:0 0 12px;">
      Hi ${customerName},
    </p>
    <p style="color:#3d3d3f;line-height:1.6;margin:0 0 16px;">
      The MAC address on your <strong>${planName}</strong> subscription has been updated. Your new MAC address is:
    </p>
    <div style="background-color:#f5f5f7;padding:18px 20px;border-radius:12px;margin:0 0 20px;text-align:center;">
      <p style="margin:0;font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#1d1d1f;letter-spacing:1px;">
        ${macAddress}
      </p>
    </div>
    <div style="background-color:#fff7ed;border-left:4px solid #f59e0b;padding:14px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
      <p style="margin:0;color:#92400e;font-size:14px;line-height:1.5;">
        If you didn't make this change, please contact support immediately.
      </p>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
      Our team has been notified and will re-provision your subscription on the new device shortly.
    </p>
  `;
  return getLodgeInternetEmailTemplate(content);
}

/**
 * TV MAC address updated — admin notification so they can re-provision the device.
 */
export function getTVMacAddressUpdatedAdminNotification({
  customerName,
  customerEmail,
  hostel,
  planName,
  macAddress,
  subscriptionId,
}: {
  customerName: string;
  customerEmail: string;
  hostel: string;
  planName: string;
  macAddress: string;
  subscriptionId: string;
}) {
  const content = `
    <div style="background-color:#dbeafe;padding:20px;border-radius:8px;border-left:4px solid #3b82f6;margin-bottom:30px;">
      <h2 style="margin:0;color:#1e40af;">📡 TV MAC Address Updated</h2>
    </div>

    <p>A subscriber updated the MAC address on their TV subscription. Please re-provision the new device on the network.</p>

    <div style="background-color:#f5f5f7;padding:20px;border-radius:8px;margin:20px 0;">
      <table style="width:100%;">
        <tr>
          <td style="padding:8px 0;color:#86868b;">Name:</td>
          <td style="padding:8px 0;font-weight:600;">${customerName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Email:</td>
          <td style="padding:8px 0;"><a href="mailto:${customerEmail}" style="color:#0071e3;">${customerEmail}</a></td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Hostel:</td>
          <td style="padding:8px 0;font-weight:600;">${hostel}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Plan:</td>
          <td style="padding:8px 0;font-weight:600;">${planName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">New MAC:</td>
          <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:14px;">${macAddress}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#86868b;">Subscription ID:</td>
          <td style="padding:8px 0;font-family:'Courier New',monospace;font-size:12px;">${subscriptionId}</td>
        </tr>
      </table>
    </div>

    <a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/tv-users" class="button">Open TV Users Panel</a>

    <div class="divider"></div>

    <p style="font-size:14px;color:#86868b;">
      This is an automated notification from the Lodge Internet system.
    </p>
  `;
  return getEmailTemplate(content);
}

/**
 * Registration reminder email — sent to users who have purchased before but
 * haven't linked a hostel to their account yet.
 */
export function getRegistrationReminderEmail({
  customerEmail,
  suggestedHostel,
  registerUrl,
}: {
  customerEmail: string;
  suggestedHostel?: string;
  registerUrl: string;
}) {
  const hostelLine = suggestedHostel
    ? `<p>Based on your purchase history, it looks like you're at <strong>${suggestedHostel}</strong>. You can confirm or change this during registration.</p>`
    : `<p>Please complete your registration so we can link your account to the correct hostel.</p>`;

  const content = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1d1d1f;">
      Complete Your Registration
    </h2>
    <p style="color:#3d3d3f;line-height:1.6;margin:0 0 12px;">
      Hi there,
    </p>
    <p style="color:#3d3d3f;line-height:1.6;margin:0 0 12px;">
      We noticed that your Lodge Internet account (<strong>${customerEmail}</strong>) hasn't been fully set up yet. To continue purchasing plans seamlessly, please link your account to your hostel.
    </p>
    ${hostelLine}
    <div style="text-align:center;margin:28px 0;">
      <a href="${registerUrl}"
         style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#60a5fa,#818cf8);color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;">
        Complete Registration
      </a>
    </div>
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
      If you didn't create an account with us, you can safely ignore this email.
    </p>
  `;

  return getLodgeInternetEmailTemplate(content);
}

// ── Waitlist confirmation ─────────────────────────────────────────────────────

export function getWaitlistConfirmationEmail(details: {
  audienceType: "student" | "resident";
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const waitlistUrl = `${baseUrl}/waitlist`;
  const placeWord = details.audienceType === "student" ? "hostel" : "area";

  const content = `
    <h2 style="font-size:24px;font-weight:700;color:#1d1d1f;margin:0 0 8px;">
      You're on the waitlist! 🎉
    </h2>
    <p style="color:#1d1d1f;font-size:16px;line-height:1.6;margin:0 0 24px;">
      Thanks for signing up. You're officially one of the first people we'll
      reach out to the moment Lodge Internet goes live in your ${placeWord}.
    </p>

    <h3 style="font-size:18px;font-weight:700;color:#1d1d1f;margin:0 0 8px;">
      So, what is Lodge Internet?
    </h3>
    <p style="color:#1d1d1f;font-size:15px;line-height:1.7;margin:0 0 12px;">
      We're bringing <strong>Starlink-powered internet</strong> straight to
      hostels and homes around you. That means real speeds — up to
      <strong>50&nbsp;Mbps</strong> — Zoom calls that don't freeze, YouTube
      without the buffering wheel, and assignments that upload in seconds,
      not minutes.
    </p>
    <p style="color:#1d1d1f;font-size:15px;line-height:1.7;margin:0 0 20px;">
      And it's not just data plans. We also offer <strong>TV Unlimited</strong>
      subscriptions — your favourite shows and movie nights without the
      buffering wheel either.
    </p>

    <div style="background-color:#f5f5f7;border-radius:12px;padding:20px;margin:20px 0;">
      <h3 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#1d1d1f;">
        Why we think you'll love it
      </h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">
            🛰️&nbsp;&nbsp;Powered by Starlink — no more "network is down"
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">
            ⚡&nbsp;&nbsp;Up to 50&nbsp;Mbps, capped fairly so everyone gets a share
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">
            💸&nbsp;&nbsp;Data plans from ₦300 (1&nbsp;GB) to ₦40,000 (Unlimited / 3 devices)
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">
            📺&nbsp;&nbsp;TV Unlimited subscriptions for movies, sports &amp; binge nights
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">
            📱&nbsp;&nbsp;Buy a data code, paste it, connect — done in seconds
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#1d1d1f;line-height:1.6;">
            🤝&nbsp;&nbsp;Real humans on WhatsApp whenever anything goes wrong
          </td>
        </tr>
      </table>
    </div>

    <div style="background:linear-gradient(135deg,#dbeafe 0%,#ede9fe 100%);border-radius:12px;padding:24px;margin:24px 0;border:1px solid #c7d2fe;">
      <h3 style="margin:0 0 10px;font-size:17px;font-weight:700;color:#1e40af;">
        Want us to come to your ${placeWord} faster?
      </h3>
      <p style="margin:0 0 16px;color:#1e3a8a;font-size:14px;line-height:1.7;">
        We're rolling out where demand is loudest. The more people from your
        ${placeWord} who join the waitlist, the sooner we install there.
        <strong>Send this to anyone you know who'd want it too</strong> —
        roommates, classmates, neighbours, your group chats.
      </p>
      <a href="${waitlistUrl}" class="button" style="background:linear-gradient(135deg,#60a5fa 0%,#a78bfa 100%);">
        Share the waitlist
      </a>
      <p style="margin:14px 0 0;font-size:12px;color:#475569;word-break:break-all;">
        Or copy this link: <a href="${waitlistUrl}" style="color:#0071e3;">${waitlistUrl}</a>
      </p>
    </div>

    <p style="color:#374151;font-size:15px;line-height:1.7;margin:20px 0 8px;">
      We'll WhatsApp you the moment we go live near you. Thanks for being
      early — that genuinely helps us decide where to build next.
    </p>

    <p style="color:#1d1d1f;font-size:15px;line-height:1.6;margin:24px 0 0;">
      — The Lodge Internet team
    </p>

    <div class="divider"></div>
    <p style="color:#86868b;font-size:12px;line-height:1.6;margin:0;">
      You're getting this because you joined the Lodge Internet waitlist. If
      that wasn't you, just ignore this email — we won't message you again.
    </p>
  `;

  return getLodgeInternetEmailTemplate(content);
}
