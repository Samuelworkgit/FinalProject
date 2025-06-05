const { Transaction } = require('mongodb');
const Transactions = require('../models/transactions');

express = require('express');
router = express.Router();

router.get('/login', async function(req,res){
    res.render('authentication/login')
})

router.get('/registration', async function(req,res){
    res.render('authentication/registration')
})

router.get('/logout', async function(req,res){
    // //clear session
    // req.session.destroy(function(err) {
    //     if (err) {
    //         console.log("Error destroying session: ", err);
    //     }
    //     res.redirect('/auth/login');
    // });
})

router.post('/login', async function(req,res){
    // // get user credentials
    // const username = req.body.username;
    // const password = req.body.password;

    // // check if user exists in db
    // const user = await Transactions.findOne({username: username, password: password});

    // if(user){
    //     // set session
    //     req.session.user = user;
    //     res.redirect('/');
    // }else{
    //     res.render('login', {error: 'Invalid username or password'});
    // }
})

router.post('/register', async function(req,res){
})

module.exports=router;