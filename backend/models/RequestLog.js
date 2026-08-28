import mongoose from 'mongoose';
const { Schema } = mongoose;


const RequestLogSchema  = new Schema({

     service: String,
  timestamp: { type: Date, default: Date.now }

});


const RequestLog_Schema_Model = mongoose.model('request_log', RequestLogSchema);
export default RequestLog_Schema_Model;
