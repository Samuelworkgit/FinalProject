const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email:{
        type: String,
        required: true,
        unique: true
    },
    password:{
        type: String,
        required: true
    },
    firstname: {
        type: String,
        required: true
    },
    lastname: {
        type: String,
        required: true
    },
    monthlyIncome: {
        type: Number,
        default: 0
    },
    token: {
        type: String,
        default: null
    },
})

const User=mongoose.model('User', userSchema);
module.exports = User;