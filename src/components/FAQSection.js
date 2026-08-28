// FAQSection.js
import React from "react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Container,
  Box,
    useMediaQuery,
  useTheme
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { styled } from "@mui/material/styles";

const faqs = [
  {
    question: "What exactly is myHandle?",
    answer: `
MyHandle is a **link-in-bio mini site**: one fast page with your links, actions (WhatsApp, Call, Maps), payments, and analytics — all on a **custom subdomain** like <strong>yourname.myhandle.in</strong>.

- Built to be **mobile-first** and super quick to launch.
- Great for Instagram, YouTube, LinkedIn bios, QR codes, and business cards.
- If you need multi-page content or blogs, you can still link out to your main site from myHandle.
    `,
  },

    {
    question: "Can I accept payments on my page?",
    answer: `
Yes — we support **UPI/Razorpay** flows that your audience already uses.

- Take **tips, donations, bookings**, or sell **digital items** right from your page.
- Payments are processed by trusted partners; myHandle **does not store** full card/UPI details.
- You'll see **basic payment events** in your analytics for clarity.
    `,
  },

    {
    question: "What analytics do I get?",
    answer: `
Your dashboard shows **Visitors vs. Views**, **top links**, **CTR**, **referrers**, **device types**, and **region**.

- Quick filters: **Today**, **Last 7 days**, **Last 28 days**.
- We dedupe visitors for a more accurate picture (no double-counting the same person repeatedly).
- Use insights to **double down** on what works.
    `,
  },

    {
    question: "Is there a free plan? What's the pricing?",
    answer: `
We're India-first and keep pricing simple: starting at **₹99/month**.

- Transparent pricing with **no hidden fees** from our side.
- Payment gateway charges (if any) are as per **Razorpay/UPI**.
- You can cancel anytime to stop future renewals.
    `,
  },

    {
    question: "Does myHandle support Hindi or other languages?",
    answer: `
Yes — we support **English + Hindi** out of the box (more languages coming).

- Add Hindi text to your page and blocks seamlessly.
- We're optimizing performance for Indian networks and devices.
    `,
  },

    {
    question: "What is your refund policy?",
    answer: `
We offer a **7-day, no-questions-asked refund** on new subscriptions. After **14 days** from payment, **no refunds** are issued.

- For duplicate/failed transactions, we'll refund after verification.
- To request: email <strong>support@myhandle.in</strong> with your registered email, amount, date, and transaction ID.
    `,
  },

  {
    question: "How do renewals and cancellation work?",
    answer: `
Plans renew automatically (monthly/yearly) unless you cancel **before** the next cycle.

- Refunds are **not available** after a successful renewal charge.
- Cancel anytime from your account or by emailing <strong>support@myhandle.in</strong> to avoid future charges.
    `,
  },
  

  {
    question: "Can I add WhatsApp, Call, Maps, and socials?",
    answer: `
Absolutely. myHandle includes **smart action blocks**:

- **WhatsApp**, **Call**, **Email**, **Maps**, **YouTube**, **Instagram**, **LinkedIn**, and more.
- Add unlimited links and reorder them easily.
- Use **QR codes** offline to send users straight to your page.
    `,
  },


  {
    question: "Will my page show up on Google? (SEO)",
    answer: `
myHandle pages are **indexable**, fast, and mobile-friendly.

- You can customize page title/description for better previews.
- If you prefer **privacy**, we can limit indexability on request.
- For deeper SEO (blogs/landing pages), link out to your main site.
    `,
  },
  {
    question: "Is my data secure? Do you store payment details?",
    answer: `
We take security seriously: **TLS encryption**, **AES-256 at rest**, **RBAC**, and secure hosting on **GCP**.

- We **do not store** full card or UPI credentials — payments flow via PCI-compliant partners like **Razorpay**.
- We collect **aggregated analytics** only (visitors, clicks, referrers) per our Privacy Policy and India’s **DPDP Act, 2023**.
    `,
  },
  {
    question: "How do I migrate from another link-in-bio platform?",
    answer: `
Just copy your existing links into myHandle and publish — it takes minutes.

- Keep the same order/titles and add action blocks (WhatsApp/Call) to improve conversions.
- Replace the link in your social bios with **yourname.myhandle.in** and you’re live.
    `,
  },

  {
    question: "Do you track my visitors personally?",
    answer: `
No — analytics are **aggregate-level** (visits, clicks, device types, regions). We don’t sell or rent your data.

- You can request account/data deletion anytime via <strong>support@myhandle.in</strong>.
- See our full Privacy Policy for details.
    `,
  }
];


// 🔄 Custom Expand Icon with rotation
const ExpandIcon = styled((props) => <ExpandMoreIcon {...props} />)(
  ({ theme, expand }) => ({
    transform: expand ? "rotate(180deg)" : "rotate(0deg)",
    transition: theme.transitions.create("transform", {
      duration: theme.transitions.duration.shortest,
    }),
  })
);

// 🎨 Background colors array
const bgColors = [
  "#ECFAE5",
  "#FFDCDC",
  "#e0f7fa",
  "#D2E0FB",
  "#E4D8DC",
  "#F9F9F9",
];

const FAQSection = () => {
  const [expanded, setExpanded] = React.useState(false);
   const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm")); 

  const handleChange = (panel) => (_, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Box textAlign="center" mb={4}>
        <Typography gutterBottom sx={{ fontFamily : 'Inter', fontSize : isMobile ? '22px' : '32px', fontWeight : 600}}>
          Frequently Asked Questions
        </Typography>
        <Typography color="text.secondary" sx={{ fontFamily : 'Inter', fontSize : isMobile ? '14px' : '15px', fontWeight : 400}}>
          Everything you need to know before using the platform
        </Typography>
      </Box>

      {faqs.map((faq, index) => (
        <Accordion
          key={index}
          expanded={expanded === index}
          onChange={handleChange(index)}
          disableGutters
          sx={{
            mb: 2,
            borderRadius: 2,
            boxShadow: 2,
            py: 2,
            px: isMobile ? 0 : 2,
            backgroundColor: bgColors[index % bgColors.length],
            "&:before": { display: "none" }, // 🔥 removes the horizontal line
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandIcon expand={expanded === index ? 1 : 0} />}
            aria-controls={`faq-content-${index}`}
            id={`faq-header-${index}`}
          >
            <Typography sx={{ fontFamily : 'Inter', fontSize : isMobile ? '16px' : '20px', fontWeight : 500, px: isMobile ? 0 : 2}}>
              {faq.question}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
 <Typography
  sx={{ whiteSpace: "pre-line", fontFamily : 'Inter', fontSize : '14px', fontWeight : 400 }}
  dangerouslySetInnerHTML={{
    __html: faq.answer
      // Convert **bold** → <strong>
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Convert "- text" → bullet points
      .replace(/^- (.*$)/gim, "<li>$1</li>")
      // Wrap consecutive <li>…</li> in <ul>…</ul>
      .replace(/(<li>.*<\/li>)/gims, "<ul>$1</ul>")
  }}
/>


              {/* {faq.answer}
            </Typography> */}
          </AccordionDetails>
        </Accordion>
      ))}
    </Container>
  );
};

export default FAQSection;
