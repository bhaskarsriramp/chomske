import { Link } from 'react-router-dom';
import employerSearch from "../images/employersFind.svg";

function BodyMain() {
  return (
    <>
      {/* Inline critical CSS for LCP */}
      <style>
        {`


          @media (max-width: 768px) {

         

           .hero-gradient-text {
              font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 1.8rem;
                    font-weight: 600;
              color: #261FB3;

                    line-height: clamp(2.2rem, 1.0em + 2vh, 5.2rem);
                    text-align: center;
          
          }

           .hero-txt-2 {
                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 1.6rem;
                    font-weight: 600;
                    color: #09122C;
                    line-height: clamp(2.2rem, 1.0em + 2vh, 5.2rem);
                    text-align: center;
                  }

                   .content-image-container {
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      width: 100%;
                      box-sizing: border-box;
                      overflow-x: hidden;
                      padding-left: 7%;
                      padding-right: 7%;
                    }

          .hero-sub-txt {
                    font-size: 1.2rem;
                    font-weight: 500;
                    margin-bottom: 1.5rem;
                    color: #09122C;
                    line-height: 1.5;
                    text-align: left;
                      width: 100%;
                    overflow-x: hidden;
                  
                  }
            
       
             .hero-txt-4 {
                font-family: Inter, system-ui, sans-serif;
                font-display: swap;
                padding-top: 2rem;
                font-size: 18px;
                font-weight: 400;
                line-height: 1.6;
                text-align: center;
                padding-left: 10%;
                padding-right: 10%;

              }

               .hero-main-hero-cutom-div {

                margin-top: 3rem;
                padding-top: 5rem;
                padding-bottom: 5rem;

              }

               .hero-signup-btn-grad {
   
                justify-content: center;
                align-items: center;
                color: white;
                display: flex;
                width: 100%;
                text-decoration: none;
                height: 50px;
                font-weight: 500;
                background-color: #261FB3;
                padding-left: 2rem;
                padding-right: 2rem;
                margin-top: 3rem;
                      border-width: 0px;
                       /* Rounded only on left side */
                      border-top-left-radius: 26px;
                      border-bottom-left-radius: 26px;

                      /* Remove full border-radius */
                      border-top-right-radius: 0;
                      border-bottom-right-radius: 0;

              
              }

              .hero-signup-btn-grad-second {
                justify-content: center;
                align-items: center;
                color: white;
                display: flex;
                width: 100%;
                text-decoration: none;
                height: 50px;
                font-weight: 500;
                background-color: #261FB3;
                padding-left: 2.75rem;
                padding-right: 2.75rem;
                margin-top: 3rem;
                border-width: 0px;

                /* Rounded only on left side */
                border-top-left-radius: 0;
                border-bottom-left-radius: 0;

                /* Remove full border-radius */
                border-top-right-radius: 26px;
                border-bottom-right-radius: 26px;
              }


                  .sub-content-div-container{

                  display : flex;
                  flex-direction: column;
                  gap: 1rem;
                  padding-top: 1rem;
                  
                  }

                  .sub-content-title{

                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 1rem;
                    font-weight: 500;
                    color: #09122C;
                    border-left: 4px solid blue;


                  }

                    .sub-content-description{

                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 16px;
                    font-weight: 400;
                    color: #09122C;

                  }

                  .responsive-img {
                    max-width: 100%;
                    height: 400px;
                    display: block;
                  }

          }

           @media (min-width: 576px) {

            .responsive-img {
                    max-width: 100%;
                    height: 400px;
                    display: block;
                  }

        

             .hero-gradient-text {
              font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 3.2rem;
                    font-weight: 600;
              color: #261FB3;

                    line-height: clamp(2.2rem, 1.0em + 2vh, 5.2rem);
                    padding-left: clamp(1rem, 5vw, 6rem);
                    padding-right: clamp(1rem, 5vw, 6rem);
                    text-align: center;
          
          }

            .hero-txt-2 {
                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 3rem;
                    font-weight: 600;
                    color: #09122C;
                    line-height: clamp(2.2rem, 1.0em + 2vh, 5.2rem);
                    padding-left: clamp(1rem, 5vw, 6rem);
                    padding-right: clamp(1rem, 5vw, 6rem);
                    text-align: center;
                  }

                  .content-image-container {
                  
                  display: flex;
                  padding-left: 7%;
                  padding-right: 7%;
                  flex-direction: row;
                  align-items: center;
                  padding-top: 1rem;
                  padding-bottom: 1rem;
                  }

                  .sub-content-div-container{

                  display : flex;
                  flex-direction: row;
                  gap: 2rem;
                  padding-top: 1rem;
                  
                  }

                  .sub-content-title{

                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 1rem;
                    font-weight: 500;
                    color: #09122C;
                    border-left: 4px solid blue;


                  }

                    .sub-content-description{

                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    font-size: 16px;
                    font-weight: 400;
                    color: #09122C;

                  }

           .hero-sub-txt {
                    font-size: 2rem;
                    font-weight: 500;
                    margin-bottom: 1.5rem;
                    color: #09122C;
                    line-height: 1.5;
                    text-align: left;
                  
                  }
            
        

            .hero-txt-4 {
                    font-family: Inter, system-ui, sans-serif;
                    font-display: swap;
                    margin-top: 3.5rem;
                    font-size: 1.4rem;
                    font-weight: 400;
                    text-align: center;
                    padding-left: 25%;
                    padding-right: 25%;
                    line-height: 2rem;
                    color: '#777270';


                  }

                   .hero-main-hero-cutom-div {

                      margin-top: 4rem;
                      padding-left: 2rem;
                      padding-right: 2rem; 
                      padding-top: 6rem;
                      padding-bottom: 6rem;
                    }

                   .hero-signup-btn-grad {
                      justify-content: center;
                      align-items: center;
                      color: white;
                      display: flex;
                      width: 100%;
                      text-decoration: none;
                      height: 50px;
                      font-weight: 500;
                      background-color: #261FB3;
                      padding-left: 3rem;
                      padding-right: 3rem;
                      margin-top: 3rem;
                      border-width: 0px;

                      /* Rounded only on left side */
                      border-top-left-radius: 26px;
                      border-bottom-left-radius: 26px;

                      /* Remove full border-radius */
                      border-top-right-radius: 0;
                      border-bottom-right-radius: 0;
                    }

                  .hero-signup-btn-grad-second {
                    justify-content: center;
                    align-items: center;
                    color: white;
                    display: flex;
                    width: 100%;
                    text-decoration: none;
                    height: 50px;
                    font-weight: 500;
                    background-color: #261FB3;
                    padding-left: 4rem;
                    padding-right: 4rem;
                    margin-top: 3rem;
                    border-width: 0px;

                    /* Rounded only on left side */
                    border-top-left-radius: 0;
                    border-bottom-left-radius: 0;

                    /* Remove full border-radius */
                    border-top-right-radius: 26px;
                    border-bottom-right-radius: 26px;
                  }

          }
        `}
      </style>


        <div className="hero-main-hero-cutom-div">

          <h1>
  <div className="hero-gradient-text">Job Switch?</div>
  <div className= "hero-txt-2">Skip the Posts. <br /> Ditch the Resumes.</div>
</h1>


            <h2 className="hero-txt-4">
              Only for working IT professionals —no resumes, no job posts.
            </h2>


         <div style={{ display: 'flex', justifyContent: 'center', gap: '1px' }}>
  <Link to="/professional/login" style={{ textDecoration: 'none' }}>
    <button className="hero-signup-btn-grad">Enrol now</button>
  </Link>

  <Link to="/professional/login" style={{ textDecoration: 'none' }}>
    <button className="hero-signup-btn-grad-second">Login</button>
  </Link>
</div>


        </div>


<div className="content-image-container">

{/* content div  */}
  <div>

          <div className="hero-sub-txt">
            Stop applying for Jobs— <br />
            Let employers find the talent they need.
          </div>


<div className="sub-content-div-container">

          <div>

                    <p className="sub-content-title">Create Account</p>
                    <p className="sub-content-description">
                            Create a{' '}
                            <span
                              style={{
                                fontStyle: 'italic',
                                textDecoration: 'underline',
                                color: '#333446',
                              }}
                            >
                              forever-free
                            </span>{' '}
                            account and join a network of verified professionals.
                          </p>

          </div>

          <div>

              <p className="sub-content-title">Employment Details</p>
                <p className="sub-content-description">
                  Add your  <span
                              style={{
                                fontStyle: 'italic',
                                textDecoration: 'underline',
                                color: '#333446',
                              }}
                            >current</span> and <span
                              style={{
                                fontStyle: 'italic',
                                textDecoration: 'underline',
                                color: '#333446',
                              }}
                            >past</span> roles to help employers understand your experience
                  and expertise.
                </p>
          </div>
  
</div>



  </div>


{/* Image div  */}

  <img
              src={employerSearch}
              alt="employerSearch"
              className="responsive-img"
            />



</div>



    </>
  );
}

export default BodyMain;
