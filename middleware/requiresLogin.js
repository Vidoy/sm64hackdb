function requiresLogin (req, res, next) {
    if (req.session && req.session.userId) {
        return next()
    } else {
        const err = new Error('You must be logged in to access this route.')
        err.status = 401
        // return next(err)
        return res.redirect('/accounts/auth')
    }
}

module.exports = requiresLogin