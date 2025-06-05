const { Transaction } = require('mongodb');
const Transactions = require('../models/transactions');
const User = require('../models/user');

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose'); // Add this import for ObjectId

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// DASHBOARD
router.get('/', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        // Get current month's start and end dates
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        // Calculate monthly income
        const monthlyIncome = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '+',
                    transactiondate: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$transactionamount' }
                }
            }
        ]);
        
        // Calculate monthly expenses
        const monthlyExpenses = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '-',
                    transactiondate: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$transactionamount' }
                }
            }
        ]);
        
        // Calculate total balance (all time)
        const allIncome = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '+'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$transactionamount' }
                }
            }
        ]);
        
        const allExpenses = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '-'
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$transactionamount' }
                }
            }
        ]);
        
        const income = monthlyIncome[0]?.total || 0;
        const expenses = monthlyExpenses[0]?.total || 0;
        const savings = income - expenses;
        const totalIncome = allIncome[0]?.total || 0;
        const totalExpenses = allExpenses[0]?.total || 0;
        const currentBalance = totalIncome - totalExpenses;
        
        // Get recent transactions
        const recentTransactions = await Transactions.find({ userId: userId })
            .sort({ transactiondate: -1 })
            .limit(5);
        
        const ctx_dashboard = {
            pagetitle: 'FinTrack - Dashboard',
            currentbalance: currentBalance.toFixed(2),
            monthlyincome: income.toFixed(2),
            monthlyexpenses: expenses.toFixed(2),
            monthlysavings: savings.toFixed(2),
            firstname: req.session.user.firstname,
            lastname: req.session.user.lastname,
            user: req.session.user,
            recentTransactions: recentTransactions
        };
        
        res.render('dashboard', ctx_dashboard);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// TRANSACTIONS
router.get('/transactions', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        // Get page from query params or default to page 1
        const page = parseInt(req.query.page) || 1;
        const limit = 15; // 15 transactions per page
        const skip = (page - 1) * limit;
        
        // Build query object with userId
        let query = { userId: userId }; // Always filter by user
        
        // Search functionality
        const searchQuery = req.query.search || '';
        if (typeof searchQuery === 'string' && searchQuery.trim() !== '') {
            query.transactiontitle = { $regex: searchQuery.trim(), $options: 'i' };
        }
        
        // Date Range filter
        if (req.query.dateRange && req.query.dateRange !== '') {
            delete query.transactiondate;
            
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
                }
            } else {
                const now = new Date();
                let startDate, endDate;
                
                switch(req.query.dateRange) {
                    case 'last30days':
                        startDate = new Date();
                        startDate.setDate(startDate.getDate() - 30);
                        query.transactiondate = { $gte: startDate };
                        break;
                        
                    case 'thisMonth':
                        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                        query.transactiondate = { $gte: startDate, $lte: endDate };
                        break;
                        
                    case 'lastMonth':
                        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                        query.transactiondate = { $gte: startDate, $lte: endDate };
                        break;
                        
                    case 'thisYear':
                        startDate = new Date(now.getFullYear(), 0, 1);
                        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
                        query.transactiondate = { $gte: startDate, $lte: endDate };
                        break;
                }
            }
        }
        
        // Transaction Type filter
        if (req.query.transactionType && req.query.transactionType !== 'All') {
            if (req.query.transactionType === 'Income') {
                query.transactiontype = '+';
            } else if (req.query.transactionType === 'Expense') {
                query.transactiontype = '-';
            }
        }
        
        // Category filter
        if (req.query.category && req.query.category !== 'All Categories') {
            query.transactioncategory = req.query.category;
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
                    sortOption = { transactiondate: -1 };
            }
        }
        
        // Get total count of filtered transactions for calculating total pages
        const totalTransactions = await Transactions.countDocuments(query);
        const totalPages = Math.ceil(totalTransactions / limit) || 1;
        
        // Query with pagination and filters
        const transactions = await Transactions.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        
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
            filters: {
                search: typeof searchQuery === 'string' ? searchQuery : '',
                dateRange: req.query.dateRange || 'last30days',
                transactionType: req.query.transactionType || 'All',
                category: req.query.category || 'All Categories',
                sortBy: req.query.sortBy || 'newestFirst',
                customStartDate: req.query.customStartDate || '',
                customEndDate: req.query.customEndDate || ''
            }
        };
        
        res.render('transactions', ctx_transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).send('Error fetching transactions: ' + error.message);
    }
});

// Add a new route to fetch a specific transaction for editing
router.get('/edit-transaction/:id', requireAuth, async function(req, res) {
    try {
        const id = req.params.id;
        const userId = req.session.user._id;
        
        // Find transaction that belongs to this user
        const transaction = await Transactions.findOne({ 
            _id: id, 
            userId: userId 
        });
        
        if (!transaction) {
            return res.status(404).send('Transaction not found');
        }
        
        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).send('Error fetching transaction');
    }
});

// ADD TRANSACTION
router.post('/transactions/AddTransactions', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        const new_transaction = new Transactions({
            userId: userId,
            transactiontitle: req.body.transactiontitle,
            transactionamount: req.body.transactionamount,
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote
        });

        await new_transaction.save();
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error adding transaction:', error);
        res.status(500).send('Error adding transaction');
    }
});

// DELETE TRANSACTION
router.get('/delete-transactions/:id', requireAuth, async function(req, res) {
    try {
        const id = req.params.id;
        const userId = req.session.user._id;
        
        // Delete only if transaction belongs to this user
        await Transactions.findOneAndDelete({ 
            _id: id, 
            userId: userId 
        });
        
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).send('Error deleting transaction');
    }
});

