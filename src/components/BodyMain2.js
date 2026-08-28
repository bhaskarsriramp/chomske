import { useEffect } from 'react';
import {
  Typography,
  Stack,
  Box,
  Grid,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AOS from 'aos'; // Import AOS
import 'aos/dist/aos.css'; // Import AOS CSS
import cred_logo from "../images/cred-logo.png";
import deloitte_logo from "../images/deloitte-seeklogo.png";
import paytm_logo from "../images/paytm-seeklogo.png";
import khoros_logo from "../images/khoros-seeklogo.png";


function BodyMain2() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    AOS.init({
      duration: 600, // Animation duration in ms
      once: true, // Animation will run once
    });
  }, []);

  return (
   <>
   <Grid xs={12} md={12} lg={12} 
   sx={{
    // px : isMobile ? 4 : 10,
    // mb: isMobile ? 10 : 14, 
    mt: isMobile ? 1 : 2,
    mb: isMobile ? 6 : 2
  }}
  >

  <Box sx={{
    display : 'flex',
    flexDirection : 'column',
    background : '#C9E9D2', 
    textAlign : 'center',
    py : isMobile ? 8 : 12,
    px: isMobile ? 4 : 10
  }}>
    <Typography sx={{ fontSize : isMobile ? '20px' : '28px', fontWeight : 400, mb: 2}}>Trusted by 100+ professionals from top companies</Typography>


{isMobile ? (<>

<Stack sx={{ display : 'flex', flexDirection : 'column', alignItems : 'center', py: 2}}>

<Stack sx={{ display : 'flex', flexDirection : 'row', justifyContent : 'space-between', gap: 4}}>
      
        <img  
        className="img-fluid rounded" 
        src={cred_logo} 
        style={{ width: '120px', height : '36px'}}
        alt="cred_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />

           <img  
        className="img-fluid rounded" 
        style={{ width: '120px', height : '24px'}}
        src={deloitte_logo} 
        alt="deloitte_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />
        </Stack>

        <Stack sx={{ display : 'flex', flexDirection : 'row', justifyContent : 'space-between', gap: 4, mt: 4}}>
      
         <img  
        className="img-fluid rounded" 
        style={{ width: '120px', height : '34px'}}
        src={khoros_logo} 
        alt="khoros_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />

        <img  
        className="img-fluid rounded" 
        style={{ width: '120px', height : '24px'}}
        src={paytm_logo} 
        alt="paytm_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />

        
        </Stack>

</Stack>

</>) : (<>
  <Stack sx={{ display : 'flex', flexDirection : 'row', justifyContent : 'space-between', mt: isMobile ? 2 : 6, px: 12}}>
      
         <img  
        className="img-fluid rounded" 
        src={cred_logo} 
        style={{ width: '120px', height : '40px'}}
        alt="cred_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />

           <img  
        className="img-fluid rounded" 
        style={{ width: '120px', height : '30px'}}
        src={deloitte_logo} 
        alt="deloitte_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />

           <img  
        className="img-fluid rounded" 
        style={{ width: '120px', height : '40px'}}
        src={khoros_logo} 
        alt="khoros_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />

        <img  
        className="img-fluid rounded" 
        style={{ width: '120px', height : '30px'}}
        src={paytm_logo} 
        alt="paytm_logo" 
        data-aos="zoom-in" 
        data-aos-delay="400"  />


    </Stack>
</>)}
  

  </Box>

   </Grid>


   
   </>
  );
}

export default BodyMain2;
