const urlConfig = require("../config/urlConfig");
const gwUtil = require("./gwUtil");

let logger = global.logger;

let e = {};

e.notPermittedUrlCheck = (_req, _res, _next) => {
	if (!_req.path.startsWith("/gw/health")) logger.info(_req.method, _req.hostname, _req.path);
	let isNotPermitted = urlConfig.urlNotPermitted.some(_p => gwUtil.compareUrl(_p, _req.path), true);

	if (isNotPermitted) return _res.status(404).send();

	logger.trace(`Permitted URL :: ${_req.path}`);
	_req.headers.TxnId = _req.get("txnId") ? _req.get("txnId") : gwUtil.getTxnId(_req);
	_next();
};

e.checkTokenMiddleware = (_req, _res, _next) => {
	if (gwUtil.isPermittedURL(_req)) return _next();

	logger.debug("Validating token format");
	let token = _req.get("authorization"); 
	
	// WTF?
	if (gwUtil.compareUrl("/api/a/rbac/logout", _req.path) && !token) return _res.status(200).json({ message: "Logged out successfully" });

	if (!token) {
		logger.debug("No token found in 'authorization' header");
		logger.debug("Checking for 'authorization' token in cookie");
		token = _req.cookies.Authorization;
	}

	if (!token) return _res.status(401).json({ message: "Unauthorized" });

	token = token.split("JWT ")[1];
	if (!token) {
		logger.error("Invalid JWT format");
		return _res.status(401).json({ "message": "Unauthorized" });
	}

	let tokenHash = gwUtil.md5(token);
	logger.debug(`Token hash :: ${tokenHash}`);
	_req.tokenHash = tokenHash;

	let tokenData = token.split(".")[1];
	_req.user = JSON.parse(Buffer.from(tokenData, "base64").toString());
	logger.trace(`Token Data : ${JSON.stringify(_req.user)}`);
	_next();
};

e.corsMiddleware = (_req, _res, _next) => {

	if (_req.headers["X-Forwarded-For"]) logger.info(`X-Forwarded-For :: ${_req.headers["X-Forwarded-For"]}`);

	if (process.env.MODE.toLowerCase() == "dev") _res.setHeader("Access-Control-Allow-Origin", "*");
	_res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,access-control-allow-methods,access-control-allow-origin,*");
	_res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");

	if (_req.method == "OPTIONS") return _res.end();

	_next();
};

module.exports = e;
