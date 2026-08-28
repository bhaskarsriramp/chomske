const CheckCircleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height="18"
    viewBox="0 0 24 24"
    fill="green"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" />
  </svg>
);

export default function HeroSection() {
  return (
    <>
      <style>
        {`
          .hero-container {
            padding-top: 4rem;
            padding-left: 1rem;
            padding-right: 1rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: 3rem;
          }

          .hero-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: #eef4ff;
            color: #06923E;
            font-weight: 500;
            padding: 6px 14px;
            border-radius: 16px;
            font-size: 0.75rem;
            margin-bottom: 1rem;
          }


          .hero-heading span {
            background: linear-gradient(to right, #0a66c2, #5600ecff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

            .hero-heading span1 {
            background: linear-gradient(to right, #0a66c2, #0a66c2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .hero-subtext {
            font-family: Inter, sans-serif;
            font-weight: 400;
            color: #555;
            margin: 0.5rem auto 0;
            max-width: 620px;
            line-height: 1.6;
            padding: 0 13px;
            font-size: 1rem;
            text-align: center;
          }

          .hero-buttons {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            margin-top: 2rem;
          }

          .btn-primary {
            background: linear-gradient(to right, #000000, #8b5cf6);
            color: white;
            padding: 10px 46px;
            border: none;
            border-radius: 26px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
          }

          .btn-primary:hover {
            background: linear-gradient(to right, #4f46e5, #7c3aed);
          }

        .hero-footer-points {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 1.5rem;
  font-size: 0.95rem;
  color: #4b5563;
}

/* For tablet and up — switch to row layout */
@media (min-width: 768px) {
 .hero-footer-points {
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    padding-left: 0;
  }
     
}

          .footer-point {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          /* Responsive media styles */
          @media (min-width: 768px) {

            .hero-heading {
            font-family: Inter, sans-serif;
            font-weight: 700;
              font-size: 3.2rem;
            text-align: center;
            color: #111;
            line-height: 1.2;
            padding: 0 12rem;
          }

            .hero-subtext {
              font-size: 1.25rem;
            }

            .hero-buttons {
              flex-direction: row;
            }

              .hero-heading-bottom {
            font-family: Inter, sans-serif;
            font-weight: 700;
            text-align: center;
            color: #111;
            line-height: 1.2;
            padding: 0 1rem;
            font-size: 2rem;
            margin-top: 10rem;
          }

          }

           @media (max-width: 768px) {
            

             .hero-heading {
            font-family: Inter, sans-serif;
            font-weight: 700;
              font-size: 2.2rem;
            text-align: center;
            color: #111;
            line-height: 1.2;
            padding: 0 2rem;
          }


            
           .hero-heading-bottom {
            font-family: Inter, sans-serif;
            font-weight: 700;
            color: #111;
            line-height: 1.2;
            padding: 0 1rem;
            font-size: 26px;
            margin-top: 8rem;
          }

             .hero-subtext-bottom {
            font-family: Inter, sans-serif;
            font-weight: 400;
            color: #555;
            margin: 0.5rem auto 0;
            max-width: 620px;
            line-height: 1.6;
            padding: 0 13px;
            font-size: 16px;
          }

            .hero-subtext {
              font-size: 0.9rem;
            }

            .hero-buttons {
              flex-direction: row;
            }
          }
        `}
      </style>

      <div className="hero-container">
        {/* Top Chip */}
        <div className="hero-chip">
          <span role="img" aria-label="rocket" style={{ fontSize: '12px' }}>
            🚀
          </span>
          Now in Public Beta
        </div>

        {/* Title */}
        <h1 className="hero-heading">
          <span1>LinkedIn</span1> posts sounds like you. Never like<span> AI.</span>
        </h1>

        {/* Subtitle */}
        <p className="hero-subtext">
          Oops! Not another AI tool. PostLn sounds like you, writes like you, and keeps your authenticity intact.
        </p>

        {/* Buttons */}
        <div className="hero-buttons">
          <button className="btn-primary"  onClick={() => {
      window.location.href = '/professional/login';
    }}
  >Try for Free</button>
        </div>

        {/* Footer Points */}
        <div className="hero-footer-points">
          <div className="footer-point">
            <CheckCircleIcon />
            No credit card required
          </div>
          <div className="footer-point">
            <CheckCircleIcon />
            7-day free trial
          </div>
        </div>


        {/* Demo Highlight Title + Subtitle */}
<h2 className="hero-heading-bottom">
  Turn Drafts into LinkedIn Gold — In Your Voice
</h2>
<p className="hero-subtext-bottom" style={{ fontSize: '1.05rem', marginTop: '0.5rem' }}>
  Paste your rough thoughts, watch them rewrite into polished LinkedIn posts — crafted to sound just like you. Smart. Authentic. On-brand.
</p>


      </div>
    </>
  );
}
