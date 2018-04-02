require('dotenv').config()
require('newrelic')

const PORT = process.env.PORT || 5000
const express = require('express')
const app = express()
const path = require('path')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const session = require('express-session')
const MongoStore = require('connect-mongo')(session)
const helmet= require('helmet')
const { check, validationResult } = require('express-validator/check')
const { matchedData, sanitize, sanitizeBody } = require('express-validator/filter')

const User = require('./models/user')
const Hack = require('./models/hack')
const requiresLogin = require('./middleware/requiresLogin')
const canEdit = require('./middleware/canEdit')
const isGuest = require('./middleware/isGuest')

/*
    Establish a database connection
*/
mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection
db.on('error', console.error.bind(console, 'connection error:'))
db.once('open', function () {})

/*
    Setup sessions
*/
app.use(session({
    secret: process.env.secret,
    resave: true,
    saveUninitialized: false,
    store: new MongoStore({
        mongooseConnection: db
    })
}))

/*
    Set security headers
*/
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'maxcdn.bootstrapcdn.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'maxcdn.bootstrapcdn.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
        fontSrc: ["'self'", 'maxcdn.bootstrapcdn.com', 'fonts.googleapis.com', 'fonts.gstatic.com'],
        frameSrc: ['www.youtube.com', 'www.youtube-nocookie.com']
    }
}))
app.use(helmet.referrerPolicy({
    policy: 'same-origin'
}))

/*
    Parse incoming requests
*/
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

/*
    Handle static files
*/
app.use(express.static('public'))

