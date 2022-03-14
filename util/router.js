let e = {};
let request = require("request");
const _ = require("lodash");
let logger = global.logger;
let authUtil = require("../util/authUtil");
let envConfig = require("../config/config");
let fileValidator = require("@appveen/utils").fileValidator;
const fs = require("fs");

function sendRequest(txnId, config, res) {
	let url = config.host + config.path;
	logger.debug(`[${txnId}] Send request :: URL :: ${url}`);
	let options = {
		url: url,
		method: config.method,
		headers: config.headers,
		qs: config.qs,
		followRedirect: false
	};
	if (config.body && !_.isEmpty(config.body)) {
		options.json = true;
		options.body = config.body;
	}
	let errMessage = "Error connecting to data service";
	return new Promise((resolve, reject) => {
		let newRes = request[config.method.toLowerCase()](options, function (err, resp) {
			if (err) {
				logger.error(`[${txnId}] Send request :: ${err.message}`);
				reject(new Error(errMessage));
			} else if (!resp) {
				logger.error(`[${txnId}] Send request :: ${config.host} DOWN`);
				reject(new Error(errMessage));
			} else resolve(resp);
			if (config.files) {
				Object.keys(config.files).forEach(file => {
					fs.unlinkSync(config.files[file].tempFilePath);
				});
			}
		});

		let pathSplit = config.path.split("/");
		let pathArray = ["/bm/{app}/download/{type}/{id}", "/rbac/{app}/user/utils/bulkCreate/{id}/download", "/bm/ieg/download/{type}", "/bm/{app}/download/appagent/{id}/{type}", "/bm/{app}/download/partneragent/{id}/{type}" ];
		if (pathArray.some((url) => authUtil.compareUrl(url, config.path))) newRes.pipe(res);
		else if ((pathSplit[4] == "file" && pathSplit[5] == "download") || (pathSplit[4] && pathSplit[4].split("?")[0] == "export")) {
			newRes.pipe(res);
		}
		if (config.files) {
			let form = newRes.form();
			Object.keys(config.files).forEach(file => {
				form.append(file, fs.createReadStream(config.files[file].tempFilePath), {
					filename: config.files[file].name,
					contentType: config.files[file].mimetype
				});
			});
		}
	});
}

function getHost(path, router, target) {
	let routes = Object.keys(router);
	let selectedKey = routes.find(key => path.startsWith(key));
	return selectedKey ? router[selectedKey] : target;
}

function getPath(path, pathRewrite) {
	let routes = Object.keys(pathRewrite);
	let selectedKey = routes.find(key => path.startsWith(key));
	return selectedKey ? path.replace(selectedKey, pathRewrite[selectedKey]) : path;
}

e.getRouterMiddleware = (config) => {
	return (req, res, next) => {
		let txnId = req.headers["TxnId"];

		// Nothing to do with OPTIONS
		if (req.method === "OPTIONS") return next();
		
		logger.debug(`[${txnId}] Routing MW :: ${JSON.stringify(config)}`);
		let reqConfig = {};
		let router = config.router;
		let routerPromise = Promise.resolve();
		if (typeof config.router === "function") {
			routerPromise = config.router(req)
				.then(temp => {
					if (temp == "next") {
						// next();
						return "next";
					} else {
						reqConfig.host = temp;
					}
				});
		} else {
			reqConfig.host = router ? getHost(req.path, router, config.target) : config.target;
		}
		let headers = {};
		headers = req.headers;
		delete headers.connection;
		delete headers.host;
		delete headers["content-length"];
		delete headers["accept-encoding"];
		delete headers["if-none-match"];
		headers.user = req.user ? req.user._id : null;
		headers.isSuperAdmin = req.user ? req.user.isSuperAdmin: false;
		reqConfig.headers = headers;
		reqConfig.method = req.method;
		reqConfig.path = getPath(req.path, config.pathRewrite);
		reqConfig.qs = req.query;
		if (req.body) {
			if (config.onReq && typeof config.onReq === "function") {
				reqConfig.body = config.onReq(req, res);
			} else {
				reqConfig.body = req.body;
			}
		}
		if (headers.cache) {
			logger.debug(`[${txnId}] Routing MW :: API request validation cache id :: ${headers.cache}`);
		}
		reqConfig.files = req.files;
		return routerPromise
			.then(_d => {
				if (_d == "next") {
					next();
					return;
				}
				return sendRequest(txnId, reqConfig, res);
			})
			.then(result => {
				if (result && !res.headersSent) {
					let resBody;
					try {
						logger.trace(`[${txnId}] Routing MW :: Body ::  ${JSON.stringify(result.body)}`);
						if(result.statusCode == 302 && result.headers) {
							if(result.headers.location) {
								res.setHeader("Location", result.headers.location
								);
							}
							logger.info(`[${txnId}] Routing MW :: Set-Cookie :: ${result.headers["set-cookie"] || "NIL"}`);
							if(result.headers["set-cookie"]) res.setHeader("set-cookie", result.headers["set-cookie"]); 
						}
						resBody = typeof result.body === "object" ? result.body : (result.body ? JSON.parse(result.body) : "");
					} catch (err) {
						logger.error(`[${txnId}] Routing MW :: ${err.message}`);
						return res.status(result.statusCode).send(result.body);
					}
					if (config.onRes && typeof config.onRes === "function") {
						res.status(result.statusCode);
						config.onRes(req, res, resBody);
					} else {
						res.status(result.statusCode).json(resBody);
					}
				}
			})
			.catch(err => {
				logger.error(`[${txnId}] Routing MW :: ${err.message}`);
				if (!res.headersSent) res.status(500).json({ "message": err.message });
			});
	};
};

e.getFileValidatorMiddleware = (req, res, next) => {
	let allowedExt = envConfig.allowedExt;
	if (!req.files) return next();
	let flag = Object.keys(req.files).every(file => {
		let filename = req.files[file].name;
		let fileExt = filename.split(".").pop();
		if (allowedExt.indexOf(fileExt) == -1) return false;
		let path = process.cwd() + "/" + req.files[file].tempFilePath;
		let isValid = fileValidator({ type: "Binary", path }, fileExt);
		return isValid;
	});
	if (flag) next();
	else next(new Error("File not supported"));
};

module.exports = e;
