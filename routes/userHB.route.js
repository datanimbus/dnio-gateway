"use strict"
const avUtils = require("@appveen/utils");
const userCache = avUtils.cache;

const config = require("../config/config");


let logger = global.logger;

module.exports = (_req, _res) => {
	logger.debug("HB received");
	let tokenHash = _req.tokenHash;
	logger.debug(`Token hash :: ${tokenHash}`);
	userCache.isBlacklistedToken(tokenHash)
		.then(_flag => _flag ? Promise.reject("Blacklisted Token") : userCache.isValidToken(tokenHash))
		.then(_flag => _flag ? _flag : Promise.reject("Invalid Token"))
		.then(() => userCache.handleHeartBeat(_req.body.uuid, tokenHash, config.RBAC_HB_INTERVAL + 5))
		.then(() => _res.json({ message: "HB received" }))
		.catch(_err => {
			logger.error(`Heartbeat error :: ${_err}`);
			return _res.status(400).json({ message: "Invalid session" });
		});
}