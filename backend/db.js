import mongoose from 'mongoose';

const username = 'sreeram_db_user';
const password = process.env.MONGODB_PASSWORD;


var dbUrl = 'mongodb+srv://'+username+':'+password+'@cluster0.ds8pal0.mongodb.net/?appName=Cluster0';

const connectToMongo = ()=>{
    mongoose.connect(dbUrl).then()
    .catch((err) => { console.error(err); });
}

export default connectToMongo;