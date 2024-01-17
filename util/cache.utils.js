const log4js = require('log4js');
const { AuthCache } = require('@appveen/ds-auth-cache');
const _ = require('lodash');

const cache = new AuthCache();
const logger = log4js.getLogger(global.loggerName);

async function getDSRouteMap() {
	let routeMap = {};
	try {
		const keys = (await cache.client.keys('DSROUTE:*') || []);
		const promises = await Promise.all(keys.map(async (key) => {
			let route = await cache.client.getAsync(key);
			_.assign(routeMap, JSON.parse(route));
			return route;
		}));
		await Promise.all(promises);
		return routeMap;
	} catch (err) {
		logger.error('Error in getDSRouteMap');
		logger.error(err);
	}
	return routeMap;
}

async function getDPRouteMap() {
	let routeMap = {};
	try {
		const keys = (await cache.client.keys('DPROUTE:*') || []);
		const promises = await Promise.all(keys.map(async (key) => {
			let route = await cache.client.getAsync(key);
			_.assign(routeMap, JSON.parse(route));
			return route;
		}));
		await Promise.all(promises);
		return routeMap;
	} catch (err) {
		logger.error('Error in getDPRouteMap');
		logger.error(err);
	}
	return routeMap;
}

module.exports.getDSRouteMap = getDSRouteMap;
module.exports.getDPRouteMap = getDPRouteMap;
module.exports.cache = cache;