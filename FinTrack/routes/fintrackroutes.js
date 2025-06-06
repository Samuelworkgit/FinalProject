const { Transaction } = require('mongodb');
const Transactions = require('../models/transactions');
const User = require('../models/user');
const Budget = require('../models/budget');
const SavingsGoal = require('../models/savingsgoal');
const Report = require('../models/report');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

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
        
        // Get user data including monthly income
        const user = await User.findById(userId);
        
        // Get current month's start and end dates
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        // Use monthly income from settings
        const monthlyIncome = user.monthlyIncome || 0;
        
        // Calculate monthly expenses (keep this as is - calculated from transactions)
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
        
        // Calculate total balance (all time income from transactions minus all expenses)
        const allIncomeTransactions = await Transactions.aggregate([
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
        
        const expenses = monthlyExpenses[0]?.total || 0;
        const savings = monthlyIncome - expenses;
        const totalIncomeTransactions = allIncomeTransactions[0]?.total || 0;
        const totalExpenses = allExpenses[0]?.total || 0;
        
        // Calculate how many months the user has been active
        const userCreatedDate = new Date(user._id.getTimestamp());
        const monthsSinceCreation = Math.max(1, 
            (now.getFullYear() - userCreatedDate.getFullYear()) * 12 + 
            (now.getMonth() - userCreatedDate.getMonth()) + 1
        );
        const totalMonthlyIncome = monthlyIncome * monthsSinceCreation;
        const currentBalance = totalMonthlyIncome + totalIncomeTransactions - totalExpenses;
        
        // Get recent transactions
        const recentTransactions = await Transactions.find({ userId: userId })
            .sort({ transactiondate: -1 })
            .limit(5);
        
        // Get budgets for dashboard display (limit to 4)
        const budgets = await Budget.find({ userId: userId }).limit(4);
        
        const budgetsWithCalculations = budgets.map(budget => ({
            ...budget.toObject(),
            remaining: budget.getRemaining(),
            percentageUsed: budget.getPercentageUsed()
        }));

        const ctx_dashboard = {
            pagetitle: 'FinTrack - Dashboard',
            currentbalance: currentBalance.toFixed(2),
            monthlyincome: monthlyIncome.toFixed(2),
            monthlyexpenses: expenses.toFixed(2),
            monthlysavings: savings.toFixed(2),
            firstname: user.firstname,
            lastname: user.lastname,
            user: user,
            recentTransactions: recentTransactions,
            budgets: budgetsWithCalculations
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

// GET SINGLE TRANSACTION FOR EDITING
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

// ADD TRANSACTION (Single route with budget updates)
router.post('/transactions/AddTransactions', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        const new_transaction = new Transactions({
            userId: userId,
            transactiontitle: req.body.transactiontitle,
            transactionamount: parseFloat(req.body.transactionamount),
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote
        });

        await new_transaction.save();
        
        // Update budget if it's an expense
        if (req.body.transactiontype === '-') {
            await updateBudgetSpending(userId, req.body.transactioncategory);
        }
        
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
        
        // Get transaction details before deleting
        const transaction = await Transactions.findOne({ _id: id, userId: userId });
        
        if (transaction) {
            const category = transaction.transactioncategory;
            const wasExpense = transaction.transactiontype === '-';
            
            // Delete the transaction
            await Transactions.findOneAndDelete({ _id: id, userId: userId });
            
            // Update budget if it was an expense
            if (wasExpense) {
                await updateBudgetSpending(userId, category);
            }
        }
        
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
        
        // Get the old transaction to check if category or type changed
        const oldTransaction = await Transactions.findOne({ _id: id, userId: userId });
        
        const data = {
            transactiontitle: req.body.transactiontitle,
            transactionamount: parseFloat(req.body.transactionamount),
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote,
        };
        
        await Transactions.findOneAndUpdate(
            { _id: id, userId: userId }, 
            data
        );
        
        // Update budgets for affected categories
        if (oldTransaction) {
            // Update old category if it was an expense
            if (oldTransaction.transactiontype === '-') {
                await updateBudgetSpending(userId, oldTransaction.transactioncategory);
            }
            
            // Update new category if it's an expense
            if (data.transactiontype === '-') {
                await updateBudgetSpending(userId, data.transactioncategory);
            }
            
            // If it changed from income to expense or vice versa, update both categories
            if (oldTransaction.transactiontype !== data.transactiontype) {
                if (oldTransaction.transactiontype === '+' && data.transactiontype === '-') {
                    // Changed from income to expense
                    await updateBudgetSpending(userId, data.transactioncategory);
                }
            }
        }
        
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).send('Error updating transaction');
    }
});

