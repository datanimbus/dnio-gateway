"use strict";

const request = require("request");
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
let timeOut = process.env.API_REQUEST_TIMEOUT || 120;
global.logger = logger;

const config = require("./config/config.js");
const utilMiddleware = require("./util/utilMiddleware");
const authUtil = require("./util/authUtil");
const fileMapper = require("./util/fileMapperMiddleware");
const router = require("./util/router.js");
const gwUtil = require("./util/gwUtil");
const cacheUtil = require("./util/cacheUtil");
const diagRouter = require("./routes/diag.route");
const userHBRouter = require("./routes/userHB.route");
const authenticationMiddleware = require("./auth/authenticationMiddleware");
const authorizationMiddleware = require("./auth/authorizationMiddleware");
const requestDetailsMiddelware = require("./auth/requestDetailsMiddelware");
const bulkImportUser = require("./util/bulkImportUserMiddleware");


config.init();

global.mongoAppCenterConnected = false;
global.mongoAuthorConnected = false;
require("./util/mongoUtils").init();

const app = express();
cacheUtil.init();

const userCacheUtil = avUtils.cache;
userCacheUtil.init();

let maxJSONSize = process.env.MAX_JSON_SIZE || "100kb";
logger.info(`Data service max JSON size :: ${maxJSONSize}`);

let maxFileSize = process.env.MAX_FILE_SIZE || "5MB";
logger.info(`Data service max file upload size :: ${maxFileSize}`);

app.use(utilMiddleware.requestLogger);

app.use(express.json({
	inflate: true,
	limit: maxJSONSize,
	strict: true
}));

// FILE UPLOAD CONFIGURATIONS

let allowedFileTypes = process.env.ALLOWED_FILE_TYPES || config.defaultAllowedFileTypes;
allowedFileTypes = allowedFileTypes.split(",");
logger.info(`Allowed file types : ${allowedFileTypes}`);

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, "./uploads");
	},
	filename: function (_req, _file, _cb) {
		let extn = _file.originalname.split(".").pop();
		logger.debug(`[${_req.headers.TxnId}] File extn of file "${_file.originalname}"" :: ${extn}`);
		let fileValidExtension = allowedFileTypes;
		if (_req.path.indexOf("fileMapper") > -1 || _req.path.indexOf("bulkCreate") > -1) {
			fileValidExtension = ["csv", "xlsx", "xls", "ods"];
		}
		if (fileValidExtension.indexOf(extn) == -1) return _cb({ "message": "Invalid file extension!" });
		_cb(null, `tmp-${Date.now()}`);
	}
});
let upload = multer({ storage: storage });

app.use((req, res, next) => {
	let urlSplit = req.path.split("/");
	if ((urlSplit[5] && urlSplit[5] === "fileMapper") || (urlSplit[4] && urlSplit[4] === "usr" && urlSplit[5] && urlSplit[5] === "bulkCreate")) {
		upload.single("file")(req, res, next);
	} else {
		fileUpload({ useTempFiles: true })(req, res, next);
	}
});

app.use((req, res, next) => {
	let urlSplit = req.path.split("/");
	if ((urlSplit[5] && urlSplit[5] === "fileMapper") || (urlSplit[4] && urlSplit[4] === "usr" && urlSplit[5] && urlSplit[5] === "bulkCreate")) {
		next();
	} else {
		const sizeInBytes = fileSizeParser(maxFileSize);
		if (req.files && req.files.file && req.files.file.size > sizeInBytes) {
			res.status(413).json({ message: "File Too Large, max file size should be "+maxFileSize });
		} else {
			next();
		}
	}
});

app.use(cookieParser());

app.use(utilMiddleware.notPermittedUrlCheck);

app.use(utilMiddleware.checkTokenMiddleware);

app.use(utilMiddleware.corsMiddleware);

// START OF SOME REAL SHIT


diagRouter.e.dependencyCheck().catch(_e => logger.error(_e));

app.use("/gw", diagRouter.router);
app.put("/api/a/rbac/usr/hb", userHBRouter);

app.use(authenticationMiddleware.authN);
app.use(authenticationMiddleware.diagnosticAPIHandler);

app.use(requestDetailsMiddelware.addRequestDetails);

app.get("/api/a/rbac/usr/role", authUtil.highestPermissionHandlerCurrentUser);
app.get("/api/a/rbac/user/role", authUtil.highestPermissionHandlerUser);
app.get("/api/a/rbac/group/role", authUtil.highestPermissionHandlerGroup);
app.get("/api/a/rbac/usr/workflow", authUtil.workFlowCalculator);

app.use(authorizationMiddleware);

app.use(fileMapper.fileMapperHandler);

app.use(bulkImportUser);

app.use(router.getRouterMiddleware({
	target: config.get("gw"),
	router: function (req) {
		let fixRoutes = {
			"/api/a/rbac": config.get("user"),
			"/api/a/sm": config.get("sm"),
			"/api/a/pm": config.get("pm"),
			"/api/a/mon": config.get("mon"),
			"/api/a/workflow": config.get("wf"),
			"/api/a/route": config.get("b2b"),
			"/api/a/sec": config.get("sec"),
			"/api/a/b2bgw": config.get("b2bgw"),
			"/api/a/de": config.get("de")
		};
		let selectedKey = Object.keys(fixRoutes).find(key => req.path.startsWith(key));
		if (selectedKey) return Promise.resolve(fixRoutes[selectedKey]);
		let api = req.path.split("/")[3] + "/" + req.path.split("/")[4];
		if (req.method === "GET") {
			return getDSApi(req, api);
		} else {
			return skipWorkflow(req.path, req)
				.then(_flag => {
					if (_flag) {
						return getDSApi(req, api);
					} else {
						return "next";
					}
				});
		}
	},
	pathRewrite: {
		"/api/a": "",
		"/api/c": ""
	},
	onRes: authUtil.getProxyResHandler(["/api/a/rbac", "/api/a/workflow"])
}));


