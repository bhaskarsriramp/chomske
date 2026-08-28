import {
  Grid,
  Card,
  CardContent,
  CardActions,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Button,
  Box,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";


export default function Support() {

    const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));


  return (
    <Box sx={{ mt: isMobile ? 3 : 8, px: isMobile ? 1 : 3 }}>
      <Typography  align="center" gutterBottom sx={{ fontWeight: 500, fontSize : isMobile ? '18px' : '34px' }}>
        We're Here to Help
      </Typography>
      <Typography variant="subtitle1" align="center" color="text.secondary" sx={{ mb: isMobile ? 2 : 4 }}>
        Get expert support tailored to your needs.
      </Typography>

      <Grid container justifyContent="center" sx={{ px: isMobile ? 0 : 8}}>
        <Grid size={{ xs: 12, sm: 8, md: 6 }}>
          <Card elevation={isMobile ? 0 : 3} sx={{ borderRadius: 4 }}>
            <CardContent sx={{ px: isMobile ? 1 : 8, py: isMobile ? 2 : 4}}>
              <Typography sx={{fontSize : isMobile ? '18px' : '28px', mb: 2, fontWeight: 500, color: '#2D2A69' }}>
                Priority Email Support
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <List>
                {[
                  "Priority Email Support",
                  "48hr Resolution Window",
                  "Account Setup",
                  "Bugs Resolution"
                ].map((text, index) => (
                  <ListItem key={index} disableGutters sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={text} primaryTypographyProps={{ fontSize: isMobile ? '15px' : '16px' }} />
                  </ListItem>
                ))}
              </List>

              <CardActions sx={{ py: isMobile ? 2 : 4 }}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<MailOutlineIcon />}
                sx={{
                  textTransform: 'none',
                  px: 3,
                  borderRadius: 3,
                  fontWeight: 500,
                  backgroundColor: '#FFFFFF',
                  '&:hover': {
                    backgroundColor: '#2D2A69',
                    color: '#FFFFFF'
                  }
                }}
              >
                support@chomske.com
              </Button>
            </CardActions>
            </CardContent>

         
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
