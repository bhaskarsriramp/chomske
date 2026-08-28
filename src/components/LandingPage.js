import { Suspense, lazy } from "react";
import { Helmet } from "react-helmet";
import Navbar from "../components/Navbar";
import BodyMain1 from "./BodyMain1";
import HeroSection from "./HeroSection";
import GifShowcase from "./GifShowCase";
import FAQSection from "./FAQSection";
import redditLogo from "../images/redditIcon.png"
import linkedinLogo from "../images/linkedin-logo.png"
import twitterLogo from "../images/twitter.png"
import facebookLogo from "../images/facebook.png"
import WhatsAppProblemSolveCard from "./WhatsAppFeature";
import ThreeBlockPage from "./ThreeBlockPage.js";
import ContentShowcase from "./ContentShowCase.js";
import InstagramAutomationBlock from "./InstagramAutomationBlocks.js";
import AllFeatures1 from "./AllFeatures1.js";
import AllFeatures2 from "./AllFeatures2.js";

// Lazy-loaded components
const Footer = lazy(() => import("../components/Footer"));
const BannerLandpage = lazy(() => import("./BannerLandPage"));

export default function LandingPage() {
  return (
    <>
  <Helmet>
  <title>Instagram Auto DM and Bio Tool for Creators under 50k Followers</title>
  <meta
    name="description"
    content="Monthly 25,00,000 AutoDMs quota, Unlimited Contacts, Unlimited Bio Links & more for just ₹399."
  />
  <link rel="canonical" href="https://myhandle.in/" />

</Helmet>



      <Navbar />
<HeroSection logos={{ reddit: redditLogo, linkedin: linkedinLogo, twitter: twitterLogo, facebook: facebookLogo }} />



      {/* Lazy-loaded below pages */}
      <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
      <AllFeatures1 />
      <AllFeatures2 />
      <ThreeBlockPage />
      {/* <WhatsAppProblemSolveCard /> */}
      {/* <InstagramAutomationBlock /> */}
      {/* <ContentShowcase /> */}
      <FAQSection />

        <BannerLandpage />
        <Footer />
      </Suspense>
    </>
  );
}

// // import Head from 'next/head'
// import React, { useEffect } from 'react';
// import Navbar from '../components/Navbar'
// import BodyMain from '../components/BodyMain'
// import Accordian from '../components/Accordian'
// import Footer from '../components/Footer'
// import BodyBlocks from '../components/BodyBlocks'
// import { Helmet } from "react-helmet";
// import BodyBlocksTabs from './BodyBlocksTabs';
// // import Script from 'next/script'

// export default function LandingPage() {

//   useEffect(() => {
//     // Ensure dataLayer is defined before calling gtag
//     window.dataLayer = window.dataLayer || [];
//     function gtag() {
//       window.dataLayer.push(arguments);
//     }
//     gtag('js', new Date());
//     gtag('config', 'G-D1X0WBG5EL');
//   }, []);

  // const [cookieConsent, setCookieConsent] = useState(null);
  // const isMobile = useMediaQuery("(max-width:600px)");

  // useEffect(() => {
  //   if (cookieConsent === "accept") {
      // Initialize Google Analytics only if the user accepts cookies
  //     window.dataLayer = window.dataLayer || [];
  //     function gtag() {
  //       window.dataLayer.push(arguments);
  //     }
  //     gtag("js", new Date());
  //     gtag("config", "G-D1X0WBG5EL");
  //   }
  // }, [cookieConsent]);

//   return (

//     <>

//         <Helmet>
//         <title>Turn Audio into Stunning Videos | AudioReel</title>
//         <meta name="description" content="Transform your audio into stunning videos with AI-powered tools. Perfect for creators, speakers, and audiobooks. Create professional videos instantly!" />
//         <meta property="og:title" content="Turn Audio into Stunning Videos | AudioReel" />
//         <meta property="og:description" content="Transform your audio into stunning videos with AI-powered tools. Perfect for creators, speakers, and audiobooks. Create professional videos instantly!" />
//         <meta property="og:type" content="website" />
//         <link rel="canonical" href="https://www.audioreel.io" />
//         <meta name="google-site-verification" content="Y8Lu6AhM03esRTZg_PR1fnHPfEv-QVz70Px3WMg2boc" />
//         <script async src="https://www.googletagmanager.com/gtag/js?id=G-D1X0WBG5EL"></script>

//       </Helmet>

//       <Navbar />
//       <BodyMain />
//       {/* <BodyBlocksTabs /> */}
//       <BodyBlocks />
//       {/* <Accordian /> */}
//       <Footer />
//       {/* <Script async src="https://www.googletagmanager.com/gtag/js?id=G-D0SY7XGY0L"></Script>

//         <Script id="analytics-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window.dataLayer = window.dataLayer || [];
//                 function gtag(){
//                 dataLayer.push(arguments);
//                 }
//                 gtag('js', new Date());
//                 gtag('config', 'G-D0SY7XGY0L');`}}></Script> */}

//          </>
//   )
// }

// import { useEffect, useState } from "react";

