"use stict";

const request = require("request-promise");
const config = require("../config/config");
const sh = require("shorthash");
const crypto = require("crypto");

let logger = global.logger;

let e = {};

function getDSHashMapValues(_data) {
	if (_data.app && _data.port && _data.api) {
		let URL = "http://localhost:" + _data.port;
		if (process.env.GW_ENV == "K8s") {
			URL = "http://" + _data.api.split("/")[1] + "." + config.odpNS + "-" + _data.app.toLowerCase().replace(/ /g, "");
		}
		logger.trace(`Routing map :: ${_data.app}${_data.api} : ${URL}`);
		return [`${_data.app}${_data.api}`, `${URL}`];
	}
	return null;
}

function getFaasHashMapValues(_data) {
	logger.trace(`Creating Faas Hash Map ${JSON.stringify(_data)}`);
	if (_data.app && _data.url) {
		let URL = "http://localhost:" + (_data.port || 30010);
		if (process.env.GW_ENV == "K8s") {
			URL = "http://" + _data.deploymentName + "." + _data.namespace; // + data.port
		}
		logger.debug(`Faas Routing Hash Map :: ${_data.url} : ${URL}`);
		return [`${_data.url}`, `${URL}`];
	}
	return null;
}

e.createServiceList = async () => {
	logger.debug("Calling SM and creating the DS routing map");
	let options = {
		url: `${config.get("sm")}/sm/service/fetchAll`,
		qs: {
			select: "_id,port,api,app,name",
			count: -1,
		},
		headers: {
			"TxnId": `GW_${sh.unique(crypto.createHash("md5").update(Date.now().toString()).digest("hex"))}`,
			"Authorization": `JWT ${global.GW_TOKEN}`
		},
		json: true
	};
	try {
		let serviceRoutingMap = {};
		let serviceIdMap = {};
		let services = await request(options);
		services.forEach(_service => {
			let hashMapValues = getDSHashMapValues(_service);
			serviceRoutingMap[hashMapValues[0]] = hashMapValues[1];
			serviceIdMap[hashMapValues[0]] = _service._id;
		});
		global.masterServiceRouter = serviceRoutingMap;
		global.serviceIdMap = serviceIdMap;
	} catch (_e) {
		logger.error("Unable to create DS routing map!");
		logger.error(_e);
	}
};

e.updateServiceList = _data => {
	logger.info("Updating DS routing map");
	try {
		let hashMapValues = getDSHashMapValues(_data);
		if (hashMapValues) {
			if (!global.masterServiceRouter) {
				global.masterServiceRouter = {};
			}
			global.masterServiceRouter[hashMapValues[0]] = hashMapValues[1];
			if (!global.serviceIdMap) {
				global.serviceIdMap = {};
			}
			global.serviceIdMap[hashMapValues[0]] = _data._id;
		}
	} catch (err) {
		logger.error(err);
	}
};

e.deleteServiceList = _data => {
	try {
		logger.debug(`Deleting DS routing map entry :: ${_data.app}${_data.api}`);
		if (global.masterServiceRouter) {
			delete global.masterServiceRouter[`${_data.app}${_data.api}`];
		}
		if (global.serviceIdMap) {
			delete global.serviceIdMap[`${_data.app}${_data.api}`];
		}
	} catch (err) {
		logger.error("deleteServiceList", err);
	}
};

e.createFaasList = async () => {
	logger.debug("Calling PM and creating the faas routing map");
	let options = {
		url: `${config.get("bm")}/bm/faas/fetchAll`,
		// qs: {
		// 	select: "_id,url,app,name,deploymentName,namespace",
		// 	count: -1,
		// },
		headers: {
			"TxnId": `GW_${sh.unique(crypto.createHash("md5").update(Date.now().toString()).digest("hex"))}`,
			"Authorization": `JWT ${global.GW_TOKEN}`
		},
		json: true
	};
	try {
		let faasRoutingMap = {};
		let faasIdMap = {};
		let functions = await request(options);
		logger.trace("Functions from BM :: ", JSON.stringify(functions));
		functions.forEach(_function => {
			let hashMapValues = getFaasHashMapValues(_function);
			faasRoutingMap[hashMapValues[0]] = hashMapValues[1];
			faasIdMap[hashMapValues[0]] = _function._id;
		});
		global.masterFaasRouter = faasRoutingMap;
		global.faasIdMap = faasIdMap;
	} catch (_e) {
		logger.error("Unable to create faas routing map!");
		logger.error(_e);
	}
};

e.updateFaasList = _data => {
	logger.info("Updating Faas routing map");
	let hashMapValues = getFaasHashMapValues(_data);
	if (hashMapValues) {
		global.masterFaasRouter[hashMapValues[0]] = hashMapValues[1];
		global.faasIdMap[hashMapValues[0]] = _data._id;
	}
};

e.deleteFaasList = _data => {
	logger.debug(`Deleting Faas routing map entry :: ${_data.app}${_data.url}`);
	if (global.masterFaasRouter[`${_data.app}${_data.url}`]) {
		delete global.masterFaasRouter[`${_data.app}${_data.url}`];
	}
	if (global.faasIdMap[`${_data.app}${_data.url}`]) {
		delete global.faasIdMap[`${_data.app}${_data.url}`];
	}
};

module.exports = e;