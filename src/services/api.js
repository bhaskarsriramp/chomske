import axios from 'axios';

const api = axios.create({
  baseURL: '/api/usersOn',
  headers: { 'Content-Type': 'application/json' },
});

export const getSituations = (sessionId) => api.get(`/situations?sessionId=${sessionId}`);
export const getInsights = (sessionId) => api.get(`/insights?sessionId=${sessionId}`);
export const postAsk = (sessionId, question) => api.post('/ask', { sessionId, question });

export default api;