// UPDATE TRANSACTION
router.post('/transactions/update-transactions', requireAuth, async function(req, res) {
    try {
        const id = req.body.transactionId;
        const userId = req.session.user._id;
        
        const data = {
            transactiontitle: req.body.transactiontitle,
            transactionamount: req.body.transactionamount,
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote,
        };
        
        // Update only if transaction belongs to this user
        await Transactions.findOneAndUpdate(
            { _id: id, userId: userId }, 
            data
        );
        
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).send('Error updating transaction');
    }
});

// Keep the old update route for backward compatibility
router.post('/transactions/update-transactions/:id', requireAuth, async function(req, res) {
    try {
        const id = req.params.id;
        const userId = req.session.user._id;
        
        const data = {
            transactiontitle: req.body.transactiontitle,
            transactionamount: req.body.transactionamount,
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote,
        };
        
        await Transactions.findOneAndUpdate(
            { _id: id, userId: userId }, 
            data
        );
        
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).send('Error updating transaction');
    }
});

// LOGIN GET
router.get('/login', async function(req, res) {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login');
});

// LOGOUT
router.get('/logout', async function(req, res) {
    req.session.destroy(function(err) {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
    });
});

// LOGIN POST
router.post('/login', async function(req, res) {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        
        const email = req.body.email;
        const password = req.body.password;
        
        // Find user in db
        const user = await User.findOne({ email: email });

        // Check password
        if (user && bcrypt.compareSync(password, user.password)) {
            // Create session
            const {
                password,
                ...userWithoutPassword
            } = user._doc;
            
            // Update token
            const tokenBase = email + password + Date.now();
            const token = bcrypt.hashSync(tokenBase, 10);
            user.token = token;
            await user.save();

            req.session.user = userWithoutPassword;
            res.redirect('/');
        } else {
            console.log('Invalid email or password');
            res.redirect('/login');
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Error during login');
    }
});

// REGISTER POST
router.post('/register', async function(req, res) {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        
        const firstname = req.body.firstname;
        const lastname = req.body.lastname;
        const email = req.body.email;
        const password = req.body.password;
        
        // Validate required fields
        if (!firstname || !lastname || !email || !password) {
            console.log('Missing required fields');
            return res.status(400).send('All fields are required');
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ email: email });
        if (existingUser) {
            console.log('User already exists with this email');
            return res.redirect('/login');
        }
        
        // Hash the password
        const hash = bcrypt.hashSync(password, 10);
        
        // Generate a token
        const tokenBase = email + password + Date.now();
        const token = bcrypt.hashSync(tokenBase, 10);
        
        // Create user
        const userData = {
            firstname: firstname,
            lastname: lastname,
            email: email,
            password: hash,
            token: token
        };
        
        const newUser = new User(userData);
        await newUser.save();
        
        // Create session
        const userWithoutPassword = {
            _id: newUser._id,
            firstname: userData.firstname,
            lastname: userData.lastname,
            email: userData.email
        };
        
        req.session.user = userWithoutPassword;
        res.redirect('/');
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Internal server error');
    }
});

// REGISTRATION GET
router.get('/registration', async function(req, res) {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('registration');
});

// BUDGET
router.get('/budget', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        // TODO: Implement budget calculations based on user data
        // For now, using placeholder data
        const ctx_budget = {
            pagetitle: 'FinTrack - Budget',
            totalbudgetamount: '0',
            spentsofar: '0',
            remianing: '0'
        };
        
        res.render('budget', ctx_budget);
    } catch (error) {
        console.error('Budget error:', error);
        res.status(500).send('Error loading budget');
    }
});

// REPORTS
router.get('/reports', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        // Calculate last 3 months data
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        
        // Get income for last 3 months
        const incomeData = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '+',
                    transactiondate: { $gte: threeMonthsAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$transactionamount' }
                }
            }
        ]);
        
        // Get expenses for last 3 months
        const expenseData = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '-',
                    transactiondate: { $gte: threeMonthsAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$transactionamount' }
                }
            }
        ]);
        
        const totalIncome = incomeData[0]?.total || 0;
        const totalExpenses = expenseData[0]?.total || 0;
        const netSavings = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) + '%' : '0%';
        
        const ctx_reports = {
            pagetitle: 'FinTrack - Reports',
            totalincome: totalIncome.toFixed(2),
            totalexpenses: totalExpenses.toFixed(2),
            netsavings: netSavings.toFixed(2),
            savingsrate: savingsRate
        };
        
        res.render('reports', ctx_reports);
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).send('Error loading reports');
    }
});

// SAVINGS GOALS
router.get('/savingsgoals', requireAuth, async function(req, res) {
    try {
        // TODO: Implement savings goals functionality
        const ctx_savingsgoals = {
            pagetitle: 'FinTrack - Savings Goals',
            totalsavings: '0',
            totalgoalamount: '0',
            activegoal: '0'
        };
        
        res.render('savingsgoals', ctx_savingsgoals);
    } catch (error) {
        console.error('Savings goals error:', error);
        res.status(500).send('Error loading savings goals');
    }
});

// SETTINGS
router.get('/settings', requireAuth, async function(req, res) {
    try {
        const ctx_settings = {
            pagetitle: 'FinTrack - Settings',
            firstname: req.session.user.firstname,
            lastname: req.session.user.lastname,
            email: req.session.user.email,
            phonenumber: req.session.user.phonenumber || '+230 1234 5678'
        };
        
        res.render('settings', ctx_settings);
    } catch (error) {
        console.error('Settings error:', error);
        res.status(500).send('Error loading settings');
    }
});

module.exports = router;