// UPDATE TRANSACTION (Legacy route with ID in URL)
router.post('/transactions/update-transactions/:id', requireAuth, async function(req, res) {
    try {
        const id = req.params.id;
        const userId = req.session.user._id;
        
        // Get the old transaction to check if category or type changed
        const oldTransaction = await Transactions.findOne({ _id: id, userId: userId });
        
        const data = {
            transactiontitle: req.body.transactiontitle,
            transactionamount: parseFloat(req.body.transactionamount),
            transactiontype: req.body.transactiontype,
            transactioncategory: req.body.transactioncategory,
            transactiondate: req.body.transactiondate,
            transactionnote: req.body.transactionnote,
        };
        
        await Transactions.findOneAndUpdate(
            { _id: id, userId: userId }, 
            data
        );
        
        // Update budgets for affected categories
        if (oldTransaction) {
            // Update old category if it was an expense
            if (oldTransaction.transactiontype === '-') {
                await updateBudgetSpending(userId, oldTransaction.transactioncategory);
            }
            
            // Update new category if it's an expense
            if (data.transactiontype === '-') {
                await updateBudgetSpending(userId, data.transactioncategory);
            }
        }
        
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

// REGISTER GET
router.get('/registration', async function(req, res) {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('registration');
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

// BUDGET GET
router.get('/budget', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        // Get all budgets for the user
        const budgets = await Budget.find({ userId: userId });
        
        // Calculate totals
        let totalBudgetAmount = 0;
        let totalSpent = 0;
        
        // Add calculated properties to each budget
        const budgetsWithCalculations = budgets.map(budget => {
            totalBudgetAmount += budget.amount;
            totalSpent += budget.spent;
            
            return {
                ...budget.toObject(),
                remaining: budget.getRemaining(),
                percentageUsed: budget.getPercentageUsed()
            };
        });
        
        const totalRemaining = totalBudgetAmount - totalSpent;
        
        const ctx_budget = {
            pagetitle: 'FinTrack - Budget',
            budgets: budgetsWithCalculations,
            totalbudgetamount: totalBudgetAmount.toFixed(2),
            spentsofar: totalSpent.toFixed(2),
            remaining: totalRemaining.toFixed(2),
            successMessage: req.query.success || null,
            errorMessage: req.query.error || null
        };
        
        res.render('budget', ctx_budget);
    } catch (error) {
        console.error('Budget error:', error);
        res.status(500).send('Error loading budget');
    }
});

// CREATE BUDGET POST
router.post('/budget/create', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const { category, amount, description } = req.body;
        
        // Check if budget already exists for this category
        const existingBudget = await Budget.findOne({ 
            userId: userId, 
            category: category 
        });
        
        if (existingBudget) {
            return res.redirect('/budget?error=Budget already exists for this category');
        }
        
        // Create new budget
        const newBudget = new Budget({
            userId: userId,
            category: category,
            amount: parseFloat(amount),
            description: description || '',
            startDate: new Date()
        });
        
        await newBudget.save();
        
        // Update spending based on existing transactions
        await updateBudgetSpending(userId, category);
        
        res.redirect('/budget?success=Budget created successfully');
    } catch (error) {
        console.error('Create budget error:', error);
        res.redirect('/budget?error=Failed to create budget');
    }
});

// EDIT BUDGET POST
router.post('/budget/edit/:id', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const budgetId = req.params.id;
        const { amount, description } = req.body;
        
        const budget = await Budget.findOneAndUpdate(
            { _id: budgetId, userId: userId },
            { 
                amount: parseFloat(amount),
                description: description || ''
            },
            { new: true }
        );
        
        if (!budget) {
            return res.redirect('/budget?error=Budget not found');
        }
        
        res.redirect('/budget?success=Budget updated successfully');
    } catch (error) {
        console.error('Edit budget error:', error);
        res.redirect('/budget?error=Failed to update budget');
    }
});

// DELETE BUDGET GET
router.get('/budget/delete/:id', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const budgetId = req.params.id;
        
        await Budget.findOneAndDelete({ _id: budgetId, userId: userId });
        
        res.redirect('/budget?success=Budget deleted successfully');
    } catch (error) {
        console.error('Delete budget error:', error);
        res.redirect('/budget?error=Failed to delete budget');
    }
});

