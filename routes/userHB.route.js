"use strict"
const config = require("../config/config");
const cacheUtils = require("../util/cache.utils").cache;

const  logger = global.logger;

module.exports = async (_req, _res) => {
	try {
		logger.debug("HB received");
		let tokenHash = _req.tokenHash;
		logger.debug(`Token hash :: ${tokenHash}`);
		let flag = await cacheUtils.isTokenBlacklisted(tokenHash);
		if (flag) {
			throw new Error("Blacklisted Token");
		}
		flag = await cacheUtils.isHeartbeatValid(tokenHash, _req.body.uuid);
		if (!flag) {
			throw new Error("Invalid Token");
		}
		await cacheUtils.setHeartbeatID(tokenHash, _req.body.uuid, config.RBAC_HB_INTERVAL + 5);
		_res.json({ message: "HB received" });
	} catch (err) {
		logger.error(`Heartbeat error :: ${err}`);
		_res.status(400).json({ message: "Invalid session" });
	}
}