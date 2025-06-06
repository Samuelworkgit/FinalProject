const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    targetAmount: {
        type: Number,
        required: true
    },
    currentAmount: {
        type: Number,
        default: 0
    },
    targetDate: {
        type: Date,
        required: true
    },
    monthlyContribution: {
        type: Number,
        required: true
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

// Method to get progress percentage
savingsGoalSchema.methods.getProgressPercentage = function() {
    return (this.currentAmount / this.targetAmount) * 100;
};

// Method to get remaining amount
savingsGoalSchema.methods.getRemainingAmount = function() {
    return this.targetAmount - this.currentAmount;
};

// Method to get days remaining
savingsGoalSchema.methods.getDaysRemaining = function() {
    const today = new Date();
    const diffTime = this.targetDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const SavingsGoal = mongoose.model('SavingsGoal', savingsGoalSchema);

module.exports = SavingsGoal; 