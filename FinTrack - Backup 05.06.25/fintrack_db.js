const mongoose = require('mongoose');

// create the connection string
const connectionString = "mongodb+srv://samuel:80fPG8GB1DrILxDd@fintrack.egf3jhb.mongodb.net/fintrack?retryWrites=true&w=majority&appName=fintrack";

// connect to db
mongoose.connect(connectionString,{
    useNewUrlParser:true,
    useUnifiedTopology:true
})
    .then(()=> {
        console.log("DB connected")
    })
    .catch((err)=>{
        console.log("Error, not connected to DB",err)
    })

// export
module.exports=mongoose;