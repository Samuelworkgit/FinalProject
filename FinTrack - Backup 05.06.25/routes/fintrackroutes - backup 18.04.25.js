const { Transaction } = require('mongodb');
const Transactions = require('../models/transactions');

express = require('express')

router = express.Router();

// import models
// Transactions = require('../models/transactions')

router.get('/', async function(req,res){
    ctx_dashboard={
        currentbalance: 'tempcurrentbalance',
        monthlyincome: 'temp2',
        monthlyexpenses: 'temp3',
        monthlysavings: 'temp4',
        firstname: 'Samuel',
        lastname: 'Frederic'
    };
    res.render('dashboard',ctx_dashboard)
})


// TRANSACTIONS
router.get('/transactions', async function(req,res){
    transactions = await Transactions.find({});
    ctx_transactions={
        transactions:transactions,
        // transactiontitle:"transaction 1",
    }
    res.render('transactions',ctx_transactions)
})

router.post('/transactions/AddTransactions', async function(req,res){
    transactiontitle=req.body.transactiontitle;
    transactionamount=req.body.transactionamount;
    transactiontype=req.body.transactiontype;
    transactioncategory=req.body.transactioncategory;
    transactiondate=req.body.transactiondate;
    transactionnote=req.body.transactionnote;

    new_transaction = new Transactions({
        transactiontitle:transactiontitle,
        transactionamount:transactionamount,
        transactiontype:transactiontype,
        transactioncategory:transactioncategory,
        transactiondate:transactiondate,
        transactionnote:transactionnote
    })

    //save the transaction
    await new_transaction.save();
    res.redirect('/transactions')

    // console.log('Transaction Added:', {transactionname}, {transactionamount}, {transactiontype}, {transactioncategory}, {transactiondate}, {transactionnote});
});

router.get('/login', async function(req,res){
    res.render('login')
})

router.get('/registration', async function(req,res){
    res.render('registration')
})

router.get('/budget', async function(req,res){
    ctx_budget={
        totalbudgetamount: 'tempTBA',
        spentsofar: 'tempSSF',
        remianing: 'tempR'
    };
    res.render('budget', ctx_budget)
})

router.get('/reports', async function(req,res){
    ctx_reports={
        totalincome: 'tempTI',
        totalexpenses: 'tempTE',
        netsavings: 'tempNS',
        savingsrate: 'tempSR'
    }
    res.render('reports',ctx_reports)
})

router.get('/savingsgoals', async function(req,res){
    ctx_savingsgoals={
        totalsavings: 'tempTS',
        totalgoalamount: 'tempTGA',
        activegoal: 'tempAG'
    }
    res.render('savingsgoals',ctx_savingsgoals)
})

router.get('/settings', async function(req,res){
    ctx_settings={
        firstname: 'Samuel',
        lastname: 'Frederic',
        email: 'samuelfrederic@domain.com',
        phonenumber: '+230 1234 5678'
    }
    res.render('settings',ctx_settings)
})

module.exports=router;