function getDSApi(req, api) {
	return new Promise((resolve, reject) => {
		if (global.masterServiceRouter[api])
			resolve(global.masterServiceRouter[api]);
		else {
			let apiSplit = api.split("/");
			let filter = { app: apiSplit[0], api: "/" + apiSplit[1] };
			logger.debug(`${req.headers.TxnId} Calling getDSApi`);
			request(config.get("sm") + "/sm/service", {
				headers: {
					"content-type": "application/json"
				},
				qs: {
					filter: JSON.stringify(filter),
					select: "app,api,port"
				}
			}, (err, res, body) => {
				if (err) {
					logger.error(`${req.headers.TxnId} Error in getDSApi: ${err}`);
					reject(err);
				} else if (res.statusCode != 200) {
					logger.debug(`${req.headers.TxnId} res.status code in getDSApi :: ${res.statusCode}`);
					logger.debug(`${req.headers.TxnId} Error in getDSApi: ${body}`);
					reject(body);
				} else {
					let parsed = JSON.parse(body);
					if (!parsed.length) {
						logger.error(`${req.headers.TxnId} Response length in getDSApi : ${parsed.length}`);
						reject("DS doesn't exists. :: ", api);
					}
					let dsDetails = parsed[0];
					let URL = "http://localhost:" + dsDetails.port;
					if (process.env.GW_ENV == "K8s") {
						URL = "http://" + dsDetails.api.split("/")[1] + "." + config.odpNS + "-" + dsDetails.app.toLowerCase().replace(/ /g, "");
					}
					global.masterServiceRouter[escape(dsDetails.app) + dsDetails.api] = URL;
					resolve(global.masterServiceRouter[api]);
				}
			});
		}

	});
}

app.use((req, res) => {
	let urlconstruct = "";
	let pathconstruct = "";

	pathconstruct = req.originalUrl.split("/");
	urlconstruct = config.get("wf") + "/workflow";

	const path = pathconstruct;
	path.splice(1, 2);
	let ids = [];
	if (req.body._id && req.body._id.trim()) {
		ids = [req.body._id];
	} else {
		if (req.method === "PUT") {
			const pathSegments = req.path.split("/");
			if (authUtil.compareUrl("/api/c/{app}/{api}/{id}/math", req.path)) {
				ids = [path[3]];
			} else if (pathSegments[5] && pathSegments[5] == "bulkUpdate") {
				ids = req.query.id ? req.query.id.split(",") : [];
			} else {
				ids = [path[path.length - 1]];
			}
		}
		if (req.method === "DELETE") {
			if (req.body.ids) {
				ids = req.body.ids;
			} else {
				ids = [path[path.length - 1]];
			}
		}
	}
	if (req.query.draft == "true") {
		req.query.status = "draft";
	} else {
		req.query.status = "pending";
	}
	request({
		url: urlconstruct,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"TxnId": req.get("txnId") ? req.get("txnId") : gwUtil.getTxnId(req),
			"Authorization": req.get("Authorization"),
			"User": req.user ? req.user._id : null
		},
		body: {
			documentIds: ids,
			operation: req.method,
			serviceId: req.serviceId,
			app: req.app,
			data: req.body,
			path: path.join("/")
		},
		qs: req.query,
		json: true
	}, (wfErr, wfRes, body) => {
		if (wfErr) {
			res.status(500).json({
				message: wfErr.message
			});
			return;
		}
		if (wfRes.statusCode !== 200) {
			res.status(wfRes.statusCode).json(body);
		} else {
			res.json(body);
		}
	});
});

app.use(function (error, req, res, next) {
	if (error) {
		logger.error(error);
		if (!res.headersSent) {
			let statusCode = error.statusCode ? error.statusCode : 500;
			res.status(statusCode).json({
				message: error.message
			});
		}
	} else {
		next();
	}
});

function skipWorkflow(path, req) {
	let paths = path.split("/");
	if (paths[6] == "experienceHook"
		|| paths[6] == "simulate"
		|| (paths[5] == "file" && paths[6] == "upload")
		|| authUtil.compareUrl("/api/c/{app}/{api}/utils/filetransfers/{id}", path)
		|| authUtil.compareUrl("/api/c/{app}/{api}/utils/aggregate", path)) {
		return Promise.resolve(true);
	} else {
		const api = "/" + paths[4];
		const app = paths[3];
		return global.mongoConnectionAuthor.collection("services").findOne({
			"app": app,
			"api": api,
			"_metadata.deleted": false
		}, {
			app: 1,
			api: 1
		})
			.then((_d) => {
				if (!_d) throw new Error("No service found");
				req.serviceId = _d._id;
				req.app = _d.app;
				return gwUtil.checkReviewPermissionForService(req, _d._id, req.user._id);
			});
	}
}


var server = app.listen(port, (err) => {
	if (!err) {
		logger.info("Server started on port " + port);
		require("./sockets/gw.socketServer")(server);
	} else logger.error(err);
});

server.setTimeout(parseInt(timeOut) * 1000);