// Function to update budget spending based on transactions
async function updateBudgetSpending(userId, category) {
    try {
        // Get current month's start and end dates
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        // Calculate total spending for this category
        const spending = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '-', // Only expenses
                    transactioncategory: category,
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
        
        const totalSpent = spending[0]?.total || 0;
        
        // Update the budget
        await Budget.findOneAndUpdate(
            { userId: userId, category: category },
            { spent: totalSpent }
        );
    } catch (error) {
        console.error('Error updating budget spending:', error);
    }
}

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
        
        // Get expense breakdown by category
        const expenseBreakdown = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiontype: '-',
                    transactiondate: { $gte: threeMonthsAgo }
                }
            },
            {
                $group: {
                    _id: '$transactioncategory',
                    total: { $sum: '$transactionamount' }
                }
            },
            {
                $sort: { total: -1 }
            }
        ]);
        
        // Get monthly trends
        const monthlyTrends = await Transactions.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    transactiondate: { $gte: threeMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$transactiondate' },
                        year: { $year: '$transactiondate' },
                        type: '$transactiontype'
                    },
                    total: { $sum: '$transactionamount' }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);
        
        const totalIncome = incomeData[0]?.total || 0;
        const totalExpenses = expenseData[0]?.total || 0;
        const netSavings = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) + '%' : '0%';
        
        // Format monthly trends data
        const formattedTrends = monthlyTrends.reduce((acc, curr) => {
            const monthYear = `${curr._id.year}-${curr._id.month}`;
            if (!acc[monthYear]) {
                acc[monthYear] = { income: 0, expenses: 0 };
            }
            if (curr._id.type === '+') {
                acc[monthYear].income = curr.total;
            } else {
                acc[monthYear].expenses = curr.total;
            }
            return acc;
        }, {});
        
        const ctx_reports = {
            pagetitle: 'FinTrack - Reports',
            totalincome: totalIncome.toFixed(2),
            totalexpenses: totalExpenses.toFixed(2),
            netsavings: netSavings.toFixed(2),
            savingsrate: savingsRate,
            expenseBreakdown: expenseBreakdown,
            monthlyTrends: formattedTrends,
            successMessage: req.query.success || '',
            errorMessage: req.query.error || ''
        };
        
        res.render('reports', ctx_reports);
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).send('Error loading reports');
    }
});

