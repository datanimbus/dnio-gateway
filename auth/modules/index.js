module.exports = {
    dsAuthorizationMw: require('./ds.authorizationMiddleware'),
    monAuthorizationMw: require('./mon.authorizationMiddleware'),
    pmAuthorizationMw: require('./bm.authorizationMiddleware'),
    secAuthorizationMw: require('./sec.authorizationMiddleware'),
    smAuthorizationMw: require('./sm.authorizationMiddleware'),
    userAuthorizationMw: require('./user.authorizationMiddleware'),
    wfAuthorizationMw: require('./wf.authorizationMiddleware'),
}