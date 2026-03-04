import { useState } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import { useNavigate } from "react-router-dom";

function Pricing() {
  const [isMonthly, setIsMonthly] = useState(true);
  const navigate = useNavigate();

  const togglePricing = () => setIsMonthly(!isMonthly);
  const redirectToSignup = () => navigate(`/employer/login`);

  return (
    <>
      <header>
        <title>Pricing and Packages | PostLn</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Checkout the prices and rates for Employers." />
      </header>

      {/* Local styles for price formatting */}
      <style>{`
        .price {
          display: inline-flex;
          align-items: flex-start;
          line-height: 1;
        }
        .price-dollar {
          font-size: 1.1rem;
          margin-right: 2px;
          line-height: 1;
        }
        .price-main {
          font-size: 2.6rem;
          font-weight: 800;
          position: relative;
          line-height: 1;
        }
        .price-cents {
          font-size: 0.9rem;
          position: relative;
          top: -0.55rem; /* raises .99 to the top-right */
          margin-left: 2px;
          line-height: 1;
        }
      `}</style>

      <Navbar />

      <div className="container mb-5 plansHeaderMargin">
        <div className="text-center">
          <div className={`btn-group custom-btn-group ${isMonthly ? 'monthly' : 'yearly'}`} role="group">
            <button
              type="button"
              className={`btn ${isMonthly ? 'price-btn-color-1' : 'price-btn-color-2'} ${isMonthly ? 'active' : ''}`}
              onClick={togglePricing}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`btn ${isMonthly ? 'price-btn-color-1' : 'price-btn-color-2'} ${isMonthly ? '' : 'active'}`}
              onClick={togglePricing}
            >
              Annually
            </button>
          </div>
        </div>
      </div>

      <div className="container row mx-auto justify-content-center mb-5">

        {/* Starter */}
        <div className="col-12 col-md-4 col-lg-4 py-3">
          <div className="border border-primary rounded p-3">
            <div className="row text-center">
              <p><span className="pricing-txt">Starter</span></p>
              <p><span className="pricing-txt-description">To try out our platform and see if it fits your needs.</span></p>
              <p className="pricing-txt-price">
                <span className="price">
                  <span className="price-dollar">$</span>
                  <span className="price-main">9</span>
                  <span className="price-cents">.99</span>
                </span>
              </p>
              <p className="pricing-txt-caption">
                {isMonthly ? 'USD • Per month • Billed monthly' : 'USD • Per month • Billed annually'}
              </p>
            </div>

            <div className="features-details">
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">account_box</span>
                <p>Unlimited profiles</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">list_alt</span>
                <p>Unlimited shortlists</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">mark_email_read</span>
                <p>5 Shortlists per month</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">chat_bubble</span>
                <p>2-way chat Messaging</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">filter_list</span>
                <p>Advanced filters & search</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">support_agent</span>
                <p>Email Support</p>
              </div>
            </div>

            <div className="container my-4 mx-auto d-flex justify-content-center">
              <button className="btn login-btn-grad btn-g-fonts text-white" onClick={redirectToSignup}>Get Started</button>
            </div>
          </div>
        </div>

        {/* Growth */}
        <div className="col-12 col-md-4 col-lg-4 py-3">
          <div className="border border-primary rounded p-3">
            <div className="row text-center">
              <p><span className="pricing-txt">Growth</span></p>
              <p><span className="pricing-txt-description">Ideal for solo recruiters or small agencies exploring quality talent.</span></p>
              <p className="pricing-txt-price">
                <span className="price">
                  <span className="price-dollar">$</span>
                  <span className="price-main">19</span>
                  <span className="price-cents">.99</span>
                </span>
              </p>
              <p className="pricing-txt-caption">
                {isMonthly ? 'USD • Per month • Billed monthly' : 'USD • Per month • Billed annually'}
              </p>
            </div>

            <div className="features-details">
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">account_box</span>
                <p>Unlimited profiles</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">list_alt</span>
                <p>Unlimited shortlists</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">mark_email_read</span>
                <p>50 Shortlists per month</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">chat_bubble</span>
                <p>2-way chat Messaging</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">filter_list</span>
                <p>Advanced filters & search</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">support_agent</span>
                <p>Priority Email Support</p>
              </div>
            </div>

            <div className="container my-4 mx-auto d-flex justify-content-center">
              <button className="btn signup-btn-grad btn-g-fonts text-white" onClick={redirectToSignup}>Get Started</button>
            </div>
          </div>
        </div>

        {/* Pro Agency */}
        <div className="col-12 col-md-4 col-lg-4 py-3">
          <div className="border border-primary rounded p-3">
            <div className="row text-center">
              <p><span className="pricing-txt">Pro Agency</span></p>
              <p><span className="pricing-txt-description">For recruitment teams or agencies with high-volume hiring needs.</span></p>
              <p className="pricing-txt-price">
                <span className="price">
                  <span className="price-dollar">$</span>
                  <span className="price-main">39</span>
                  <span className="price-cents">.99</span>
                </span>
              </p>
              <p className="pricing-txt-caption">
                {isMonthly ? 'USD • Per month • Billed monthly' : 'USD • Per month • Billed annually'}
              </p>
            </div>

            <div className="features-details">
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">account_box</span>
                <p>Unlimited profiles</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">list_alt</span>
                <p>Unlimited shortlists</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">mark_email_read</span>
                <p>200 Shortlists per month</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">chat_bubble</span>
                <p>Advanced chat messaging</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">filter_list</span>
                <p>Advanced filters & search</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">support_agent</span>
                <p>Dedicated account manager</p>
              </div>
              <div className="bb-txt-3 cussLine">
                <span className="material-icons me-3">batch_prediction</span>
                <p>Access to early beta features (e.g., AI match scoring)</p>
              </div>
            </div>

            <div className="container my-4 mx-auto d-flex justify-content-center">
              <button className="btn signup-btn-grad btn-g-fonts text-white" onClick={redirectToSignup}>Get Started</button>
            </div>
          </div>
        </div>

      </div>

      <Footer />
    </>
  );
}

export default Pricing;
