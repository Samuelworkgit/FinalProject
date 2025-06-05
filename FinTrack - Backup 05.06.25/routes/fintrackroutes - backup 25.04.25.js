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
    try {
        // Get page from query params or default to page 1
        const page = parseInt(req.query.page) || 1;
        const limit = 15; // 15 transactions per page
        const skip = (page - 1) * limit;
        
        // Get total count of transactions for calculating total pages
        const totalTransactions = await Transactions.countDocuments();
        const totalPages = Math.ceil(totalTransactions / limit);
        
        // Query with pagination
        const transactions = await Transactions.find({})
            .sort({ transactiondate: -1 }) // Sort by date, newest first
            .skip(skip)
            .limit(limit);
        
        const ctx_transactions = { 
            transactions,
            currentPage: page,
            totalPages,
            totalTransactions,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1
        };
        
        res.render('transactions', ctx_transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).send('Error fetching transactions');
    }
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

router.get('/delete-transactions/:id', async function(req,res){
    id=req.params.id;
    await Transactions.findByIdAndDelete({_id: id});
    res.redirect('/transactions')
});

router.post('/transactions/update-transactions/:id', async function(req,res){
    id=req.params.id;
    data={
        id:req.params.id,
        transactiontitle:req.body.transactiontitle,
        transactionamount:req.body.transactionamount,
        transactiontype:req.body.transactiontype,
        transactioncategory:req.body.transactioncategory,
        transactiondate:req.body.transactiondate,
        transactionnote:req.body.transactionnote,
    }
    transactions = await Transactions.findByIdAndUpdate(id,data);
    res.redirect('/transactions')
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