/*
    App Routes
*/

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.get('/', function (req, res) {
    res.render('pages/index', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.get('/about', function (req, res) {
    res.render('pages/about', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.get('/all', function (req, res, next) {
    Hack.find({}, {}, {skip: 0, limit: 0, sort:{meta: 1}}, function (err, hack) {
        if (err) {
            return next(err)
        }
        res.render('pages/all', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, results: hack})
    }).sort('meta.title')
})

app.get('/random', function (req, res) {
    Hack.count().exec(function (err, count) {
        const random = Math.floor(Math.random() * count)
        Hack.findOne().skip(random).exec(function(err, result) {
            res.redirect(`/view/${result._id}`)
        })
    })
})

app.get('/search', function (req, res) {
    res.render('pages/search', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.post('/search', function (req, res) {
    Hack.find({$text: {$search: req.body.query}}).exec(function(err, hack){
        if (err) {
            return callback(err)
        }
        res.render('pages/results', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, results: hack})
    })
})

app.get('/admin', canEdit, function (req, res) {
    res.render('pages/admin', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.get('/add', canEdit, function (req, res) {
    res.render('pages/add', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.post('/add', canEdit, [
    check('title').isLength({min: 1, max: 128}),
    sanitize('author').escape(),
    check('author').isLength({min: 1, max: 128}),
    check('description').isLength({min: 1, max: 10000}),
    sanitize('youtube').escape(),
    check('youtube').isLength({min: 1}),
    sanitize('requiredstars').toInt(),
    check('requiredstars').isLength({min: 1, max: 3}),
    sanitize('totalstars').toInt(),
    check('totalstars').isLength({min: 1, max: 3}),
    sanitize('difficulty').toInt(),
    check('difficulty').isLength({min: 1, max: 1})
], function (req, res, next) {
    if(!validationResult(req).isEmpty()){
        return res.status(422).json({ validationResult: validationResult(req).mapped() })
    }
    if(req.body.difficulty < 0  ||  req.body.difficulty > 5)  {
        return res.status(422).json({error: "Difficulty must be an integer between 0 and 5."})
    }
    const hackData = {
        meta: {
            title: req.body.title,
            author: req.body.author,
            description: req.body.description,
            youtubeLink: req.body.youtube
        },
        stars: {
            requiredStars: req.body.requiredstars,
            totalStars: req.body.totalstars,
            difficulty: req.body.difficulty
        }
    }
    Hack.create(hackData, function (error, hack) {
        if (error) {
            return next(error)
        } else {
            return res.redirect(`/view/${hack._id}`)
        }
    })
})

app.get('/edit/:id', canEdit, function (req, res, next) {
    Hack.findById(req.params.id).exec(function (err, hack) {
        if (err) {
            return next(err)
        } else if (!hack) {
            res.status(404).json({error: "No such hack!"})
        } else {
            res.render('pages/edit', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, id: req.params.id, title: hack.meta.title, author: hack.meta.author, youtube: hack.meta.youtubeLink, description: hack.meta.description, requiredstars: hack.stars.requiredStars, totalstars: hack.stars.totalStars, difficulty: hack.stars.difficulty, versionData: hack.versions})
        }
    })
})

app.post('/edit/:id', canEdit, [
    check('title').isLength({min: 1, max: 128}),
    sanitize('author').escape(),
    check('author').isLength({min: 1, max: 128}),
    check('description').isLength({min: 1, max: 10000}),
    sanitize('youtube').escape(),
    check('youtube').isLength({min: 1}),
    sanitize('requiredstars').toInt(),
    check('requiredstars').isLength({min: 1, max: 3}),
    sanitize('totalstars').toInt(),
    check('totalstars').isLength({min: 1, max: 3}),
    sanitize('difficulty').toInt(),
    check('difficulty').isLength({min: 1, max: 2})
], function (req, res, next) {
    if(!validationResult(req).isEmpty()){
        return res.status(422).json({ validationResult: validationResult(req).mapped() })
    }
    if(req.body.difficulty < -1  ||  req.body.difficulty > 5)  {
        return res.status(422).json({error: "Difficulty must be an integer between 0 and 5. You can enter -1 for \"Unknown\""})
    }
    const hackData = {
        meta: {
            title: req.body.title,
            author: req.body.author,
            description: req.body.description,
            youtubeLink: req.body.youtube
        },
        stars: {
            requiredStars: req.body.requiredstars,
            totalStars: req.body.totalstars,
            difficulty: req.body.difficulty
        }
    }
    Hack.findById(req.params.id, function (err, hack) {
        if (err) { return next(err) }
        hack.set(hackData)
        hack.save(function (err, updatedHack){
            if (err) { return next(err) }
            res.redirect(`/view/${req.params.id}`)
        })
    })
})

app.get('/edit/:id/versions/add', canEdit, function (req, res, next) {
    Hack.findById(req.params.id).exec(function (err, hack) {
        if (err) {
            return next(err)
        } else if (!hack) {
            res.status(404).json({error: "No such hack!"})
        } else {
            res.render('pages/add-version', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, id: req.params.id})
        }
    })
})

app.post('/edit/:id/versions/add', canEdit, [
    sanitize('versionstring').escape(),
    check('versionstring').isLength({min: 1}),
    sanitize('ipfshash').escape(),
    check('ipfshash').isLength({min: 1})
], function (req, res, next) {
    if(!validationResult(req).isEmpty()){
        return res.status(422).json({ validationResult: validationResult(req).mapped() })
    }
    const versionData = {
        versionString: req.body.versionstring,
        ipfsHash: req.body.ipfshash
    }

    Hack.findById(req.params.id, function (err, hack) {
        if (err) { return next(err) }
        hack.versions.push(versionData)
        hack.set({versions: hack.versions})
        hack.save(function (err, updatedHack){
            if (err) { return next(err) }
            res.redirect(`/view/${req.params.id}`)
        })
    })

})

app.get('/edit/:id/links/add', canEdit, function (req, res, next) {
    Hack.findById(req.params.id).exec(function (err, hack) {
        if (err) {
            return next(err)
        } else if (!hack) {
            res.status(404).json({error: "No such hack!"})
        } else {
            res.render('pages/add-link', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, id: req.params.id})
        }
    })
})

app.post('/edit/:id/links/add', canEdit, [
    check('linkname').isLength({min: 1}),
    check('linklocation').isLength({min: 1})
], function (req, res, next) {
    if(!validationResult(req).isEmpty()){
        return res.status(422).json({ validationResult: validationResult(req).mapped() })
    }
    const linkData = {
        name: req.body.linkname,
        location: req.body.linklocation
    }

    Hack.findById(req.params.id, function (err, hack) {
        if (err) { return next(err) }
        hack.links.push(linkData)
        hack.set({links: hack.links})
        hack.save(function (err, updatedHack){
            if (err) { return next(err) }
            res.redirect(`/view/${req.params.id}`)
        })
    })

})

app.get('/delete/:id', canEdit, function (req, res, next) {
    res.render('pages/delete-hack', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, id: req.params.id})
})

app.post('/delete/:id',canEdit, function (req, res, next) {
    Hack.findByIdAndRemove(req.params.id).exec(function (err, hack) {
        if(err) {
            return next(err)
        } else {
            res.redirect('/')
        }
    })
})

app.get('/view/:id', function (req, res, next) {
    Hack.findById(req.params.id).exec(function (err, hack) {
        if (err) {
            return next(err)
        } else if (!hack) {
            res.status(404).json({error: "No such hack!"})
        } else {
            res.render('pages/view', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit, id: req.params.id, title: hack.meta.title, youtube: hack.meta.youtubeLink, description: hack.meta.description, requiredstars: hack.stars.requiredStars, totalstars: hack.stars.totalStars, difficulty: hack.stars.difficulty, versionData: hack.versions, linkData: hack.links, author: hack.meta.author})
        }
    })
})

/*
    Authentication Routes
*/

app.get('/accounts/auth', isGuest, function (req, res) {
    res.render('pages/login', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.get('/accounts/register', isGuest, function (req, res) {
    res.render('pages/register', {isLoggedIn: req.session.userId, canEdit: req.session.canEdit})
})

app.post('/api/auth', [
    check('email').isEmail()
], function (req, res, next) {

    if(!validationResult(req).isEmpty()){
        return res.status(422).json({ validationResult: validationResult(req).mapped() })
    }

    User.authenticate(req.body.email, req.body.password, function (error, user) {
        if (error || !user) {
            const err = new Error('Wrong email or password!')
            err.status = 401
            return next(err)
        } else {
            req.session.userId = user._id
            req.session.canEdit = user.canEdit
            return res.redirect('/')
        }
    })
})

app.post('/api/register', [
    check('email').isEmail(), sanitize('username').trim().escape(),
    check('username').isLength({ min: 1, max: 24}), check('password').isLength({min: 12})
], function (req, res, next) {
    if(!validationResult(req).isEmpty()){
        return res.status(422).json({ validationResult: validationResult(req).mapped() })
    }
    if (req.body.password != req.body.confirmpassword){
        return res.status(422).json({ error: "Password and Confirm Password do not match!"})
    }
    const userData = {
        email: req.body.email,
        username: req.body.username,
        password: req.body.password
    }
    User.create(userData, function (error, user) {
        if (error) {
            return next(error)
        } else {
            req.session.userId = user._id
            return res.redirect('/')
        }
    })
})

app.get('/session/destroy', function(req, res, next) {
    if (req.session) {
        req.session.destroy(function (err) {
            if (err) {
                return next(err)
            } else {
                return res.redirect('/')
            }
        })
    }
})

app.listen(PORT, function () {
    console.log(`App listening on port http://localhost:${PORT}/`)
})