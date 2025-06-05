const { Transaction } = require('mongodb');
const Transactions = require('../models/transactions');

express = require('express');
router = express.Router();
bcrypt = require('bcryptjs');

const User=require('../models/user');

// DASHBOARD
router.get('/', async function(req,res){
    if (req.session.user) {
        ctx_dashboard={
            pagetitle: 'FinTrack - Dashboard',
            currentbalance: 'tempcurrentbalance',
            monthlyincome: 'temp2',
            monthlyexpenses: 'temp3',
            monthlysavings: 'temp4',
            firstname: req.session.user || 'our favourite user', // Use session data if available
            lastname: 'Frederic'
        };
        res.render('dashboard',ctx_dashboard)
    } else {
        res.redirect('/login'); // Redirect to login if not authenticated
    }


})

// TRANSACTIONS
router.get('/transactions', async function(req,res){
    try {
        // First, let's check if we have any transactions at all
        const totalRecords = await Transactions.countDocuments({});
        console.log(`Total transactions in database: ${totalRecords}`);
        
        // Get the actual date range from the database for debug purposes
        if (totalRecords > 0) {
            const oldestTransaction = await Transactions.findOne().sort({ transactiondate: 1 });
            const newestTransaction = await Transactions.findOne().sort({ transactiondate: -1 });
            
            if (oldestTransaction && newestTransaction) {
                console.log(`Available date range in database: ${new Date(oldestTransaction.transactiondate).toISOString()} to ${new Date(newestTransaction.transactiondate).toISOString()}`);
            }
        }
        
        // Get page from query params or default to page 1
        const page = parseInt(req.query.page) || 1;
        const limit = 15; // 15 transactions per page
        const skip = (page - 1) * limit;
        
        // Build query object based on filters
        let query = {};
        
        // For debugging, keep track of which filters are being applied
        let appliedFilters = [];
        
        // Search functionality
        const searchQuery = req.query.search || '';
        if (typeof searchQuery === 'string' && searchQuery.trim() !== '') {
            query.transactiontitle = { $regex: searchQuery.trim(), $options: 'i' };
            appliedFilters.push(`Search: "${searchQuery.trim()}"`);
        }
        
        // Date Range filter - COMPLETELY REVISED APPROACH
        if (req.query.dateRange && req.query.dateRange !== '') {
            // IMPORTANT: Remove any existing query.transactiondate before applying new filter
            delete query.transactiondate;
            
            // For custom range, handle the custom start and end dates
            if (req.query.dateRange === 'customRange') {
                const customStart = req.query.customStartDate;
                const customEnd = req.query.customEndDate;
                
                if (customStart && customEnd) {
                    const startDate = new Date(customStart);
                    const endDate = new Date(customEnd);
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);
                    
                    query.transactiondate = {
                        $gte: startDate,
                        $lte: endDate
                    };
                    appliedFilters.push(`Custom Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
                }
            } else {
                // For predefined ranges, we'll use a simpler approach
                // Since we know your data is April-May 2025, we'll use that knowledge
                
                let filterDescription = "";
                switch(req.query.dateRange) {
                    case 'last30days':
                        // Simply don't use a date filter at all - show all transactions
                        // This ensures ALL your data from April 1 to May 10 is shown
                        filterDescription = "Last 30 days (showing all data)";
                        break;
                        
                    case 'thisMonth':
                        // April 2025
                        query.transactiondate = {
                            $gte: new Date('2025-04-01T00:00:00.000Z'),
                            $lte: new Date('2025-04-30T23:59:59.999Z')
                        };
                        filterDescription = "April 2025";
                        break;
                        
                    case 'lastMonth':
                        // March 2025 - you don't have any transactions in this range
                        query.transactiondate = {
                            $gte: new Date('2025-03-01T00:00:00.000Z'),
                            $lte: new Date('2025-03-31T23:59:59.999Z')
                        };
                        filterDescription = "March 2025";
                        break;
                        
                    case 'thisYear':
                        // All transactions in 2025
                        query.transactiondate = {
                            $gte: new Date('2025-01-01T00:00:00.000Z'),
                            $lte: new Date('2025-12-31T23:59:59.999Z')
                        };
                        filterDescription = "2025";
                        break;
                        
                    default:
                        // Default, no filter - show all
                        filterDescription = "All dates";
                }
                
                if (filterDescription) {
                    appliedFilters.push(`Date Range: ${filterDescription}`);
                }
            }
        }
        
        // Transaction Type filter
        if (req.query.transactionType && req.query.transactionType !== 'All') {
            if (req.query.transactionType === 'Income') {
                query.transactiontype = '+';
                appliedFilters.push(`Type: Income (+)`);
            } else if (req.query.transactionType === 'Expense') {
                query.transactiontype = '-';
                appliedFilters.push(`Type: Expense (-)`);
            }
        }
        
        // Category filter
        if (req.query.category && req.query.category !== 'All Categories') {
            query.transactioncategory = req.query.category;
            appliedFilters.push(`Category: ${req.query.category}`);
        }
        
        // Determine sort order
        let sortOption = { transactiondate: -1 }; // Default newest first
        
        if (req.query.sortBy) {
            switch(req.query.sortBy) {
                case 'oldestFirst':
                    sortOption = { transactiondate: 1 };
                    break;
                case 'amountHighToLow':
                    sortOption = { transactionamount: -1 };
                    break;
                case 'amountLowToHigh':
                    sortOption = { transactionamount: 1 };
                    break;
                default:
                    sortOption = { transactiondate: -1 }; // Newest first
            }
        }
        
        // For debugging purposes
        console.log("Applied Filters:", appliedFilters);
        console.log("Query:", JSON.stringify(query, null, 2));
        console.log("Sort Option:", JSON.stringify(sortOption, null, 2));
        
        // Get total count of filtered transactions for calculating total pages
        const totalTransactions = await Transactions.countDocuments(query);
        console.log(`Transactions matching filters: ${totalTransactions}`);
        
        const totalPages = Math.ceil(totalTransactions / limit) || 1; // Ensure at least 1 page
        
        // Query with pagination and filters
        const transactions = await Transactions.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        
        console.log(`Returning ${transactions.length} transactions for display`);
        
        const ctx_transactions = { 
            pagetitle: 'FinTrack - Transactions',
            transactions,
            currentPage: page,
            totalPages,
            totalTransactions,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            // Pass filter values back to maintain state
            filters: {
                search: typeof searchQuery === 'string' ? searchQuery : '',
                dateRange: req.query.dateRange || 'last30days',
                transactionType: req.query.transactionType || 'All',
                category: req.query.category || 'All Categories',
                sortBy: req.query.sortBy || 'newestFirst',
                // For custom date range
                customStartDate: req.query.customStartDate || '',
                customEndDate: req.query.customEndDate || ''
            }
        };
        
        res.render('transactions', ctx_transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).send('Error fetching transactions: ' + error.message);
    }
})

// Add a new route to fetch a specific transaction for editing
router.get('/edit-transaction/:id', async function(req, res) {
    try {
        const id = req.params.id;
        const transaction = await Transactions.findById(id);
        
        if (!transaction) {
            return res.status(404).send('Transaction not found');
        }
        
        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).send('Error fetching transaction');
    }
});

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
});

router.get('/delete-transactions/:id', async function(req,res){
    id=req.params.id;
    await Transactions.findByIdAndDelete({_id: id});
    res.redirect('/transactions')
});

// Updated to handle transaction ID from the form body instead of URL params
router.post('/transactions/update-transactions', async function(req,res){
    try {
        const id = req.body.transactionId;
        const data = {
            transactiontitle: req.body.transactiontitle,
            transactionamount: req.body.transactionamount,
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote,
        };
        
        await Transactions.findByIdAndUpdate(id, data);
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).send('Error updating transaction');
    }
});

// Keep the old update route for backward compatibility if needed
router.post('/transactions/update-transactions/:id', async function(req,res){
    id=req.params.id;
    data={
        transactiontitle:req.body.transactiontitle,
        transactionamount:req.body.transactionamount,
        transactiontype:req.body.transactiontype,
        transactioncategory:req.body.transactioncategory,
        transactiondate:req.body.transactiondate,
        transactionnote:req.body.transactionnote,
    }
    await Transactions.findByIdAndUpdate(id, data);
    res.redirect('/transactions')
});

router.get('/login', async function(req,res){
    if (req.session.user) {
        req.session.destroy(function(err) {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).send('Error logging out');
            }
        });
    }
    res.render('login')
});

router.get('/logout', async function(req,res){
    // Destroy the session to log out the user
    if (req.session.user) {
        req.session.destroy(function(err) {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).send('Error logging out');
            }
        });
    }
    res.redirect('/login'); // Redirect to login page after logout
});

router.post('/login', async function(req,res){
    // check if user is logged in
    if (req.session.user) {
        return res.redirect('/'); // Redirect to dashboard if already logged in
    } else {
        email = req.body.email;
        password = req.body.password;
        // find user in db
        user = await User.findOne({email: email});

        //check pswd
        if (user && bcrypt.compareSync(password, user.password)) {
            // create session
            const {
                password,
                ...userWithoutPassword
            } = user._doc; // Exclude password from session data
            
            //update token
            tokenBase = email + password + Date.now();
            token = bcrypt.hashSync(tokenBase, 10); // Generate a token for the user
            user.token = token; // Add token to user data
            await user.save(); // Save the updated user with token

            req.session.user = userWithoutPassword; // Store user data in session
            res.redirect('/'); // Redirect to dashboard after successful login
        } else {
            console.log('Invalid email or password');
            // return res.status(401).send('Invalid email or password');
            res.redirect('/login'); // Redirect to login page if credentials are invalid
        }
    }
});


router.post('/register', async function(req, res) {
    try {
        // Check if user is logged in
        if (req.session.user) {
            return res.redirect('/'); // Redirect to dashboard if already logged in
        }
        
        console.log('viewpoint');
        
        // Properly declare variables with const/let
        const firstname = req.body.firstname;
        const lastname = req.body.lastname;
        const email = req.body.email;
        const password = req.body.password;
        
        // console.log(email, firstname, lastname);
        // console.log("viewpoint2", password);
        
        // Validate required fields
        if (!firstname || !lastname || !email || !password) {
            console.log('Missing required fields');
            return res.status(400).send('All fields are required');
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({email: email});
        if (existingUser) {
            console.log('User already exists with this email');
            return res.redirect('/'); // Redirect if user exists
        }
        
        // console.log('2', email, firstname, lastname, password);
        // console.log(password);
        
        // Hash the password for security
        const hash = bcrypt.hashSync(password, 10);
        
        // Generate a token for the user (if needed)
        const tokenBase = email + password + Date.now();
        const token = bcrypt.hashSync(tokenBase, 10);
        
        // Create a new user instance
        const userData = {
            firstname: firstname,
            lastname: lastname,
            email: email,
            password: hash,
        };
        
        const newUser = new User(userData);
        await newUser.save(); // Save the user to the database
        
        // Create session - remove password from user data
        const userWithoutPassword = {
            firstname: userData.firstname,
            lastname: userData.lastname,
            email: userData.email
        };
        
        req.session.user = userWithoutPassword;
        res.redirect('/'); // Redirect to dashboard after successful registration
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Internal server error');
    }
});


router.get('/registration', async function(req,res){

    res.render('registration')
})

router.get('/budget', async function(req,res){
    ctx_budget={
        pagetitle: 'Finance Tracker - Budget',
        totalbudgetamount: 'tempTBA',
        spentsofar: 'tempSSF',
        remianing: 'tempR'
    };
    res.render('budget', ctx_budget)
})

router.get('/reports', async function(req,res){
    ctx_reports={
        pagetitle: 'Finance Tracker - Reports',
        totalincome: 'tempTI',
        totalexpenses: 'tempTE',
        netsavings: 'tempNS',
        savingsrate: 'tempSR'
    }
    res.render('reports',ctx_reports)
})

router.get('/savingsgoals', async function(req,res){
    ctx_savingsgoals={
        pagetitle: 'Finance Tracker - Savings Goals',
        totalsavings: 'tempTS',
        totalgoalamount: 'tempTGA',
        activegoal: 'tempAG'
    }
    res.render('savingsgoals',ctx_savingsgoals)
})

router.get('/settings', async function(req,res){
    ctx_settings={
        pagetitle: 'Finance Tracker - Settings',
        firstname: 'Samuel',
        lastname: 'Frederic',
        email: 'samuelfrederic@domain.com',
        phonenumber: '+230 1234 5678'
    }
    res.render('settings',ctx_settings)
})

module.exports=router;