import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useMediaQuery,
  MobileStepper,
  Stack,
  Rating
} from '@mui/material';
import SwipeableViews from 'react-swipeable-views';
import FormatQuoteOutlinedIcon from '@mui/icons-material/FormatQuoteOutlined';

const reviews = [
  { name: "Sarah L.", review: "I didn't get responses immediately, but once I added clear employment history and skills, companies started showing real interest and hired in under two weeks. Good for serious professionals.", rating: 4.5 },
  { name: "Priya S.", review: "Landed a new job without applying anywhere! The platform completely flipped the job search process. Companies contacted me based on my experience, and I got hired.", rating: 4.0 },
  { name: "Amit R.", review: "Simple, fast, and stress-free process! I updated my profile and got interview calls within days. The best part? I didn't apply to a single company — they came to me.", rating: 4.8},
  { name: "John D.", review: "Switching jobs was never this easy! I created a profile and within a week, three companies reached out. No more endless job applications — just genuine opportunities coming directly to me.", rating: 5.0 },

];

// Pass `isMobile` as a prop to apply different sizes
const ReviewCard = ({ name, review, rating, isMobile }) => (
  <Card
    sx={{
      width: isMobile ? 320 : 330,
      height: isMobile ? 340 : 320,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      py: 2
    }}
  >
    <CardContent sx={{ px: 4}}>
      <Typography fontStyle="italic" sx={{ fontSize : '16px'}}>"{review}"</Typography>
      <Typography variant="subtitle2" mt={2} color="text.secondary">- {name}</Typography>

        <Box display="flex" alignItems="center" gap={1} sx={{mt: 1 }}>
    <Rating name="read-only" value={rating} precision={0.1} readOnly size="small" />
  </Box>

    </CardContent>
  </Card>
);

const ReviewsCarousel = () => {
  const isMobile = useMediaQuery('(max-width:600px)');
  const [activeStep, setActiveStep] = useState(0);
  const maxSteps = reviews.length;

  const handleStepChange = (step) => {
    setActiveStep(step);
  };

  return (
    <Box sx={{  display : isMobile ? '' : 'flex', width: '100%', background: '#DDF6D2', py: 8, justifyContent : isMobile ? '' : 'center' }}>

      

      {isMobile ? (
        <>

          <Stack sx={{  display : 'flex', flexDirection : 'column', gap : 2, px: 2, justifyContent : 'flex-start'}}>
 
 
    <Stack sx={{  display : 'flex', flexDirection : 'row', gap : 2, px: 2 }}>
      <FormatQuoteOutlinedIcon sx={{ fontSize : '28px'}}/>

      <Stack sx={{ display : 'flex', flexDirection : 'column'}}>

      <Typography sx={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 500}}>
        What Professionals are saying...
      </Typography>

        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 4, mt: 2 }}>
    <Rating name="read-only" value={4.4} precision={0.1} readOnly size="small" />
    <Typography variant="body2">(112)</Typography>
  </Box>

      </Stack>


    </Stack>

    


    </Stack>


          <SwipeableViews index={activeStep} onChangeIndex={handleStepChange} enableMouseEvents>
            {reviews.map((review, index) => (
              <Box key={index} px={2} sx={{ display : 'flex', justifyContent : 'center'}}>
                <ReviewCard {...review} isMobile={true} />
              </Box>
            ))}
          </SwipeableViews>

          <MobileStepper
            steps={maxSteps}
            position="static"
            activeStep={activeStep}
            nextButton={null}
            backButton={null}
            sx={{ justifyContent: 'center', backgroundColor: 'transparent', mt: 1 }}
          />
        </>
      ) : (

        <>
           <Stack sx={{  display : 'flex', flexDirection : 'column', gap : 2, px: 2, justifyContent : 'center'}}>
 
 
    <Stack sx={{  display : 'flex', flexDirection : 'row', gap : 2, px: 2 }}>
      <FormatQuoteOutlinedIcon sx={{ fontSize : '28px'}}/>

      <Stack sx={{ display : 'flex', flexDirection : 'column'}}>

      <Typography sx={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 500}}>
        What Professionals are saying...
      </Typography>

        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 4, mt: 2 }}>
    <Rating name="read-only" value={4.4} precision={0.1} readOnly size="small" />
    <Typography variant="body2">(112)</Typography>
  </Box>

      </Stack>


    </Stack>

    


    </Stack>
      
        <Box
          sx={{
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {reviews.map((review, index) => (
            // <Box key={index} sx={{ scrollSnapAlign: 'start' }}>
            //   <ReviewCard {...review} isMobile={false} />
            // </Box>
            <Box
  key={index}
  px={2}
  display="flex"
  justifyContent="center"
>
  <ReviewCard {...review} isMobile={true} />
</Box>

          ))}
        </Box>
          </>
      )}
    </Box>
  );
};

export default ReviewsCarousel;
