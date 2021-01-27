const urlConfig = require("../config/urlConfig");
const gwUtil = require("./gwUtil");

let logger = global.logger;

let e = {};

e.requestLogger = (_req, _res, _next) => {
	gwUtil.getTxnId(_req);
	if (!_req.path.startsWith("/gw/health")) logger.info(`[${_req.headers.TxnId}] [${_req.hostname}] ${_req.method} ${_req.path}`);
	_res.set("TxnId", _req.headers.TxnId);
	_next();
};

e.notPermittedUrlCheck = (_req, _res, _next) => {	
	let isNotPermitted = urlConfig.urlNotPermitted.some(_p => gwUtil.compareUrl(_p, _req.path), true);

	if (isNotPermitted) return _res.status(404).send();

	logger.trace(`[${_req.headers.TxnId}] Permitted URL :: ${_req.path}`);
	_next();
};

e.checkTokenMiddleware = (_req, _res, _next) => {
	if (gwUtil.isPermittedURL(_req)) return _next();

	logger.debug(`[${_req.headers.TxnId}] Validating token format`);
	let token = _req.get("authorization"); 
	
	// WTF?
	if (gwUtil.compareUrl("/api/a/rbac/logout", _req.path) && !token) return _res.status(200).json({ message: "Logged out successfully" });

	if (!token) {
		logger.debug(`[${_req.headers.TxnId}] No token found in 'authorization' header`);
		logger.debug(`[${_req.headers.TxnId}] Checking for 'authorization' token in cookie`);
		token = _req.cookies.Authorization;
	}

	if (!token) return _res.status(401).json({ message: "Unauthorized" });

	token = token.split("JWT ")[1];
	if (!token) {
		logger.error(`[${_req.headers.TxnId}] Invalid JWT format`);
		return _res.status(401).json({ "message": "Unauthorized" });
	}

	let tokenHash = gwUtil.md5(token);
	logger.debug(`[${_req.headers.TxnId}] Token hash :: ${tokenHash}`);
	_req.tokenHash = tokenHash;

	let tokenData = token.split(".")[1];
	_req.user = JSON.parse(Buffer.from(tokenData, "base64").toString());
	logger.trace(`[${_req.headers.TxnId}] Token Data : ${JSON.stringify(_req.user)}`);
	_next();
};

e.corsMiddleware = (_req, _res, _next) => {

	if (_req.headers["X-Forwarded-For"]) logger.info(`[${_req.headers.TxnId}] X-Forwarded-For :: ${_req.headers["X-Forwarded-For"]}`);

	if (process.env.MODE.toLowerCase() == "dev") _res.setHeader("Access-Control-Allow-Origin", "*");
	_res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,access-control-allow-methods,access-control-allow-origin,*");
	_res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");

	if (_req.method == "OPTIONS") return _res.end();

	_next();
};

module.exports = e;
