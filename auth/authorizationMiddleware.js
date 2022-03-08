const gwUtil = require("../util/gwUtil");
var authorizationModules = require("./modules/index");

let logger = global.logger;

module.exports = (req, res, next) => {
	let txnId = req.headers.TxnId

	if (gwUtil.isPermittedAuthZUrl(req)) return next()
	logger.debug(`[${txnId}] Authorization check : Started!`)

	if (req.path.startsWith("/api/a/rbac")) {
		return authorizationModules.userAuthorizationMw(req, res, next);
	} else if (req.path.startsWith("/api/a/sm")) {
		return authorizationModules.smAuthorizationMw(req, res, next);
	} else if ((req.path.startsWith("/api/a/mon"))) {
		return authorizationModules.monAuthorizationMw(req, res, next);
	} else if ((req.path.startsWith("/api/a/workflow"))) {
		return authorizationModules.wfAuthorizationMw(req, res, next);
	} else if ((req.path.startsWith("/api/a/sec"))) {
		return authorizationModules.secAuthorizationMw(req, res, next);
	} else if ((req.path.startsWith("/api/a/pm"))) {
		return authorizationModules.pmAuthorizationMw(req, res, next);
	} else if (req.path.startsWith("/api/c/")) {
		// return authorizationModules.dsAuthorizationMw(req, res, next);
		next(); // The Authorization code is moved to Data Service Itself.
	} else if (req.path.startsWith("/api/a/faas")) {
		return next();
	} else if (req.path.startsWith("/api/common")) {
		return next();
	} else {
		logger.error(`[${txnId}] Url not registered.`);
		res.status(404).json({ message: "Url not registered." });
		return next(new Error("Url not registered."))
	}
}