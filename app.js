"use strict";

const os = require("os");
const path = require("path");
const { request } = require("./util/got-request-wrapper.js");
const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const avUtils = require("@appveen/utils");
const fileUpload = require("express-fileupload");
const fileSizeParser = require("filesize-parser");


const port = process.env.PORT || 9080;

const log4js = avUtils.logger.getLogger;
let version = require("./package.json").version;
const loggerName = (process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT) ? `[${process.env.DATA_STACK_NAMESPACE}] [${process.env.HOSTNAME}] [GW ${version}]` : `[GW ${version}]`;

const logger = log4js.getLogger(loggerName);
global.logger = logger;

const config = require("./config/config.js");
const utilMiddleware = require("./util/utilMiddleware");
const authUtil = require("./util/authUtil");
const fileMapper = require("./util/fileMapperMiddleware");
const router = require("./util/router.js");
const cacheUtil = require("./util/cacheUtil");
const diagRouter = require("./routes/diag.route");
const userHBRouter = require("./routes/userHB.route");


config.init();

global.mongoAppCenterConnected = false;
global.mongoAuthorConnected = false;

const mongoUtils = require("./util/mongoUtils");

let timeOut, maxFileSize, maxJSONSize, allowedFileTypes;

(async () => {
	await mongoUtils.init()
		.then((envVariables) => {
			timeOut = envVariables.API_REQUEST_TIMEOUT || 120;

			maxJSONSize = envVariables.MAX_JSON_SIZE;
			logger.info(`Data service max JSON size :: ${maxJSONSize}`);

			maxFileSize = envVariables.MAX_FILE_SIZE || "5MB";
			logger.info(`Data service max file upload size :: ${maxFileSize}`);

			// FILE UPLOAD CONFIGURATIONS
			allowedFileTypes = envVariables.ALLOWED_FILE_TYPES || config.defaultAllowedFileTypes;
			allowedFileTypes = allowedFileTypes.split(",");
			logger.info(`Allowed file types : ${allowedFileTypes}`);
		});

	const app = express();
	cacheUtil.init();

	const userCacheUtil = avUtils.cache;
	userCacheUtil.init();

	app.use(utilMiddleware.requestLogger);

	app.use(express.json({
		inflate: true,
		limit: maxJSONSize,
		strict: true
	}));

	const storage = multer.diskStorage({
		destination: function (req, file, cb) {
			cb(null, "./uploads");
		},
		filename: function (_req, _file, _cb) {
			logger.debug(`[${_req.headers.TxnId}] File details :: ${JSON.stringify(_file)}`);
			let extn = _file.originalname.split(".").pop();
			logger.debug(`[${_req.headers.TxnId}] File extn of file "${_file.originalname}"" :: ${extn}`);
			let fileValidExtension = allowedFileTypes;
			if (_req.path.indexOf("fileMapper") > -1) {
				fileValidExtension = ["csv", "xlsx", "xls", "ods", "json"];
			}
			if (fileValidExtension.indexOf(extn) == -1) return _cb({ "message": "Invalid file extension!" });
			_cb(null, `tmp-${Date.now()}`);
		}
	});
	let upload = multer({ storage: storage });

	app.use((req, res, next) => {
		let urlSplit = req.path.split("/");
		if ((urlSplit[6] && urlSplit[6] === "fileMapper")) {
			upload.single("file")(req, res, next);
		} else {
			fileUpload({ useTempFiles: true, tempFileDir: path.join(os.tmpdir(), "gw-files") })(req, res, next);
		}
	});

	app.use((req, res, next) => {
		let urlSplit = req.path.split("/");
		if ((urlSplit[5] && urlSplit[5] === "fileMapper") || (urlSplit[4] && urlSplit[4] === "usr" && urlSplit[5] && urlSplit[5] === "bulkCreate")) {
			next();
		} else {
			const sizeInBytes = fileSizeParser(maxFileSize);
			if (req.files && req.files.file && req.files.file.size > sizeInBytes) {
				res.status(413).json({ message: "File Too Large, max file size should be " + maxFileSize });
			} else {
				next();
			}
		}
	});

	app.use(cookieParser());

	app.use(utilMiddleware.notPermittedUrlCheck);
	app.use(utilMiddleware.checkTokenMiddleware);
	app.use(utilMiddleware.storeUserPermissions);
	app.use(utilMiddleware.corsMiddleware);

	// START OF SOME REAL SHIT
	diagRouter.e.dependencyCheck().catch(_e => logger.error(_e));

	app.use(["/gw", "/api/a/gw"], diagRouter.router);
	app.put("/api/a/rbac/usr/hb", userHBRouter);
	app.get("/api/a/workflow/:app/serviceList", authUtil.workflowServiceList);
	app.post("/api/a/gw/socket-emit", async (req, res) => {
		if (global.socketClients && req.body && req.body.event && req.body.data) {
			Object.keys(global.socketClients).forEach(key => {
				global.socketClients[key].emit(req.body.event, req.body.data);
			});
		}
		res.status(202).end();
	});

	app.use(fileMapper.fileMapperHandler);

	app.use(router.getRouterMiddleware({
		target: config.get("gw"),
		router: function (req) {
			let fixRoutes = {
				"/api/a/bm": config.get("bm"),
				"/api/a/cm": config.get("cm"),
				"/api/a/common": config.get("common"),
				"/api/a/mon": config.get("mon"),
				"/api/a/sm": config.get("sm"),
				"/api/a/rbac": config.get("user"),
				// "/api/a/workflow": config.get("wf"),
				"/api/a/route": config.get("b2b"),
				// "/api/a/sec": config.get("sec"),
				"/api/a/b2bgw": config.get("b2bgw"),
				"/api/a/de": config.get("de")
			};
			logger.debug(`[${req.headers.TxnId}] getRouterMiddleware :: ${req.path}`);
			let selectedKey = Object.keys(fixRoutes).find(key => req.path.startsWith(key));
			if (selectedKey) return Promise.resolve(fixRoutes[selectedKey]);

			let urlSplit = req.path.split("/");

			if (req.path.startsWith("/api/a/faas")) {
				if (urlSplit[4] && !urlSplit[4].match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]+$/)) {
					throw new Error("APP_NAME_ERROR :: App name must consist of alphanumeric characters or '-' , and must start and end with an alphanumeric character.");
				}
				if (urlSplit[5] && !urlSplit[5].match(/^[a-zA-Z][a-zA-Z0-9]*$/)) {
					throw new Error("FUNCTION_NAME_ERROR :: Function name must consist of alphanumeric characters, and must start with an alphabet.");
				}
				let faasApi = urlSplit[3] + "/" + urlSplit[4] + "/" + urlSplit[5];
				logger.info(`[${req.headers.TxnId}] Master Faas router API :: ${faasApi}`);
				return getFaasApi(req, faasApi);
			} else {
				if (urlSplit[3] && !urlSplit[3].match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]+$/)) {
					throw new Error("APP_NAME_ERROR :: App name must consist of alphanumeric characters or '-' , and must start and end with an alphanumeric character.");
				}
				if (urlSplit[4] && !urlSplit[4].match(/^[a-zA-Z][a-zA-Z0-9]*$/)) {
					throw new Error("DATA_SERVICE_NAME_ERROR :: Data Service name must consist of alphanumeric characters, and must start with an alphabet.");
				}
				let api = urlSplit[3] + "/" + urlSplit[4];
				logger.info(`[${req.headers.TxnId}] Master service router API :: ${api}`);
				return getDSApi(req, api);
			}

		},
		pathRewrite: {
			"/api/a/faas": "/api/faas",
			"/api/a/": "/",
			"/api/c/": "/"
		},
		onRes: function (req, res, body) {
			if ((req.path === "/api/a/rbac/auth/login" || req.path === "/api/a/rbac/auth/refresh" || req.path === "/api/a/rbac/auth/check") && res.statusCode === 200) {
				let domain = process.env.FQDN ? process.env.FQDN.split(":").shift() : "localhost";
				let cookieJson = {};
				if (domain != "localhost") {
					cookieJson = {
						expires: new Date(body.expiresIn),
						httpOnly: true,
						sameSite: true,
						secure: true,
						domain: domain,
						path: "/api/"
					};
				}
				res.cookie("Authorization", "JWT " + body.token, cookieJson);
			}
			if (req.path === "/api/a/rbac/auth/logout" && res.statusCode === 200) {
				res.cookie("Authorization", null, { maxAge: 0 });
				res.cookie("azure-token", null, { maxAge: 0 });
			}
			return res.json(body);
		}
		// onRes: authUtil.getProxyResHandler(["/api/a/rbac", "/api/a/workflow"])
	}));

	
	function getDSApi(req, api) {
		return new Promise((resolve, reject) => {
			if (global.masterServiceRouter && global.masterServiceRouter[api]) {
				logger.debug(`[${req.headers.TxnId}] Routing to :: ${global.masterServiceRouter[api]}`);
				resolve(global.masterServiceRouter[api]);
			} else {
				let apiSplit = api.split("/");
				let filter = { app: apiSplit[0], api: "/" + apiSplit[1] };
				logger.debug(`${req.headers.TxnId} Calling getDSApi`);
				request({
					url: `${config.get("sm")}/sm/${apiSplit[0]}/service`, 
					headers: {
						"content-type": "application/json",
						"Authorization": req.get("Authorization"),
						"User": req.user ? req.user._id : null
					},
					qs: {
						filter: JSON.stringify(filter),
						select: "_id,app,api,port"
					}
				}, (err, res, body) => {
					if (err) {
						logger.error(`[${req.headers.TxnId}] Error in getDSApi: ${err}`);
						reject(err);
					} else if (res.statusCode != 200) {
						logger.debug(`[${req.headers.TxnId}] res.status code in getDSApi :: ${res.statusCode}`);
						logger.debug(`[${req.headers.TxnId}] Error in getDSApi: ${body}`);
						reject({ statusCode: res.statusCode, body: body });
					} else {
						let parsed = JSON.parse(body);
						if (!parsed.length) {
							logger.error(`[${req.headers.TxnId}] Response length in getDSApi : ${parsed.length}`);
							return reject({ statusCode: 404, body: `{"message": "Data Service with ${api} api doesn't exist."}`});
						}
						let dsDetails = parsed[0];
						let URL = "http://localhost:" + dsDetails.port;
						if (process.env.GW_ENV == "K8s") {
							URL = "http://" + dsDetails.api.split("/")[1] + "." + config.dataStackNS + "-" + dsDetails.app.toLowerCase().replace(/ /g, "");
						}
						if (!global.masterServiceRouter) {
							global.masterServiceRouter = {};
						}
						global.masterServiceRouter[escape(dsDetails.app) + dsDetails.api] = URL;
						resolve(global.masterServiceRouter[api]);
					}
				});
			}
		});
	}


	function getFaasApi(req, api) {
		return new Promise((resolve, reject) => {
			let apiPath = `/api/a/${api}`;
			logger.debug(`[${req.headers.TxnId}] getFaasApi :: ApiPath :: ${apiPath}`);
			logger.trace(`[${req.headers.TxnId}] Global Master Faas Router :: ${JSON.stringify(global.masterFaasRouter)}`);
			if (global.masterFaasRouter && global.masterFaasRouter[apiPath]) {
				logger.debug(`[${req.headers.TxnId}] Routing to :: ${global.masterFaasRouter[apiPath]}`);
				resolve(global.masterFaasRouter[apiPath]);
			} else {
				let apiSplit = api.split("/");
				let filter = { app: apiSplit[1], url: apiPath };
				logger.debug(`[${req.headers.TxnId}] Calling getFaasApi :: ${config.get("bm") + "/bm/" + apiSplit[1] + "/faas"}`);
				request({
					url: config.get("bm") + "/bm/" + apiSplit[1] + "/faas",
					headers: {
						"content-type": "application/json",
						"Authorization": req.get("Authorization"),
						"User": req.user ? req.user._id : null
					},
					qs: {
						filter: JSON.stringify(filter),
						select: "_id app url port deploymentName namespace"
					}
				}, (err, res, body) => {
					if (err) {
						logger.error(`[${req.headers.TxnId}] Error in getFaasApi: ${err}`);
						reject(err);
					} else if (res.statusCode != 200) {
						logger.debug(`[${req.headers.TxnId}] res.status code in getFaasApi :: ${res.statusCode}`);
						logger.debug(`[${req.headers.TxnId}] Error in getFaasApi: ${body}`);
						reject(body);
					} else {
						let parsed = JSON.parse(body);
						if (!parsed.length) {
							logger.error(`[${req.headers.TxnId}] Response length in getFaasApi : ${parsed.length}`);
							return reject(new Error(`Faas with ${api} api doesn't exist.`));
						}
						let faasDetails = parsed[0];
						let URL = "http://localhost:" + (faasDetails.port || 30010);
						if (process.env.GW_ENV == "K8s") {
							URL = "http://" + faasDetails.deploymentName + "." + faasDetails.namespace; // + faasDetails.port
						}
						if (!global.masterFaasRouter) {
							global.masterFaasRouter = {};
						}
						global.masterFaasRouter[apiPath] = URL;
						resolve(global.masterFaasRouter[apiPath]);
					}
				});
			}

		});
	}


	app.use(function (error, req, res, next) {
		if (error) {
			logger.error("Global error handler - ", error);
			if (!res.headersSent) {
				let statusCode = error.statusCode || 500;
				if (error?.message?.includes("APP_NAME_ERROR") || error?.message?.includes("DATA_SERVICE_NAME_ERROR") || error?.message?.includes("FUNCTION_NAME_ERROR")) {
					statusCode = 400;
				}
				res.status(statusCode).json({
					message: error.message
				});
			}
		} else {
			next();
		}
	});

	app.use(function (error, req, res, next) {
		if (error) {
			logger.error("Global error handler - ", error);
			if (!res.headersSent) {
				let statusCode = error.statusCode || 500;
				if (error?.message?.includes("APP_NAME_ERROR") || error?.message?.includes("DATA_SERVICE_NAME_ERROR") || error?.message?.includes("FUNCTION_NAME_ERROR")) {
					statusCode = 400;
				}
				res.status(statusCode).json({
					message: error.message
				});
			}
		} else {
			next();
		}
	});

	var server = app.listen(port, (err) => {
		if (!err) {
			logger.info("Server started on port " + port);
			require("./sockets/gw.socketServer")(server);
		} else logger.error(err);
	});
	server.setTimeout(parseInt(timeOut) * 1000);
})();
