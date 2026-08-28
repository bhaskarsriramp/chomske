import { Box, Button, Typography, useMediaQuery } from '@mui/material';
import { Link } from 'react-router-dom';
import CallMadeOutlinedIcon from '@mui/icons-material/CallMadeOutlined';

const BannerLandpage = () => {
  const isMobile = useMediaQuery('(max-width:600px)');


  return (
    <Box
      sx={{
        background: 'linear-gradient(to right, #000000, #8b5cf6)',
        borderRadius: 4,
        px: isMobile ? 4 : 8,
        py: 10,
        textAlign: 'center',
        color: 'white',
        mx: isMobile ? 2 : 6,
        mt: 8,
        mb: 8,
      }}
    >
      <Typography
        sx={{
          fontFamily : 'Inter',
          fontWeight: 600,
          fontSize: isMobile ? '28px' : '56px',
          mb: 2,
        }}
      >
        Ready to transform your Bio?
      </Typography>

      {/* <Typography
        sx={{
          fontSize: isMobile ? '16px' : '20px',
          mb: 5,
          fontWeight: 400,
          fontFamily: 'Inter'
        }}
      >
        Ready to transform your productivity?
      </Typography> */}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        {/* <Link to="/professional/login" style={{ textDecoration: 'none' }}>
          <Button
            variant="outlined"
            sx={{
              borderRadius: 10,
              px: isMobile ? 2 : 4,
              py: 1.5,
              color: 'white',
              borderColor: 'white',
              fontWeight: 400,
              textTransform: 'none',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.1)',
              },
            }}
          >
            Try for Free
          </Button>
        </Link> */}

        <Link to="/professional/login" style={{ textDecoration: 'none' }}>
          <Button
          endIcon={ <CallMadeOutlinedIcon />}
            variant="contained"
            sx={{
              borderRadius: 10,
              px: isMobile ? 6 : 6,
              py: 1.5,
              mt: 2,
              color: 'white',
              borderColor: 'white',
              fontWeight: 400,
              textTransform: 'none',
           background: "linear-gradient(90deg, #000000 0%, #8b5cf6 70%, rgba(255,255,255,0.9) 100%)",
    color: "white",
    boxShadow: "0 6px 18px rgba(43, 108, 255, 0.18)",
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.1)',
              },
            }}
          >
            Try for Free
          </Button>
        </Link>
      </Box>
    </Box>
  );
};

export default BannerLandpage;
