const JWT = require("jsonwebtoken");
const envConfig = require("../config/config");
const urlConfig = require("../config/urlConfig");
const gwUtil = require("./gwUtil");
const cacheUtils = require("./cache.utils").cache;
const mongoUtils = require("./mongoUtils");

let logger = global.logger;


// Create a Token for GW to make internal API Calls
const token = JWT.sign({ name: "DS_GATEWAY", _id: "admin", isSuperAdmin: true }, envConfig.RBAC_JWT_KEY);
global.GW_TOKEN = token;

let e = {};

e.requestLogger = (_req, _res, _next) => {
	gwUtil.getTxnId(_req);
	if (!_req.path.startsWith("/gw/internal/health")) logger.info(`[${_req.header("txnId")}] [${_req.hostname}] ${_req.method} ${_req.path}`);
	_res.set("TxnId", _req.header("txnId"));
	_next();
};

e.notPermittedUrlCheck = (_req, _res, _next) => {
	let isNotPermitted = urlConfig.urlNotPermitted.some(_p => gwUtil.compareUrl(_p, _req.path), true);

	if (isNotPermitted) return _res.status(404).send();

	logger.trace(`[${_req.header("txnId")}] Permitted URL :: ${_req.path}`);
	_next();
};

e.checkTokenMiddleware = (_req, _res, _next) => {
	if (gwUtil.isPermittedURL(_req)) return _next();

	logger.debug(`[${_req.header("txnId")}] Validating token format`);
	let token = _req.header("authorization");

	if (!token) {
		logger.debug(`[${_req.header("txnId")}] No token found in 'authorization' header`);
		logger.debug(`[${_req.header("txnId")}] Checking for 'authorization' token in cookie`);
		token = _req.cookies.Authorization;
	}

	// WTF?
	if (gwUtil.compareUrl("/api/a/rbac/auth/logout", _req.path) && !token) return _res.status(200).json({ message: "Logged out successfully" });

	if (!token) {
		logger.debug(`[${_req.header("txnId")}] No token found in cookie or header`);
		return _res.status(401).json({ message: "Unauthorized" });
	}

	token = token.split("JWT ")[1];
	let user;
	try {
		user = JWT.verify(token, envConfig.RBAC_JWT_KEY);
	} catch (err) {
		logger.error(`[${_req.header("txnId")}] Invalid JWT`);
		return _res.status(401).json({ "message": "Unauthorized" });
	}
	if (!user) {
		logger.error(`[${_req.header("txnId")}] Invalid JWT format`);
		return _res.status(401).json({ "message": "Unauthorized" });
	}

	let tokenHash = gwUtil.md5(token);
	logger.debug(`[${_req.header("txnId")}] Token hash :: ${tokenHash}`);
	_req.tokenHash = tokenHash;

	// let tokenData = token.split(".")[1];
	// _req.user = JSON.parse(Buffer.from(tokenData, "base64").toString());
	// logger.trace(`[${_req.header('txnId')}] Token Data : ${JSON.stringify(_req.user)}`);

	_req.user = typeof user === "string" ? JSON.parse(user) : user;
	logger.trace(`[${_req.header("txnId")}] Token Data : ${JSON.stringify(_req.user)}`);
	_next();
};

e.corsMiddleware = (_req, _res, _next) => {

	if (_req.header("X-Forwarded-For")) logger.info(`[${_req.header("txnId")}] X-Forwarded-For :: ${_req.header("X-Forwarded-For")}`);

	if (process.env.MODE.toLowerCase() == "dev") _res.setHeader("Access-Control-Allow-Origin", "*");
	_res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,access-control-allow-methods,access-control-allow-origin,*");
	_res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");

	if (_req.method == "OPTIONS") return _res.end();

	_next();
};

e.storeUserPermissions = async function (req, res, next) {
	try {
		if (gwUtil.isPermittedURL(req)) return next();
		const userId = req.user._id;
		// const keys = await cacheUtils.client.keys(`perm:${userId}_*`) || [];
		// if (!keys || keys.length == 0) {
		// const permissions = await mongoUtils.aggregate(false, "userMgmt.groups", [
		// 	{ $match: { users: userId } },
		// 	{ $unwind: "$roles" },
		// 	// { $match: { 'roles.type': 'appcenter' } },
		// 	{ $group: { _id: "$roles.app", perms: { $addToSet: "$roles.id" } } }
		// ]);
		// if (permissions && permissions.length > 0) {
		// 	let promises = permissions.map(async (element) => {
		// 		return await cacheUtils.setUserPermissions(userId + "_" + element._id, element.perms);
		// 	});
		// 	await Promise.all(promises);
		// }
		// }
		const permissions = await mongoUtils.aggregate(false, "userMgmt.groups", [
			{ $match: { users: userId } },
			{ $unwind: "$roles" },
			{ $group: { _id: "$roles.app", perms: { $addToSet: "$roles.id" } } }
		]);
		if (permissions && permissions.length > 0) {
			let promises = permissions.map(async (element) => {
				return await cacheUtils.setUserPermissions(userId + "_" + element._id, element.perms);
			});
			await Promise.all(promises);
		}
		next();
	} catch (err) {
		logger.error(`[${req.get("TxnId")}] Error while storing permissions`);
		logger.error(err);
		res.status(500).json({ message: err.message });
	}
};

module.exports = e;