// GENERATE REPORT
router.post('/reports/generate', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const { reportType, startDate, endDate } = req.body;
        
        let reportData = {};
        let reportTitle = '';
        
        // Generate report based on type
        switch(reportType) {
            case 'financial-status':
                reportTitle = 'Financial Status Report';
                // Get income and expenses for the period
                const [incomeData, expenseData] = await Promise.all([
                    Transactions.aggregate([
                        {
                            $match: {
                                userId: new mongoose.Types.ObjectId(userId),
                                transactiontype: '+',
                                transactiondate: { 
                                    $gte: new Date(startDate),
                                    $lte: new Date(endDate)
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$transactionamount' }
                            }
                        }
                    ]),
                    Transactions.aggregate([
                        {
                            $match: {
                                userId: new mongoose.Types.ObjectId(userId),
                                transactiontype: '-',
                                transactiondate: { 
                                    $gte: new Date(startDate),
                                    $lte: new Date(endDate)
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$transactionamount' }
                            }
                        }
                    ])
                ]);
                
                reportData = {
                    totalIncome: incomeData[0]?.total || 0,
                    totalExpenses: expenseData[0]?.total || 0,
                    netSavings: (incomeData[0]?.total || 0) - (expenseData[0]?.total || 0)
                };
                break;
                
            case 'expense-breakdown':
                reportTitle = 'Expense Breakdown Report';
                const breakdown = await Transactions.aggregate([
                    {
                        $match: {
                            userId: new mongoose.Types.ObjectId(userId),
                            transactiontype: '-',
                            transactiondate: { 
                                $gte: new Date(startDate),
                                $lte: new Date(endDate)
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$transactioncategory',
                            total: { $sum: '$transactionamount' }
                        }
                    },
                    {
                        $sort: { total: -1 }
                    }
                ]);
                
                reportData = {
                    categories: breakdown
                };
                break;
        }
        
        // Create PDF
        const doc = new PDFDocument();
        const filename = `${reportType}-${Date.now()}.pdf`;
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add content to PDF
        doc.fontSize(25).text(reportTitle, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12).text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`);
        doc.moveDown();
        
        // Add report data based on type
        switch(reportType) {
            case 'financial-status':
                doc.fontSize(14).text('Financial Summary', { underline: true });
                doc.moveDown();
                doc.fontSize(12)
                    .text(`Total Income: Rs ${reportData.totalIncome.toFixed(2)}`)
                    .text(`Total Expenses: Rs ${reportData.totalExpenses.toFixed(2)}`)
                    .text(`Net Savings: Rs ${reportData.netSavings.toFixed(2)}`);
                
                // Add savings rate
                const savingsRate = reportData.totalIncome > 0 
                    ? ((reportData.netSavings / reportData.totalIncome) * 100).toFixed(1) 
                    : 0;
                doc.text(`Savings Rate: ${savingsRate}%`);
                break;
                
            case 'expense-breakdown':
                doc.fontSize(14).text('Expense Breakdown by Category', { underline: true });
                doc.moveDown();
                
                // Calculate total expenses
                const totalExpenses = reportData.categories.reduce((sum, cat) => sum + cat.total, 0);
                
                // Create table
                let y = doc.y;
                doc.fontSize(12);
                
                // Table headers
                doc.text('Category', 50, y)
                   .text('Amount', 250, y)
                   .text('Percentage', 400, y);
                
                y += 20;
                doc.moveTo(50, y).lineTo(500, y).stroke();
                y += 10;
                
                // Table rows
                reportData.categories.forEach(category => {
                    const percentage = ((category.total / totalExpenses) * 100).toFixed(1);
                    doc.text(category._id, 50, y)
                       .text(`Rs ${category.total.toFixed(2)}`, 250, y)
                       .text(`${percentage}%`, 400, y);
                    y += 20;
                });
                
                // Add total row
                y += 10;
                doc.moveTo(50, y).lineTo(500, y).stroke();
                y += 10;
                doc.font('Helvetica-Bold')
                   .text('Total', 50, y)
                   .text(`Rs ${totalExpenses.toFixed(2)}`, 250, y)
                   .text('100%', 400, y);
                break;
        }
        
        // Add footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(10)
               .text(
                   `Generated on ${new Date().toLocaleDateString()}`,
                   50,
                   doc.page.height - 50,
                   { align: 'center' }
               );
        }
        
        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error('Generate report error:', error);
        res.redirect('/reports?error=Failed to generate report');
    }
});

// EXPORT REPORT TO PDF
router.get('/reports/export/:id', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const reportId = req.params.id;
        
        const report = await Report.findOne({ _id: reportId, userId: userId });
        if (!report) {
            return res.redirect('/reports?error=Report not found');
        }
        
        // Create PDF
        const doc = new PDFDocument();
        const filename = `report-${reportId}.pdf`;
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add content to PDF
        doc.fontSize(25).text('Financial Report', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12).text(`Report Type: ${report.reportType}`);
        doc.text(`Period: ${report.startDate.toLocaleDateString()} to ${report.endDate.toLocaleDateString()}`);
        doc.moveDown();
        
        // Add report data based on type
        switch(report.reportType) {
            case 'financial-status':
                doc.text(`Total Income: Rs ${report.data.totalIncome.toFixed(2)}`);
                doc.text(`Total Expenses: Rs ${report.data.totalExpenses.toFixed(2)}`);
                doc.text(`Net Savings: Rs ${report.data.netSavings.toFixed(2)}`);
                break;
                
            case 'expense-breakdown':
                doc.text('Expense Breakdown by Category:');
                doc.moveDown();
                report.data.categories.forEach(category => {
                    doc.text(`${category._id}: Rs ${category.total.toFixed(2)}`);
                });
                break;
        }
        
        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error('Export report error:', error);
        res.redirect('/reports?error=Failed to export report');
    }
});

// SAVINGS GOALS
router.get('/savingsgoals', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        
        // Get all savings goals for the user
        const savingsGoals = await SavingsGoal.find({ userId: userId });
        
        // Calculate totals
        let totalSavings = 0;
        let totalGoalAmount = 0;
        
        savingsGoals.forEach(goal => {
            totalSavings += goal.currentAmount;
            totalGoalAmount += goal.targetAmount;
        });
        
        const ctx_savingsgoals = {
            pagetitle: 'FinTrack - Savings Goals',
            totalsavings: totalSavings.toFixed(2),
            totalgoalamount: totalGoalAmount.toFixed(2),
            activegoal: savingsGoals.length.toString(),
            savingsGoals: savingsGoals,
            successMessage: req.query.success || '',
            errorMessage: req.query.error || ''
        };
        
        res.render('savingsgoals', ctx_savingsgoals);
    } catch (error) {
        console.error('Savings goals error:', error);
        res.status(500).send('Error loading savings goals');
    }
});

// CREATE SAVINGS GOAL
router.post('/savingsgoals/create', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const { name, targetAmount, targetDate, monthlyContribution, description, initialAmount } = req.body;
        
        const newGoal = new SavingsGoal({
            userId: userId,
            name: name,
            targetAmount: parseFloat(targetAmount),
            currentAmount: parseFloat(initialAmount) || 0,
            targetDate: new Date(targetDate),
            monthlyContribution: parseFloat(monthlyContribution),
            description: description || ''
        });
        
        await newGoal.save();
        
        res.redirect('/savingsgoals?success=Goal created successfully');
    } catch (error) {
        console.error('Create savings goal error:', error);
        res.redirect('/savingsgoals?error=Failed to create goal');
    }
});

// ADD FUNDS TO GOAL
router.post('/savingsgoals/add-funds/:id', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const goalId = req.params.id;
        const { amount } = req.body;
        
        const goal = await SavingsGoal.findOne({ _id: goalId, userId: userId });
        if (!goal) {
            return res.redirect('/savingsgoals?error=Goal not found');
        }
        
        goal.currentAmount += parseFloat(amount);
        await goal.save();
        
        res.redirect('/savingsgoals?success=Funds added successfully');
    } catch (error) {
        console.error('Add funds error:', error);
        res.redirect('/savingsgoals?error=Failed to add funds');
    }
});

// EDIT SAVINGS GOAL
router.post('/savingsgoals/edit/:id', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const goalId = req.params.id;
        const { name, targetAmount, targetDate, monthlyContribution, description } = req.body;
        
        const goal = await SavingsGoal.findOneAndUpdate(
            { _id: goalId, userId: userId },
            {
                name: name,
                targetAmount: parseFloat(targetAmount),
                targetDate: new Date(targetDate),
                monthlyContribution: parseFloat(monthlyContribution),
                description: description || ''
            },
            { new: true }
        );
        
        if (!goal) {
            return res.redirect('/savingsgoals?error=Goal not found');
        }
        
        res.redirect('/savingsgoals?success=Goal updated successfully');
    } catch (error) {
        console.error('Edit savings goal error:', error);
        res.redirect('/savingsgoals?error=Failed to update goal');
    }
});

// DELETE SAVINGS GOAL
router.get('/savingsgoals/delete/:id', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const goalId = req.params.id;
        
        await SavingsGoal.findOneAndDelete({ _id: goalId, userId: userId });
        
        res.redirect('/savingsgoals?success=Goal deleted successfully');
    } catch (error) {
        console.error('Delete savings goal error:', error);
        res.redirect('/savingsgoals?error=Failed to delete goal');
    }
});

// SETTINGS GET
router.get('/settings', requireAuth, async function(req, res) {
    try {
        const user = await User.findById(req.session.user._id);
        
        const ctx_settings = {
            pagetitle: 'FinTrack - Settings',
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
            monthlyIncome: user.monthlyIncome || 0,
            phonenumber: user.phonenumber || '+230 1234 5678',
            successMessage: req.query.success === 'true' ? 'Settings updated successfully!' : null,
            errorMessage: req.query.error || null
        };
        
        res.render('settings', ctx_settings);
    } catch (error) {
        console.error('Settings error:', error);
        res.status(500).send('Error loading settings');
    }
});

// SETTINGS UPDATE POST
router.post('/settings/update', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const { firstname, lastname, email, monthlyIncome } = req.body;
        
        // Check if email is being changed and if it's already taken
        if (email !== req.session.user.email) {
            const existingUser = await User.findOne({ email: email, _id: { $ne: userId } });
            if (existingUser) {
                return res.redirect('/settings?error=Email already in use');
            }
        }
        
        // Update user data
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                firstname: firstname,
                lastname: lastname,
                email: email,
                monthlyIncome: parseFloat(monthlyIncome) || 0
            },
            { new: true, runValidators: true }
        );
        
        // Update session data
        req.session.user = {
            _id: updatedUser._id,
            firstname: updatedUser.firstname,
            lastname: updatedUser.lastname,
            email: updatedUser.email
        };
        
        res.redirect('/settings?success=true');
    } catch (error) {
        console.error('Settings update error:', error);
        res.redirect('/settings?error=Failed to update settings');
    }
});

// CHANGE PASSWORD POST
router.post('/settings/change-password', requireAuth, async function(req, res) {
    try {
        const userId = req.session.user._id;
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        // Validate passwords match
        if (newPassword !== confirmPassword) {
            return res.redirect('/settings?error=New passwords do not match');
        }
        
        // Get user and verify current password
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect('/settings?error=User not found');
        }
        
        const isValidPassword = bcrypt.compareSync(currentPassword, user.password);
        if (!isValidPassword) {
            return res.redirect('/settings?error=Current password is incorrect');
        }
        
        // Hash new password and update
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        user.password = hashedPassword;
        await user.save();
        
        res.redirect('/settings?success=true');
    } catch (error) {
        console.error('Password change error:', error);
        res.redirect('/settings?error=Failed to change password');
    }
});

module.exports = router;