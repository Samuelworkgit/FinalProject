const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    spent: {
        type: Number,
        default: 0,
        min: 0
    },
    period: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Method to calculate remaining budget
budgetSchema.methods.getRemaining = function() {
    return this.amount - this.spent;
};

// Method to calculate percentage used
budgetSchema.methods.getPercentageUsed = function() {
    if (this.amount === 0) return 0;
    return Math.round((this.spent / this.amount) * 100);
};

const Budget = mongoose.model('Budget', budgetSchema);
module.exports = Budget;