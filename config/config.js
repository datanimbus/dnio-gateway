"use strict";
const fs = require("fs");

var e = {};

e.isK8sEnv = () => {
	return process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT;
};

e.odpNS = process.env.DATA_STACK_NAMESPACE || "appveen";
process.env.MODE = process.env.MODE ? process.env.MODE : "PROD";

e.debugDB = false;
if (process.env.LOG_LEVEL == "DB_DEBUG") {
	process.env.LOG_LEVEL = "debug";
	e.debugDB = true;
	let Logger = require("mongodb").Logger;
	Logger.setLevel("debug");
}

if (e.isK8sEnv()) {
	let logger = global.logger;
	logger.info("*** K8s environment detected ***");
	logger.info("Image version: " + process.env.IMAGE_TAG);
	process.env.GW_ENV = "K8s";
} else {
	let logger = global.logger;
	logger.info("*** Local environment detected ***");
	process.env.GW_ENV = "Local";
}

e.mongoUrlAuthor = process.env.MONGO_AUTHOR_URL || "mongodb://localhost";
e.mongoUrlAppcenter = process.env.MONGO_APPCENTER_URL || "mongodb://localhost";

e.get = (_service) => {
	if (e.isK8sEnv()) {
		if (_service == "ne") return `http://ne.${e.odpNS}`;
		if (_service == "sm") return `http://sm.${e.odpNS}`;
		if (_service == "bm") return `http://bm.${e.odpNS}`;
		if (_service == "user") return `http://user.${e.odpNS}`;
		if (_service == "gw") return `http://gw.${e.odpNS}`;
		if (_service == "mon") return `http://mon.${e.odpNS}`;
		if (_service == "b2b") return `http://b2b.${e.odpNS}`;
		if (_service == "de") return `http://de.${e.odpNS}`;
		if (_service == "common") return `http://common.${e.odpNS}`;
	} else {
		if (_service == "ne") return "http://localhost:10010";
		if (_service == "sm") return "http://localhost:10003";
		if (_service == "bm") return "http://localhost:10011";
		if (_service == "user") return "http://localhost:10004";
		if (_service == "gw") return "http://localhost:9080";
		if (_service == "mon") return "http://localhost:10005";
		if (_service == "de") return "http://localhost:10012";
		if (_service == "common") return "http://localhost:3000";
	}
};

e.defaultAllowedFileTypes = "ppt,xls,csv,doc,jpg,jpeg,png,gif,zip,tar,rar,gz,bz2,7z,mp4,mp3,pdf,ico,docx,pptx,xlsx,ods,xml";

e.init = () => {
	try {
		if (!fs.existsSync("./uploads")) {
			fs.mkdirSync("./uploads");
		}
	} catch (e) {
		let logger = global.logger;
		logger.error(e);
	}
};

e.mongoOptions = {
	useNewUrlParser: true,
	useUnifiedTopology: true
	// TBD
	// reconnectTries: process.env.MONGO_RECONN_TRIES,
	// reconnectInterval: process.env.MONGO_RECONN_TIME_MILLI,
};

e.apiTimeout = process.env.API_REQUEST_TIMEOUT || 60;
e.roleCacheExpiry = 60 * 60 * 8;
e.validationCacheExpiry = 60 * 60 * 8;
e.cacheKeyPrefix = {
	validate: "validate",
	appcenterRole: "roles_appcenter"
};
e.RBAC_HB_MISS_COUNT = process.env.RBAC_HB_MISS_COUNT ? parseInt(process.env.RBAC_HB_MISS_COUNT) : 1;
e.RBAC_HB_INTERVAL = process.env.RBAC_HB_INTERVAL ? parseInt(process.env.RBAC_HB_INTERVAL) * e.RBAC_HB_MISS_COUNT : 50 * e.RBAC_HB_MISS_COUNT;

e.baseUrlSM = e.get("sm") + "/sm";
e.baseUrlNE = e.get("ne") + "/ne";
e.baseUrlUSR = e.get("user") + "/rbac";
e.baseUrlMON = e.get("mon") + "/mon";
e.baseUrlWF = e.get("wf") + "/workflow";
e.baseUrlSEC = e.get("sec") + "/sec";
e.baseUrlDM = e.get("dm") + "/dm";
e.baseUrlbm = e.get("bm") + "/bm";

e.TOKEN_SECRET = process.env.TOKEN_SECRET || "u?5k167v13w5fhjhuiweuyqi67621gqwdjavnbcvadjhgqyuqagsduyqtw87e187etqiasjdbabnvczmxcnkzn";
e.RBAC_JWT_KEY = process.env.RBAC_JWT_KEY || "u?5k167v13w5fhjhuiweuyqi67621gqwdjavnbcvadjhgqyuqagsduyqtw87e187etqiasjdbabnvczmxcnkzn";

module.exports = e;