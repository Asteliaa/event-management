const mongoose = require('mongoose');
const toJSON = require('./toJSON');

// Категория (тематика) мероприятия: IT, Бизнес, Образование и т. д.
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    color: { type: String, default: '#6366f1', match: /^#[0-9a-fA-F]{6}$/ },
    description: { type: String, default: '', maxlength: 300 }
}, { timestamps: true, toJSON });

module.exports = mongoose.model('Category', categorySchema);
