"use stict";

const request = require("request-promise");
const config = require("../config/config");
const sh = require("shorthash");
const crypto = require("crypto");

let logger = global.logger;

let e = {};

function getHashMapValues(_data){
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

e.createServiceList = async () => {
	logger.debug("Calling SM and creating the routing map");
	let options = {
		url: `${config.get("sm")}/sm/service`,
		qs: {
			select: "port,api,app,name",
			count: -1,
		},
		headers: {
			"TxnId": `GW_${sh.unique(crypto.createHash("md5").update(Date.now().toString()).digest("hex"))}`
		},
		json: true
	};
	try {
		let serviceRoutingMap = {};
		let services = await request(options);
		services.forEach(_service => {
			let hashMapValues = getHashMapValues(_service);
			serviceRoutingMap[hashMapValues[0]] = hashMapValues[1];
		});
		global.masterServiceRouter = serviceRoutingMap;
	} catch (_e) {
		logger.error("Unable to create routing map!");
		logger.error(_e);
	}
};

e.updateServiceList = _data => {
	logger.info("Updating routing map");
	let hashMapValues =  getHashMapValues(_data);
	if(hashMapValues) global.masterServiceRouter[hashMapValues[0]] = hashMapValues[1];
};

e.deleteServiceList = _data => {
	logger.debug(`Deleting routing map entry :: ${_data.app}${_data.api}`);
	delete global.masterServiceRouter[`${_data.app}${_data.api}`];
};

module.exports = e;