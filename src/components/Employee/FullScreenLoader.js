import { Backdrop, LinearProgress, Typography } from '@mui/material';

const FullscreenLoader = ({ open, message }) => (
  <Backdrop
    open={open}
    sx={{
      zIndex: (theme) => theme.zIndex.modal + 2,
      backdropFilter: 'blur(3px)',
      backgroundColor: 'rgba(255, 255, 255, 0.85)',
      flexDirection: 'column',
    }}
  >
    <LinearProgress
      sx={{
        width: '60%',
        height: 8,
        borderRadius: 10,
        mb: 2,
        backgroundColor: '#ccc',
        '& .MuiLinearProgress-bar': {
          backgroundColor: '#093FB4',
        },
      }}
    />
    <Typography sx={{ color: '#093FB4', fontWeight: 500 }}>{message}</Typography>
  </Backdrop>
);

export default FullscreenLoader;
