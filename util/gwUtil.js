const crypto = require("crypto");
const sh = require("shorthash");
const uuid = require("uuid/v1");
const config = require("../config/config");
const urlConfig = require("../config/urlConfig");
const request = require("request");
let logger = global.logger;

let e = {};


e.randomStr = function(len) {
	let str = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < len; i++) {
		str += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return str;
};

e.getTxnId = (_req) => {
	_req.headers["TxnId"] = sh.unique(crypto.createHash("md5").update(uuid()).digest("hex"));
	logger.debug(`getTxnId() :: _req.headers.TxnId :: ${_req.headers.TxnId}`);
};

e.checkReviewPermissionForService = (_req, _id, usrId) => {
	return new Promise((resolve, reject) => {
		const options = {
			url: config.baseUrlUSR + `/usr/reviewpermissionservice/${_id}?user=${usrId}`,
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"TxnId": _req.get("txnId"),
				"Authorization": _req.get("Authorization"),
				"User": usrId
			},
			json: true
		};
		request(options, (_err, _res) => {
			if (_err) {
				reject(_err);
			} else {
				if (_res.statusCode == 404) return resolve(true);
				return resolve(false);
			}
		});
	});
};

e.compareUrl = (tempUrl, url) => {
	let tempUrlSegment = tempUrl.split("/");
	let urlSegment = url.split("/");
	if (tempUrlSegment.length != urlSegment.length) return false;

	tempUrlSegment.shift();
	urlSegment.shift();

	let flag = tempUrlSegment.every((_k, i) => {
		if (_k.startsWith("{") && _k.endsWith("}") && urlSegment[i] != "") return true;
		return _k === urlSegment[i];
	});
	logger.trace(`Compare URL :: ${tempUrl}, ${url} :: ${flag}`);
	return flag;
};

e.getParams = (tempUrl, url) => {
	let tempUrlSegment = tempUrl.split("/");
	let urlSegment = url.split("/");
	if (tempUrlSegment.length != urlSegment.length) return {};

	let params = {};
	tempUrlSegment = tempUrlSegment.splice(1, tempUrlSegment.length - 1);
	urlSegment = urlSegment.splice(1, urlSegment.length - 1);

	tempUrlSegment.forEach((_k, i) => {
		if (_k.startsWith("{") && _k.endsWith("}") && urlSegment[i] != "") {
			params[_k.split("{")[1].split("}")[0]] = urlSegment[i];
		}
	});
	return params;
};

e.md5 = data => {
	return crypto.createHash("md5").update(data).digest("hex");
};

e.isPermittedURL = (_req) => {
	return urlConfig.permittedUrl.some(_url => e.compareUrl(_url, _req.path));
};

e.isPermittedAuthZUrl = (_req) => {
	return urlConfig.permittedAuthZUrl.some(_url => _req.path.startsWith(_url));
};

e.isDownloadURL = (_req) => {
	return urlConfig.downloadUrl.some(_url => e.compareUrl(_url, _req.path));
};

e.isIntenalAPICall = (_req) => {
	return _req.method === "GET" &&
	(
		(
			e.compareUrl("/api/c/{app}/{api}", _req.path) &&
					(
						_req.query.expand || _req.get("Cache")
					)
		) ||
			e.compareUrl("/api/c/{app}/{api}/export", _req.path)
	);
};

e.hasDuplicate = (arr) => {
	return arr.length !== Array.from(new Set(arr)).length;
}; 

e.getDuplicateValues = (arr) => {
	var duplicates = arr.filter(a => arr.indexOf(a) !== arr.lastIndexOf(a));
	return Array.from(new Set(duplicates));
};

module.exports = e;