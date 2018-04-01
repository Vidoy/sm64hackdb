const mongoose = require('mongoose')

const Version = new mongoose.Schema({
    versionString: {type: String, required: true, trim: false},
    ipfsHash: {type: String, required: true, trim: true},
    downloads: {type: Number, required: false, default: 0},
    reports: {type: Number, required: false, default: 0}
})

const Screenshot = new mongoose.Schema({
    bucket: {type: String, required: false},
    key: {type: String, required: false}
})

const HackSchema = new mongoose.Schema({
    meta: {
        title: {type: String, required: true, trim: false},
        author: {type: String, required: true, trim: true},
        description: {type: String, required: true, trim: false},
        youtubeLink: {type: String, required: true, trim: true}
    },
    stars: {
        requiredStars: {type: Number, required: true, default: 0},
        totalStars: {type: Number, required: true, default: 0},
        difficulty: {type: Number, required: true, default: 0}
    },
    versions: [Version],
    screenshots: [Screenshot]
})
HackSchema.index({'meta.title': 'text', 'meta.author': 'text'})

const Hack = mongoose.model('Hack', HackSchema)
module.exports = Hack