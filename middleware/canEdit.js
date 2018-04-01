function canEdit(req, res, next) {
    if (req.session.canEdit === true) {
        return next()
    } else {
        const err = new Error('You do not have authorization to perform database edits!')
        err.status = 401
        return next(err)
    }
}

module.exports = canEdit