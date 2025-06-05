const { Transaction } = require('mongodb');
const Transactions = require('../models/transactions');
const User = require('../models/user');
const Budget = require('../models/budget');


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
        
        // For current balance, you might want to consider:
        // Option 1: Only transaction-based balance
        // const currentBalance = totalIncomeTransactions - totalExpenses;
        
        // Option 2: Include monthly income history (recommended)
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
            monthlyincome: monthlyIncome.toFixed(2),  // Now using the value from settings
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

// BUDGET - GET (Updated)
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

// CREATE BUDGET - POST
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

// EDIT BUDGET - POST
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

// DELETE BUDGET - GET
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

// Update the ADD TRANSACTION route to update budgets
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

// Update the DELETE TRANSACTION route to update budgets
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

// Update the UPDATE TRANSACTION route to update budgets
router.post('/transactions/update-transactions', requireAuth, async function(req, res) {
    try {
        const id = req.body.transactionId;
        const userId = req.session.user._id;
        
        // Get the old transaction to check if category changed
        const oldTransaction = await Transactions.findOne({ _id: id, userId: userId });
        
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
        
        // Update budgets for both old and new categories if they're expenses
        if (oldTransaction) {
            if (oldTransaction.transactiontype === '-') {
                await updateBudgetSpending(userId, oldTransaction.transactioncategory);
            }
            if (data.transactiontype === '-' && data.transactioncategory !== oldTransaction.transactioncategory) {
                await updateBudgetSpending(userId, data.transactioncategory);
            }
        }
        
        res.redirect('/transactions');
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).send('Error updating transaction');
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

// SETTINGS - GET
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

// SETTINGS UPDATE - POST
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

// CHANGE PASSWORD - POST
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