const request = require("request");
const authUtil = require("../util/authUtil");
const config = require("../config/config");
const cacheUtil = require("../util/cacheUtil");
const gwUtil = require("../util/gwUtil");

const logger = global.logger;
function isUrlPermitted(permittedUrls, originalUrl) {
	let permitted = false;
	if (!permittedUrls) return false;
	permittedUrls.forEach(url => {
		if (originalUrl.startsWith(url)) {
			permitted = true;
			return;
		}
	});
	return permitted;
}
logger.debug("Debug log active");

function validateJWT(url, req, jwt) {
	let promise = Promise.resolve();
	if (req.path.startsWith("/api/c") && req.method === "GET" && req.get("Cache")) {
		logger.debug("Cache enabled " + req.get("Cache"));
		promise = cacheUtil.getCachedValidateJWT(jwt, req);
	}
	return promise
		.then(_d => {
			if (_d) {
				logger.debug("Validation fetched from cache");
				return _d;
			}
			var options = {
				url: url,
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"TxnId": req.get("txnId") ? req.get("txnId") : gwUtil.getTxnId(req),
					"Authorization": jwt,
					"User": req.user ? req.user._id : null
				},
				json: true
			};
			return new Promise((resolve, reject) => {
				request.get(options, function (err, res, body) {
					if (err) {
						reject(err);
					} else if (!res) {
						reject(new Error("User management service Down"));
					} else {
						if (res.statusCode == 200) {
							let promise = Promise.resolve();
							if (req.method === "GET" && ((authUtil.compareUrl("/api/c/{app}/{api}", req.path) && (req.query.expand || req.get("Cache"))) || authUtil.compareUrl("/api/c/{app}/{api}/export", req.path))) {
								promise = cacheUtil.cacheValidateJWT(jwt, body, req);
							}
							return promise
								.then(() => {
									logger.debug(`Validate body: ${JSON.stringify(body)}`);
									resolve(body);
								});
						}
						else {
							reject(new Error(JSON.stringify(body)));
						}
					}
				});
			});
		});
}

function validateSocketJWT(url, token) {
	var options = {
		url: url,
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			"Authorization": token
		},
		json: true
	};
	return new Promise((resolve, reject) => {
		request.get(options, function (err, res, body) {
			if (err) {
				reject(err);
			} else if (!res) {
				reject(new Error("User management service Down"));
			} else {
				if (res.statusCode == 200) resolve(body);
				else {
					reject(new Error(JSON.stringify(body)));
				}
			}
		});
	});
}

var getMiddleware = (validationAPI, permittedUrls, cookieUrl) => {
	return (_req, _res, next) => {
		_req.txnId = gwUtil.getTxnId(_req);
		if (_req.method == "OPTIONS") next();
		else if (isUrlPermitted(permittedUrls, _req.originalUrl)) next();
		else {
			let token = null;
			let isCookieUrl = cookieUrl.some(_p => _req.path.startsWith(_p));
			if (!isCookieUrl) {
				let urlsplit = _req.originalUrl.split("/");
				let urlArray = ["/api/a/pm/{app}/download/{type}/{id}", "/api/a/rbac/usr/bulkCreate/{id}/download", "/api/a/pm/ieg/download/{type}", "/api/a/pm/{app}/download/appagent/{id}/{type}", "/api/a/pm/{app}/download/partneragent/{id}/{type}", "/api/a/sec/identity/{appName}/fetch/download", "/api/a/sec/identity/{appName}/csr", "/api/a/sec/identity/{appName}/certificate/download", "/api/a/sec/keys/download/IEG", "/api/a/sec/keys/download/CA", "/api/c/{app}/{api}/export/download/{fileId}"];
				if (urlArray.some((url) => authUtil.compareUrl(url, _req.path))) isCookieUrl = true;
				else if ((urlsplit[5] == "export" && urlsplit[6] == "download") || (urlsplit[5] == "file" && urlsplit[6] == "download")) {
					isCookieUrl = true;
				}
			}
			if (!_req.get("authorization") && isCookieUrl) {
				if (_req.cookies) {
					token = _req.cookies.Authorization;
					_req.headers.Authorization = token;
				}
			} else {
				token = _req.get("authorization");
			}
			if (token) {
				validateJWT(validationAPI, _req, token)
					.then(body => {
						_req.user = body;
						if (!_req.user.roles) _req.user.roles = [];
						next();
					})
					.catch((err) => {
						// logger.info({ path: _req.path, token });
						logger.error(err.message);
						if (authUtil.compareUrl("/api/a/rbac/logout", _req.path)) {
							return _res.status(200).json({
								message: "logged out successfully"
							});
						}
						_res.status(401).json({
							message: "Unauthorized"
						});
					});
			} else {
				if (authUtil.compareUrl("/api/a/rbac/logout", _req.path)) {
					return _res.status(200).json({
						message: "logged out successfully"
					});
				}
				_res.status(401).json({
					message: "Unauthorized"
				});
			}
		}
	};
};

var checkDiag = () => {
	return (_req, _res, next) => {
		if (_req.path.startsWith("/api/a/gw/diag")) {
			var options = {
				url: config.get("gw") + "/gw/diag",
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			};

			var promise = new Promise((resolve, reject) => {
				request.get(options, function (err, res) {
					if (err) {
						logger.error(err.message);
						reject(err);
					} else if (!res) {
						logger.error("Gateway DOWN");
						reject(new Error("Gateway DOWN"));
					} else {
						if (res.statusCode >= 200 && res.statusCode < 400)
							return resolve(res.body);
						else {
							return reject(res.body);
						}
					}
				});
			});

			return promise
				.then(body => {
					return _res.status(200).send(body);
				})
				.catch(err => {
					return _res.status(400).send(err);
				});
		}
		else next();
	};
};

module.exports.getMiddleware = getMiddleware;
module.exports.checkDiag = checkDiag;
module.exports.validateSocketJWT = validateSocketJWT;