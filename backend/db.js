import mongoose from 'mongoose';

const username = 'jobswitchco';
const password = process.env.MONGODB_PASSWORD;


var dbUrl = 'mongodb+srv://'+username+':'+password+'@clusterjob.5grzhlw.mongodb.net/?retryWrites=true&w=majority&appName=ClusterJob';
const connectToMongo = ()=>{
    mongoose.connect(dbUrl).then()
    .catch((err) => { console.error(err); });
}

export default connectToMongo;