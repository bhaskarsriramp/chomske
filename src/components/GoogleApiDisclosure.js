import React, { useState, useEffect } from 'react';
import Navbar from './Navbar'
import Footer from './Footer'


function GoogleApiDisclosure() {

     useEffect(() => {
          // Ensure dataLayer is defined before calling gtag
          window.dataLayer = window.dataLayer || [];
          function gtag() {
            window.dataLayer.push(arguments);
          }
          gtag('js', new Date());
          gtag('config', 'G-D1X0WBG5EL');
        }, []);

  return (
   <>

      <header>
        <title>Security and Data Protection | PostLn</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-D1X0WBG5EL"></script>

      </header>
   <Navbar />


    <div className="container">

        <div className = "google-api-disclosure-text">Google API Disclosure</div>

        <div className = "google-api-disclosure-text-desc">PostLn's use and transfer of information received from Google APIs to any other app will adhere to <span className="span-txt-70"><a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" style={{ textDecoration : 'none', color : 'blue'}}>Google API Services User Data Policy</a></span>, including the Limited Use requirements.</div>
    </div>
    <Footer />
   </>
  )
}

export default GoogleApiDisclosure