const mongoose = require('mongoose');

const transactionsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    transactiontitle: String,
    transactionamount: Number,
    transactiontype: String,
    transactioncategory: String,
    transactiondate: Date,
    transactionnote: String
})

const Transactions = mongoose.model('Transactions', transactionsSchema);
module.exports = Transactions;