//import libraries
var express = require('express');
var ejs = require('ejs')
var bodyparser = require('body-parser')
var session = require('express-session');

// create server
var server = express();
server.use(bodyparser.urlencoded({extended:true}));
server.use(bodyparser.json());

// import routers
FinTrackRouter = require('./routes/fintrackroutes');
autheticationRouter = require('./routes/authenticationroutes');

// connect to db
bb=require('./fintrack_db');


// set view engine
server.set('view engine','ejs')


// bind template directory
server.set('views','./templates');

// set static folder
server.use(express.static('./static'))
server.use('/auth',autheticationRouter) // connect authentication router

// set session
server.use(session({
    secret: 'gerg789ergy23#@RFEw234f',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // true if using https
    maxAge: 1000 * 60 * 60 * 24 // 1 day
}))

// route handling  in fintackroutes.js


// connect routers
server.use('/',FinTrackRouter)

// start server and listen to port
PORT=3000;
server.listen(PORT,function(){
    console.log('Server is running on port ',PORT)
})