import  { useEffect, useState } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Pagination, CircularProgress, Typography
} from '@mui/material';
import axios from 'axios';

const EmployersTable = () => {
  const [employers, setEmployers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const baseUrl = "http://localhost:8001/adminOn";



  const fetchEmployers = async ( ) => {
    setLoading(true);
    try {
      const response = await axios.get(baseUrl + '/all_employers?page=${currentPage}&limit=10');
      setEmployers(response.data.employers);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      console.error('Error fetching employers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployers(page);
  }, [page]);

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  return (

    <>
   <Typography sx={{
    fontSize : '18px',
    fontWeight : 500,
    pb: 2
   }}>All Employers</Typography>
   
   <Paper sx={{ padding: 2 }}>
      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Company Name</TableCell>
                  <TableCell>Company Type</TableCell>
                  <TableCell>Company Category</TableCell>
                  <TableCell>Contact Name</TableCell>
                  <TableCell>Designation</TableCell>
                  <TableCell>Email Address</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
               {employers.map((employer, index) => (
  <TableRow key={employer._id || index}>
    <TableCell>{(page - 1) * 10 + index + 1}</TableCell>
    <TableCell>{employer.company_name}</TableCell>
    <TableCell>{employer.company_type}</TableCell>
    <TableCell>{employer.company_category}</TableCell>
    <TableCell>{employer.firstName}&nbsp;{employer.lastName}</TableCell>
    <TableCell>{employer.designation}</TableCell>
    <TableCell>{employer.email}</TableCell>
  </TableRow>
))}

              </TableBody>
            </Table>
          </TableContainer>

          <Pagination
            count={totalPages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            sx={{ marginTop: 2, display: 'flex', justifyContent: 'center' }}
          />
        </>
      )}
    </Paper>

    </>

  );
};

export default EmployersTable;
